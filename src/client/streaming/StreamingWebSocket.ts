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
    StreamingProvider,
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
    compactRecord,
    createMissingWebSocketConstructor,
    describeUnexpectedMessage,
    ensureError,
    isRecord,
    normalizeTimeoutMs,
} from "./utils";
import {
    NormalizedStreamingSubscription,
    NormalizedStreamingUnsubscribe,
    applyStreamingUnsubscribe,
    areNormalizedSubscriptionsEqual,
    normalizeStreamingSubscription,
    normalizeStreamingUnsubscribe,
} from "./validation";

type PendingRequest = {
    resolve: (value: StreamingResponse) => void;
    reject: (reason: Error) => void;
};

type StreamingResponse = {
    id?: string | number;
    status?: string;
    error?: unknown;
    [key: string]: unknown;
};

const STREAMING_WEBSOCKET_PROVIDER_DEFAULTS = {
    tonapi: {
        endpoint: "wss://tonapi.io/streaming/v2/ws",
        apiKeyParam: "token",
    },
    toncenter: {
        endpoint: "wss://toncenter.com/api/streaming/v2/ws",
        apiKeyParam: "api_key",
    },
} satisfies Record<
    StreamingProvider,
    {
        endpoint: string;
        apiKeyParam: string;
    }
>;

function decodeWebSocketMessage(rawMessage: unknown): string {
    if (typeof rawMessage === "string") {
        return rawMessage;
    }

    if (rawMessage instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(rawMessage));
    }

    if (ArrayBuffer.isView(rawMessage)) {
        return new TextDecoder().decode(
            new Uint8Array(
                rawMessage.buffer,
                rawMessage.byteOffset,
                rawMessage.byteLength,
            ),
        );
    }

    return String(rawMessage);
}

function parseWebSocketMessage(rawMessage: unknown): unknown {
    if (isRecord(rawMessage)) {
        return rawMessage;
    }

    return JSON.parse(decodeWebSocketMessage(rawMessage)) as unknown;
}

function diffRemovedTargets(
    current: readonly string[] | undefined,
    next: readonly string[] | undefined,
): string[] | undefined {
    if (!current || current.length === 0) {
        return undefined;
    }

    if (!next || next.length === 0) {
        return [...current];
    }

    const nextSet = new Set(next);
    const removed = current.filter((value) => !nextSet.has(value));
    return removed.length > 0 ? removed : undefined;
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

/**
 * WebSocket client for Streaming API v2-compatible endpoints.
 */
export class StreamingWebSocket extends TypedEventEmitter<StreamingEventMap> {
    readonly #endpoint: string;
    readonly #apiKey: string | undefined;
    readonly #apiKeyParam: string;
    readonly #WsCtor: IWebSocketConstructor;
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
        if (parameters.provider) {
            const providerDefaults =
                STREAMING_WEBSOCKET_PROVIDER_DEFAULTS[parameters.provider];
            this.#endpoint = providerDefaults.endpoint;
            this.#apiKeyParam = providerDefaults.apiKeyParam;
        } else {
            if (!parameters.endpoint) {
                throw new Error(
                    "Streaming endpoint is required when provider is not specified",
                );
            }

            this.#endpoint = parameters.endpoint;
            this.#apiKeyParam = parameters.apiKeyParam ?? "api_key";
        }
        this.#apiKey = parameters.apiKey;
        this.#WsCtor =
            parameters.WebSocket ??
            (globalThis as { WebSocket?: IWebSocketConstructor }).WebSocket ??
            createMissingWebSocketConstructor();
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

    /**
     * Connect to the streaming WebSocket endpoint.
     *
     * When `params` are provided they become the active subscription snapshot.
     * When omitted, the most recently requested snapshot is reused.
     */
    async connect(params?: StreamingSubscription): Promise<void> {
        const targetSubscription = params
            ? normalizeStreamingSubscription(params)
            : this.#requestedSubscription;
        const wasOpen = this.#state === "open";

        await this.#ensureSocketOpen();

        if (!targetSubscription) {
            return;
        }

        this.#requestedSubscription = targetSubscription;
        if (
            !wasOpen ||
            (params !== undefined &&
                !areNormalizedSubscriptionsEqual(
                    this.#activeSubscription,
                    targetSubscription,
                ))
        ) {
            await this.#replaceSubscriptionSnapshot(targetSubscription);
        }
    }

    /**
     * Replace the current subscription snapshot (snapshot semantics).
     */
    async subscribe(params: StreamingSubscription): Promise<void> {
        const normalized = normalizeStreamingSubscription(params);
        this.#requestedSubscription = normalized;

        await this.#ensureSocketOpen();
        if (
            this.connected &&
            areNormalizedSubscriptionsEqual(
                this.#activeSubscription,
                normalized,
            )
        ) {
            return;
        }

        await this.#replaceSubscriptionSnapshot(normalized);
    }

    /**
     * Remove specific addresses or trace hashes from the current subscription.
     *
     * If the socket is currently disconnected, the stored subscription snapshot
     * is updated locally and will be reused on the next `connect()`.
     */
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

    /**
     * Close the WebSocket connection and clean up.
     *
     * The last requested subscription snapshot is preserved so `connect()` can
     * restore it later.
     */
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

    /**
     * Whether the WebSocket connection is currently open.
     */
    get connected(): boolean {
        return (
            this.#state === "open" && this.#ws?.readyState === this.#WsCtor.OPEN
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
        const ws = new this.#WsCtor(url);

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
                } catch {
                    // Ignore secondary close errors.
                }
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
            types: normalized.types,
            addresses: normalized.addresses,
            trace_external_hash_norms: normalized.traceExternalHashNorms,
            min_finality: normalized.minFinality,
            include_address_book: normalized.includeAddressBook,
            include_metadata: normalized.includeMetadata,
            action_types: normalized.actionTypes,
            supported_action_types: normalized.supportedActionTypes,
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
            });

            try {
                ws.send(JSON.stringify(compactRecord(message)));
            } catch (error) {
                this.#pendingRequests.delete(id);
                clearTimeout(timeout);
                reject(ensureError(error, "Failed to send WebSocket message"));
            }
        });
    }

    #rejectAllPending(error: Error): void {
        for (const pending of this.#pendingRequests.values()) {
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
