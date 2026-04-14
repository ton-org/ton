/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SseParser } from "./SseParser";
import { parseStreamingEvent } from "./protocol";
import { TypedEventEmitter } from "./TypedEventEmitter";
import {
    FetchLike,
    ReadableStreamLike,
    StreamingEventMap,
    StreamingSseParameters,
    StreamingSubscription,
    StreamingUnsubscribe,
} from "./types";
import {
    appendQueryParameter,
    describeHttpError,
    describeUnexpectedMessage,
    ensureError,
    isAbortError,
    isRecord,
    resolveProviderEndpoint,
} from "./utils";
import {
    NormalizedStreamingSubscription,
    applyStreamingUnsubscribe,
    areNormalizedSubscriptionsEqual,
    normalizeStreamingSubscription,
    normalizeStreamingUnsubscribe,
} from "./validation";

type ConnectHandshake = {
    settled: boolean;
    resolve: () => void;
    reject: (error: Error) => void;
};

/**
 * SSE client for Streaming API v2-compatible endpoints.
 *
 * SSE subscriptions are immutable for the lifetime of the HTTP stream,
 * so `subscribe()` / `unsubscribe()` reconnect with the desired snapshot.
 */
export class StreamingSse extends TypedEventEmitter<StreamingEventMap> {
    readonly #endpoint: string;
    readonly #apiKey: string | undefined;
    readonly #apiKeyParam: string;
    readonly #bearerAuth: boolean;
    readonly #fetchFn: FetchLike;
    readonly #headers: Record<string, string>;

    #abortController: AbortController | null = null;
    #connectionId = 0;
    #reading = false;
    #pendingHandshake: {
        abortController: AbortController;
        handshake: ConnectHandshake;
    } | null = null;
    #requestedSubscription: NormalizedStreamingSubscription | null = null;
    #activeSubscription: NormalizedStreamingSubscription | null = null;

    constructor(parameters: StreamingSseParameters) {
        super();
        const resolved = resolveProviderEndpoint(
            "sse",
            parameters.provider,
            parameters.endpoint,
            parameters.apiKeyParam,
        );
        this.#endpoint = resolved.endpoint;
        this.#apiKeyParam = resolved.apiKeyParam;
        this.#apiKey = parameters.apiKey;
        this.#bearerAuth = parameters.bearerAuth ?? false;
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

    async connect(params?: StreamingSubscription): Promise<void> {
        const normalized = params
            ? normalizeStreamingSubscription(params)
            : this.#requestedSubscription;

        if (!normalized) {
            throw new Error(
                "Streaming SSE connect requires subscription parameters on the first call",
            );
        }

        if (
            this.connected &&
            areNormalizedSubscriptionsEqual(
                this.#activeSubscription,
                normalized,
            )
        ) {
            this.#requestedSubscription = normalized;
            return;
        }

        this.#requestedSubscription = normalized;
        await this.#connectNormalized(normalized);
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        await this.connect(params);
    }

    async unsubscribe(params: StreamingUnsubscribe): Promise<void> {
        const normalizedUnsubscribe = normalizeStreamingUnsubscribe(params);

        if (!this.#requestedSubscription) {
            throw new Error(
                "Cannot unsubscribe from SSE before a subscription has been established",
            );
        }

        const nextSubscription = applyStreamingUnsubscribe(
            this.#requestedSubscription,
            normalizedUnsubscribe,
        );

        this.#requestedSubscription = nextSubscription;
        if (!nextSubscription) {
            this.#activeSubscription = null;
            this.close();
            return;
        }

        if (
            this.connected &&
            areNormalizedSubscriptionsEqual(
                this.#activeSubscription,
                nextSubscription,
            )
        ) {
            return;
        }

        await this.#connectNormalized(nextSubscription);
    }

    close(): void {
        const abortController = this.#abortController;
        const hadConnection = this.#reading || abortController !== null;

        this.#abortController = null;
        this.#reading = false;
        this.#activeSubscription = null;

        if (
            abortController &&
            this.#pendingHandshake?.abortController === abortController &&
            !this.#pendingHandshake.handshake.settled
        ) {
            this.#pendingHandshake.handshake.reject(
                new Error(
                    "Streaming SSE connection was closed before subscription confirmation",
                ),
            );
        }

        abortController?.abort();

        if (hadConnection) {
            this.emit("close", undefined);
        }
    }

    get connected(): boolean {
        return this.#reading;
    }

    async #connectNormalized(
        normalized: NormalizedStreamingSubscription,
    ): Promise<void> {
        this.close();

        const connectionId = ++this.#connectionId;
        const abortController = new AbortController();
        this.#abortController = abortController;

        const url =
            this.#apiKey && !this.#bearerAuth
                ? appendQueryParameter(
                      this.#endpoint,
                      this.#apiKeyParam,
                      this.#apiKey,
                  )
                : this.#endpoint;
        const authorizationHeader =
            this.#apiKey && this.#bearerAuth
                ? `Bearer ${this.#apiKey}`
                : undefined;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...(authorizationHeader
                ? { Authorization: authorizationHeader }
                : {}),
            ...this.#headers,
        };

        const releaseAbort = () => {
            if (this.#abortController === abortController) {
                this.#abortController = null;
            }
        };

        let response;
        try {
            response = await this.#fetchFn(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    types: normalized.types,
                    addresses: normalized.addresses,
                    trace_external_hash_norms:
                        normalized.traceExternalHashNorms,
                    min_finality: normalized.minFinality,
                    include_address_book: normalized.includeAddressBook,
                    include_metadata: normalized.includeMetadata,
                    action_types: normalized.actionTypes,
                    supported_action_types: normalized.supportedActionTypes,
                }),
                signal: abortController.signal,
            });
        } catch (error) {
            releaseAbort();
            if (isAbortError(error)) {
                throw new Error(
                    "Streaming SSE connection was closed before subscription confirmation",
                );
            }
            throw ensureError(error, "Streaming SSE connection failed");
        }

        if (!response.ok) {
            releaseAbort();
            throw new Error(
                `Streaming SSE connection failed: ${await describeHttpError(response)}`,
            );
        }

        if (!response.body || typeof response.body.getReader !== "function") {
            releaseAbort();
            throw new Error("SSE response does not expose a readable body");
        }
        const body = response.body;

        if (this.#abortController !== abortController) {
            body.cancel?.();
            throw new Error(
                "Streaming SSE connection was superseded by a newer connect call",
            );
        }

        const handshake: ConnectHandshake = {
            settled: false,
            resolve: () => undefined,
            reject: () => undefined,
        };

        const waitForSubscribed = new Promise<void>((resolve, reject) => {
            handshake.resolve = () => {
                handshake.settled = true;
                if (
                    this.#pendingHandshake?.abortController === abortController
                ) {
                    this.#pendingHandshake = null;
                }
                this.#activeSubscription = normalized;
                resolve();
            };
            handshake.reject = (error: Error) => {
                handshake.settled = true;
                if (
                    this.#pendingHandshake?.abortController === abortController
                ) {
                    this.#pendingHandshake = null;
                }
                reject(error);
            };
        });

        this.#pendingHandshake = { abortController, handshake };
        void this.#readStream(body, connectionId, abortController, handshake);
        return waitForSubscribed;
    }

    #rejectOrEmitError(
        handshake: ConnectHandshake,
        abortController: AbortController,
        error: Error,
    ): void {
        if (!handshake.settled) {
            handshake.reject(error);
            abortController.abort();
        } else {
            this.emit("error", error);
        }
    }

    async #readStream(
        body: ReadableStreamLike,
        connectionId: number,
        abortController: AbortController,
        handshake: ConnectHandshake,
    ): Promise<void> {
        const parser = new SseParser((sseEvent) => {
            let payload: unknown;
            try {
                payload = JSON.parse(sseEvent.data) as unknown;
            } catch (error) {
                this.#rejectOrEmitError(
                    handshake,
                    abortController,
                    ensureError(error, "Failed to parse streaming SSE event"),
                );
                return;
            }

            if (!isRecord(payload)) {
                this.#rejectOrEmitError(
                    handshake,
                    abortController,
                    new Error(
                        `Unexpected streaming SSE payload: ${describeUnexpectedMessage(payload)}`,
                    ),
                );
                return;
            }

            if (
                this.#connectionId !== connectionId ||
                this.#abortController !== abortController
            ) {
                return;
            }

            if (typeof payload.status === "string") {
                if (payload.status === "subscribed") {
                    if (!this.#reading) {
                        this.#reading = true;
                        this.emit("open", undefined);
                    }
                    if (!handshake.settled) {
                        handshake.resolve();
                    }
                    return;
                }

                this.#rejectOrEmitError(
                    handshake,
                    abortController,
                    payload.error !== undefined
                        ? ensureError(
                              payload.error,
                              `Streaming SSE request failed with status ${payload.status}`,
                          )
                        : new Error(
                              `Unexpected streaming SSE status message: ${describeUnexpectedMessage(payload)}`,
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
                    handshake,
                    abortController,
                    ensureError(error, "Invalid streaming SSE notification"),
                );
            }
        });

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let endedNormally = false;

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
            if (!isAbortError(error)) {
                const normalizedError = ensureError(
                    error,
                    "Streaming SSE stream terminated unexpectedly",
                );
                if (!handshake.settled) {
                    handshake.reject(normalizedError);
                } else {
                    this.emit("error", normalizedError);
                }
            }
        } finally {
            reader.releaseLock?.();

            if (
                this.#connectionId !== connectionId ||
                this.#abortController !== abortController
            ) {
                return;
            }

            const wasReading = this.#reading;
            this.#abortController = null;
            this.#reading = false;
            this.#activeSubscription = null;

            if (!handshake.settled) {
                handshake.reject(
                    new Error(
                        "Streaming SSE connection closed before subscription confirmation",
                    ),
                );
            }

            if (this.#pendingHandshake?.abortController === abortController) {
                this.#pendingHandshake = null;
            }

            if (endedNormally && handshake.settled && wasReading) {
                this.emit(
                    "error",
                    new Error("Streaming SSE stream closed by server"),
                );
            }

            if (wasReading) {
                this.emit("close", undefined);
            }
        }
    }
}
