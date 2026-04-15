/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StreamingSubscription } from "./types";
import type { Finality, SubscribableEventType } from "./utils";
import {
    FINALITY_SET,
    SUBSCRIBABLE_EVENT_TYPE_SET,
    requireStringList,
    sanitizeStringList,
} from "./utils";

/**
 * A fully resolved subscription with all defaults materialized and arrays
 * sorted. Two resolved subscriptions can be compared with
 * `sameSubscription()` for cheap equality.
 */
export type ResolvedStreamingSubscription = {
    addresses: string[];
    traceExternalHashNorms: string[];
    types: SubscribableEventType[];
    minFinality: Finality;
    includeAddressBook: boolean;
    includeMetadata: boolean;
    actionTypes: string[];
    supportedActionTypes: string[];
};

export function resolveStreamingSubscription(
    params: StreamingSubscription,
): ResolvedStreamingSubscription {
    const types = requireStringList(params.types, "params.types").map(
        (type) => {
            if (!SUBSCRIBABLE_EVENT_TYPE_SET.has(type)) {
                throw new Error(`Unsupported streaming event type: ${type}`);
            }
            return type as SubscribableEventType;
        },
    );
    types.sort();

    const addresses = sanitizeStringList(params.addresses) ?? [];
    addresses.sort();

    const traceExternalHashNorms =
        sanitizeStringList(params.traceExternalHashNorms) ?? [];
    traceExternalHashNorms.sort();

    const actionTypes = sanitizeStringList(params.actionTypes) ?? [];
    actionTypes.sort();

    const supportedActionTypes =
        sanitizeStringList(params.supportedActionTypes) ?? [];
    supportedActionTypes.sort();

    const minFinality: Finality = params.minFinality ?? "finalized";
    if (!FINALITY_SET.has(minFinality)) {
        throw new Error(`Unsupported finality level: ${minFinality}`);
    }

    const includeAddressBook = params.includeAddressBook ?? false;
    const includeMetadata = params.includeMetadata ?? false;

    const hasTraceSubscription = types.includes("trace");
    const hasAddressBoundSubscription = types.some((type) => type !== "trace");

    if (hasTraceSubscription && traceExternalHashNorms.length === 0) {
        throw new Error(
            'traceExternalHashNorms are required when subscribing to "trace" events',
        );
    }

    if (hasAddressBoundSubscription && addresses.length === 0) {
        throw new Error(
            "addresses are required when subscribing to non-trace streaming events",
        );
    }

    if (actionTypes.length > 0 && !types.includes("actions")) {
        throw new Error(
            'actionTypes can only be used with the "actions" event type',
        );
    }

    if (
        supportedActionTypes.length > 0 &&
        !types.some((type) => type === "actions" || type === "trace")
    ) {
        throw new Error(
            'supportedActionTypes can only be used with the "actions" or "trace" event types',
        );
    }

    return {
        addresses,
        traceExternalHashNorms,
        types,
        minFinality,
        includeAddressBook,
        includeMetadata,
        actionTypes,
        supportedActionTypes,
    };
}

export function sameSubscription(
    a: ResolvedStreamingSubscription,
    b: ResolvedStreamingSubscription,
): boolean {
    return (
        a.minFinality === b.minFinality &&
        a.includeAddressBook === b.includeAddressBook &&
        a.includeMetadata === b.includeMetadata &&
        arraysEqual(a.types, b.types) &&
        arraysEqual(a.addresses, b.addresses) &&
        arraysEqual(a.traceExternalHashNorms, b.traceExternalHashNorms) &&
        arraysEqual(a.actionTypes, b.actionTypes) &&
        arraysEqual(a.supportedActionTypes, b.supportedActionTypes)
    );
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export function serializeSubscription(
    resolved: ResolvedStreamingSubscription,
): Record<string, unknown> {
    const result: Record<string, unknown> = {
        types: resolved.types,
    };

    if (resolved.addresses.length > 0) {
        result.addresses = resolved.addresses;
    }
    if (resolved.traceExternalHashNorms.length > 0) {
        result.trace_external_hash_norms = resolved.traceExternalHashNorms;
    }
    if (resolved.minFinality !== "finalized") {
        result.min_finality = resolved.minFinality;
    }
    if (resolved.includeAddressBook) {
        result.include_address_book = true;
    }
    if (resolved.includeMetadata) {
        result.include_metadata = true;
    }
    if (resolved.actionTypes.length > 0) {
        result.action_types = resolved.actionTypes;
    }
    if (resolved.supportedActionTypes.length > 0) {
        result.supported_action_types = resolved.supportedActionTypes;
    }

    return result;
}
