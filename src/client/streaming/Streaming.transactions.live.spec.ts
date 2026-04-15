/**
 * Live smoke test that compares transaction streaming across all four
 * provider + transport combinations (toncenter-ws, toncenter-sse,
 * tonapi-ws, tonapi-sse) on mainnet.
 *
 * All four clients subscribe to the same address and wait until every source
 * has received at least one transaction event (up to a ~95 s timeout).
 * After that the suite verifies that:
 *   - every source received at least one transaction event
 *   - no streaming errors were emitted
 *
 * Required env vars:
 *   TONCENTER_API_KEY        – mainnet Toncenter API key
 *   TONAPI_API_KEY           – mainnet TonAPI key
 *   STREAMING_TEST_ADDRESS   – (optional) address to watch; defaults to a
 *                              well-known high-activity address
 */

import { TonWsClient } from "./TonWsClient";
import { TonSseClient } from "./TonSseClient";
import type { StreamingClient } from "./types";

const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;
const TONAPI_API_KEY = process.env.TONAPI_API_KEY;
const TEST_ADDRESS =
    process.env.STREAMING_TEST_ADDRESS ??
    "EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3";
const WATCH_TIMEOUT_MS = 95_000;
const POLL_INTERVAL_MS = 250;
const CLOSE_SETTLE_MS = 1_500;

const describeLive =
    TONCENTER_API_KEY && TONAPI_API_KEY ? describe : describe.skip;

const SOURCES = [
    "toncenter-ws",
    "toncenter-sse",
    "tonapi-ws",
    "tonapi-sse",
] as const;

type Source = (typeof SOURCES)[number];

type SeenEvent = {
    source: Source;
};

describeLive("streaming live transaction watch", () => {
    jest.setTimeout(130_000);

    const clients = {} as Record<Source, StreamingClient>;
    const errors = {} as Record<Source, Error[]>;
    const events: SeenEvent[] = [];
    const detachHandlers: (() => void)[] = [];

    beforeAll(async () => {
        clients["toncenter-ws"] = new TonWsClient({
            endpoint: "wss://toncenter.com/api/streaming/v2/ws",
            apiKey: TONCENTER_API_KEY,
        });
        clients["tonapi-ws"] = new TonWsClient({
            endpoint: "wss://tonapi.io/streaming/v2/ws",
            apiKey: TONAPI_API_KEY,
            apiKeyParam: "token",
        });
        clients["toncenter-sse"] = new TonSseClient({
            endpoint: "https://toncenter.com/api/streaming/v2/sse",
            apiKey: TONCENTER_API_KEY,
        });
        clients["tonapi-sse"] = new TonSseClient({
            endpoint: "https://tonapi.io/streaming/v2/sse",
            apiKey: TONAPI_API_KEY,
            apiKeyParam: "token",
        });

        for (const source of SOURCES) {
            errors[source] = [];
            detachHandlers.push(
                attachCollectors(
                    clients[source],
                    source,
                    events,
                    errors[source],
                ),
            );
        }

        const subscription = {
            addresses: [TEST_ADDRESS],
            types: ["transactions"] as const,
        };

        await Promise.all(
            SOURCES.map((s) => clients[s].subscribe(subscription)),
        );

        for (const source of SOURCES) {
            expect(clients[source].ready).toBe(true);
        }

        process.stdout.write(
            `Waiting for transactions on address ${TEST_ADDRESS} from ${SOURCES.length} sources (timeout ${WATCH_TIMEOUT_MS / 1000}s)...\n`,
        );

        await waitUntilAllSourcesSeen(events, WATCH_TIMEOUT_MS);
    });

    afterAll(async () => {
        for (const detach of detachHandlers) {
            detach();
        }

        await Promise.all(SOURCES.map((s) => clients[s].close()));
        await delay(CLOSE_SETTLE_MS);
    });

    it("receives events from all four sources", () => {
        expect(events.length).toBeGreaterThan(0);

        const seenSources = new Set(events.map((e) => e.source));
        expect(seenSources).toEqual(new Set(SOURCES));
    });

    it("reports no streaming errors", () => {
        for (const source of SOURCES) {
            expect(errors[source]).toEqual([]);
        }
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attachCollectors(
    target: StreamingClient,
    source: Source,
    events: SeenEvent[],
    errors: Error[],
): () => void {
    let first = true;
    const detachers = [
        target.on("transactions", () => {
            if (first) {
                first = false;
                process.stdout.write(`  ✓ ${source}: first transaction received\n`);
            }
            events.push({ source });
        }),
        target.on("error", (error: Error) => {
            errors.push(error);
        }),
    ];

    return () => detachers.forEach((d) => d());
}

async function waitUntilAllSourcesSeen(
    events: readonly SeenEvent[],
    timeoutMs: number,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    const startedAt = Date.now();

    while (Date.now() < deadline) {
        const seen = new Set(events.map((e) => e.source));
        if (SOURCES.every((s) => seen.has(s))) {
            process.stdout.write(
                `All sources received transactions in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
            );
            return;
        }
        await delay(POLL_INTERVAL_MS);
    }

    const seen = new Set(events.map((e) => e.source));
    const missing = SOURCES.filter((s) => !seen.has(s));
    throw new Error(
        `Timed out waiting for transaction events from: ${missing.join(", ")}`,
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
