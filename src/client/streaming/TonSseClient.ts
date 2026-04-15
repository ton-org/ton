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
    createStreamingError,
} from "./errors";
import type { StreamingErrorContext } from "./errors";
import { parseStreamingEvent } from "./protocol";
import { SseParser } from "./SseParser";
import {
    type ResolvedStreamingSubscription,
    resolveStreamingSubscription,
    serializeSubscription,
} from "./subscriptionState";
import { TypedEventEmitter } from "./TypedEventEmitter";
import type {
    FetchLike,
    ReadableStreamLike,
    StreamingEventMap,
    StreamingLifecycleError,
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
    readonly #fetchFn: FetchLike;
    readonly #headers: Record<string, string>;

    #session: SseSession | null = null;

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
            (globalThis as { fetch?: FetchLike }).fetch ??
            (() => {
                throw new Error(
                    "fetch is not available. Pass a fetch function via parameters or use Node 18+.",
                );
            });
        this.#headers = { ...(parameters.headers ?? {}) };
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        const resolved = resolveStreamingSubscription(params);
        await this.#startSession(resolved);
    }

    close(): Promise<void> {
        const session = this.#session;
        if (!session) {
            return Promise.resolve();
        }

        const wasReady = session.isReady;
        this.#session = null;
        session.isReady = false;
        session.abort.abort();

        session.subscribed.reject(
            new StreamingHandshakeError(
                "Streaming SSE connection was closed before subscription confirmation",
                this.#ctx("subscription_confirmation"),
            ),
        );

        if (wasReady) {
            this.emit("close", undefined);
        }

        return session.closed.promise;
    }

    get ready(): boolean {
        return this.#session?.isReady === true;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    #ctx(phase: string, extra?: Partial<StreamingErrorContext>): StreamingErrorContext {
        return { transport: "sse", endpoint: this.#endpoint, phase, ...extra };
    }

    async #startSession(
        resolved: ResolvedStreamingSubscription,
    ): Promise<void> {
        await this.close();

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
                throw new StreamingHandshakeError(
                    "Streaming SSE connection was closed before subscription confirmation",
                    this.#ctx("subscription_confirmation"),
                    { cause: error },
                );
            }
            throw createStreamingError(
                StreamingError,
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

        if (this.#session !== session) {
            body.cancel?.();
            this.#teardown(session);
            throw new StreamingClosedError(
                "Streaming SSE connection was superseded by a newer subscribe call",
                this.#ctx("connect"),
            );
        }

        void this.#readStream(body, session);
        return session.subscribed.promise;
    }

    #teardown(session: SseSession): void {
        if (this.#session === session) {
            this.#session = null;
        }
        session.closed.resolve();
    }

    #rejectOrEmitError(
        session: SseSession,
        error: StreamingLifecycleError,
    ): void {
        if (!session.subscribed.settled) {
            session.subscribed.reject(error);
            session.abort.abort();
        } else {
            this.emit("error", error);
        }
    }

    async #readStream(
        body: ReadableStreamLike,
        session: SseSession,
    ): Promise<void> {
        const parser = new SseParser((sseEvent) => {
            let payload: unknown;
            try {
                payload = JSON.parse(sseEvent.data) as unknown;
            } catch (error) {
                this.#rejectOrEmitError(
                    session,
                    createStreamingError(
                        StreamingError,
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
                        ? createStreamingError(
                              StreamingError,
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
                    createStreamingError(
                        StreamingError,
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
                    createStreamingError(
                        StreamingError,
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

            session.subscribed.reject(
                new StreamingHandshakeError(
                    "Streaming SSE connection closed before subscription confirmation",
                    this.#ctx("subscription_confirmation"),
                ),
            );

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
