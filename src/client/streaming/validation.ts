/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    Finality,
    StreamingEventType,
    StreamingSubscription,
    StreamingUnsubscribe,
} from "./types";
import {
    FINALITY_LEVELS,
    areStringListsEqual,
    requireStringList,
    sanitizeStringList,
} from "./utils";

const STREAMING_EVENT_TYPES = new Set<StreamingEventType>([
    "transactions",
    "actions",
    "trace",
    "account_state_change",
    "jettons_change",
]);

export type NormalizedStreamingSubscription = {
    addresses?: string[];
    traceExternalHashNorms?: string[];
    types: StreamingEventType[];
    minFinality?: Finality;
    includeAddressBook?: boolean;
    includeMetadata?: boolean;
    actionTypes?: string[];
    supportedActionTypes?: string[];
};

export type NormalizedStreamingUnsubscribe = {
    addresses?: string[];
    traceExternalHashNorms?: string[];
};

function normalizeOptionalBoolean(
    value: boolean | undefined,
    fieldName: string,
): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "boolean") {
        throw new Error(`${fieldName} must be a boolean`);
    }

    return value;
}

export function normalizeStreamingSubscription(
    params: StreamingSubscription,
): NormalizedStreamingSubscription {
    const types = requireStringList(params.types, "params.types").map(
        (type) => {
            if (!STREAMING_EVENT_TYPES.has(type as StreamingEventType)) {
                throw new Error(`Unsupported streaming event type: ${type}`);
            }
            return type as StreamingEventType;
        },
    );

    const addresses = sanitizeStringList(params.addresses);
    const traceExternalHashNorms = sanitizeStringList(
        params.traceExternalHashNorms,
    );
    const actionTypes = sanitizeStringList(params.actionTypes);
    const supportedActionTypes = sanitizeStringList(
        params.supportedActionTypes,
    );
    const includeAddressBook = normalizeOptionalBoolean(
        params.includeAddressBook,
        "params.includeAddressBook",
    );
    const includeMetadata = normalizeOptionalBoolean(
        params.includeMetadata,
        "params.includeMetadata",
    );

    if (
        params.minFinality !== undefined &&
        !FINALITY_LEVELS.has(params.minFinality)
    ) {
        throw new Error(`Unsupported finality level: ${params.minFinality}`);
    }

    const hasTraceSubscription = types.includes("trace");
    const hasAddressBoundSubscription = types.some((type) => type !== "trace");

    if (hasTraceSubscription && !traceExternalHashNorms) {
        throw new Error(
            'traceExternalHashNorms are required when subscribing to "trace" events',
        );
    }

    if (hasAddressBoundSubscription && !addresses) {
        throw new Error(
            "addresses are required when subscribing to non-trace streaming events",
        );
    }

    if (actionTypes && !types.includes("actions")) {
        throw new Error(
            'actionTypes can only be used with the "actions" event type',
        );
    }

    if (
        supportedActionTypes &&
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
        minFinality: params.minFinality,
        includeAddressBook,
        includeMetadata,
        actionTypes,
        supportedActionTypes,
    };
}

export function normalizeStreamingUnsubscribe(
    params: StreamingUnsubscribe,
): NormalizedStreamingUnsubscribe {
    const addresses = sanitizeStringList(params.addresses);
    const traceExternalHashNorms = sanitizeStringList(
        params.traceExternalHashNorms,
    );

    if (!addresses && !traceExternalHashNorms) {
        throw new Error(
            "unsubscribe requires at least one address or traceExternalHashNorm",
        );
    }

    return {
        addresses,
        traceExternalHashNorms,
    };
}

export function areNormalizedSubscriptionsEqual(
    left: NormalizedStreamingSubscription | null,
    right: NormalizedStreamingSubscription | null,
): boolean {
    if (left === right) {
        return true;
    }

    if (!left || !right) {
        return false;
    }

    return (
        areStringListsEqual(left.addresses, right.addresses) &&
        areStringListsEqual(
            left.traceExternalHashNorms,
            right.traceExternalHashNorms,
        ) &&
        areStringListsEqual(left.types, right.types) &&
        left.minFinality === right.minFinality &&
        left.includeAddressBook === right.includeAddressBook &&
        left.includeMetadata === right.includeMetadata &&
        areStringListsEqual(left.actionTypes, right.actionTypes) &&
        areStringListsEqual(
            left.supportedActionTypes,
            right.supportedActionTypes,
        )
    );
}

function removeFromList(
    current: readonly string[] | undefined,
    toRemove: readonly string[] | undefined,
): string[] | undefined {
    if (!current) {
        return undefined;
    }

    if (!toRemove || toRemove.length === 0) {
        return [...current];
    }

    const removalSet = new Set(toRemove);
    const next = current.filter((value) => !removalSet.has(value));
    return next.length > 0 ? next : undefined;
}

export function applyStreamingUnsubscribe(
    current: NormalizedStreamingSubscription,
    params: NormalizedStreamingUnsubscribe,
): NormalizedStreamingSubscription | null {
    const addresses = removeFromList(current.addresses, params.addresses);
    const traceExternalHashNorms = removeFromList(
        current.traceExternalHashNorms,
        params.traceExternalHashNorms,
    );

    const types = current.types.filter((type) => {
        if (type === "trace") {
            return Boolean(traceExternalHashNorms);
        }

        return Boolean(addresses);
    });

    if (types.length === 0) {
        return null;
    }

    const actionTypes = types.includes("actions")
        ? current.actionTypes
        : undefined;
    const supportedActionTypes = types.some(
        (type) => type === "actions" || type === "trace",
    )
        ? current.supportedActionTypes
        : undefined;

    return {
        addresses,
        traceExternalHashNorms,
        types,
        minFinality: current.minFinality,
        includeAddressBook: current.includeAddressBook,
        includeMetadata: current.includeMetadata,
        actionTypes,
        supportedActionTypes,
    };
}
