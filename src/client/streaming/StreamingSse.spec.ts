import { StreamingSse } from "./StreamingSse";
import { Finality, StreamingSubscription } from "./types";

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

function createSseResponse(contentType = "text/event-stream; charset=utf-8") {
    let deferred: DeferredRead | null = null;

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
        abort: () => deferred?.reject(createAbortError()),
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

async function connectAndConfirm(
    client: StreamingSse,
    response: ReturnType<typeof createSseResponse>,
    subscription = createSubscription("EQC123"),
): Promise<void> {
    const connectPromise = client.connect(subscription);
    await flushAsyncWork();
    response.pushText('data: {"status":"subscribed"}\n\n');
    await flushAsyncWork();
    await connectPromise;
}

describe("StreamingSse", () => {
    it.each([
        {
            name: "sends api_key as query parameter by default",
            parameters: {
                endpoint: "https://toncenter.com/api/streaming/v2/sse",
                apiKey: "secret",
            },
            expectedUrl:
                "https://toncenter.com/api/streaming/v2/sse?api_key=secret",
            assertHeaders: (headers: Record<string, string>) => {
                expect(headers).not.toHaveProperty("Authorization");
            },
        },
        {
            name: "supports custom apiKeyParam for query-parameter auth",
            parameters: {
                endpoint: "https://tonapi.io/streaming/v2/sse",
                apiKey: "secret",
                apiKeyParam: "token",
            },
            expectedUrl: "https://tonapi.io/streaming/v2/sse?token=secret",
            assertHeaders: (headers: Record<string, string>) => {
                expect(headers).not.toHaveProperty("Authorization");
            },
        },
        {
            name: "uses Bearer auth header when bearerAuth is true",
            parameters: {
                endpoint: "https://tonapi.io/streaming/v2/sse",
                apiKey: "secret",
                bearerAuth: true,
            },
            expectedUrl: "https://tonapi.io/streaming/v2/sse",
            assertHeaders: (headers: Record<string, string>) => {
                expect(headers).toEqual(
                    expect.objectContaining({
                        Authorization: "Bearer secret",
                    }),
                );
            },
        },
        {
            name: "resolves Toncenter provider defaults",
            parameters: {
                provider: "toncenter" as const,
                apiKey: "secret",
                endpoint: "https://example.test/ignored",
                apiKeyParam: "ignored_token",
            },
            expectedUrl:
                "https://toncenter.com/api/streaming/v2/sse?api_key=secret",
            assertHeaders: (headers: Record<string, string>) => {
                expect(headers).not.toHaveProperty("Authorization");
            },
        },
        {
            name: "resolves TonAPI provider defaults",
            parameters: {
                provider: "tonapi" as const,
                apiKey: "secret",
                endpoint: "https://example.test/ignored",
                apiKeyParam: "ignored_api_key",
            },
            expectedUrl: "https://tonapi.io/streaming/v2/sse?token=secret",
            assertHeaders: (headers: Record<string, string>) => {
                expect(headers).not.toHaveProperty("Authorization");
            },
        },
    ])("$name", async ({ parameters, expectedUrl, assertHeaders }) => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new StreamingSse({
            ...parameters,
            fetch: fetchFn,
        });

        await connectAndConfirm(client, response, createSubscription("EQC123"));

        expect(fetchFn).toHaveBeenCalledWith(
            expectedUrl,
            expect.objectContaining({ method: "POST" }),
        );

        const [, requestInit] = fetchFn.mock.calls[0];
        assertHeaders(requestInit.headers);
        expect(JSON.parse(requestInit.body)).toEqual({
            addresses: ["EQC123"],
            types: ["transactions"],
        });

        client.close();
    });

    it("requires endpoint when provider is not specified", () => {
        expect(
            () =>
                new StreamingSse({
                    fetch: jest.fn(),
                }),
        ).toThrow(
            "Streaming endpoint is required when provider is not specified",
        );
    });

    it("reconnects with a pruned snapshot when unsubscribing from SSE", async () => {
        const first = createSseResponse();
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new StreamingSse({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        let closeCount = 0;
        client.on("close", () => {
            closeCount += 1;
        });

        await connectAndConfirm(client, first, {
            addresses: ["EQ1"],
            traceExternalHashNorms: ["trace-1"],
            types: ["transactions", "trace"],
        });

        const unsubscribePromise = client.unsubscribe({ addresses: ["EQ1"] });
        await flushAsyncWork();
        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await unsubscribePromise;

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
            trace_external_hash_norms: ["trace-1"],
            types: ["trace"],
        });
        expect(closeCount).toBe(1);

        client.close();
    });

    it("closes the SSE stream when unsubscribe removes the last target", async () => {
        const first = createSseResponse();
        const fetchFn = createFetchMock(first);
        const client = new StreamingSse({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });
        let closeCount = 0;
        client.on("close", () => {
            closeCount += 1;
        });

        await connectAndConfirm(client, first, {
            traceExternalHashNorms: ["trace-1"],
            types: ["trace"],
        });

        await client.unsubscribe({ traceExternalHashNorms: ["trace-1"] });
        await flushAsyncWork();

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(client.connected).toBe(false);
        expect(closeCount).toBe(1);
    });

    it("reuses the previous snapshot when reconnecting without explicit params", async () => {
        const first = createSseResponse();
        const second = createSseResponse();
        const fetchFn = createFetchMock(first, second);
        const client = new StreamingSse({
            endpoint: "https://example.test/sse",
            fetch: fetchFn,
        });

        await connectAndConfirm(client, first, createSubscription("EQC123"));
        client.close();
        await flushAsyncWork();

        const reconnectPromise = client.connect();
        await flushAsyncWork();
        second.pushText('data: {"status":"subscribed"}\n\n');
        await flushAsyncWork();
        await reconnectPromise;

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
            addresses: ["EQC123"],
            types: ["transactions"],
        });

        client.close();
    });

    it("surfaces invalid notifications through the error channel", async () => {
        const response = createSseResponse();
        const fetchFn = createFetchMock(response);
        const client = new StreamingSse({
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

        await connectAndConfirm(client, response, createSubscription("EQC123"));
        await flushAsyncWork();

        response.pushText(
            'data: {"type":"transactions","finality":"pending","trace_external_hash_norm":"trace-1","transactions":"oops"}\n\n',
        );
        await flushAsyncWork();

        expect(transactions).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain(
            "transactions.transactions must be an array",
        );

        client.close();
    });
});
