/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Finality, FetchResponseLike, StreamingProvider } from "./types";

export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_PING_INTERVAL_MS = 15_000;

export const FINALITY_LEVELS = new Set<Finality>([
    "pending",
    "confirmed",
    "finalized",
]);
export const NON_PENDING_FINALITY_LEVELS = new Set<"confirmed" | "finalized">([
    "confirmed",
    "finalized",
]);

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
    StreamingProvider,
    { sse: ProviderDefaults; ws: ProviderDefaults }
> = {
    tonapiMainnet: createProviderDefaults("tonapi.io", "token", "mainnet"),
    toncenterMainnet: createProviderDefaults(
        "toncenter.com",
        "api_key",
        "mainnet",
    ),
    tonapiTestnet: createProviderDefaults("tonapi.io", "token", "testnet"),
    toncenterTestnet: createProviderDefaults(
        "toncenter.com",
        "api_key",
        "testnet",
    ),
};

export function resolveProviderEndpoint(
    transport: "sse" | "ws",
    provider: StreamingProvider | undefined,
    endpoint: string | undefined,
    apiKeyParam: string | undefined,
): { endpoint: string; apiKeyParam: string } {
    if (provider) {
        return PROVIDER_DEFAULTS[provider][transport];
    }
    if (!endpoint) {
        throw new Error(
            "Streaming endpoint is required when provider is not specified",
        );
    }
    return { endpoint, apiKeyParam: apiKeyParam ?? "api_key" };
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
