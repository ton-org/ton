/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { FetchResponseLike } from "./types";

// ---------------------------------------------------------------------------
// Deferred
// ---------------------------------------------------------------------------

export type Deferred<T> = {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
    settled: boolean;
};

export function deferred<T = void>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    const d: Deferred<T> = {
        promise,
        settled: false,
        resolve(value: T) {
            if (!d.settled) {
                d.settled = true;
                resolve(value);
            }
        },
        reject(error: unknown) {
            if (!d.settled) {
                d.settled = true;
                reject(error);
            }
        },
    };
    return d;
}

// ---------------------------------------------------------------------------
// Canonical const arrays — single source of truth for union values
// ---------------------------------------------------------------------------

export const FINALITIES = ["pending", "confirmed", "finalized"] as const;
export type Finality = (typeof FINALITIES)[number];
export const FINALITY_SET: ReadonlySet<string> = new Set(FINALITIES);

export const NON_PENDING_FINALITIES = ["confirmed", "finalized"] as const;
export type NonPendingFinality = (typeof NON_PENDING_FINALITIES)[number];
export const NON_PENDING_FINALITY_SET: ReadonlySet<string> = new Set(
    NON_PENDING_FINALITIES,
);

export const SUBSCRIBABLE_EVENT_TYPES = [
    "transactions",
    "actions",
    "trace",
    "account_state_change",
    "jettons_change",
] as const;
export type SubscribableEventType = (typeof SUBSCRIBABLE_EVENT_TYPES)[number];
export const SUBSCRIBABLE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
    SUBSCRIBABLE_EVENT_TYPES,
);

export const NOTIFICATION_TYPES = [
    ...SUBSCRIBABLE_EVENT_TYPES,
    "trace_invalidated",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Streaming service / network (provider resolution)
// ---------------------------------------------------------------------------

export type StreamingService = "tonapi" | "toncenter";
export type StreamingNetwork = "mainnet" | "testnet";

export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_PING_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

export function ensureError(reason: unknown, fallback?: string): Error {
    if (reason instanceof Error) {
        return reason;
    }

    if (typeof reason === "string" && reason.length > 0) {
        return new Error(reason);
    }

    if (isRecord(reason)) {
        if (typeof reason.message === "string" && reason.message.length > 0) {
            return new Error(reason.message);
        }

        if (typeof reason.error === "string" && reason.error.length > 0) {
            return new Error(reason.error);
        }

        try {
            return new Error(JSON.stringify(reason));
        } catch {}
    }

    if (fallback) {
        return new Error(fallback);
    }

    return new Error(String(reason));
}

export function isAbortError(reason: unknown): boolean {
    return (
        reason instanceof Error &&
        (reason.name === "AbortError" || /aborted/i.test(reason.message))
    );
}

export function sanitizeStringList(
    values?: readonly string[],
): string[] | undefined {
    if (!values) {
        return undefined;
    }

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const rawValue of values) {
        if (typeof rawValue !== "string") {
            throw new TypeError("Expected a string value");
        }

        const value = rawValue.trim();
        if (!value || seen.has(value)) {
            continue;
        }

        seen.add(value);
        normalized.push(value);
    }

    return normalized.length > 0 ? normalized : undefined;
}

export function requireStringList(
    values: readonly string[] | undefined,
    fieldName: string,
): string[] {
    const normalized = sanitizeStringList(values);
    if (!normalized) {
        throw new Error(
            `${fieldName} must contain at least one non-empty value`,
        );
    }
    return normalized;
}

export function normalizeTimeoutMs(
    value: number | undefined,
    defaultValue: number,
    fieldName: string,
): number {
    if (value === undefined) {
        return defaultValue;
    }

    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative finite number`);
    }

    return Math.floor(value);
}

export function appendQueryParameter(
    endpoint: string,
    key: string,
    value: string,
): string {
    const url = new URL(endpoint);
    url.searchParams.set(key, value);
    return url.toString();
}

export async function describeHttpError(
    response: FetchResponseLike,
): Promise<string> {
    const statusPart = `${response.status} ${response.statusText}`.trim();
    let bodyText = "";

    try {
        if (typeof response.text === "function") {
            bodyText = (await response.text()).trim();
        }
    } catch {}

    return bodyText ? `${statusPart} — ${bodyText}` : statusPart;
}

export function describeUnexpectedMessage(payload: unknown): string {
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function areStringListsEqual(
    left?: readonly string[],
    right?: readonly string[],
): boolean {
    if (left === right) {
        return true;
    }

    if (!left || !right) {
        return left === right;
    }

    if (left.length !== right.length) {
        return false;
    }

    for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) {
            return false;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// Provider endpoint resolution
// ---------------------------------------------------------------------------

type ProviderDefaults = { endpoint: string; apiKeyParam: string };

function createProviderDefaults(
    service: "tonapi.io" | "toncenter.com",
    apiKeyParam: string,
    network: "mainnet" | "testnet",
): { sse: ProviderDefaults; ws: ProviderDefaults } {
    const host = network === "testnet" ? `testnet.${service}` : service;
    const apiPrefix = service === "toncenter.com" ? "/api" : "";

    return {
        sse: {
            endpoint: `https://${host}${apiPrefix}/streaming/v2/sse`,
            apiKeyParam,
        },
        ws: {
            endpoint: `wss://${host}${apiPrefix}/streaming/v2/ws`,
            apiKeyParam,
        },
    };
}

const PROVIDER_DEFAULTS: Record<
    StreamingService,
    Record<StreamingNetwork, { sse: ProviderDefaults; ws: ProviderDefaults }>
> = {
    tonapi: {
        mainnet: createProviderDefaults("tonapi.io", "token", "mainnet"),
        testnet: createProviderDefaults("tonapi.io", "token", "testnet"),
    },
    toncenter: {
        mainnet: createProviderDefaults("toncenter.com", "api_key", "mainnet"),
        testnet: createProviderDefaults("toncenter.com", "api_key", "testnet"),
    },
};

export function resolveProviderEndpoint(
    transport: "sse" | "ws",
    service: StreamingService | undefined,
    network: StreamingNetwork | undefined,
    endpoint: string | undefined,
    apiKeyParam: string | undefined,
): { endpoint: string; apiKeyParam: string } {
    if (service && endpoint) {
        throw new Error(
            "Cannot specify both 'service' and 'endpoint'. Use one or the other.",
        );
    }

    if (service) {
        return PROVIDER_DEFAULTS[service][network ?? "mainnet"][transport];
    }

    if (!endpoint) {
        throw new Error(
            "Streaming endpoint is required when service is not specified",
        );
    }

    return { endpoint, apiKeyParam: apiKeyParam ?? "api_key" };
}
