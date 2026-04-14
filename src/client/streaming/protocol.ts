/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    Finality,
    JsonObject,
    StreamingAccountStateEvent,
    StreamingActionsEvent,
    StreamingEvent,
    StreamingJettonsEvent,
    StreamingTraceEvent,
    StreamingTraceInvalidatedEvent,
    StreamingTransactionsEvent,
} from "./types";
import { isRecord } from "./utils";

const FINALITY_LEVELS = new Set<Finality>([
    "pending",
    "confirmed",
    "finalized",
]);
const NON_PENDING_FINALITY_LEVELS = new Set<"confirmed" | "finalized">([
    "confirmed",
    "finalized",
]);

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

function expectOptionalString(
    value: unknown,
    fieldName: string,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return expectString(value, fieldName);
}

function expectFinality(value: unknown, fieldName: string): Finality {
    const finality = expectString(value, fieldName);
    if (!FINALITY_LEVELS.has(finality as Finality)) {
        throw new Error(`${fieldName} has unsupported value: ${finality}`);
    }

    return finality as Finality;
}

function expectNonPendingFinality(
    value: unknown,
    fieldName: string,
): "confirmed" | "finalized" {
    const finality = expectString(value, fieldName);
    if (!NON_PENDING_FINALITY_LEVELS.has(finality as "confirmed" | "finalized")) {
        throw new Error(`${fieldName} has unsupported value: ${finality}`);
    }

    return finality as "confirmed" | "finalized";
}

function expectObjectArray(value: unknown, fieldName: string): JsonObject[] {
    if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array`);
    }

    for (let i = 0; i < value.length; i += 1) {
        if (!isRecord(value[i])) {
            throw new Error(`${fieldName}[${i}] must be an object`);
        }
    }

    return value as JsonObject[];
}

function expectOptionalObjectArray(
    value: unknown,
    fieldName: string,
): JsonObject[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    return expectObjectArray(value, fieldName);
}

function expectRecordOfObjects(
    value: unknown,
    fieldName: string,
): Record<string, JsonObject> {
    const record = expectRecord(value, fieldName);

    for (const [key, entry] of Object.entries(record)) {
        if (!isRecord(entry)) {
            throw new Error(`${fieldName}.${key} must be an object`);
        }
    }

    return record as Record<string, JsonObject>;
}

function expectOptionalRecordOfObjects(
    value: unknown,
    fieldName: string,
): Record<string, JsonObject> | undefined {
    if (value === undefined) {
        return undefined;
    }

    return expectRecordOfObjects(value, fieldName);
}

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
        transactions: expectObjectArray(
            payload.transactions,
            "transactions.transactions",
        ),
        address_book: expectOptionalRecordOfObjects(
            payload.address_book,
            "transactions.address_book",
        ),
        metadata: expectOptionalRecordOfObjects(
            payload.metadata,
            "transactions.metadata",
        ),
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
        actions: expectObjectArray(payload.actions, "actions.actions"),
        address_book: expectOptionalRecordOfObjects(
            payload.address_book,
            "actions.address_book",
        ),
        metadata: expectOptionalRecordOfObjects(
            payload.metadata,
            "actions.metadata",
        ),
    };
}

function parseTraceEvent(payload: Record<string, unknown>): StreamingTraceEvent {
    return {
        type: "trace",
        finality: expectFinality(payload.finality, "trace.finality"),
        trace_external_hash_norm: expectString(
            payload.trace_external_hash_norm,
            "trace.trace_external_hash_norm",
        ),
        trace: expectRecord(payload.trace, "trace.trace") as JsonObject,
        transactions: expectRecordOfObjects(
            payload.transactions,
            "trace.transactions",
        ),
        actions: expectOptionalObjectArray(payload.actions, "trace.actions"),
        address_book: expectOptionalRecordOfObjects(
            payload.address_book,
            "trace.address_book",
        ),
        metadata: expectOptionalRecordOfObjects(
            payload.metadata,
            "trace.metadata",
        ),
    };
}

function parseAccountStateEvent(
    payload: Record<string, unknown>,
): StreamingAccountStateEvent {
    const state = expectRecord(payload.state, "account_state_change.state");

    return {
        type: "account_state_change",
        finality: expectNonPendingFinality(
            payload.finality,
            "account_state_change.finality",
        ),
        account: expectString(payload.account, "account_state_change.account"),
        state: {
            hash: expectString(state.hash, "account_state_change.state.hash"),
            balance: expectString(
                state.balance,
                "account_state_change.state.balance",
            ),
            account_status: expectString(
                state.account_status,
                "account_state_change.state.account_status",
            ),
            data_hash: expectOptionalString(
                state.data_hash,
                "account_state_change.state.data_hash",
            ),
            code_hash: expectOptionalString(
                state.code_hash,
                "account_state_change.state.code_hash",
            ),
        },
    };
}

function parseJettonsEvent(
    payload: Record<string, unknown>,
): StreamingJettonsEvent {
    const jetton = expectRecord(payload.jetton, "jettons_change.jetton");

    return {
        type: "jettons_change",
        finality: expectNonPendingFinality(
            payload.finality,
            "jettons_change.finality",
        ),
        jetton: {
            address: expectString(jetton.address, "jettons_change.jetton.address"),
            balance: expectString(jetton.balance, "jettons_change.jetton.balance"),
            owner: expectString(jetton.owner, "jettons_change.jetton.owner"),
            jetton: expectString(jetton.jetton, "jettons_change.jetton.jetton"),
            last_transaction_lt: expectString(
                jetton.last_transaction_lt,
                "jettons_change.jetton.last_transaction_lt",
            ),
        },
        address_book: expectOptionalRecordOfObjects(
            payload.address_book,
            "jettons_change.address_book",
        ),
        metadata: expectOptionalRecordOfObjects(
            payload.metadata,
            "jettons_change.metadata",
        ),
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
