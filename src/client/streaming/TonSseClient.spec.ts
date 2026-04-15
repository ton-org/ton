import {
    StreamingClosedError,
    StreamingHandshakeError,
    StreamingError,
} from "./errors";
import { TonSseClient } from "./TonSseClient";
import type { Finality, StreamingSubscription } from "./types";

type DeferredRead = {
    resolve: (value: { done: boolean; value?: Uint8Array }) => void;
    reject: (error: Error) => void;
};

const encoder = new TextEncoder();

function createAbortError(): Error {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}

function createSseResponse(
    contentType = "text/event-stream; charset=utf-8",
    abortErrorFactory: () => Error = createAbortError,
    abortMode: "immediate" | "manual" = "immediate",
) {
    let deferred: DeferredRead | null = null;
    let aborted = false;

    const reader = {
        read: jest.fn(
            () =>
                new Promise<{ done: boolean; value?: Uint8Array }>(
                    (resolve, reject) => {
                        deferred = { resolve, reject };
                    },
                ),
        ),
        releaseLock: jest.fn(),
    };

    return {
        response: {
            ok: true,
            status: 200,
            statusText: "OK",
            headers: {
                get(name: string) {
                    return name.toLowerCase() === "content-type"
                        ? contentType
                        : null;
                },
            },
            body: {
                cancel: jest.fn(),
                getReader: () => reader,
            },
        },
        abort: () => {
            aborted = true;
            if (abortMode === "immediate") {
                deferred?.reject(abortErrorFactory());
            }
        },
        rejectAbort: () => {
            if (!aborted) {
                throw new Error("Abort has not been requested");
            }
            deferred?.reject(abortErrorFactory());
        },
        close: () => deferred?.resolve({ done: true }),
        pushText: (text: string) =>
            deferred?.resolve({ done: false, value: encoder.encode(text) }),
        reader,
    };
}

async function flushAsyncWork(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}

function createFetchMock(...responses: ReturnType<typeof createSseResponse>[]) {
    return jest.fn().mockImplementation(async (_url: string, init: any) => {
        const response = responses.shift();
        if (!response) {
            throw new Error("Unexpected fetch call");
        }

        init.signal?.addEventListener("abort", response.abort);
        return response.response;
    });
}

function createSubscription(
    address: string,
    minFinality?: Finality,
): StreamingSubscription {
    return {
        addresses: [address],
        types: ["transactions"] as const,
        ...(minFinality ? { minFinality } : {}),
    };
}

async function subscribeAndConfirm(
    client: TonSseClient,
    response: ReturnType<typeof createSseResponse>,
    subscription = createSubscription("EQC123"),
): Promise<void> {
    const subscribePromise = client.subscribe(subscription);
    await flushAsyncWork();
    response.pushText('data: {"status":"subscribed"}\n\n');
    await flushAsyncWork();
    await subscribePromise;
}

describe("TonSseClient", () => {
    it.each([
        {
            name: "sends api_key as query parameter by default",
            parameters: {
                endpoint: "https://toncenter.com/api/streaming/v2/sse",
                apiKey: "secret",
            },
            expectedUrl:
                "https://toncenter.com/api/streaming/v2/sse?api_key=secret",
        },
        {
            name: "supports custom apiKeyParam for query-parameter auth",
            parameters: {
                endpoint: "https://tonapi.io/streaming/v2/sse",
                apiKey: "secret",
                apiKeyParam: "token",
            },
            expectedUrl: "https://tonapi.io/streaming/v2/sse?token=secret",
        },
        {
            name: "resolves Toncenter mainnet service defaults",
            parameters: {
                service: "toncenter" as const,
                apiKey: "secret",
            },
            expectedUrl:
                "https://toncenter.com/api/streaming/v2/sse?api_key=secret",
        },
        {
            name: "resolves TonAPI mainnet service defaults",
            parameters: {
                service: "tonapi" as const,
                apiKey: "secret",
            },
            expectedUrl: "https://tonapi.io/streaming/v2/sse?token=secret",
        },
        {
            name: "resolves Toncenter testnet service defaults",
            parameters: {
                service: "toncenter" as const,
                network: "testnet" as const,
                apiKey: "secret",
            },
            expectedUrl:
                "https://testnet.toncenter.com/api/streaming/v2/sse?api_key=secret",
        },
        {
            name: "resolves TonAPI testnet service defaults",
            parameters: {
                service: "tonapi" as const,
                network: "testnet" as const,
                apiKey: "secret",
            },
            expectedUrl:
                "https://testnet.tonapi.io/streaming/v2/sse?token=secret",
        },
    ])("$name", async ({ parameters, expectedUrl }) => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new TonSseClient({
            ...parameters,
            fetch: fetchFn,
        });

        await subscribeAndConfirm(
            client,
            response,
            createSubscription("EQC123"),
        );

        expect(fetchFn).toHaveBeenCalledWith(
            expectedUrl,
            expect.objectContaining({ method: "POST" }),
        );

        const [, requestInit] = fetchFn.mock.calls[0];
        expect(JSON.parse(requestInit.body)).toEqual({
            addresses: ["EQC123"],
            types: ["transactions"],
        });

        client.close();
    });

    it("requires endpoint when service is not specified", () => {
        expect(
            () =>
                new TonSseClient({
                    fetch: jest.fn(),
                }),
        ).toThrow(
            "Streaming endpoint is required when service is not specified",
        );
    });

    it("throws when both service and endpoint are specified", () => {
        expect(
            () =>
                new TonSseClient({
                    service: "tonapi",
                    endpoint: "https://example.test/sse",
                    fetch: jest.fn(),
                }),
        ).toThrow("Cannot specify both 'service' and 'endpoint'");
    });

    it("rejects an unconfirmed handshake with a typed handshake error", async () => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });

        const subscribePromise = client
            .subscribe(createSubscription("EQC123"))
            .catch((error) => error as Error);
        await flushAsyncWork();
        response.close();
        await flushAsyncWork();

        const error = await subscribePromise;

        expect(error).toBeInstanceOf(StreamingHandshakeError);
        expect(error).toMatchObject({
            context: {
                endpoint: "https://example.test/sse",
                phase: "subscription_confirmation",
                transport: "sse",
            },
            message:
                "Streaming SSE connection closed before subscription confirmation",
        });
    });

    it("reconnects with the replacement snapshot when subscribe updates SSE", async () => {
        const first = createSseResponse();
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        let closeCount = 0;
        client.on("close", () => {
            closeCount += 1;
        });

        await subscribeAndConfirm(client, first, {
            addresses: ["EQ1"],
            traceExternalHashNorms: ["trace-1"],
            types: ["transactions", "trace"],
        });

        const replacePromise = client.subscribe({
            traceExternalHashNorms: ["trace-1"],
            types: ["trace"],
        });
        await flushAsyncWork();
        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await replacePromise;

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
            trace_external_hash_norms: ["trace-1"],
            types: ["trace"],
        });
        expect(closeCount).toBe(1);

        client.close();
    });

    it("resolves close only after the active SSE reader unwinds", async () => {
        const response = createSseResponse(
            "text/event-stream; charset=utf-8",
            createAbortError,
            "manual",
        );
        const fetchFn = createFetchMock(response);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });

        await subscribeAndConfirm(
            client,
            response,
            createSubscription("EQC123"),
        );

        let closeResolved = false;
        const closePromise = client.close().then(() => {
            closeResolved = true;
        });

        await flushAsyncWork();
        expect(closeResolved).toBe(false);

        response.rejectAbort();
        await closePromise;
        expect(closeResolved).toBe(true);
    });

    it("waits for the previous SSE stream to close before reconnecting", async () => {
        const first = createSseResponse(
            "text/event-stream; charset=utf-8",
            createAbortError,
            "manual",
        );
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });

        await subscribeAndConfirm(client, first, createSubscription("EQ1"));

        const replacePromise = client.subscribe(createSubscription("EQ2"));
        await flushAsyncWork();

        expect(fetchFn).toHaveBeenCalledTimes(1);

        first.rejectAbort();
        await flushAsyncWork();

        expect(fetchFn).toHaveBeenCalledTimes(2);

        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await replacePromise;
    });

    it("does not reject a pending subscribe when a newer SSE snapshot replaces it", async () => {
        const first = createSseResponse();
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        const errors: Error[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });

        const firstSubscribe = client.subscribe(createSubscription("EQ1"));
        await flushAsyncWork();

        const secondSubscribe = client.subscribe(createSubscription("EQ2"));
        await flushAsyncWork();

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
            addresses: ["EQ2"],
            types: ["transactions"],
        });

        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await Promise.all([firstSubscribe, secondSubscribe]);

        expect(errors).toEqual([]);

        client.close();
    });

    it("surfaces invalid notifications through the error channel", async () => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        const errors: Error[] = [];
        const transactions: unknown[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });
        client.on("transactions", (event) => {
            transactions.push(event);
        });

        await subscribeAndConfirm(
            client,
            response,
            createSubscription("EQC123"),
        );
        await flushAsyncWork();

        response.pushText(
            'data: {"type":"transactions","finality":"pending","trace_external_hash_norm":"trace-1","transactions":"oops"}\n\n',
        );
        await flushAsyncWork();

        expect(transactions).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(StreamingError);
        expect(errors[0].message).toContain(
            "transactions.transactions must be an array",
        );
        expect(errors[0]).toMatchObject({
            context: {
                endpoint: "https://example.test/sse",
                phase: "notification",
                transport: "sse",
            },
        });

        client.close();
    });

    it("emits a typed closed error when the server ends an active stream", async () => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        const errors: Error[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });

        await subscribeAndConfirm(
            client,
            response,
            createSubscription("EQC123"),
        );
        response.close();
        await flushAsyncWork();

        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(StreamingClosedError);
        expect(errors[0]).toMatchObject({
            context: {
                endpoint: "https://example.test/sse",
                phase: "stream",
                transport: "sse",
            },
            message: "Streaming SSE stream closed by server",
        });
    });

    it("does not emit an error when reconnect aborts the previous stream", async () => {
        const first = createSseResponse(
            "text/event-stream; charset=utf-8",
            () => new Error("This operation was aborted"),
        );
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new TonSseClient({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        const errors: Error[] = [];

        client.on("error", (error) => {
            errors.push(error);
        });

        await subscribeAndConfirm(client, first, createSubscription("EQ1"));

        const reconnectPromise = client.subscribe(createSubscription("EQ2"));
        await flushAsyncWork();
        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await reconnectPromise;

        expect(errors).toEqual([]);

        client.close();
    });
});
