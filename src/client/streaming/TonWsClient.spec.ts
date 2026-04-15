import { TonWsClient } from "./TonWsClient";
import { IWebSocket } from "./types";

class MockWebSocket implements IWebSocket {
    static readonly OPEN = 1;
    static instances: MockWebSocket[] = [];

    readonly url: string;
    readyState = 0;
    sent: string[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
    }

    open(): void {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.({});
    }

    failBeforeOpen(): void {
        this.readyState = 3;
        this.onclose?.({});
    }

    receive(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }

    serverClose(): void {
        this.readyState = 3;
        this.onclose?.({});
    }
}

async function flushAsyncWork(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}

describe("TonWsClient", () => {
    beforeEach(() => {
        MockWebSocket.instances = [];
    });

    function createClient(
        parameters: Partial<ConstructorParameters<typeof TonWsClient>[0]> = {},
    ) {
        return new TonWsClient({
            endpoint: "wss://example.test/stream",
            WebSocket: MockWebSocket,
            pingIntervalMs: 0,
            ...parameters,
        });
    }

    it("rejects connect when the socket closes before opening", async () => {
        const client = createClient();

        const connectPromise = client.connect();
        MockWebSocket.instances[0].failBeforeOpen();

        await expect(connectPromise).rejects.toThrow(
            "WebSocket connection closed before opening",
        );
        expect(client.connected).toBe(false);
    });

    it.each([
        {
            name: "uses api_key query parameter by default",
            parameters: {
                endpoint: "wss://toncenter.com/api/streaming/v2/ws",
                apiKey: "secret",
            },
            expectedUrl:
                "wss://toncenter.com/api/streaming/v2/ws?api_key=secret",
        },
        {
            name: "uses custom apiKeyParam when provided",
            parameters: {
                endpoint: "wss://tonapi.io/streaming/v2/ws",
                apiKey: "secret",
                apiKeyParam: "token",
            },
            expectedUrl: "wss://tonapi.io/streaming/v2/ws?token=secret",
        },
        {
            name: "resolves Toncenter mainnet provider defaults",
            parameters: {
                provider: "toncenterMainnet" as const,
                apiKey: "secret",
                endpoint: "wss://example.test/ignored",
                apiKeyParam: "ignored_token",
            },
            expectedUrl:
                "wss://toncenter.com/api/streaming/v2/ws?api_key=secret",
        },
        {
            name: "resolves TonAPI mainnet provider defaults",
            parameters: {
                provider: "tonapiMainnet" as const,
                apiKey: "secret",
                endpoint: "wss://example.test/ignored",
                apiKeyParam: "ignored_api_key",
            },
            expectedUrl: "wss://tonapi.io/streaming/v2/ws?token=secret",
        },
        {
            name: "resolves Toncenter testnet provider defaults",
            parameters: {
                provider: "toncenterTestnet" as const,
                apiKey: "secret",
                endpoint: "wss://example.test/ignored",
                apiKeyParam: "ignored_token",
            },
            expectedUrl:
                "wss://testnet.toncenter.com/api/streaming/v2/ws?api_key=secret",
        },
        {
            name: "resolves TonAPI testnet provider defaults",
            parameters: {
                provider: "tonapiTestnet" as const,
                apiKey: "secret",
                endpoint: "wss://example.test/ignored",
                apiKeyParam: "ignored_api_key",
            },
            expectedUrl: "wss://testnet.tonapi.io/streaming/v2/ws?token=secret",
        },
    ])("$name", async ({ parameters, expectedUrl }) => {
        const client = createClient(parameters);

        const connectPromise = client.connect();
        expect(MockWebSocket.instances[0].url).toBe(expectedUrl);

        MockWebSocket.instances[0].open();
        await connectPromise;
        client.close();
    });

    it("requires endpoint when provider is not specified", () => {
        expect(
            () =>
                new TonWsClient({
                    WebSocket: MockWebSocket,
                }),
        ).toThrow(
            "Streaming endpoint is required when provider is not specified",
        );
    });

    it("connect(params) opens the socket and subscribes in a single call", async () => {
        const client = createClient();

        const connectPromise = client.connect({
            addresses: ["EQC123"],
            types: ["transactions"],
            minFinality: "confirmed",
        });
        const ws = MockWebSocket.instances[0];

        ws.open();
        await flushAsyncWork();
        expect(ws.sent).toHaveLength(1);
        expect(JSON.parse(ws.sent[0])).toEqual({
            operation: "subscribe",
            id: "1",
            addresses: ["EQC123"],
            types: ["transactions"],
            min_finality: "confirmed",
        });

        ws.receive({ id: "1", status: "subscribed" });
        await connectPromise;

        expect(client.connected).toBe(true);
        client.close();
    });

    it("reuses the previous subscription when reconnecting without params", async () => {
        const client = createClient();

        const firstConnect = client.connect({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws1 = MockWebSocket.instances[0];
        ws1.open();
        await flushAsyncWork();
        ws1.receive({ id: "1", status: "subscribed" });
        await firstConnect;

        client.close();
        ws1.serverClose();

        const reconnectPromise = client.connect();
        const ws2 = MockWebSocket.instances[1];
        ws2.open();
        await flushAsyncWork();

        expect(ws2.sent).toHaveLength(1);
        expect(JSON.parse(ws2.sent[0])).toEqual({
            operation: "subscribe",
            id: "2",
            addresses: ["EQC123"],
            types: ["transactions"],
        });

        ws2.receive({ id: "2", status: "subscribed" });
        await reconnectPromise;

        expect(client.connected).toBe(true);
        client.close();
    });

    it("replaces stale targets when connect(params) updates an open snapshot", async () => {
        const client = createClient();

        const firstConnect = client.connect({
            addresses: ["EQ1", "EQ2"],
            traceExternalHashNorms: ["trace-1", "trace-2"],
            types: ["transactions", "trace"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await firstConnect;

        const secondConnect = client.connect({
            addresses: ["EQ2", "EQ3"],
            traceExternalHashNorms: ["trace-2", "trace-3"],
            types: ["transactions", "trace"],
        });
        await flushAsyncWork();

        expect(JSON.parse(ws.sent[1])).toEqual({
            operation: "unsubscribe",
            id: "2",
            addresses: ["EQ1"],
            trace_external_hash_norms: ["trace-1"],
        });

        ws.receive({ id: "2", status: "unsubscribed" });
        await flushAsyncWork();

        expect(JSON.parse(ws.sent[2])).toEqual({
            operation: "subscribe",
            id: "3",
            addresses: ["EQ2", "EQ3"],
            trace_external_hash_norms: ["trace-2", "trace-3"],
            types: ["transactions", "trace"],
        });

        ws.receive({ id: "3", status: "subscribed" });
        await secondConnect;

        client.close();
    });

    it("emits close only after the native socket close arrives", async () => {
        const client = createClient();
        let closeEvents = 0;

        client.on("close", () => {
            closeEvents += 1;
        });

        const connectPromise = client.connect();
        const ws = MockWebSocket.instances[0];
        ws.open();
        await connectPromise;

        client.close();
        expect(closeEvents).toBe(0);
        expect(client.connected).toBe(false);

        ws.serverClose();
        expect(closeEvents).toBe(1);
    });

    it("rejects connect immediately but defers close until the socket actually closes", async () => {
        const client = createClient();
        let closeEvents = 0;

        client.on("close", () => {
            closeEvents += 1;
        });

        const connectPromise = client.connect();
        const ws = MockWebSocket.instances[0];

        client.close();

        await expect(connectPromise).rejects.toThrow(
            "WebSocket connection was closed",
        );
        expect(closeEvents).toBe(0);

        ws.serverClose();
        expect(closeEvents).toBe(1);
    });

    it("updates the stored snapshot when unsubscribing while disconnected", async () => {
        const client = createClient();

        const firstConnect = client.connect({
            addresses: ["EQ1"],
            traceExternalHashNorms: ["trace-1"],
            types: ["transactions", "trace"],
        });
        const ws1 = MockWebSocket.instances[0];
        ws1.open();
        await flushAsyncWork();
        ws1.receive({ id: "1", status: "subscribed" });
        await firstConnect;

        client.close();
        ws1.serverClose();
        await client.unsubscribe({ addresses: ["EQ1"] });

        const reconnectPromise = client.connect();
        const ws2 = MockWebSocket.instances[1];
        ws2.open();
        await flushAsyncWork();

        expect(JSON.parse(ws2.sent[0])).toEqual({
            operation: "subscribe",
            id: "2",
            trace_external_hash_norms: ["trace-1"],
            types: ["trace"],
        });

        ws2.receive({ id: "2", status: "subscribed" });
        await reconnectPromise;
        client.close();
    });

    it("removes stale targets before replacing the active snapshot", async () => {
        const client = createClient();

        const connectPromise = client.connect({
            addresses: ["EQ1", "EQ2"],
            traceExternalHashNorms: ["trace-1", "trace-2"],
            types: ["transactions", "trace"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await connectPromise;

        const replacePromise = client.subscribe({
            addresses: ["EQ2", "EQ3"],
            traceExternalHashNorms: ["trace-2", "trace-3"],
            types: ["transactions", "trace"],
        });
        await flushAsyncWork();

        expect(JSON.parse(ws.sent[1])).toEqual({
            operation: "unsubscribe",
            id: "2",
            addresses: ["EQ1"],
            trace_external_hash_norms: ["trace-1"],
        });

        ws.receive({ id: "2", status: "unsubscribed" });
        await flushAsyncWork();

        expect(JSON.parse(ws.sent[2])).toEqual({
            operation: "subscribe",
            id: "3",
            addresses: ["EQ2", "EQ3"],
            trace_external_hash_norms: ["trace-2", "trace-3"],
            types: ["transactions", "trace"],
        });

        ws.receive({ id: "3", status: "subscribed" });
        await replacePromise;

        client.close();
    });

    it("surfaces invalid notifications through the error channel", async () => {
        const client = createClient();
        const errors: Error[] = [];
        const transactions: unknown[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });
        client.on("transactions", (event) => {
            transactions.push(event);
        });

        const connectPromise = client.connect();
        const ws = MockWebSocket.instances[0];
        ws.open();
        await connectPromise;

        ws.receive({
            type: "transactions",
            finality: "pending",
            trace_external_hash_norm: "trace-1",
            transactions: "oops",
        });

        expect(transactions).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain(
            "transactions.transactions must be an array",
        );

        client.close();
    });
});
