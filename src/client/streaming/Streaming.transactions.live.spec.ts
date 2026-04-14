import { StreamingWebSocket } from "./StreamingWebSocket";
import { StreamingSse } from "./StreamingSse";
import type { StreamingTransactionsEvent } from "./types";

const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;
const TONAPI_API_KEY = process.env.TONAPI_API_KEY;
const TEST_ADDRESS =
    process.env.STREAMING_TEST_ADDRESS ??
    "EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3";
const WATCH_MS = 95_000;
const CLOSE_SETTLE_MS = 1_500;

const describeLive =
    TONCENTER_API_KEY && TONAPI_API_KEY ? describe : describe.skip;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type SeenEvent = {
    source: "toncenter-ws" | "toncenter-sse" | "tonapi-ws" | "tonapi-sse";
    kind: "transactions";
    trace?: string;
    txCount?: number;
    finality?: string;
};

type TransactionsSource = {
    on(
        event: "transactions",
        handler: (event: StreamingTransactionsEvent) => void,
    ): void;
    off(
        event: "transactions",
        handler: (event: StreamingTransactionsEvent) => void,
    ): void;
};

function attachTransactionsCollector(
    target: TransactionsSource,
    source: SeenEvent["source"],
    events: SeenEvent[],
): () => void {
    const handler = (event: StreamingTransactionsEvent) => {
        events.push({
            source,
            kind: "transactions",
            trace: event.trace_external_hash_norm,
            txCount: event.transactions.length,
            finality: event.finality,
        });
    };

    target.on("transactions", handler);
    return () => target.off("transactions", handler);
}

describeLive("streaming live transaction watch", () => {
    jest.setTimeout(130_000);

    it("fails on any data mismatch between live streaming endpoints", async () => {
        const toncenterWs = new StreamingWebSocket({
            endpoint: "wss://toncenter.com/api/streaming/v2/ws",
            apiKey: TONCENTER_API_KEY,
        });
        const tonapiWs = new StreamingWebSocket({
            endpoint: "wss://tonapi.io/streaming/v2/ws",
            apiKey: TONAPI_API_KEY,
            apiKeyParam: "token",
        });
        const toncenterSse = new StreamingSse({
            endpoint: "https://toncenter.com/api/streaming/v2/sse",
            apiKey: TONCENTER_API_KEY,
        });
        const tonapiSse = new StreamingSse({
            endpoint: "https://tonapi.io/streaming/v2/sse",
            apiKey: TONAPI_API_KEY,
            bearerAuth: true,
        });

        const events: SeenEvent[] = [];
        const detachHandlers = [
            attachTransactionsCollector(toncenterWs, "toncenter-ws", events),
            attachTransactionsCollector(toncenterSse, "toncenter-sse", events),
            attachTransactionsCollector(tonapiWs, "tonapi-ws", events),
            attachTransactionsCollector(tonapiSse, "tonapi-sse", events),
        ];

        const startedAt = Date.now();

        try {
            await Promise.all([
                toncenterWs.connect(),
                tonapiWs.connect(),
                toncenterSse.connect({
                    addresses: [TEST_ADDRESS],
                    types: ["transactions"],
                }),
                tonapiSse.connect({
                    addresses: [TEST_ADDRESS],
                    types: ["transactions"],
                }),
            ]);

            await Promise.all([
                toncenterWs.subscribe({
                    addresses: [TEST_ADDRESS],
                    types: ["transactions"],
                }),
                tonapiWs.subscribe({
                    addresses: [TEST_ADDRESS],
                    types: ["transactions"],
                }),
            ]);

            await delay(WATCH_MS);
        } finally {
            for (const detach of detachHandlers) {
                detach();
            }

            toncenterWs.close();
            tonapiWs.close();
            toncenterSse.close();
            tonapiSse.close();
            await delay(CLOSE_SETTLE_MS);
        }

        const watchedMs = Date.now() - startedAt;
        expect(watchedMs).toBeGreaterThanOrEqual(90_000);
        expect(events.length).toBeGreaterThan(0);

        const sources = new Set(events.map((event) => event.source));
        expect(sources).toEqual(
            new Set([
                "toncenter-ws",
                "toncenter-sse",
                "tonapi-ws",
                "tonapi-sse",
            ]),
        );

        function transactionKeys(source: SeenEvent["source"]): string[] {
            return events
                .filter(
                    (
                        event,
                    ): event is SeenEvent & {
                        trace: string;
                        txCount: number;
                        finality: string;
                    } =>
                        event.source === source &&
                        event.kind === "transactions" &&
                        typeof event.trace === "string" &&
                        typeof event.txCount === "number" &&
                        typeof event.finality === "string",
                )
                .map(
                    (event) =>
                        `${event.finality}:${event.trace}:${event.txCount}`,
                )
                .sort();
        }

        function transactionCount(source: SeenEvent["source"]): number {
            return events
                .filter(
                    (event): event is SeenEvent & { txCount: number } =>
                        event.source === source &&
                        event.kind === "transactions" &&
                        typeof event.txCount === "number",
                )
                .reduce((sum, event) => sum + event.txCount, 0);
        }

        const tonapiWsEvents = transactionKeys("tonapi-ws");
        const tonapiSseEvents = transactionKeys("tonapi-sse");
        const toncenterWsEvents = transactionKeys("toncenter-ws");
        const toncenterSseEvents = transactionKeys("toncenter-sse");

        expect(tonapiWsEvents.length).toBeGreaterThan(0);
        expect(tonapiWsEvents).toEqual(tonapiSseEvents);

        expect(toncenterWsEvents.length).toBeGreaterThan(0);
        expect(toncenterWsEvents).toEqual(toncenterSseEvents);

        expect(toncenterWsEvents).toEqual(tonapiWsEvents);

        expect(transactionCount("toncenter-ws")).toBeGreaterThan(0);
        expect(transactionCount("tonapi-ws")).toBe(
            transactionCount("toncenter-ws"),
        );
    });
});
