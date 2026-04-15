import {
    StreamingClosedError,
    StreamingError,
    StreamingRequestTimeoutError,
    StreamingTransportError,
} from "./errors";
import { TonWsClient } from "./TonWsClient";
import { IWebSocket } from "./types";

class MockWebSocket implements IWebSocket {
    static readonly OPEN = 1;
    static instances: MockWebSocket[] = [];

    readonly url: string;
    readonly options: unknown;
    readyState = 0;
    sent: string[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(url: string, options?: unknown) {
        this.url = url;
        this.options = options;
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
        const hasService = "service" in parameters;
        return new TonWsClient({
            ...(hasService ? {} : { endpoint: "wss://example.test/stream" }),
            WebSocket: MockWebSocket,
            pingIntervalMs: 0,
            ...parameters,
        });
    }

    it("rejects subscribe when the socket closes before opening", async () => {
        const client = createClient();

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        MockWebSocket.instances[0].failBeforeOpen();

        await expect(subscribePromise).rejects.toThrow(
            "WebSocket connection closed before opening",
        );
        expect(client.ready).toBe(false);
    });

    it("rejects timed out requests with a typed timeout error", async () => {
        jest.useFakeTimers();
        const client = createClient({ requestTimeoutMs: 25 });

        try {
            const subscribePromise = client.subscribe({
                addresses: ["EQC123"],
                types: ["transactions"],
            });
            const errorPromise = subscribePromise.catch((error) => error);
            const ws = MockWebSocket.instances[0];

            ws.open();
            await Promise.resolve();
            await jest.advanceTimersByTimeAsync(25);

            const error = await errorPromise;

            expect(error).toBeInstanceOf(StreamingRequestTimeoutError);
            expect(error).toMatchObject({
                context: {
                    endpoint: "wss://example.test/stream",
                    requestId: "1",
                    transport: "ws",
                },
                message: "Streaming request 1 timed out",
            });
        } finally {
            jest.useRealTimers();
            client.close();
        }
    });

    it("rejects protocol failures with request context", async () => {
        const client = createClient();

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];

        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", error: "Subscription rejected" });

        await expect(subscribePromise).rejects.toMatchObject({
            context: {
                endpoint: "wss://example.test/stream",
                requestId: "1",
                transport: "ws",
            },
            message: "Subscription rejected",
        });
        await expect(subscribePromise).rejects.toBeInstanceOf(StreamingError);

        client.close();
    });

    it("emits a typed closed error when the server ends an active stream", async () => {
        const client = createClient();
        const errors: Error[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];

        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;

        ws.serverClose();

        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(StreamingClosedError);
        expect(errors[0]).toMatchObject({
            context: {
                endpoint: "wss://example.test/stream",
                phase: "stream",
                transport: "ws",
            },
            message: "Streaming WebSocket stream closed by server",
        });
    });

    it("surfaces heartbeat timeouts as error+close without implicit reconnect", async () => {
        const client = createClient({
            pingIntervalMs: 20,
            requestTimeoutMs: 50,
        });
        const errors: Error[] = [];
        let closeEvents = 0;
        let openEvents = 0;

        client.on("error", (error) => {
            errors.push(error);
        });
        client.on("close", () => {
            closeEvents += 1;
        });
        client.on("open", () => {
            openEvents += 1;
        });

        try {
            const subscribePromise = client.subscribe({
                addresses: ["EQC123"],
                types: ["transactions"],
            });
            const ws1 = MockWebSocket.instances[0];

            ws1.open();
            await flushAsyncWork();
            expect(JSON.parse(ws1.sent[0])).toEqual({
                operation: "subscribe",
                id: "1",
                addresses: ["EQC123"],
                types: ["transactions"],
            });
            ws1.receive({ id: "1", status: "subscribed" });
            await subscribePromise;

            expect(client.ready).toBe(true);
            expect(openEvents).toBe(1);

            await new Promise((resolve) => setTimeout(resolve, 25));
            expect(JSON.parse(ws1.sent[1])).toEqual({
                operation: "ping",
                id: "2",
            });

            await new Promise((resolve) => setTimeout(resolve, 55));
            await flushAsyncWork();
            await flushAsyncWork();

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBeInstanceOf(StreamingError);
            expect(errors[0]).toMatchObject({
                context: {
                    endpoint: "wss://example.test/stream",
                    phase: "heartbeat",
                    requestId: "2",
                    transport: "ws",
                },
                message: "Streaming request 2 timed out",
            });
            expect(closeEvents).toBe(1);
            expect(client.ready).toBe(false);

            // No implicit reconnect — only 1 WebSocket instance created
            expect(MockWebSocket.instances).toHaveLength(1);
        } finally {
            client.close();
        }
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
            name: "resolves Toncenter mainnet service defaults",
            parameters: {
                service: "toncenter" as const,
                apiKey: "secret",
            },
            expectedUrl:
                "wss://toncenter.com/api/streaming/v2/ws?api_key=secret",
        },
        {
            name: "resolves TonAPI mainnet service defaults",
            parameters: {
                service: "tonapi" as const,
                apiKey: "secret",
            },
            expectedUrl: "wss://tonapi.io/streaming/v2/ws?token=secret",
        },
        {
            name: "resolves Toncenter testnet service defaults",
            parameters: {
                service: "toncenter" as const,
                network: "testnet" as const,
                apiKey: "secret",
            },
            expectedUrl:
                "wss://testnet.toncenter.com/api/streaming/v2/ws?api_key=secret",
        },
        {
            name: "resolves TonAPI testnet service defaults",
            parameters: {
                service: "tonapi" as const,
                network: "testnet" as const,
                apiKey: "secret",
            },
            expectedUrl: "wss://testnet.tonapi.io/streaming/v2/ws?token=secret",
        },
    ])("$name", async ({ parameters, expectedUrl }) => {
        const client = createClient(parameters);

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        expect(ws.url).toBe(expectedUrl);

        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;
        client.close();
    });

    it("passes headers to a custom WebSocket constructor when provided", async () => {
        const client = createClient({
            headers: {
                Authorization: "Bearer secret",
                "X-Test": "1",
            },
        });

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        expect(MockWebSocket.instances[0].options).toEqual({
            headers: {
                Authorization: "Bearer secret",
                "X-Test": "1",
            },
        });

        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;
        client.close();
    });

    it("throws when headers are provided without a custom WebSocket constructor", () => {
        expect(
            () =>
                new TonWsClient({
                    endpoint: "wss://example.test/stream",
                    headers: { Authorization: "Bearer secret" },
                }),
        ).toThrow("Custom headers require a custom WebSocket constructor");
    });

    it("requires endpoint when service is not specified", () => {
        expect(
            () =>
                new TonWsClient({
                    WebSocket: MockWebSocket,
                }),
        ).toThrow(
            "Streaming endpoint is required when service is not specified",
        );
    });

    it("subscribe opens the socket and subscribes in a single call", async () => {
        const client = createClient();
        let openEvents = 0;

        client.on("open", () => {
            openEvents += 1;
        });

        const subscribePromise = client.subscribe({
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
        await subscribePromise;

        expect(client.ready).toBe(true);
        expect(openEvents).toBe(1);
        client.close();
    });

    it("replaces the active snapshot with a single subscribe", async () => {
        const client = createClient();

        const firstSubscribe = client.subscribe({
            addresses: ["EQ1", "EQ2"],
            traceExternalHashNorms: ["trace-1", "trace-2"],
            types: ["transactions", "trace"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await firstSubscribe;

        const replacePromise = client.subscribe({
            addresses: ["EQ2", "EQ3"],
            traceExternalHashNorms: ["trace-2", "trace-3"],
            types: ["transactions", "trace"],
        });
        await flushAsyncWork();

        expect(ws.sent).toHaveLength(2);
        const sent = JSON.parse(ws.sent[1]);
        expect(sent.operation).toBe("subscribe");
        expect(sent.types).toEqual(["trace", "transactions"]);
        expect(sent.addresses).toEqual(["EQ2", "EQ3"]);
        expect(sent.trace_external_hash_norms).toEqual(["trace-2", "trace-3"]);

        ws.receive({ id: sent.id, status: "subscribed" });
        await replacePromise;

        client.close();
    });

    it("serializes concurrent subscribe replacements", async () => {
        const client = createClient();

        const subscribePromise = client.subscribe({
            addresses: ["EQ1"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;

        const firstReplace = client.subscribe({
            addresses: ["EQ2"],
            types: ["transactions"],
        });
        const secondReplace = client.subscribe({
            addresses: ["EQ3"],
            types: ["transactions"],
        });

        await flushAsyncWork();

        expect(ws.sent).toHaveLength(2);
        const firstSent = JSON.parse(ws.sent[1]);
        expect(firstSent.addresses).toEqual(["EQ2"]);

        ws.receive({ id: firstSent.id, status: "subscribed" });
        await flushAsyncWork();

        const secondSent = JSON.parse(ws.sent[2]);
        expect(secondSent.addresses).toEqual(["EQ3"]);

        ws.receive({ id: secondSent.id, status: "subscribed" });
        await Promise.all([firstReplace, secondReplace]);

        client.close();
    });

    it("rejects queued subscribe replacements on close without reopening the socket", async () => {
        const client = createClient();

        const subscribePromise = client.subscribe({
            addresses: ["EQ1"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;

        const firstReplace = client.subscribe({
            addresses: ["EQ2"],
            types: ["transactions"],
        });
        const secondReplace = client.subscribe({
            addresses: ["EQ3"],
            types: ["transactions"],
        });

        await flushAsyncWork();

        const closePromise = client.close();

        await expect(firstReplace).rejects.toBeInstanceOf(StreamingClosedError);
        await expect(secondReplace).rejects.toBeInstanceOf(
            StreamingClosedError,
        );
        expect(MockWebSocket.instances).toHaveLength(1);

        ws.serverClose();
        await closePromise;

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("emits close immediately when the logical stream is closed explicitly", async () => {
        const client = createClient();
        let closeEvents = 0;

        client.on("close", () => {
            closeEvents += 1;
        });

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;

        client.close();
        expect(closeEvents).toBe(1);
        expect(client.ready).toBe(false);

        ws.serverClose();
        expect(closeEvents).toBe(1);
    });

    it("rejects pending subscribe immediately on close and resolves close after transport shutdown", async () => {
        const client = createClient();

        const firstSubscribe = client.subscribe({
            addresses: ["EQ1"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await firstSubscribe;

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        await flushAsyncWork();

        let closeResolved = false;
        const closePromise = client.close().then(() => {
            closeResolved = true;
        });

        await expect(subscribePromise).rejects.toBeInstanceOf(
            StreamingClosedError,
        );
        expect(closeResolved).toBe(false);

        ws.serverClose();
        await closePromise;
        expect(closeResolved).toBe(true);
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

        const subscribePromise = client.subscribe({
            addresses: ["EQC123"],
            types: ["transactions"],
        });
        const ws = MockWebSocket.instances[0];
        ws.open();
        await flushAsyncWork();
        ws.receive({ id: "1", status: "subscribed" });
        await subscribePromise;

        ws.receive({
            type: "transactions",
            finality: "pending",
            trace_external_hash_norm: "trace-1",
            transactions: "oops",
        });

        expect(transactions).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(StreamingError);
        expect(errors[0].message).toContain(
            "transactions.transactions must be an array",
        );
        expect(errors[0]).toMatchObject({
            context: {
                endpoint: "wss://example.test/stream",
                phase: "notification",
                transport: "ws",
            },
        });

        client.close();
    });
});
