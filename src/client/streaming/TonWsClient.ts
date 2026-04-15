/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { parseStreamingEvent } from "./protocol";
import { TypedEventEmitter } from "./TypedEventEmitter";
import {
    StreamingEventMap,
    StreamingSubscription,
    StreamingUnsubscribe,
    StreamingWebSocketParameters,
    IWebSocket,
    IWebSocketConstructor,
} from "./types";
import {
    DEFAULT_PING_INTERVAL_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    appendQueryParameter,
    describeUnexpectedMessage,
    ensureError,
    isRecord,
    normalizeTimeoutMs,
    resolveProviderEndpoint,
} from "./utils";
import {
    NormalizedStreamingSubscription,
    NormalizedStreamingUnsubscribe,
    applyStreamingUnsubscribe,
    diffRemovedTargets,
    normalizeStreamingSubscription,
    normalizeStreamingUnsubscribe,
    serializeSubscription,
} from "./subscriptionState";

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

function createUnsubscribeDelta(
    current: NormalizedStreamingSubscription,
    next: NormalizedStreamingSubscription,
): NormalizedStreamingUnsubscribe | null {
    const addresses = diffRemovedTargets(current.addresses, next.addresses);
    const traceExternalHashNorms = diffRemovedTargets(
        current.traceExternalHashNorms,
        next.traceExternalHashNorms,
    );

    if (!addresses && !traceExternalHashNorms) {
        return null;
    }

    return {
        addresses,
        traceExternalHashNorms,
    };
}

/** WebSocket client for Streaming API v2-compatible endpoints. */
export class TonWsClient extends TypedEventEmitter<StreamingEventMap> {
    readonly #endpoint: string;
    readonly #apiKey: string | undefined;
    readonly #apiKeyParam: string;
    readonly #wsCtor: IWebSocketConstructor;
    readonly #requestTimeoutMs: number;
    readonly #pingIntervalMs: number;

    #ws: IWebSocket | null = null;
    #state: "idle" | "connecting" | "open" | "closing" = "idle";
    #connectPromise: Promise<void> | null = null;
    #resolveConnect: (() => void) | null = null;
    #rejectConnect: ((error: Error) => void) | null = null;
    #closePromise: Promise<void> | null = null;
    #resolveClose: (() => void) | null = null;
    #pingInterval: ReturnType<typeof setInterval> | null = null;
    #requestId = 0;
    #pendingRequests = new Map<string, PendingRequest>();
    #requestedSubscription: NormalizedStreamingSubscription | null = null;
    #activeSubscription: NormalizedStreamingSubscription | null = null;

    constructor(parameters: StreamingWebSocketParameters) {
        super();
        const resolved = resolveProviderEndpoint(
            "ws",
            parameters.provider,
            parameters.endpoint,
            parameters.apiKeyParam,
        );
        this.#endpoint = resolved.endpoint;
        this.#apiKeyParam = resolved.apiKeyParam;
        this.#apiKey = parameters.apiKey;
        const wsCtor =
            parameters.WebSocket ??
            (globalThis as { WebSocket?: IWebSocketConstructor }).WebSocket;
        if (!wsCtor) {
            throw new Error(
                "WebSocket is not available. Pass a WebSocket constructor via parameters.",
            );
        }
        this.#wsCtor = wsCtor;
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

    async connect(params?: StreamingSubscription): Promise<void> {
        await this.#ensureSocketOpen();

        if (params) {
            this.#requestedSubscription = normalizeStreamingSubscription(params);
            await this.#replaceSubscriptionSnapshot(this.#requestedSubscription);
        }
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        this.#requestedSubscription = normalizeStreamingSubscription(params);

        await this.#ensureSocketOpen();
        await this.#replaceSubscriptionSnapshot(this.#requestedSubscription);
    }

    async unsubscribe(params: StreamingUnsubscribe): Promise<void> {
        const normalized = normalizeStreamingUnsubscribe(params);

        if (!this.connected) {
            if (!this.#requestedSubscription) {
                throw new Error(
                    "Cannot unsubscribe before a subscription has been established",
                );
            }

            const nextSubscription = applyStreamingUnsubscribe(
                this.#requestedSubscription,
                normalized,
            );
            this.#requestedSubscription = nextSubscription;
            this.#activeSubscription = null;
            return;
        }

        await this.#unsubscribeNormalized(normalized);

        if (this.#requestedSubscription) {
            const nextSubscription = applyStreamingUnsubscribe(
                this.#requestedSubscription,
                normalized,
            );
            this.#requestedSubscription = nextSubscription;
            this.#activeSubscription = nextSubscription;
        }
    }

    close(): void {
        const ws = this.#ws;
        const wasConnecting = this.#state === "connecting";

        if (!ws || this.#state === "idle" || this.#state === "closing") {
            return;
        }

        this.#state = "closing";
        this.#stopPing();
        this.#closePromise ??= new Promise<void>((resolve) => {
            this.#resolveClose = resolve;
        });

        if (wasConnecting) {
            this.#rejectConnection(
                new Error("WebSocket connection was closed"),
            );
        }

        try {
            ws.close();
        } catch {
            this.#cleanupSocketState(ws, new Error("Connection closed"));
            this.emit("close", undefined);
        }
    }

    get connected(): boolean {
        return (
            this.#state === "open" && this.#ws?.readyState === this.#wsCtor.OPEN
        );
    }

    async #ensureSocketOpen(): Promise<void> {
        if (this.#state === "open") {
            return;
        }
        if (this.#state === "closing") {
            await this.#closePromise;
        }
        if (this.#connectPromise) {
            return this.#connectPromise;
        }

        const url = this.#apiKey
            ? appendQueryParameter(
                  this.#endpoint,
                  this.#apiKeyParam,
                  this.#apiKey,
              )
            : this.#endpoint;
        const ws = new this.#wsCtor(url);

        this.#ws = ws;
        this.#state = "connecting";
        this.#connectPromise = new Promise<void>((resolve, reject) => {
            this.#resolveConnect = resolve;
            this.#rejectConnect = reject;
        });

        ws.onopen = () => {
            if (this.#ws !== ws || this.#state !== "connecting") {
                return;
            }

            this.#state = "open";
            this.#startPing();
            this.emit("open", undefined);
            this.#resolveConnection();
        };

        ws.onerror = () => {
            if (this.#ws !== ws) {
                return;
            }

            const error = new Error("WebSocket connection error");
            this.emit("error", error);

            if (this.#state === "connecting") {
                this.#cleanupSocketState(ws, error);
                this.#rejectConnection(error);
                try {
                    ws.close();
                } catch {}
            }
        };

        ws.onmessage = (event) => {
            if (this.#ws !== ws) {
                return;
            }

            try {
                this.#handleMessage(event.data);
            } catch (error) {
                this.emit(
                    "error",
                    ensureError(error, "Failed to handle streaming message"),
                );
            }
        };

        ws.onclose = () => {
            if (this.#ws !== ws) {
                return;
            }

            const wasConnecting = this.#state === "connecting";
            this.#cleanupSocketState(ws, new Error("Connection closed"));

            if (wasConnecting) {
                this.#rejectConnection(
                    new Error("WebSocket connection closed before opening"),
                );
                return;
            }

            this.emit("close", undefined);
        };

        return this.#connectPromise;
    }

    async #subscribeNormalized(
        normalized: NormalizedStreamingSubscription,
    ): Promise<void> {
        const id = this.#nextRequestId();
        const response = await this.#sendRequest(id, {
            operation: "subscribe",
            id,
            ...serializeSubscription(normalized),
        });

        if (response.status !== "subscribed") {
            throw new Error(
                `Subscription failed: ${describeUnexpectedMessage(response)}`,
            );
        }

        this.#activeSubscription = normalized;
    }

    async #replaceSubscriptionSnapshot(
        normalized: NormalizedStreamingSubscription,
    ): Promise<void> {
        const current = this.#activeSubscription;
        if (current) {
            const unsubscribeDelta = createUnsubscribeDelta(
                current,
                normalized,
            );
            if (unsubscribeDelta) {
                await this.#unsubscribeNormalized(unsubscribeDelta);
                this.#activeSubscription = applyStreamingUnsubscribe(
                    current,
                    unsubscribeDelta,
                );
            }
        }

        await this.#subscribeNormalized(normalized);
    }

    async #unsubscribeNormalized(
        normalized: NormalizedStreamingUnsubscribe,
    ): Promise<void> {
        const id = this.#nextRequestId();
        const response = await this.#sendRequest(id, {
            operation: "unsubscribe",
            id,
            addresses: normalized.addresses,
            trace_external_hash_norms: normalized.traceExternalHashNorms,
        });

        if (response.status !== "unsubscribed") {
            throw new Error(
                `Unsubscribe failed: ${describeUnexpectedMessage(response)}`,
            );
        }
    }

    #nextRequestId(): string {
        this.#requestId += 1;
        return String(this.#requestId);
    }

    #startPing(): void {
        if (this.#pingIntervalMs === 0) {
            return;
        }

        this.#stopPing();
        this.#pingInterval = setInterval(() => {
            if (!this.connected) {
                return;
            }

            const id = this.#nextRequestId();
            void this.#sendRequest(id, { operation: "ping", id }).catch(() => {
                // The normal error/close handlers will surface the failure.
            });
        }, this.#pingIntervalMs);
    }

    #stopPing(): void {
        if (!this.#pingInterval) {
            return;
        }

        clearInterval(this.#pingInterval);
        this.#pingInterval = null;
    }

    #resolveConnection(): void {
        const resolve = this.#resolveConnect;
        this.#clearConnectPromise();
        resolve?.();
    }

    #rejectConnection(error: Error): void {
        const reject = this.#rejectConnect;
        this.#clearConnectPromise();
        reject?.(error);
    }

    #clearConnectPromise(): void {
        this.#connectPromise = null;
        this.#resolveConnect = null;
        this.#rejectConnect = null;
    }

    #cleanupSocketState(ws: IWebSocket | null, error: Error): void {
        if (this.#ws === ws) {
            this.#ws = null;
        }

        this.#state = "idle";
        this.#stopPing();
        this.#rejectAllPending(error);
        this.#activeSubscription = null;
        this.#resolveClose?.();
        this.#closePromise = null;
        this.#resolveClose = null;
    }

    async #sendRequest(
        id: string,
        message: Record<string, unknown>,
    ): Promise<StreamingResponse> {
        const ws = this.#ws;
        if (!ws || !this.connected) {
            throw new Error("WebSocket is not connected");
        }

        return new Promise<StreamingResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.#pendingRequests.has(id)) {
                    return;
                }

                this.#pendingRequests.delete(id);
                reject(new Error(`Streaming request ${id} timed out`));
            }, this.#requestTimeoutMs);

            this.#pendingRequests.set(id, {
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
                ws.send(JSON.stringify(message));
            } catch (error) {
                this.#pendingRequests.delete(id);
                clearTimeout(timeout);
                reject(ensureError(error, "Failed to send WebSocket message"));
            }
        });
    }

    #rejectAllPending(error: Error): void {
        for (const pending of this.#pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.#pendingRequests.clear();
    }

    #handleMessage(rawMessage: unknown): void {
        const data = parseWebSocketMessage(rawMessage);

        if (this.#handleResponse(data)) {
            return;
        }

        if (this.#handleNotification(data)) {
            return;
        }

        this.emit(
            "error",
            new Error(
                `Unexpected streaming message: ${describeUnexpectedMessage(data)}`,
            ),
        );
    }

    #handleResponse(payload: unknown): payload is StreamingResponse {
        if (!isRecord(payload) || payload.id === undefined) {
            return false;
        }

        const requestId = String(payload.id);
        const pending = this.#pendingRequests.get(requestId);
        if (!pending) {
            return false;
        }

        this.#pendingRequests.delete(requestId);
        if (payload.error !== undefined) {
            pending.reject(
                ensureError(
                    payload.error,
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
                ensureError(error, "Invalid streaming notification"),
            );
        }

        return true;
    }
}
