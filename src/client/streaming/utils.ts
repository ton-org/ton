/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    FetchResponseLike,
    IWebSocket,
    IWebSocketConstructor,
} from "./types";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_PING_INTERVAL_MS = 15_000;

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
        } catch {
            // Fall through to the generic fallback below.
        }
    }

    if (fallback) {
        return new Error(fallback);
    }

    return new Error(String(reason));
}

export function isAbortError(reason: unknown): boolean {
    return (
        reason instanceof Error &&
        (reason.name === "AbortError" || reason.message === "Aborted")
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

export function mergeHeaders(
    ...headersList: Array<Record<string, string> | undefined>
): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const headers of headersList) {
        if (headers) {
            Object.assign(merged, headers);
        }
    }
    return merged;
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
    } catch {
        // Ignore bodies that cannot be read.
    }

    return bodyText ? `${statusPart} — ${bodyText}` : statusPart;
}

export function createMissingWebSocketConstructor(): IWebSocketConstructor {
    class MissingWebSocket implements IWebSocket {
        static readonly OPEN = 1;
        readonly readyState = 3;
        onopen = null;
        onclose = null;
        onmessage = null;
        onerror = null;

        constructor(_url: string) {
            throw new Error(
                "WebSocket is not available. Pass a WebSocket constructor via parameters.",
            );
        }

        send(_data: string): void {
            throw new Error("WebSocket is not available");
        }

        close(): void {}
    }

    return MissingWebSocket;
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

export function compactRecord(
    message: Record<string, unknown>,
): Record<string, unknown> {
    const compact: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(message)) {
        if (value !== undefined) {
            compact[key] = value;
        }
    }
    return compact;
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
