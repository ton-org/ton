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
    StreamingRequestTimeoutError,
    createStreamingError,
} from "./errors";
import type { StreamingErrorContext } from "./errors";
import { parseStreamingEvent } from "./protocol";
import {
    type ResolvedStreamingSubscription,
    resolveStreamingSubscription,
    serializeSubscription,
} from "./subscriptionState";
import { TypedEventEmitter } from "./TypedEventEmitter";
import type {
    IWebSocket,
    IWebSocketConstructor,
    StreamingEventMap,
    StreamingSubscription,
    StreamingWebSocketParameters,
} from "./types";
import {
    type Deferred,
    DEFAULT_PING_INTERVAL_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    appendQueryParameter,
    deferred,
    describeUnexpectedMessage,
    isRecord,
    normalizeTimeoutMs,
    resolveProviderEndpoint,
} from "./utils";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (value: StreamingResponse) => void;
    reject: (reason: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

type StreamingResponse = {
    id?: string | number;
    status?: string;
    error?: unknown;
    [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Session — single object replaces fragmented per-connection state
// ---------------------------------------------------------------------------

type WsSession = {
    socket: IWebSocket;
    state: "connecting" | "open" | "closing";
    connected: Deferred<void>;
    closed: Deferred<void>;
    pingInterval: ReturnType<typeof setInterval> | null;
    pendingRequests: Map<string, PendingRequest>;
    requestId: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const textDecoder = new TextDecoder();

function parseWebSocketMessage(rawMessage: unknown): unknown {
    if (isRecord(rawMessage)) {
        return rawMessage;
    }

    if (typeof rawMessage === "string") {
        return JSON.parse(rawMessage) as unknown;
    }

    if (rawMessage instanceof ArrayBuffer || ArrayBuffer.isView(rawMessage)) {
        return JSON.parse(textDecoder.decode(rawMessage)) as unknown;
    }

    return JSON.parse(String(rawMessage)) as unknown;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** WebSocket client for Streaming API v2-compatible endpoints. */
export class TonWsClient extends TypedEventEmitter<StreamingEventMap> {
    readonly #endpoint: string;
    readonly #apiKey: string | undefined;
    readonly #apiKeyParam: string;
    readonly #wsCtor: IWebSocketConstructor;
    readonly #wsHeaders: Record<string, string>;
    readonly #shouldPassWsHeaders: boolean;
    readonly #requestTimeoutMs: number;
    readonly #pingIntervalMs: number;

    #session: WsSession | null = null;
    #subscribed = false;
    #subscriptionQueue: Promise<void> | null = null;
    #subscriptionOperationVersion = 0;

    constructor(parameters: StreamingWebSocketParameters) {
        super();
        const resolved = resolveProviderEndpoint(
            "ws",
            parameters.service,
            parameters.network,
            parameters.endpoint,
            parameters.apiKeyParam,
        );
        this.#endpoint = resolved.endpoint;
        this.#apiKeyParam = resolved.apiKeyParam;
        this.#apiKey = parameters.apiKey;
        this.#wsHeaders = { ...(parameters.headers ?? {}) };

        const wsCtor =
            parameters.WebSocket ??
            (globalThis as { WebSocket?: IWebSocketConstructor }).WebSocket;
        if (!wsCtor) {
            throw new Error(
                "WebSocket is not available. Pass a WebSocket constructor via parameters.",
            );
        }
        this.#wsCtor = wsCtor;

        const hasHeaders = Object.keys(this.#wsHeaders).length > 0;
        if (hasHeaders && parameters.WebSocket === undefined) {
            throw new Error(
                "Custom headers require a custom WebSocket constructor. " +
                    "Browser WebSocket does not support arbitrary headers.",
            );
        }
        this.#shouldPassWsHeaders =
            parameters.WebSocket !== undefined && hasHeaders;

        this.#requestTimeoutMs = normalizeTimeoutMs(
            parameters.requestTimeoutMs,
            DEFAULT_REQUEST_TIMEOUT_MS,
            "parameters.requestTimeoutMs",
        );
        this.#pingIntervalMs = normalizeTimeoutMs(
            parameters.pingIntervalMs,
            DEFAULT_PING_INTERVAL_MS,
            "parameters.pingIntervalMs",
        );
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        const resolved = resolveStreamingSubscription(params);

        return this.#enqueueSubscriptionOperation(async () => {
            await this.#ensureSocketOpen();
            await this.#sendSubscribe(resolved);
        });
    }

    close(): Promise<void> {
        const session = this.#session;

        if (!session || session.state === "closing") {
            return session?.closed.promise ?? Promise.resolve();
        }

        const wasConnecting = session.state === "connecting";
        const wasSubscribed = this.#subscribed;

        session.state = "closing";
        this.#subscriptionOperationVersion += 1;
        this.#stopPing(session);
        this.#setSubscribed(false);
        this.#rejectAllPending(
            session,
            new StreamingClosedError("Streaming transport is closing", this.#ctx("close")),
        );

        if (wasConnecting) {
            session.connected.reject(
                new StreamingClosedError(
                    "WebSocket connection was closed",
                    this.#ctx("connect"),
                ),
            );
        }

        if (wasSubscribed) {
            this.emit("close", undefined);
        }

        try {
            session.socket.close();
        } catch {
            this.#cleanupSession(session);
        }

        return session.closed.promise;
    }

    get ready(): boolean {
        return this.#subscribed;
    }

    // -----------------------------------------------------------------------
    // Internal — context helper
    // -----------------------------------------------------------------------

    #ctx(phase: string, extra?: Partial<StreamingErrorContext>): StreamingErrorContext {
        return { transport: "ws", endpoint: this.#endpoint, phase, ...extra };
    }

    // -----------------------------------------------------------------------
    // Internal — socket lifecycle
    // -----------------------------------------------------------------------

    async #ensureSocketOpen(): Promise<void> {
        if (this.#session?.state === "open") {
            return;
        }
        if (this.#session?.state === "closing") {
            await this.#session.closed.promise;
        }
        if (this.#session?.state === "connecting") {
            return this.#session.connected.promise;
        }

        const url = this.#apiKey
            ? appendQueryParameter(
                  this.#endpoint,
                  this.#apiKeyParam,
                  this.#apiKey,
              )
            : this.#endpoint;
        const ws = this.#shouldPassWsHeaders
            ? new this.#wsCtor(url, { headers: this.#wsHeaders })
            : new this.#wsCtor(url);

        const session: WsSession = {
            socket: ws,
            state: "connecting",
            connected: deferred<void>(),
            closed: deferred<void>(),
            pingInterval: null,
            pendingRequests: new Map(),
            requestId: 0,
        };
        this.#session = session;

        ws.onopen = () => {
            if (this.#session !== session || session.state !== "connecting") {
                return;
            }
            session.state = "open";
            this.#startPing(session);
            session.connected.resolve();
        };

        ws.onerror = () => {
            if (this.#session !== session) {
                return;
            }

            const error = new StreamingError(
                "WebSocket connection error",
                this.#ctx("connect"),
            );
            this.emit("error", error);

            if (session.state === "connecting") {
                this.#cleanupSession(session);
                session.connected.reject(error);
                try {
                    ws.close();
                } catch {}
            }
        };

        ws.onmessage = (event) => {
            if (this.#session !== session) {
                return;
            }

            try {
                this.#handleMessage(session, event.data);
            } catch (error) {
                this.emit(
                    "error",
                    createStreamingError(
                        StreamingError,
                        error,
                        this.#ctx("message", { rawPayload: event.data }),
                        "Failed to handle streaming message",
                    ),
                );
            }
        };

        ws.onclose = () => {
            if (this.#session !== session) {
                return;
            }

            const wasConnecting = session.state === "connecting";
            const wasSubscribed = this.#subscribed;

            this.#cleanupSession(session);

            if (wasConnecting) {
                session.connected.reject(
                    new StreamingHandshakeError(
                        "WebSocket connection closed before opening",
                        this.#ctx("connect"),
                    ),
                );
                return;
            }

            if (wasSubscribed) {
                this.emit(
                    "error",
                    new StreamingClosedError(
                        "Streaming WebSocket stream closed by server",
                        this.#ctx("stream"),
                    ),
                );
                this.emit("close", undefined);
            }
        };

        return session.connected.promise;
    }

    // -----------------------------------------------------------------------
    // Internal — subscription
    // -----------------------------------------------------------------------

    async #sendSubscribe(
        resolved: ResolvedStreamingSubscription,
    ): Promise<void> {
        const session = this.#session;
        if (!session || session.state !== "open") {
            throw new StreamingError(
                "WebSocket is not connected",
                this.#ctx("send"),
            );
        }

        const id = this.#nextRequestId(session);
        const response = await this.#sendRequest(session, id, {
            operation: "subscribe",
            id,
            ...serializeSubscription(resolved),
        });

        if (response.status !== "subscribed") {
            throw new StreamingError(
                `Subscription failed: ${describeUnexpectedMessage(response)}`,
                this.#ctx("subscription_confirmation", {
                    requestId: id,
                    rawPayload: response,
                }),
            );
        }

        this.#setSubscribed(true);
    }

    #enqueueSubscriptionOperation<T>(operation: () => Promise<T>): Promise<T> {
        const operationVersion = this.#subscriptionOperationVersion;
        const run = async () => {
            if (operationVersion !== this.#subscriptionOperationVersion) {
                throw new StreamingClosedError(
                    "Streaming transport is closing",
                    this.#ctx("close"),
                );
            }
            return operation();
        };
        const result = this.#subscriptionQueue
            ? this.#subscriptionQueue.then(run, run)
            : run();
        const tail = result.then(
            () => undefined,
            () => undefined,
        );
        this.#subscriptionQueue = tail.finally(() => {
            if (this.#subscriptionQueue === tail) {
                this.#subscriptionQueue = null;
            }
        });
        return result;
    }

    // -----------------------------------------------------------------------
    // Internal — request / response
    // -----------------------------------------------------------------------

    #nextRequestId(session: WsSession): string {
        session.requestId += 1;
        return String(session.requestId);
    }

    async #sendRequest(
        session: WsSession,
        id: string,
        message: Record<string, unknown>,
    ): Promise<StreamingResponse> {
        if (
            session.state !== "open" ||
            session.socket.readyState !== this.#wsCtor.OPEN
        ) {
            throw new StreamingError(
                "WebSocket is not connected",
                this.#ctx("send", { requestId: id, rawPayload: message }),
            );
        }

        return new Promise<StreamingResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!session.pendingRequests.has(id)) {
                    return;
                }
                session.pendingRequests.delete(id);
                reject(
                    new StreamingRequestTimeoutError(
                        `Streaming request ${id} timed out`,
                        this.#ctx("request", { requestId: id }),
                    ),
                );
            }, this.#requestTimeoutMs);

            session.pendingRequests.set(id, {
                resolve: (value) => {
                    clearTimeout(timeout);
                    resolve(value);
                },
                reject: (reason) => {
                    clearTimeout(timeout);
                    reject(reason);
                },
                timeout,
            });

            try {
                session.socket.send(JSON.stringify(message));
            } catch (error) {
                session.pendingRequests.delete(id);
                clearTimeout(timeout);
                reject(
                    createStreamingError(
                        StreamingError,
                        error,
                        this.#ctx("send", { requestId: id, rawPayload: message }),
                        "Failed to send WebSocket message",
                    ),
                );
            }
        });
    }

    #rejectAllPending(session: WsSession, error: Error): void {
        for (const pending of session.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        session.pendingRequests.clear();
    }

    // -----------------------------------------------------------------------
    // Internal — message handling
    // -----------------------------------------------------------------------

    #handleMessage(session: WsSession, rawMessage: unknown): void {
        const data = parseWebSocketMessage(rawMessage);

        if (this.#handleResponse(session, data)) {
            return;
        }

        if (this.#handleNotification(data)) {
            return;
        }

        this.emit(
            "error",
            new StreamingError(
                `Unexpected streaming message: ${describeUnexpectedMessage(data)}`,
                this.#ctx("message", { rawPayload: data }),
            ),
        );
    }

    #handleResponse(
        session: WsSession,
        payload: unknown,
    ): payload is StreamingResponse {
        if (!isRecord(payload) || payload.id === undefined) {
            return false;
        }

        const requestId = String(payload.id);
        const pending = session.pendingRequests.get(requestId);
        if (!pending) {
            return false;
        }

        session.pendingRequests.delete(requestId);
        if (payload.error !== undefined) {
            pending.reject(
                createStreamingError(
                    StreamingError,
                    payload.error,
                    this.#ctx("request", { requestId, rawPayload: payload }),
                    `Streaming request ${requestId} failed`,
                ),
            );
        } else {
            pending.resolve(payload as StreamingResponse);
        }
        return true;
    }

    #handleNotification(payload: unknown): boolean {
        if (!isRecord(payload) || typeof payload.type !== "string") {
            return false;
        }

        try {
            const event = parseStreamingEvent(payload);
            this.emit(event.type as keyof StreamingEventMap, event as never);
        } catch (error) {
            this.emit(
                "error",
                createStreamingError(
                    StreamingError,
                    error,
                    this.#ctx("notification", { rawPayload: payload }),
                    "Invalid streaming notification",
                ),
            );
        }

        return true;
    }

    // -----------------------------------------------------------------------
    // Internal — ping / heartbeat
    // -----------------------------------------------------------------------

    #startPing(session: WsSession): void {
        if (this.#pingIntervalMs === 0) {
            return;
        }

        this.#stopPing(session);
        session.pingInterval = setInterval(() => {
            if (!this.#subscribed || this.#session !== session) {
                return;
            }

            const id = this.#nextRequestId(session);
            void this.#sendRequest(session, id, { operation: "ping", id }).catch(
                (error) => {
                    this.#handleHeartbeatFailure(session, id, error);
                },
            );
        }, this.#pingIntervalMs);
    }

    #handleHeartbeatFailure(
        session: WsSession,
        requestId: string,
        reason: unknown,
    ): void {
        if (this.#session !== session || session.state !== "open") {
            return;
        }

        const cause = reason instanceof Error ? reason : undefined;
        const message =
            cause?.message ?? "WebSocket heartbeat failed";
        const error = new StreamingError(
            message,
            this.#ctx("heartbeat", { requestId }),
            { cause },
        );
        const wasSubscribed = this.#subscribed;

        this.emit("error", error);
        this.#cleanupSession(session);
        if (wasSubscribed) {
            this.emit("close", undefined);
        }

        try {
            session.socket.close();
        } catch {}
    }

    #stopPing(session: WsSession): void {
        if (!session.pingInterval) {
            return;
        }
        clearInterval(session.pingInterval);
        session.pingInterval = null;
    }

    // -----------------------------------------------------------------------
    // Internal — state helpers
    // -----------------------------------------------------------------------

    #setSubscribed(next: boolean): void {
        if (this.#subscribed === next) {
            return;
        }
        this.#subscribed = next;
        if (next) {
            this.emit("open", undefined);
        }
    }

    #cleanupSession(session: WsSession): void {
        if (this.#session === session) {
            this.#session = null;
        }
        this.#stopPing(session);
        this.#rejectAllPending(
            session,
            new StreamingClosedError("Connection closed", this.#ctx("transport")),
        );
        this.#subscribed = false;
        session.closed.resolve();
    }
}
