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
    StreamingRequestTimeoutError,
    wrapStreamingError,
} from "./errors";
import { parseStreamingEvent } from "./protocol";
import type { ResolvedStreamingSubscription } from "./subscriptionState";
import { serializeSubscription } from "./subscriptionState";
import type {
    IWebSocket,
    IWebSocketConstructor,
    StreamingEventMap,
    StreamingWebSocketParameters,
} from "./types";
import {
    type Deferred,
    DEFAULT_PING_INTERVAL_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    buildStreamingUrl,
    deferred,
    describeUnexpectedMessage,
    isRecord,
    normalizeTimeoutMs,
} from "./utils";

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

type WsSession = {
    socket: IWebSocket;
    state: "connecting" | "open" | "closing";
    connected: Deferred<void>;
    closed: Deferred<void>;
    isReady: boolean;
    pingInterval: ReturnType<typeof setInterval> | null;
    pendingRequests: Map<string, PendingRequest>;
    requestId: number;
};

const textDecoder = new TextDecoder();

function parseWebSocketMessage(rawMessage: unknown): unknown {
    if (typeof rawMessage === "string") {
        return JSON.parse(rawMessage) as unknown;
    }

    if (rawMessage instanceof ArrayBuffer || ArrayBuffer.isView(rawMessage)) {
        return JSON.parse(textDecoder.decode(rawMessage)) as unknown;
    }

    throw new Error(`Unexpected WebSocket message type: ${typeof rawMessage}`);
}

export class TonWsClient extends AbstractStreamingClient {
    readonly #wsCtor: IWebSocketConstructor;
    readonly #wsHeaders: Record<string, string>;
    readonly #hasCustomHeaders: boolean;
    readonly #requestTimeoutMs: number;
    readonly #pingIntervalMs: number;

    #session: WsSession | null = null;

    constructor(parameters: StreamingWebSocketParameters) {
        super("ws", buildStreamingUrl("ws", parameters));

        this.#wsHeaders = { ...(parameters.headers ?? {}) };
        this.#hasCustomHeaders = Object.keys(this.#wsHeaders).length > 0;

        const wsCtor =
            parameters.WebSocket ??
            (globalThis as { WebSocket?: IWebSocketConstructor }).WebSocket;
        if (!wsCtor) {
            throw new Error(
                "WebSocket is not available. Pass a WebSocket constructor via parameters.",
            );
        }
        this.#wsCtor = wsCtor;

        if (this.#hasCustomHeaders && parameters.WebSocket === undefined) {
            throw new Error(
                "Custom headers require a custom WebSocket constructor. " +
                    "Browser WebSocket does not support arbitrary headers.",
            );
        }

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

    protected get isSessionReady(): boolean {
        return this.#session?.isReady === true;
    }

    protected async applySubscription(
        desired: DesiredSubscription,
    ): Promise<"ready" | "replaced"> {
        await this.#ensureSocketOpen();
        await this.#sendSubscribe(desired.snapshot);
        return "ready";
    }

    protected async closeTransport(error: StreamingError): Promise<void> {
        await this.#closeActiveSession(error);
    }

    #closeActiveSession(error: StreamingError): Promise<void> {
        const session = this.#session;
        if (!session || session.state === "closing") {
            return session?.closed.promise ?? Promise.resolve();
        }

        const wasConnecting = session.state === "connecting";
        const wasSubscribed = session.isReady;

        session.state = "closing";
        session.isReady = false;
        this.#stopPing(session);
        this.#rejectAllPending(session, error);

        if (wasConnecting) {
            session.connected.reject(
                new StreamingClosedError(
                    "WebSocket connection was closed",
                    this.ctx("connect"),
                ),
            );
        }

        if (wasSubscribed) {
            this.emit("close", undefined);
        }

        try {
            session.socket.close();
        } catch {
            // socket.close() threw — cleanup below handles it
        }

        this.#cleanupSession(session);
        return session.closed.promise;
    }

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

        const ws = this.#hasCustomHeaders
            ? new this.#wsCtor(this.url, { headers: this.#wsHeaders })
            : new this.#wsCtor(this.url);

        const session: WsSession = {
            socket: ws,
            state: "connecting",
            connected: deferred<void>(),
            closed: deferred<void>(),
            isReady: false,
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
            session.connected.resolve();
        };

        ws.onerror = () => {
            if (this.#session !== session) {
                return;
            }

            const error = new StreamingError(
                "WebSocket connection error",
                this.ctx("connect"),
            );

            if (session.state === "connecting") {
                this.#cleanupSession(session);
                session.connected.reject(error);
                try {
                    ws.close();
                } catch {}
                return;
            }

            if (session.isReady) {
                this.emit("error", error);
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
                    wrapStreamingError(
                        error,
                        this.ctx("message", { rawPayload: event.data }),
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
            const wasSubscribed = session.isReady;

            this.#cleanupSession(session);

            if (wasConnecting) {
                session.connected.reject(
                    new StreamingHandshakeError(
                        "WebSocket connection closed before opening",
                        this.ctx("connect"),
                    ),
                );
                return;
            }

            if (wasSubscribed) {
                this.emit(
                    "error",
                    new StreamingClosedError(
                        "Streaming WebSocket stream closed by server",
                        this.ctx("stream"),
                    ),
                );
                this.emit("close", undefined);
            }
        };

        return session.connected.promise;
    }

    async #sendSubscribe(
        resolved: ResolvedStreamingSubscription,
    ): Promise<void> {
        const session = this.#session;
        if (!session || session.state !== "open") {
            throw new StreamingError(
                "WebSocket is not connected",
                this.ctx("send"),
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
                this.ctx("subscription_confirmation", {
                    requestId: id,
                    rawPayload: response,
                }),
            );
        }

        if (!session.isReady) {
            session.isReady = true;
            this.#startPing(session);
            this.emit("open", undefined);
        }
    }

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
                this.ctx("send", { requestId: id, rawPayload: message }),
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
                        this.ctx("request", { requestId: id }),
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
                    wrapStreamingError(
                        error,
                        this.ctx("send", {
                            requestId: id,
                            rawPayload: message,
                        }),
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
                this.ctx("message", { rawPayload: data }),
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
                wrapStreamingError(
                    payload.error,
                    this.ctx("request", { requestId, rawPayload: payload }),
                    `Streaming request ${requestId} failed`,
                ),
            );
        } else {
            pending.resolve(payload);
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
                wrapStreamingError(
                    error,
                    this.ctx("notification", { rawPayload: payload }),
                    "Invalid streaming notification",
                ),
            );
        }

        return true;
    }

    #startPing(session: WsSession): void {
        if (this.#pingIntervalMs === 0) {
            return;
        }

        this.#stopPing(session);
        session.pingInterval = setInterval(() => {
            if (this.#session !== session) {
                return;
            }

            const id = this.#nextRequestId(session);
            void this.#sendRequest(session, id, {
                operation: "ping",
                id,
            }).catch((error) => {
                this.#handleHeartbeatFailure(session, id, error);
            });
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
        const message = cause?.message ?? "WebSocket heartbeat failed";
        const error = new StreamingError(
            message,
            this.ctx("heartbeat", { requestId }),
            { cause },
        );
        const wasSubscribed = session.isReady;

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

    #cleanupSession(session: WsSession): void {
        if (this.#session === session) {
            this.#session = null;
        }
        this.#stopPing(session);
        this.#rejectAllPending(
            session,
            new StreamingClosedError(
                "Connection closed",
                this.ctx("transport"),
            ),
        );
        session.socket.onopen = null;
        session.socket.onclose = null;
        session.socket.onmessage = null;
        session.socket.onerror = null;
        try {
            session.socket.terminate?.();
        } catch {}
        session.isReady = false;
        session.closed.resolve();
    }
}
