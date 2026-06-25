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

function castJsonObjectArray<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): T[] {
    const arr = expectArray(value, fieldName);
    for (let i = 0; i < arr.length; i++) {
        if (!isRecord(arr[i])) {
            throw new Error(`${fieldName}[${i}] must be an object`);
        }
    }
    return arr as T[];
}

function castJsonObjectRecord<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): Record<string, T> {
    const record = expectRecord(value, fieldName);
    for (const [key, entry] of Object.entries(record)) {
        if (!isRecord(entry)) {
            throw new Error(`${fieldName}.${key} must be an object`);
        }
    }
    return record as Record<string, T>;
}

function castOptionalJsonObjectRecord<T extends JsonObject>(
    value: unknown,
    fieldName: string,
): Record<string, T> | undefined {
    return value === undefined
        ? undefined
        : castJsonObjectRecord<T>(value, fieldName);
}

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

function parseTraceCommonFields(
    payload: Record<string, unknown>,
    prefix: string,
) {
    return {
        finality: expectFinality(payload.finality, `${prefix}.finality`),
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            `${prefix}.trace_external_hash_norm`,
        ),
        address_book: parseAddressBook(
            payload.address_book,
            `${prefix}.address_book`,
        ),
        metadata: parseMetadata(payload.metadata, `${prefix}.metadata`),
    };
}

function parseTransactionsEvent(
    payload: Record<string, unknown>,
): StreamingTransactionsEvent {
    return {
        type: "transactions",
        ...parseTraceCommonFields(payload, "transactions"),
        transactions: castJsonObjectArray<StreamingTransaction>(
            payload.transactions,
            "transactions.transactions",
        ),
    };
}

function parseActionsEvent(
    payload: Record<string, unknown>,
): StreamingActionsEvent {
    return {
        type: "actions",
        ...parseTraceCommonFields(payload, "actions"),
        actions: castJsonObjectArray<StreamingAction>(
            payload.actions,
            "actions.actions",
        ),
    };
}

function parseTraceEvent(
    payload: Record<string, unknown>,
): StreamingTraceEvent {
    return {
        type: "trace",
        ...parseTraceCommonFields(payload, "trace"),
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

export function parseStreamingEvent(
    payload: Record<string, unknown>,
): StreamingEvent {
    const type = expectString(payload.type, "streaming message.type");

    switch (type) {
        case "transactions":
            return parseTransactionsEvent(payload);
        case "actions":
            return parseActionsEvent(payload);
        case "trace":
            return parseTraceEvent(payload);
        case "account_state_change":
            return parseAccountStateEvent(payload);
        case "jettons_change":
            return parseJettonsEvent(payload);
        case "trace_invalidated":
            return parseTraceInvalidatedEvent(payload);
        default:
            throw new Error(`Unexpected streaming event type: ${type}`);
    }
}
