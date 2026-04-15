/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue;
};

export interface IWebSocket {
    readonly readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((event: unknown) => void) | null;
    onclose: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: ((event: unknown) => void) | null;
}

export interface IWebSocketConstructor {
    new (url: string): IWebSocket;
    readonly OPEN: number;
}

export type Finality = "pending" | "confirmed" | "finalized";

export type StreamingLifecycleEvents = {
    error: Error;
    close: undefined;
    open: undefined;
};

export type StreamingEventType =
    | "transactions"
    | "actions"
    | "trace"
    | "account_state_change"
    | "jettons_change";

export type StreamingProvider =
    | "tonapiMainnet"
    | "toncenterMainnet"
    | "tonapiTestnet"
    | "toncenterTestnet";

export type StreamingBaseParameters = {
    /**
     * Known streaming provider preset.
     * When set, endpoint and API key query parameter are inferred automatically.
     * Explicit `endpoint` and `apiKeyParam` values are ignored.
     */
    provider?: StreamingProvider;

    /**
     * Transport endpoint URL.
     * Required when `provider` is omitted.
     */
    endpoint?: string;

    /** API key for authentication. */
    apiKey?: string;

    /**
     * Query parameter name for the API key.
     * Use "token" for TonAPI-compatible query-parameter authentication.
     * Ignored when `provider` is set.
     * @default "api_key"
     */
    apiKeyParam?: string;
};

export type StreamingWebSocketParameters = StreamingBaseParameters & {
    /** Custom WebSocket constructor (for Node.js < 22 use the `ws` package). */
    WebSocket?: IWebSocketConstructor;

    /**
     * Time to wait for a request/response pair before rejecting.
     * @default 30000
     */
    requestTimeoutMs?: number;

    /**
     * Ping interval in milliseconds. Set to 0 to disable automatic pings.
     * @default 15000
     */
    pingIntervalMs?: number;
};

export type StreamingSubscription = {
    /** Wallet or contract addresses to monitor. */
    addresses?: readonly string[];
    /** Trace external hashes to monitor (required for the "trace" event type). */
    traceExternalHashNorms?: readonly string[];
    /** Event types to receive. */
    types: readonly StreamingEventType[];
    /** Minimum finality level. Default: "finalized". */
    minFinality?: Finality;
    /** Include DNS-resolved and friendly names for addresses. */
    includeAddressBook?: boolean;
    /** Include metadata for known token contracts. */
    includeMetadata?: boolean;
    /** Filter actions by type (for example ["jetton_transfer", "ton_transfer"]). */
    actionTypes?: readonly string[];
    /** Advertise which action classification types the client understands. */
    supportedActionTypes?: readonly string[];
};

export type StreamingUnsubscribe = {
    /** Addresses to remove from the current subscription snapshot. */
    addresses?: readonly string[];
    /** Trace external hashes to remove from the current subscription snapshot. */
    traceExternalHashNorms?: readonly string[];
};

export type StreamingTransactionsEvent = {
    type: "transactions";
    finality: Finality;
    trace_external_hash_norm: string;
    transactions: JsonObject[];
    address_book?: Record<string, JsonObject>;
    metadata?: Record<string, JsonObject>;
};

export type StreamingActionsEvent = {
    type: "actions";
    finality: Finality;
    trace_external_hash_norm: string;
    actions: JsonObject[];
    address_book?: Record<string, JsonObject>;
    metadata?: Record<string, JsonObject>;
};

export type StreamingTraceEvent = {
    type: "trace";
    finality: Finality;
    trace_external_hash_norm: string;
    trace: JsonObject;
    transactions: Record<string, JsonObject>;
    actions?: JsonObject[];
    address_book?: Record<string, JsonObject>;
    metadata?: Record<string, JsonObject>;
};

export type StreamingAccountStateEvent = {
    type: "account_state_change";
    finality: "confirmed" | "finalized";
    account: string;
    state: {
        hash: string;
        balance: string;
        account_status: string;
        data_hash?: string;
        code_hash?: string;
    };
};

export type StreamingJettonsEvent = {
    type: "jettons_change";
    finality: "confirmed" | "finalized";
    jetton: {
        address: string;
        balance: string;
        owner: string;
        jetton: string;
        last_transaction_lt: string;
    };
    address_book?: Record<string, JsonObject>;
    metadata?: Record<string, JsonObject>;
};

export type StreamingTraceInvalidatedEvent = {
    type: "trace_invalidated";
    trace_external_hash_norm: string;
};

export type StreamingEvent =
    | StreamingTransactionsEvent
    | StreamingActionsEvent
    | StreamingTraceEvent
    | StreamingAccountStateEvent
    | StreamingJettonsEvent
    | StreamingTraceInvalidatedEvent;

export type StreamingEventMap = StreamingLifecycleEvents & {
    transactions: StreamingTransactionsEvent;
    actions: StreamingActionsEvent;
    trace: StreamingTraceEvent;
    account_state_change: StreamingAccountStateEvent;
    jettons_change: StreamingJettonsEvent;
    trace_invalidated: StreamingTraceInvalidatedEvent;
};

export type HeadersLike = {
    get(name: string): string | null;
};

export type ReadResultLike = {
    done: boolean;
    value?: Uint8Array;
};

export type ReaderLike = {
    read(): Promise<ReadResultLike>;
    cancel?(reason?: unknown): Promise<unknown> | void;
    releaseLock?(): void;
};

export type ReadableStreamLike = {
    getReader(): ReaderLike;
    cancel?(reason?: unknown): Promise<unknown> | void;
};

export type FetchResponseLike = {
    ok: boolean;
    status: number;
    statusText: string;
    body?: ReadableStreamLike | null;
    headers?: HeadersLike;
    text?(): Promise<string>;
};

/**
 * Minimal fetch-like function signature.
 * Compatible with `globalThis.fetch` (Node 18+, browsers).
 */
export type FetchLike = (
    url: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
    },
) => Promise<FetchResponseLike>;

/**
 * Common interface for streaming clients (WebSocket or SSE).
 *
 * `connect(params)` opens a connection and, when parameters are provided,
 * establishes the full subscription snapshot in one step.
 *
 * For WebSocket transports, `subscribe(params)` sends a protocol-level
 * `subscribe` request. For SSE transports it reconnects with the new snapshot,
 * because SSE subscriptions are immutable for the lifetime of the connection.
 */
export type StreamingClient = {
    connect(params?: StreamingSubscription): Promise<void>;
    subscribe(params: StreamingSubscription): Promise<void>;
    unsubscribe(params: StreamingUnsubscribe): Promise<void>;
    on<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): () => void;
    off<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): void;
    close(): void;
    readonly connected: boolean;
};

export type StreamingSseParameters = StreamingBaseParameters & {
    /**
     * Custom fetch function (defaults to `globalThis.fetch`).
     * Must support streaming responses (ReadableStream body).
     */
    fetch?: FetchLike;

    /** Extra headers to send with the SSE request. */
    headers?: Record<string, string>;
};
