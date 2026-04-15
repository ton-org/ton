/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    AbstractStreamingClient,
    type DesiredSubscription,
} from "./AbstractStreamingClient";
import {
    StreamingClosedError,
    StreamingError,
    StreamingHandshakeError,
    wrapStreamingError,
} from "./errors";
import { parseStreamingEvent } from "./protocol";
import { SseParser } from "./SseParser";
import { serializeSubscription } from "./subscriptionState";
import type { StreamingEventMap, StreamingSseParameters } from "./types";
import {
    type Deferred,
    buildStreamingUrl,
    deferred,
    describeHttpError,
    describeUnexpectedMessage,
    isAbortError,
    isRecord,
} from "./utils";

type SseSession = {
    abort: AbortController;
    subscribed: Deferred<void>;
    closed: Deferred<void>;
    isReady: boolean;
};

// SSE subscriptions are immutable for the lifetime of the HTTP stream,
// so each subscribe() replaces the desired snapshot and reconnects.
export class TonSseClient extends AbstractStreamingClient {
    readonly #fetchFn: typeof fetch;
    readonly #headers: Record<string, string>;

    #session: SseSession | null = null;
    #closingPromise: Promise<void> | null = null;

    constructor(parameters: StreamingSseParameters) {
        super("sse", buildStreamingUrl("sse", parameters));

        this.#fetchFn =
            parameters.fetch ??
            (globalThis as { fetch?: typeof fetch }).fetch ??
            (() => {
                throw new Error(
                    "fetch is not available. Pass a fetch function via parameters or use Node 18+.",
                );
            });
        this.#headers = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...(parameters.headers ?? {}),
        };
    }

    protected get isSessionReady(): boolean {
        return this.#session?.isReady === true;
    }

    // SSE can't change subscription mid-stream, so abort any in-flight connection.
    protected onSupersede(): void {
        if (this.#session && !this.#session.isReady) {
            this.#session.abort.abort();
        }
    }

    protected applySubscription(
        desired: DesiredSubscription,
    ): Promise<"ready" | "replaced"> {
        return this.#startSession(desired);
    }

    protected async closeTransport(error: StreamingError): Promise<void> {
        await this.#closeActiveSession(error);
    }

    async #startSession(
        desired: DesiredSubscription,
    ): Promise<"ready" | "replaced"> {
        if (this.#session) {
            await this.#closeActiveSession(
                new StreamingClosedError(
                    "Streaming subscription is being replaced",
                    this.ctx("close"),
                ),
            );
        } else if (this.#closingPromise) {
            await this.#closingPromise;
        }

        const session: SseSession = {
            abort: new AbortController(),
            subscribed: deferred<void>(),
            closed: deferred<void>(),
            isReady: false,
        };
        this.#session = session;

        let response;
        try {
            response = await this.#fetchFn(this.url, {
                method: "POST",
                headers: this.#headers,
                body: JSON.stringify(serializeSubscription(desired.snapshot)),
                signal: session.abort.signal,
            });
        } catch (error) {
            this.#teardown(session);
            if (isAbortError(error)) {
                if (this.isSuperseded(desired)) {
                    return "replaced";
                }
                throw new StreamingClosedError(
                    "Streaming transport is closing",
                    this.ctx("close"),
                    { cause: error },
                );
            }
            throw wrapStreamingError(
                error,
                this.ctx("connect"),
                "Streaming SSE connection failed",
            );
        }

        if (!response.ok) {
            this.#teardown(session);
            throw new StreamingError(
                `Streaming SSE connection failed: ${await describeHttpError(response)}`,
                this.ctx("connect", { rawPayload: response }),
            );
        }

        if (!response.body || typeof response.body.getReader !== "function") {
            this.#teardown(session);
            throw new StreamingError(
                "SSE response does not expose a readable body",
                this.ctx("connect", { rawPayload: response }),
            );
        }
        const body = response.body;

        if (this.#session !== session || this.isSuperseded(desired)) {
            void body.cancel();
            this.#teardown(session);
            return "replaced";
        }

        void this.#readStream(body, session);

        try {
            await session.subscribed.promise;
        } catch (error) {
            if (this.isSuperseded(desired)) {
                return "replaced";
            }
            throw error;
        }

        return "ready";
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
        body: ReadableStream<Uint8Array>,
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
                        this.ctx("message", { rawPayload: sseEvent.data }),
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
                        this.ctx("message", { rawPayload: payload }),
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
                              this.ctx("subscription_confirmation", {
                                  rawPayload: payload,
                              }),
                              `Streaming SSE request failed with status ${payload.status}`,
                          )
                        : new StreamingError(
                              `Unexpected streaming SSE status message: ${describeUnexpectedMessage(payload)}`,
                              this.ctx("subscription_confirmation", {
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
                        this.ctx("notification", { rawPayload: payload }),
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
                parser.feed(decoder.decode(value, { stream: true }));
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
                        this.ctx("stream"),
                        "Streaming SSE stream terminated unexpectedly",
                    ),
                );
            }
        } finally {
            reader.releaseLock();

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
                      this.ctx("close"),
                  )
                : new StreamingHandshakeError(
                      "Streaming SSE connection closed before subscription confirmation",
                      this.ctx("subscription_confirmation"),
                  );

            session.subscribed.reject(preReadyError);

            if (endedNormally && wasReady) {
                this.emit(
                    "error",
                    new StreamingClosedError(
                        "Streaming SSE stream closed by server",
                        this.ctx("stream"),
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
