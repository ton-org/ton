import { StreamingWebSocket } from "./StreamingWebSocket";
import { StreamingSse } from "./StreamingSse";
import type { StreamingTransactionsEvent } from "./types";

const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;
const TONAPI_API_KEY = process.env.TONAPI_API_KEY;
const TEST_ADDRESS = "EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3";
const NETWORK_CLOSE_SETTLE_MS = 1_200;

const describeLive =
    TONCENTER_API_KEY && TONAPI_API_KEY ? describe : describe.skip;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceTransactionsEvent(
    target: {
        on(
            event: "transactions",
            handler: (data: StreamingTransactionsEvent) => void,
        ): void;
        off(
            event: "transactions",
            handler: (data: StreamingTransactionsEvent) => void,
        ): void;
    },
    timeoutMs: number,
): Promise<StreamingTransactionsEvent> {
    return new Promise((resolve, reject) => {
        const handler = (data: StreamingTransactionsEvent) => {
            clearTimeout(timeout);
            target.off("transactions", handler);
            resolve(data);
        };
        const timeout = setTimeout(() => {
            target.off("transactions", handler);
            reject(new Error('Timed out waiting for "transactions" event'));
        }, timeoutMs);

        target.on("transactions", handler);
    });
}

describeLive("streaming live integration", () => {
    jest.setTimeout(30_000);

    it("connects to Toncenter WebSocket and manages a live subscription", async () => {
        const client = new StreamingWebSocket({
            endpoint: "wss://toncenter.com/api/streaming/v2/ws",
            apiKey: TONCENTER_API_KEY,
        });

        try {
            await client.connect();
            expect(client.connected).toBe(true);

            await client.subscribe({
                addresses: [TEST_ADDRESS],
                types: ["transactions"],
            });

            await client.unsubscribe({
                addresses: [TEST_ADDRESS],
            });
        } finally {
            client.close();
            await delay(NETWORK_CLOSE_SETTLE_MS);
        }

        expect(client.connected).toBe(false);
    });

    it("connects to TonAPI WebSocket and manages a live subscription", async () => {
        const client = new StreamingWebSocket({
            endpoint: "wss://tonapi.io/streaming/v2/ws",
            apiKey: TONAPI_API_KEY,
            apiKeyParam: "token",
        });
        const transactionsPromise = onceTransactionsEvent(client, 20_000);

        try {
            await client.connect();
            expect(client.connected).toBe(true);

            await client.subscribe({
                addresses: [TEST_ADDRESS],
                types: ["transactions"],
            });

            const event = await transactionsPromise;
            expect(event.transactions.length).toBeGreaterThan(0);

            await client.unsubscribe({
                addresses: [TEST_ADDRESS],
            });
        } finally {
            client.close();
            await delay(NETWORK_CLOSE_SETTLE_MS);
        }

        expect(client.connected).toBe(false);
    });

    it("connects to Toncenter SSE on the production endpoint", async () => {
        const client = new StreamingSse({
            endpoint: "https://toncenter.com/api/streaming/v2/sse",
            apiKey: TONCENTER_API_KEY,
        });
        const errors: Error[] = [];
        const onError = (error: Error) => {
            errors.push(error);
        };

        client.on("error", onError);

        try {
            await client.connect({
                addresses: [TEST_ADDRESS],
                types: ["transactions"],
            });
            expect(client.connected).toBe(true);

            await delay(1_500);
            expect(errors).toEqual([]);
        } finally {
            client.off("error", onError);
            client.close();
            await delay(NETWORK_CLOSE_SETTLE_MS);
        }

        expect(client.connected).toBe(false);
    });

    it("connects to TonAPI SSE on the production endpoint", async () => {
        const client = new StreamingSse({
            endpoint: "https://tonapi.io/streaming/v2/sse",
            apiKey: TONAPI_API_KEY,
            bearerAuth: true,
        });
        const errors: Error[] = [];
        const onError = (error: Error) => {
            errors.push(error);
        };

        client.on("error", onError);

        try {
            await client.connect({
                addresses: [TEST_ADDRESS],
                types: ["transactions"],
            });

            expect(client.connected).toBe(true);
            await delay(1_500);
            expect(errors).toEqual([]);
        } finally {
            client.off("error", onError);
            client.close();
            await delay(NETWORK_CLOSE_SETTLE_MS);
        }

        expect(client.connected).toBe(false);
    });
});
