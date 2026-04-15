/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    StreamingClosedError,
    StreamingError,
    StreamingHandshakeError,
    wrapStreamingError,
} from "./errors";
import type { StreamingErrorContext } from "./errors";
import { parseStreamingEvent } from "./protocol";
import { SseParser } from "./SseParser";
import {
    type ResolvedStreamingSubscription,
    resolveStreamingSubscription,
    sameSubscription,
    serializeSubscription,
} from "./subscriptionState";
import { TypedEventEmitter } from "./TypedEventEmitter";
import type {
    StreamingEventMap,
    StreamingSseParameters,
    StreamingSubscription,
} from "./types";
import {
    type Deferred,
    appendQueryParameter,
    deferred,
    describeHttpError,
    describeUnexpectedMessage,
    isAbortError,
    isRecord,
    resolveProviderEndpoint,
} from "./utils";

// ---------------------------------------------------------------------------
// Session — single object replaces all fragmented per-connection state
// ---------------------------------------------------------------------------

type SseSession = {
    abort: AbortController;
    subscribed: Deferred<void>;
    closed: Deferred<void>;
    isReady: boolean;
};

type SseReadResult = {
    done: boolean;
    value?: Uint8Array;
};

type SseReader = {
    read(): Promise<SseReadResult>;
    releaseLock?(): void;
};

type SseReadableStream = {
    getReader(): SseReader;
    cancel?(reason?: unknown): Promise<unknown> | void;
};

type SseResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    body?: SseReadableStream | null;
    text?(): Promise<string>;
};

type SseFetch = (
    url: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
    },
) => Promise<SseResponse>;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * SSE client for Streaming API v2-compatible endpoints.
 *
 * SSE subscriptions are immutable for the lifetime of the HTTP stream,
 * so each `subscribe()` reconnects with the desired snapshot.
 */
export class TonSseClient extends TypedEventEmitter<StreamingEventMap> {
    readonly #endpoint: string;
    readonly #apiKey: string | undefined;
    readonly #apiKeyParam: string;
    readonly #fetchFn: SseFetch;
    readonly #headers: Record<string, string>;

    #session: SseSession | null = null;
    #closingPromise: Promise<void> | null = null;
    #applied: ResolvedStreamingSubscription | null = null;
    #desired: ResolvedStreamingSubscription | null = null;
    #reconciling = false;
    #waiters: Deferred<void>[] = [];

    constructor(parameters: StreamingSseParameters) {
        super();
        const resolved = resolveProviderEndpoint(
            "sse",
            parameters.service,
            parameters.network,
            parameters.endpoint,
            parameters.apiKeyParam,
        );
        this.#endpoint = resolved.endpoint;
        this.#apiKeyParam = resolved.apiKeyParam;
        this.#apiKey = parameters.apiKey;
        this.#fetchFn =
            parameters.fetch ??
            (globalThis as { fetch?: SseFetch }).fetch ??
            (() => {
                throw new Error(
                    "fetch is not available. Pass a fetch function via parameters or use Node 18+.",
                );
            });
        this.#headers = { ...(parameters.headers ?? {}) };
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        const resolved = resolveStreamingSubscription(params);
        if (
            this.ready &&
            this.#applied &&
            sameSubscription(this.#applied, resolved)
        ) {
            return Promise.resolve();
        }

        const shouldAbortPending =
            this.#session !== null &&
            !this.#session.isReady &&
            this.#desired !== null &&
            !sameSubscription(this.#desired, resolved);

        this.#desired = resolved;
        const waiter = deferred<void>();
        this.#waiters.push(waiter);

        if (shouldAbortPending) {
            this.#session?.abort.abort();
        }

        void this.#reconcile();
        return waiter.promise;
    }

    close(): Promise<void> {
        const error = new StreamingClosedError(
            "Streaming transport is closing",
            this.#ctx("close"),
        );
        this.#desired = null;
        this.#applied = null;
        this.#rejectWaiters(error);
        return this.#closeActiveSession(error);
    }

    get ready(): boolean {
        return this.#session?.isReady === true;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    #ctx(
        phase: string,
        extra?: Partial<StreamingErrorContext>,
    ): StreamingErrorContext {
        return { transport: "sse", endpoint: this.#endpoint, phase, ...extra };
    }

    async #reconcile(): Promise<void> {
        if (this.#reconciling) {
            return;
        }
        this.#reconciling = true;

        try {
            while (this.#desired) {
                const snapshot = this.#desired;
                if (
                    this.ready &&
                    this.#applied &&
                    sameSubscription(this.#applied, snapshot)
                ) {
                    this.#resolveWaiters();
                    break;
                }

                const outcome = await this.#startSession(snapshot);
                if (outcome === "replaced") {
                    continue;
                }

                this.#applied = snapshot;
                if (
                    this.#desired &&
                    sameSubscription(this.#desired, snapshot)
                ) {
                    this.#resolveWaiters();
                    break;
                }
            }
        } catch (error) {
            this.#rejectWaiters(error);
        } finally {
            this.#reconciling = false;
        }
    }

    async #startSession(
        resolved: ResolvedStreamingSubscription,
    ): Promise<"ready" | "replaced"> {
        await this.#closeActiveSession(
            new StreamingClosedError(
                "Streaming subscription is being replaced",
                this.#ctx("close"),
            ),
        );

        const session: SseSession = {
            abort: new AbortController(),
            subscribed: deferred<void>(),
            closed: deferred<void>(),
            isReady: false,
        };
        this.#session = session;

        const url = this.#apiKey
            ? appendQueryParameter(
                  this.#endpoint,
                  this.#apiKeyParam,
                  this.#apiKey,
              )
            : this.#endpoint;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...this.#headers,
        };

        let response;
        try {
            response = await this.#fetchFn(url, {
                method: "POST",
                headers,
                body: JSON.stringify(serializeSubscription(resolved)),
                signal: session.abort.signal,
            });
        } catch (error) {
            this.#teardown(session);
            if (isAbortError(error)) {
                if (this.#isSuperseded(resolved)) {
                    return "replaced";
                }
                throw new StreamingClosedError(
                    "Streaming transport is closing",
                    this.#ctx("close"),
                    { cause: error },
                );
            }
            throw wrapStreamingError(
                error,
                this.#ctx("connect"),
                "Streaming SSE connection failed",
            );
        }

        if (!response.ok) {
            this.#teardown(session);
            throw new StreamingError(
                `Streaming SSE connection failed: ${await describeHttpError(response)}`,
                this.#ctx("connect", { rawPayload: response }),
            );
        }

        if (!response.body || typeof response.body.getReader !== "function") {
            this.#teardown(session);
            throw new StreamingError(
                "SSE response does not expose a readable body",
                this.#ctx("connect", { rawPayload: response }),
            );
        }
        const body = response.body;

        if (this.#session !== session || this.#isSuperseded(resolved)) {
            body.cancel?.();
            this.#teardown(session);
            return "replaced";
        }

        void this.#readStream(body, session);

        try {
            await session.subscribed.promise;
        } catch (error) {
            if (this.#isSuperseded(resolved)) {
                return "replaced";
            }
            throw error;
        }

        return "ready";
    }

    #resolveWaiters(): void {
        const waiters = this.#waiters;
        this.#waiters = [];
        for (const waiter of waiters) {
            waiter.resolve();
        }
    }

    #rejectWaiters(reason: unknown): void {
        const waiters = this.#waiters;
        this.#waiters = [];
        for (const waiter of waiters) {
            waiter.reject(reason);
        }
    }

    #isSuperseded(resolved: ResolvedStreamingSubscription): boolean {
        return (
            this.#desired !== null && !sameSubscription(this.#desired, resolved)
        );
    }

    #closeActiveSession(error: StreamingError): Promise<void> {
        const session = this.#session;
        if (!session) {
            return this.#closingPromise ?? Promise.resolve();
        }

        const wasReady = session.isReady;
        this.#session = null;
        session.isReady = false;
        session.abort.abort();
        session.subscribed.reject(error);

        if (wasReady) {
            this.emit("close", undefined);
        }

        const closingPromise = session.closed.promise.finally(() => {
            if (this.#closingPromise === closingPromise) {
                this.#closingPromise = null;
            }
        });
        this.#closingPromise = closingPromise;
        return closingPromise;
    }

    #teardown(session: SseSession): void {
        if (this.#session === session) {
            this.#session = null;
        }
        session.closed.resolve();
    }

    #rejectOrEmitError(session: SseSession, error: StreamingError): void {
        if (!session.subscribed.settled) {
            session.subscribed.reject(error);
            session.abort.abort();
        } else {
            this.emit("error", error);
        }
    }

    async #readStream(
        body: SseReadableStream,
        session: SseSession,
    ): Promise<void> {
        const parser = new SseParser((sseEvent) => {
            let payload: unknown;
            try {
                payload = JSON.parse(sseEvent.data) as unknown;
            } catch (error) {
                this.#rejectOrEmitError(
                    session,
                    wrapStreamingError(
                        error,
                        this.#ctx("message", { rawPayload: sseEvent.data }),
                        "Failed to parse streaming SSE event",
                    ),
                );
                return;
            }

            if (!isRecord(payload)) {
                this.#rejectOrEmitError(
                    session,
                    new StreamingError(
                        `Unexpected streaming SSE payload: ${describeUnexpectedMessage(payload)}`,
                        this.#ctx("message", { rawPayload: payload }),
                    ),
                );
                return;
            }

            if (this.#session !== session) {
                return;
            }

            if (typeof payload.status === "string") {
                if (payload.status === "subscribed") {
                    if (!session.isReady) {
                        session.isReady = true;
                        this.emit("open", undefined);
                    }
                    session.subscribed.resolve();
                    return;
                }

                this.#rejectOrEmitError(
                    session,
                    payload.error !== undefined
                        ? wrapStreamingError(
                              payload.error,
                              this.#ctx("subscription_confirmation", {
                                  rawPayload: payload,
                              }),
                              `Streaming SSE request failed with status ${payload.status}`,
                          )
                        : new StreamingError(
                              `Unexpected streaming SSE status message: ${describeUnexpectedMessage(payload)}`,
                              this.#ctx("subscription_confirmation", {
                                  rawPayload: payload,
                              }),
                          ),
                );
                return;
            }

            try {
                const event = parseStreamingEvent(payload);
                this.emit(
                    event.type as keyof StreamingEventMap,
                    event as never,
                );
            } catch (error) {
                this.#rejectOrEmitError(
                    session,
                    wrapStreamingError(
                        error,
                        this.#ctx("notification", { rawPayload: payload }),
                        "Invalid streaming SSE notification",
                    ),
                );
            }
        });

        const reader = body.getReader();
        let endedNormally = false;

        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                if (value) {
                    parser.feed(decoder.decode(value, { stream: true }));
                }
            }

            const tail = decoder.decode();
            if (tail) {
                parser.feed(tail);
            }
            parser.finish();
            endedNormally = true;
        } catch (error) {
            if (!session.abort.signal.aborted && !isAbortError(error)) {
                this.#rejectOrEmitError(
                    session,
                    wrapStreamingError(
                        error,
                        this.#ctx("stream"),
                        "Streaming SSE stream terminated unexpectedly",
                    ),
                );
            }
        } finally {
            reader.releaseLock?.();

            if (this.#session !== session) {
                this.#teardown(session);
                return;
            }

            const wasReady = session.isReady;
            this.#session = null;
            session.isReady = false;

            const preReadyError = session.abort.signal.aborted
                ? new StreamingClosedError(
                      "Streaming transport is closing",
                      this.#ctx("close"),
                  )
                : new StreamingHandshakeError(
                      "Streaming SSE connection closed before subscription confirmation",
                      this.#ctx("subscription_confirmation"),
                  );

            session.subscribed.reject(preReadyError);

            if (endedNormally && wasReady) {
                this.emit(
                    "error",
                    new StreamingClosedError(
                        "Streaming SSE stream closed by server",
                        this.#ctx("stream"),
                    ),
                );
            }

            if (wasReady) {
                this.emit("close", undefined);
            }

            this.#teardown(session);
        }
    }
}
