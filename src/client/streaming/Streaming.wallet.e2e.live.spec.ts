/**
 * Live end-to-end test for the streaming clients (SSE / WebSocket) against the TON testnet.
 *
 * The suite derives a wallet from a mnemonic, opens two streaming connections
 * (one for address-level events, one for trace-level events), and then:
 *
 *  1. Sends a small TON self-transfer and verifies that the address stream
 *     delivers matching `transactions`, `actions`, `account_state_change`
 *     events and that the trace stream delivers a corresponding `trace` event
 *     with a consistent `trace_external_hash_norm` across all of them.
 *
 *  2. Discovers a jetton with a non-zero balance on the wallet (via TonAPI),
 *     sends a minimal jetton transfer, and — in addition to the checks above —
 *     verifies that a `jettons_change` event arrives with the correct owner.
 *     If no transferable jetton is found the test logs a warning and returns
 *     early rather than failing.
 *
 * Configuration is read from environment variables (use `node --env-file=.env`
 * to load from a file). The suite is skipped entirely when
 * `RUN_STREAMING_WALLET_E2E` is not set or the required env vars are missing.
 *
 * Required env vars:
 *   WALLET_MNEMONIC            – space-separated mnemonic words
 *   WALLET_VERSION             – one of "v3r1", "v3r2", "v4", "v5"
 *   TONCENTER_API_KEY_TESTNET  – Toncenter testnet API key
 *   TONAPI_API_KEY             – TonAPI key (used for jetton discovery and optionally as streaming key)
 *   STREAMING_PROVIDER         – "toncenter" or "tonapi"
 *   CONNECTION_TYPE            – "sse" or "websocket" (default "sse")
 *   RUN_STREAMING_WALLET_E2E   – "1" or "true" to enable the suite
 */

import fs from "node:fs";
import path from "node:path";
import {
    Address,
    beginCell,
    Cell,
    comment,
    external,
    internal,
    Message,
    MessageRelaxed,
    SendMode,
    toNano,
} from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import axios from "axios";
import { z } from "zod";
import { JettonMaster } from "../../jetton/JettonMaster";
import { JettonWallet } from "../../jetton/JettonWallet";
import { WalletContractV3R1 } from "../../wallets/WalletContractV3R1";
import { WalletContractV3R2 } from "../../wallets/WalletContractV3R2";
import { WalletContractV4 } from "../../wallets/WalletContractV4";
import { WalletContractV5R1 } from "../../wallets/WalletContractV5R1";
import { TonClient } from "../TonClient";
import { TonSseClient } from "./TonSseClient";
import { TonWsClient } from "./TonWsClient";
import type {
    StreamingAccountStateEvent,
    StreamingActionsEvent,
    StreamingClient,
    StreamingJettonsEvent,
    StreamingTraceEvent,
    StreamingTransactionsEvent,
} from "./types";

const liveEnvSchema = z.object({
    WALLET_MNEMONIC: z.string().min(1),
    WALLET_VERSION: z.enum(["v3r1", "v3r2", "v4", "v5"]),
    TONCENTER_API_KEY: z.string().min(1),
    TONAPI_API_KEY: z.string().min(1),
    STREAMING_PROVIDER: z.enum(["toncenter", "tonapi"]),
    CONNECTION_TYPE: z.enum(["sse", "websocket"]),
});

const liveEnvResult = liveEnvSchema.safeParse({
    WALLET_MNEMONIC: process.env.WALLET_MNEMONIC,
    WALLET_VERSION: process.env.WALLET_VERSION,
    TONCENTER_API_KEY: process.env.TONCENTER_API_KEY_TESTNET,
    TONAPI_API_KEY: process.env.TONAPI_API_KEY,
    STREAMING_PROVIDER: process.env.STREAMING_PROVIDER,
    CONNECTION_TYPE: normalizeConnectionType(
        process.env.CONNECTION_TYPE ?? "sse",
    ),
});

const RUN_STREAMING_WALLET_E2E =
    process.env.RUN_STREAMING_WALLET_E2E === "1" ||
    process.env.RUN_STREAMING_WALLET_E2E === "true";
const describeLive =
    liveEnvResult.success && RUN_STREAMING_WALLET_E2E
        ? describe
        : describe.skip;

const TESTNET_TONCENTER_RPC = "https://testnet.toncenter.com/api/v2/jsonRPC";
const TONAPI_TESTNET_ACCOUNTS = "https://testnet.tonapi.io/v2/accounts";

const TON_TRANSFER_VALUE = toNano("0.001");
const JETTON_TRANSFER_MESSAGE_VALUE = toNano("0.03");
const TRACE_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 500;
const ADDRESS_STREAM_TYPES = [
    "transactions",
    "actions",
    "account_state_change",
    "jettons_change",
] as const;

type SupportedWalletVersion = z.infer<typeof liveEnvSchema>["WALLET_VERSION"];
type SupportedWallet =
    | WalletContractV3R1
    | WalletContractV3R2
    | WalletContractV4
    | WalletContractV5R1;

type WalletContext = {
    version: SupportedWalletVersion;
    contract: SupportedWallet;
    secretKey: Buffer;
};

type ObservedAddressEvents = {
    transactions: StreamingTransactionsEvent[];
    actions: StreamingActionsEvent[];
    traces: StreamingTraceEvent[];
    accountStates: StreamingAccountStateEvent[];
    jettons: StreamingJettonsEvent[];
    errors: Error[];
};

type AddressEventCursor = {
    transactions: number;
    actions: number;
    traces: number;
    accountStates: number;
    jettons: number;
};

type SendObservation = {
    cursor: AddressEventCursor;
    transactions: StreamingTransactionsEvent;
    actions: StreamingActionsEvent;
    trace: StreamingTraceEvent;
    accountState: StreamingAccountStateEvent;
};

type StreamLogSource = "address-stream" | "trace-stream";

type StreamLogEntry = {
    timestamp: string;
    source: StreamLogSource;
    type:
        | "transactions"
        | "actions"
        | "trace"
        | "account_state_change"
        | "jettons_change"
        | "error";
    summary: string;
    payload: unknown;
};

type StreamingLogWriter = {
    filePath: string;
    recordEvent(
        source: StreamLogSource,
        type: StreamLogEntry["type"],
        event: unknown,
    ): void;
    recordError(source: StreamLogSource, error: Error): void;
    flush(): void;
};

const tonApiJettonsSchema = z.object({
    balances: z.array(
        z.object({
            balance: z.string(),
            wallet_address: z.object({
                address: z.string(),
            }),
            jetton: z.object({
                address: z.string(),
                symbol: z.string().optional(),
                name: z.string().optional(),
            }),
        }),
    ),
});

describeLive("streaming wallet testnet e2e", () => {
    jest.setTimeout(30_000);

    let env: z.infer<typeof liveEnvSchema>;
    let wallet: WalletContext;
    let auxRecipient: WalletContractV4;
    let tonClient: TonClient;
    let addressStream: StreamingClient;
    let traceStream: StreamingClient;
    let addressEvents: ObservedAddressEvents;
    let logWriter: StreamingLogWriter;
    let detachAddressHandlers: () => void;
    let detachTraceHandlers: () => void;

    beforeAll(async () => {
        if (!liveEnvResult.success) {
            throw new Error(
                `Invalid live streaming environment: ${liveEnvResult.error.message}`,
            );
        }

        env = liveEnvResult.data;
        const mnemonicWords = env.WALLET_MNEMONIC.trim().split(/\s+/);
        const keyPair = await mnemonicToPrivateKey(mnemonicWords);

        wallet = createWalletContext(env.WALLET_VERSION, keyPair);
        auxRecipient = WalletContractV4.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
            walletId: 0,
        });

        tonClient = new TonClient({
            endpoint: TESTNET_TONCENTER_RPC,
            apiKey: env.TONCENTER_API_KEY,
        });

        const streamingApiKey =
            env.STREAMING_PROVIDER === "tonapi"
                ? env.TONAPI_API_KEY
                : env.TONCENTER_API_KEY;

        addressStream = createStreamingClient(
            env.CONNECTION_TYPE,
            env.STREAMING_PROVIDER,
            streamingApiKey,
        );
        traceStream = createStreamingClient(
            env.CONNECTION_TYPE,
            env.STREAMING_PROVIDER,
            streamingApiKey,
        );

        addressEvents = {
            transactions: [],
            actions: [],
            traces: [],
            accountStates: [],
            jettons: [],
            errors: [],
        };

        logWriter = createStreamingLogWriter({
            connectionType: env.CONNECTION_TYPE,
            provider: env.STREAMING_PROVIDER,
            walletAddress: wallet.contract.address,
        });

        detachAddressHandlers = attachEventCollectors(
            addressStream,
            "address-stream",
            addressEvents,
            logWriter,
        );
        detachTraceHandlers = attachEventCollectors(
            traceStream,
            "trace-stream",
            addressEvents,
            logWriter,
        );

        const walletProvider = tonClient.provider(
            wallet.contract.address,
            wallet.contract.init,
        );
        const balance = await wallet.contract.getBalance(walletProvider);
        expect(balance).toBeGreaterThan(TON_TRANSFER_VALUE);

        await addressStream.subscribe(
            addressSubscription(wallet.contract.address),
        );
        expect(addressStream.ready).toBe(true);
    });

    afterAll(async () => {
        detachAddressHandlers();
        detachTraceHandlers();
        await Promise.all([
            addressStream.close(),
            traceStream.close(),
        ]);
        logWriter.flush();
    });

    afterAll(() => {
        expect(addressEvents.errors).toEqual([]);
    });

    it("streams address updates for a TON self-transfer", async () => {
        const observation = await sendAndObserve({
            addressEvents,
            traceStreaming: traceStream,
            tonClient,
            wallet,
            buildMessages: () => [
                internal({
                    to: wallet.contract.address,
                    value: TON_TRANSFER_VALUE,
                    bounce: false,
                    body: "streaming wallet e2e ton transfer",
                }),
            ],
        });

        expectObservedSend(observation, wallet.contract.address);
    });

    it("streams address and jetton updates for a jetton transfer", async () => {
        const transferableJetton = await discoverTransferableJetton(
            env.TONAPI_API_KEY,
            wallet.contract.address,
        );

        if (!transferableJetton) {
            console.warn(
                "No transferable jetton found on testnet wallet — skipping jetton assertions",
            );
            return;
        }

        const walletProvider = tonClient.provider(
            wallet.contract.address,
            wallet.contract.init,
        );
        const balance = await wallet.contract.getBalance(walletProvider);
        expect(balance).toBeGreaterThan(
            TON_TRANSFER_VALUE + JETTON_TRANSFER_MESSAGE_VALUE,
        );

        const jettonMaster = JettonMaster.create(
            Address.parse(transferableJetton.jettonAddress),
        );
        const jettonWalletAddress = Address.parse(
            transferableJetton.walletAddress,
        );
        const resolvedWalletAddress = await tonClient
            .open(jettonMaster)
            .getWalletAddress(wallet.contract.address);
        expect(resolvedWalletAddress.equals(jettonWalletAddress)).toBeTruthy();

        const jettonWallet = JettonWallet.create(jettonWalletAddress);
        const jettonBalance = await tonClient.open(jettonWallet).getBalance();
        expect(jettonBalance).toBeGreaterThan(0n);
        const jettonTransferAmount = jettonBalance > 1n ? 1n : jettonBalance;

        const observation = await sendAndObserve({
            addressEvents,
            traceStreaming: traceStream,
            tonClient,
            wallet,
            buildMessages: () => [
                internal({
                    to: jettonWalletAddress,
                    value: JETTON_TRANSFER_MESSAGE_VALUE,
                    bounce: true,
                    body: createJettonTransferBody({
                        amount: jettonTransferAmount,
                        destination: auxRecipient.address,
                        responseDestination: wallet.contract.address,
                        commentText: "streaming wallet e2e jetton transfer",
                    }),
                }),
            ],
        });

        expectObservedSend(observation, wallet.contract.address);

        const jettonsEvent = await waitForNextEvent(
            "jettons_change event",
            addressEvents.jettons,
            observation.cursor.jettons,
            (event) => sameAddress(event.jetton.address, jettonWalletAddress),
        );

        expect(
            sameAddress(jettonsEvent.jetton.owner, wallet.contract.address),
        ).toBe(true);
    });
});

function normalizeConnectionType(value: string): "sse" | "websocket" {
    if (value === "ws" || value === "websocket") {
        return "websocket";
    }

    if (value === "sse") {
        return "sse";
    }

    return value as "sse" | "websocket";
}

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------

function createWalletContext(
    version: SupportedWalletVersion,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
): WalletContext {
    switch (version) {
        case "v3r1":
            return {
                version,
                contract: WalletContractV3R1.create({
                    workchain: 0,
                    publicKey: keyPair.publicKey,
                }),
                secretKey: keyPair.secretKey,
            };
        case "v3r2":
            return {
                version,
                contract: WalletContractV3R2.create({
                    workchain: 0,
                    publicKey: keyPair.publicKey,
                }),
                secretKey: keyPair.secretKey,
            };
        case "v4":
            return {
                version,
                contract: WalletContractV4.create({
                    workchain: 0,
                    publicKey: keyPair.publicKey,
                }),
                secretKey: keyPair.secretKey,
            };
        case "v5":
            return {
                version,
                contract: WalletContractV5R1.create({
                    publicKey: keyPair.publicKey,
                    walletId: {
                        networkGlobalId: -3,
                        context: {
                            workchain: 0,
                            walletVersion: "v5r1",
                            subwalletNumber: 0,
                        },
                    },
                }),
                secretKey: keyPair.secretKey,
            };
    }
}

async function createTransferBody(
    wallet: WalletContext,
    tonClient: TonClient,
    messages: MessageRelaxed[],
): Promise<Cell> {
    const provider = tonClient.provider(
        wallet.contract.address,
        wallet.contract.init,
    );
    const seqno = await wallet.contract.getSeqno(provider);
    const baseArgs = {
        seqno,
        secretKey: wallet.secretKey,
        messages,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
    };

    switch (wallet.version) {
        case "v3r1":
            return (wallet.contract as WalletContractV3R1).createTransfer(
                baseArgs,
            ) as Cell;
        case "v3r2":
            return (wallet.contract as WalletContractV3R2).createTransfer(
                baseArgs,
            ) as Cell;
        case "v4":
            return (wallet.contract as WalletContractV4).createTransfer(
                baseArgs,
            ) as Cell;
        case "v5":
            return (await (
                wallet.contract as WalletContractV5R1
            ).createTransfer(baseArgs)) as Cell;
    }
}

// ---------------------------------------------------------------------------
// Jetton helpers
// ---------------------------------------------------------------------------

async function discoverTransferableJetton(
    tonApiApiKey: string,
    ownerAddress: Address,
): Promise<{
    walletAddress: string;
    jettonAddress: string;
} | null> {
    const response = await axios.get(
        `${TONAPI_TESTNET_ACCOUNTS}/${encodeURIComponent(toTestnetFriendly(ownerAddress))}/jettons`,
        {
            headers: {
                Authorization: `Bearer ${tonApiApiKey}`,
            },
            timeout: 5_000,
        },
    );

    const parsed = tonApiJettonsSchema.parse(response.data);
    const firstNonZero = parsed.balances.find(
        (balance) => BigInt(balance.balance) > 0n,
    );
    if (!firstNonZero) {
        return null;
    }

    return {
        walletAddress: firstNonZero.wallet_address.address,
        jettonAddress: firstNonZero.jetton.address,
    };
}

function createJettonTransferBody(args: {
    amount: bigint;
    destination: Address;
    responseDestination: Address;
    commentText: string;
}): Cell {
    return beginCell()
        .storeUint(0x0f8a7ea5, 32)
        .storeUint(BigInt(Date.now()), 64)
        .storeCoins(args.amount)
        .storeAddress(args.destination)
        .storeAddress(args.responseDestination)
        .storeBit(0)
        .storeCoins(1n)
        .storeBit(1)
        .storeRef(comment(args.commentText))
        .endCell();
}

// ---------------------------------------------------------------------------
// Streaming: send + observe
// ---------------------------------------------------------------------------

async function sendAndObserve(args: {
    addressEvents: ObservedAddressEvents;
    traceStreaming: StreamingClient;
    tonClient: TonClient;
    wallet: WalletContext;
    buildMessages: () => MessageRelaxed[];
}): Promise<SendObservation> {
    const cursor = markAddressEvents(args.addressEvents);

    const messages = args.buildMessages();
    const transferBody = await createTransferBody(
        args.wallet,
        args.tonClient,
        messages,
    );
    const deployed = await args.tonClient.isContractDeployed(
        args.wallet.contract.address,
    );
    const externalMessage = external({
        to: args.wallet.contract.address,
        init:
            !deployed && args.wallet.contract.init
                ? args.wallet.contract.init
                : undefined,
        body: transferBody,
    });

    await args.traceStreaming.subscribe(
        traceSubscription(getExternalMessageHashNorm(externalMessage)),
    );

    await args.tonClient.sendMessage(externalMessage);

    const [transactions, actions, accountState] = await Promise.all([
        waitForNextEvent(
            "transactions event",
            args.addressEvents.transactions,
            cursor.transactions,
        ),
        waitForNextEvent(
            "actions event",
            args.addressEvents.actions,
            cursor.actions,
        ),
        waitForNextEvent(
            "account_state_change event",
            args.addressEvents.accountStates,
            cursor.accountStates,
        ),
    ]);
    const trace = await waitForNextEvent(
        "trace event",
        args.addressEvents.traces,
        cursor.traces,
    );

    return { cursor, transactions, actions, trace, accountState };
}

// ---------------------------------------------------------------------------
// Streaming: subscriptions + event collection
// ---------------------------------------------------------------------------

function attachEventCollectors(
    target: StreamingClient,
    source: StreamLogSource,
    sink: ObservedAddressEvents,
    logWriter: StreamingLogWriter,
): () => void {
    const detachers: (() => void)[] = [];

    if (source === "address-stream") {
        detachers.push(
            target.on("transactions", (event) => {
                logWriter.recordEvent(source, event.type, event);
                sink.transactions.push(event);
            }),
            target.on("actions", (event) => {
                logWriter.recordEvent(source, event.type, event);
                sink.actions.push(event);
            }),
            target.on("account_state_change", (event) => {
                logWriter.recordEvent(source, event.type, event);
                sink.accountStates.push(event);
            }),
            target.on("jettons_change", (event) => {
                logWriter.recordEvent(source, event.type, event);
                sink.jettons.push(event);
            }),
        );
    }

    if (source === "trace-stream") {
        detachers.push(
            target.on("trace", (event) => {
                logWriter.recordEvent(source, event.type, event);
                sink.traces.push(event);
            }),
        );
    }

    detachers.push(
        target.on("error", (error) => {
            logWriter.recordError(source, error);
            if (!isExpectedStreamingAbort(error)) {
                sink.errors.push(error);
            }
        }),
    );

    return () => detachers.forEach((d) => d());
}

function markAddressEvents(events: ObservedAddressEvents): AddressEventCursor {
    return {
        transactions: events.transactions.length,
        actions: events.actions.length,
        traces: events.traces.length,
        accountStates: events.accountStates.length,
        jettons: events.jettons.length,
    };
}

function addressSubscription(address: Address) {
    return {
        addresses: [toTestnetFriendly(address)],
        types: ADDRESS_STREAM_TYPES,
        minFinality: "confirmed" as const,
        includeAddressBook: true,
        includeMetadata: true,
    };
}

function traceSubscription(traceExternalHashNorm: string) {
    return {
        traceExternalHashNorms: [traceExternalHashNorm],
        types: ["trace"] as const,
        minFinality: "confirmed" as const,
        includeAddressBook: true,
        includeMetadata: true,
    };
}

function getExternalMessageHashNorm(message: Message): string {
    if (message.info.type !== "external-in") {
        return message.body.hash().toString("hex");
    }

    return beginCell()
        .storeUint(2, 2)
        .storeUint(0, 2)
        .storeAddress(message.info.dest)
        .storeUint(0, 4)
        .storeBit(false)
        .storeBit(true)
        .storeRef(message.body)
        .endCell()
        .hash()
        .toString("base64");
}

function isExpectedStreamingAbort(error: Error): boolean {
    return /aborted/i.test(error.message);
}

// ---------------------------------------------------------------------------
// Streaming: client lifecycle
// ---------------------------------------------------------------------------

function createStreamingClient(
    connectionType: "sse" | "websocket",
    service: "toncenter" | "tonapi",
    apiKey: string,
): StreamingClient {
    if (connectionType === "websocket") {
        return new TonWsClient({
            service,
            network: "testnet",
            apiKey,
        });
    }

    return new TonSseClient({
        service,
        network: "testnet",
        apiKey,
    });
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function expectObservedSend(
    observation: SendObservation,
    walletAddress: Address,
) {
    expect(observation.transactions.transactions.length).toBeGreaterThan(0);
    expect(observation.actions.actions.length).toBeGreaterThan(0);
    expect(Object.keys(observation.trace.transactions).length).toBeGreaterThan(
        0,
    );

    const traceHash = observation.transactions.trace_external_hash_norm;
    expect(traceHash).toBeTruthy();
    expect(traceHash).toBe(observation.actions.trace_external_hash_norm);
    expect(traceHash).toBe(observation.trace.trace_external_hash_norm);
    expect(
        sameAddress(observation.accountState.account, walletAddress),
    ).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function createStreamingLogWriter(args: {
    connectionType: "sse" | "websocket";
    provider: "toncenter" | "tonapi";
    walletAddress: Address;
}): StreamingLogWriter {
    const logsDir = path.join(
        process.cwd(),
        ".tmp",
        "streaming-wallet-e2e-logs",
    );
    fs.mkdirSync(logsDir, { recursive: true });

    const filePath = path.join(
        logsDir,
        `streaming-wallet-e2e-${Date.now()}-${args.connectionType}.json`,
    );
    const entries: StreamLogEntry[] = [];
    const meta = {
        createdAt: new Date().toISOString(),
        connectionType: args.connectionType,
        provider: args.provider,
        walletAddress: toTestnetFriendly(args.walletAddress),
    };

    writeStreamingLine(
        `Streaming raw log: ${path.relative(process.cwd(), filePath)}`,
    );

    return {
        filePath,
        recordEvent(source, type, event) {
            const summary = summarizeStreamingEvent(type, event);
            entries.push({
                timestamp: new Date().toISOString(),
                source,
                type,
                summary,
                payload: event,
            });
            writeStreamingLine(
                `${formatStreamSourceLabel(source)}: ${summary}`,
            );
        },
        recordError(source, error) {
            const payload = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
            const summary = `error name=${error.name} message=${error.message}`;
            entries.push({
                timestamp: new Date().toISOString(),
                source,
                type: "error",
                summary,
                payload,
            });
            writeStreamingLine(
                `${formatStreamSourceLabel(source)}: ${summary}`,
            );
        },
        flush() {
            fs.writeFileSync(
                filePath,
                JSON.stringify({ meta, entries }, null, 2),
                "utf8",
            );
        },
    };
}

function writeStreamingLine(line: string) {
    process.stdout.write(`${line}\n`);
}

function formatStreamSourceLabel(source: StreamLogSource): string {
    return source === "address-stream" ? "Address stream" : "Trace stream";
}

function summarizeStreamingEvent(
    type: StreamLogEntry["type"],
    event: unknown,
): string {
    switch (type) {
        case "transactions": {
            const payload = event as StreamingTransactionsEvent;
            return [
                "transactions",
                `finality=${payload.finality}`,
                `trace=${shortHash(payload.trace_external_hash_norm)}`,
                `count=${payload.transactions.length}`,
            ].join(" ");
        }
        case "actions": {
            const payload = event as StreamingActionsEvent;
            return [
                "actions",
                `finality=${payload.finality}`,
                `trace=${shortHash(payload.trace_external_hash_norm)}`,
                `count=${payload.actions.length}`,
            ].join(" ");
        }
        case "trace": {
            const payload = event as StreamingTraceEvent;
            return [
                "trace",
                `finality=${payload.finality}`,
                `trace=${shortHash(payload.trace_external_hash_norm)}`,
                `txs=${Object.keys(payload.transactions).length}`,
                `actions=${payload.actions?.length ?? 0}`,
            ].join(" ");
        }
        case "account_state_change": {
            const payload = event as StreamingAccountStateEvent;
            return [
                "account_state_change",
                `finality=${payload.finality}`,
                `account=${payload.account}`,
                `status=${payload.state.account_status}`,
                `balance=${payload.state.balance}`,
            ].join(" ");
        }
        case "jettons_change": {
            const payload = event as StreamingJettonsEvent;
            return [
                "jettons_change",
                `finality=${payload.finality}`,
                `wallet=${payload.jetton.address}`,
                `owner=${payload.jetton.owner}`,
                `balance=${payload.jetton.balance}`,
            ].join(" ");
        }
        case "error":
            return "error";
    }
}

// ---------------------------------------------------------------------------
// Generic utilities
// ---------------------------------------------------------------------------

async function waitForNextEvent<T>(
    label: string,
    events: readonly T[],
    startIndex: number,
    match: (event: T) => boolean = () => true,
): Promise<T> {
    return waitFor(label, TRACE_TIMEOUT_MS, () => {
        for (let i = startIndex; i < events.length; i++) {
            if (match(events[i])) return events[i];
        }
        return undefined;
    });
}

async function waitFor<T>(
    label: string,
    timeoutMs: number,
    probe: () => T | undefined | Promise<T | undefined>,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const result = await probe();
        if (result !== undefined) {
            return result;
        }
        await delay(POLL_INTERVAL_MS);
    }

    throw new Error(`Timed out waiting for ${label}`);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortHash(value: string): string {
    if (value.length <= 16) {
        return value;
    }

    return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function toTestnetFriendly(address: Address): string {
    return address.toString({
        bounceable: true,
        urlSafe: true,
        testOnly: true,
    });
}

function sameAddress(left: string, right: Address): boolean {
    return Address.parse(left).equals(right);
}
