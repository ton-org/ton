/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
    StreamingClosedError,
    StreamingHandshakeError,
    StreamingProtocolError,
    StreamingRequestTimeoutError,
    StreamingTransportError,
} from "./errors";
import type {
    Finality,
    NonPendingFinality,
    SubscribableEventType,
    StreamingService,
    StreamingNetwork,
} from "./utils";

export type {
    Finality,
    NonPendingFinality,
    SubscribableEventType,
    StreamingService,
    StreamingNetwork,
} from "./utils";

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
    new (url: string, options?: unknown): IWebSocket;
    readonly OPEN: number;
}

export type StreamingLifecycleError =
    | StreamingClosedError
    | StreamingHandshakeError
    | StreamingProtocolError
    | StreamingRequestTimeoutError
    | StreamingTransportError;

export type StreamingLifecycleEvents = {
    error: StreamingLifecycleError;
    close: undefined;
    open: undefined;
};

export type StreamingBaseParameters = {
    /**
     * Known streaming service.
     * When set, endpoint and API key query parameter are inferred automatically.
     * Cannot be combined with `endpoint`.
     */
    service?: StreamingService;

    /**
     * Network to use with the streaming service.
     * Ignored when `endpoint` is provided directly.
     * @default "mainnet"
     */
    network?: StreamingNetwork;

    /**
     * Transport endpoint URL.
     * Required when `service` is omitted. Cannot be combined with `service`.
     */
    endpoint?: string;

    /** API key for authentication. */
    apiKey?: string;

    /**
     * Query parameter name for the API key.
     * Ignored when `service` is set (inferred from the service).
     * @default "api_key"
     */
    apiKeyParam?: string;
};

export type StreamingWebSocketParameters = StreamingBaseParameters & {
    /** Custom WebSocket constructor (for Node.js < 22 use the `ws` package). */
    WebSocket?: IWebSocketConstructor;

    /**
     * Extra headers to send with the WebSocket handshake.
     *
     * Requires a custom `WebSocket` constructor (for example, Node.js `ws`).
     * Browser WebSocket does not support arbitrary headers — providing headers
     * without a custom constructor will throw.
     */
    headers?: Record<string, string>;

    /**
     * Time to wait for a request/response pair before rejecting.
     * @default 5000
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
    types: readonly SubscribableEventType[];
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

export type StreamingAddressBookEntry = JsonObject & {
    user_friendly?: string;
    domain?: string | null;
    interfaces?: string[];
};

export type StreamingMetadataEntry = JsonObject;

/**
 * Streaming payloads may expose different decode depth for the same message
 * across notification types. The public surface is kept loose: callers may
 * discriminate on `@type` when present, but should not assume a fully
 * normalized payload shape.
 */
export type StreamingDecodedMessage = JsonObject & {
    "@type": string;
};

export type StreamingMessageContent = JsonObject & {
    hash: string;
    body: string;
    decoded: StreamingDecodedMessage | null;
};

/**
 * Message payload from the streaming API.
 *
 * Many fields may be `null` for external messages (e.g. `source`, `value`,
 * `fwd_fee`, etc.). The type is kept conservative — prefer null-checks at
 * usage sites.
 */
export type StreamingMessage = JsonObject & {
    hash: string;
    source: string | null;
    destination: string | null;
    value: string | null;
    value_extra_currencies: JsonObject | null;
    fwd_fee: string | null;
    ihr_fee: string | null;
    extra_flags: string | null;
    created_lt: string | null;
    created_at: string | null;
    opcode: string | null;
    decoded_opcode: string | null;
    ihr_disabled: boolean | null;
    bounce: boolean | null;
    bounced: boolean | null;
    import_fee: string | null;
    message_content: StreamingMessageContent | null;
    init_state: JsonObject | null;
};

export type StreamingTransactionAccountState = JsonObject & {
    hash: string;
    balance: string | null;
    extra_currencies: JsonValue | null;
    account_status: string | null;
    frozen_hash: string | null;
    data_hash: string | null;
    code_hash: string | null;
};

export type StreamingBlockRef = JsonObject & {
    workchain: number;
    shard: string;
    seqno: number;
};

export type StreamingTransactionDescription = JsonObject & {
    type: string;
};

export type StreamingTransaction = JsonObject & {
    account: string;
    hash: string;
    lt: string;
    now: number;
    mc_block_seqno: number;
    trace_id: string;
    prev_trans_hash: string;
    prev_trans_lt: string;
    orig_status: string;
    end_status: string;
    total_fees: string;
    total_fees_extra_currencies: JsonObject;
    description: StreamingTransactionDescription;
    out_msgs: StreamingMessage[];
    block_ref?: StreamingBlockRef;
    account_state_before?: StreamingTransactionAccountState;
    account_state_after?: StreamingTransactionAccountState;
    in_msg?: StreamingMessage | null;
    finality?: Finality;
    emulated?: boolean;
};

export type StreamingTraceNode = JsonObject & {
    tx_hash: string;
    children: StreamingTraceNode[];
    in_msg_hash?: string;
    transaction?: StreamingTransaction | null;
};

export type StreamingTrace = StreamingTraceNode;

export type StreamingActionDetails = JsonObject;

export type StreamingAction = JsonObject & {
    trace_id: string;
    action_id: string;
    start_lt: string;
    end_lt: string;
    start_utime: number;
    end_utime: number;
    trace_end_lt: string;
    trace_end_utime: number;
    trace_mc_seqno_end: number;
    transactions: string[];
    success: boolean;
    type: string;
    details: StreamingActionDetails;
    trace_external_hash?: string;
    trace_external_hash_norm?: string;
    accounts: string[];
    finality?: Finality;
};

export type StreamingTransactionsEvent = {
    type: "transactions";
    finality: Finality;
    trace_external_hash_norm: string;
    transactions: StreamingTransaction[];
    address_book?: Record<string, StreamingAddressBookEntry>;
    metadata?: Record<string, StreamingMetadataEntry>;
};

export type StreamingActionsEvent = {
    type: "actions";
    finality: Finality;
    trace_external_hash_norm: string;
    actions: StreamingAction[];
    address_book?: Record<string, StreamingAddressBookEntry>;
    metadata?: Record<string, StreamingMetadataEntry>;
};

export type StreamingTraceEvent = {
    type: "trace";
    finality: Finality;
    trace_external_hash_norm: string;
    trace: StreamingTrace;
    transactions: Record<string, StreamingTransaction>;
    actions?: StreamingAction[];
    address_book?: Record<string, StreamingAddressBookEntry>;
    metadata?: Record<string, StreamingMetadataEntry>;
};

export type StreamingAccountStateEvent = {
    type: "account_state_change";
    finality: NonPendingFinality;
    account: string;
    state: JsonObject & {
        hash: string;
        balance: string;
        account_status: string;
        data_hash?: string;
        code_hash?: string;
    };
};

export type StreamingJettonsEvent = {
    type: "jettons_change";
    finality: NonPendingFinality;
    jetton: JsonObject & {
        address: string;
        balance: string;
        owner: string;
        jetton: string;
        last_transaction_lt: string;
    };
    address_book?: Record<string, StreamingAddressBookEntry>;
    metadata?: Record<string, StreamingMetadataEntry>;
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
 * The lifecycle is subscription-centric:
 * - `subscribe(params)` starts (or replaces) the active subscription. Resolves
 *   when the server confirms the subscription and notifications may arrive.
 * - `ready` is `true` while an active subscription is confirmed.
 * - `open` / `close` events bracket the `ready` state.
 * - `close()` shuts down the client. Resolves when transport cleanup finishes.
 */
export type StreamingClient = {
    subscribe(params: StreamingSubscription): Promise<void>;
    on<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): () => void;
    off<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): void;
    close(): Promise<void>;
    readonly ready: boolean;
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
