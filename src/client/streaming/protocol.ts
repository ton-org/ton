/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
    JsonObject,
    StreamingAccountStateEvent,
    StreamingAction,
    StreamingActionsEvent,
    StreamingAddressBookEntry,
    StreamingEvent,
    StreamingJettonsEvent,
    StreamingMetadataEntry,
    StreamingTrace,
    StreamingTraceEvent,
    StreamingTraceInvalidatedEvent,
    StreamingTransaction,
    StreamingTransactionsEvent,
} from "./types";
import type { Finality, NonPendingFinality } from "./utils";
import { FINALITY_SET, NON_PENDING_FINALITY_SET, isRecord } from "./utils";

// ---------------------------------------------------------------------------
// Minimal validation helpers — envelope-level only
// ---------------------------------------------------------------------------

function expectRecord(
    value: unknown,
    fieldName: string,
): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return value;
}

function expectString(value: unknown, fieldName: string): string {
    if (typeof value !== "string") {
        throw new Error(`${fieldName} must be a string`);
    }
    return value;
}

function expectFinality(value: unknown, fieldName: string): Finality {
    const finality = expectString(value, fieldName);
    if (!FINALITY_SET.has(finality)) {
        throw new Error(`${fieldName} has unsupported value: ${finality}`);
    }
    return finality as Finality;
}

function expectNonPendingFinality(
    value: unknown,
    fieldName: string,
): NonPendingFinality {
    const finality = expectString(value, fieldName);
    if (!NON_PENDING_FINALITY_SET.has(finality)) {
        throw new Error(`${fieldName} has unsupported value: ${finality}`);
    }
    return finality as NonPendingFinality;
}

function expectArray(value: unknown, fieldName: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array`);
    }
    return value;
}

function expectJsonObject(value: unknown, fieldName: string): JsonObject {
    return expectRecord(value, fieldName) as JsonObject;
}

/**
 * Cast an array of records as-is. Each element is validated only as a
 * record — no deep field-level parsing.
 */
function castJsonObjectArray<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): T[] {
    const arr = expectArray(value, fieldName);
    return arr.map((entry, i) =>
        expectRecord(entry, `${fieldName}[${i}]`),
    ) as T[];
}

/**
 * Cast a record-of-records as-is. Values are validated only as records.
 */
function castJsonObjectRecord<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): Record<string, T> {
    const record = expectRecord(value, fieldName);
    const result: Record<string, T> = {};

    for (const [key, entry] of Object.entries(record)) {
        result[key] = expectRecord(entry, `${fieldName}.${key}`) as T;
    }

    return result;
}

function castOptionalJsonObjectRecord<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): Record<string, T> | undefined {
    return value === undefined
        ? undefined
        : castJsonObjectRecord<T>(value, fieldName);
}

// ---------------------------------------------------------------------------
// Envelope-level address book / metadata
// ---------------------------------------------------------------------------

function parseAddressBook(
    value: unknown,
    fieldName: string,
): Record<string, StreamingAddressBookEntry> | undefined {
    return castOptionalJsonObjectRecord<StreamingAddressBookEntry>(
        value,
        fieldName,
    );
}

function parseMetadata(
    value: unknown,
    fieldName: string,
): Record<string, StreamingMetadataEntry> | undefined {
    return castOptionalJsonObjectRecord<StreamingMetadataEntry>(
        value,
        fieldName,
    );
}

// ---------------------------------------------------------------------------
// Event parsers — envelope validation only, deep content passed through
// ---------------------------------------------------------------------------

function parseTransactionsEvent(
    payload: Record<string, unknown>,
): StreamingTransactionsEvent {
    return {
        type: "transactions",
        finality: expectFinality(payload.finality, "transactions.finality"),
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            "transactions.trace_external_hash_norm",
        ),
        transactions: castJsonObjectArray<StreamingTransaction>(
            payload.transactions,
            "transactions.transactions",
        ),
        address_book: parseAddressBook(
            payload.address_book,
            "transactions.address_book",
        ),
        metadata: parseMetadata(payload.metadata, "transactions.metadata"),
    };
}

function parseActionsEvent(
    payload: Record<string, unknown>,
): StreamingActionsEvent {
    return {
        type: "actions",
        finality: expectFinality(payload.finality, "actions.finality"),
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            "actions.trace_external_hash_norm",
        ),
        actions: castJsonObjectArray<StreamingAction>(
            payload.actions,
            "actions.actions",
        ),
        address_book: parseAddressBook(
            payload.address_book,
            "actions.address_book",
        ),
        metadata: parseMetadata(payload.metadata, "actions.metadata"),
    };
}

function parseTraceEvent(
    payload: Record<string, unknown>,
): StreamingTraceEvent {
    return {
        type: "trace",
        finality: expectFinality(payload.finality, "trace.finality"),
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            "trace.trace_external_hash_norm",
        ),
        trace: expectJsonObject(payload.trace, "trace.trace") as StreamingTrace,
        transactions: castJsonObjectRecord<StreamingTransaction>(
            payload.transactions,
            "trace.transactions",
        ),
        actions:
            payload.actions === undefined
                ? undefined
                : castJsonObjectArray<StreamingAction>(
                      payload.actions,
                      "trace.actions",
                  ),
        address_book: parseAddressBook(
            payload.address_book,
            "trace.address_book",
        ),
        metadata: parseMetadata(payload.metadata, "trace.metadata"),
    };
}

function parseAccountStateEvent(
    payload: Record<string, unknown>,
): StreamingAccountStateEvent {
    return {
        type: "account_state_change",
        finality: expectNonPendingFinality(
            payload.finality,
            "account_state_change.finality",
        ),
        account: expectString(payload.account, "account_state_change.account"),
        state: expectJsonObject(
            payload.state,
            "account_state_change.state",
        ) as StreamingAccountStateEvent["state"],
    };
}

function parseJettonsEvent(
    payload: Record<string, unknown>,
): StreamingJettonsEvent {
    return {
        type: "jettons_change",
        finality: expectNonPendingFinality(
            payload.finality,
            "jettons_change.finality",
        ),
        jetton: expectJsonObject(
            payload.jetton,
            "jettons_change.jetton",
        ) as StreamingJettonsEvent["jetton"],
        address_book: parseAddressBook(
            payload.address_book,
            "jettons_change.address_book",
        ),
        metadata: parseMetadata(payload.metadata, "jettons_change.metadata"),
    };
}

function parseTraceInvalidatedEvent(
    payload: Record<string, unknown>,
): StreamingTraceInvalidatedEvent {
    return {
        type: "trace_invalidated",
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            "trace_invalidated.trace_external_hash_norm",
        ),
    };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseStreamingEvent(payload: unknown): StreamingEvent {
    const record = expectRecord(payload, "streaming message");
    const type = expectString(record.type, "streaming message.type");

    switch (type) {
        case "transactions":
            return parseTransactionsEvent(record);
        case "actions":
            return parseActionsEvent(record);
        case "trace":
            return parseTraceEvent(record);
        case "account_state_change":
            return parseAccountStateEvent(record);
        case "jettons_change":
            return parseJettonsEvent(record);
        case "trace_invalidated":
            return parseTraceInvalidatedEvent(record);
        default:
            throw new Error(`Unexpected streaming event type: ${type}`);
    }
}
