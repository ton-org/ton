/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { isRecord } from "./utils";

export type StreamingTransport = "sse" | "ws";

export type StreamingErrorContext = {
    transport: StreamingTransport;
    endpoint?: string;
    phase?: string;
    requestId?: string;
    rawPayload?: unknown;
};

export class StreamingError extends Error {
    readonly context: Readonly<StreamingErrorContext>;
    declare readonly cause: unknown;

    constructor(
        message: string,
        context: StreamingErrorContext,
        options?: { cause?: unknown },
    ) {
        super(message);
        this.name = new.target.name;
        this.context = Object.freeze({ ...context });

        if (options?.cause !== undefined) {
            Object.defineProperty(this, "cause", {
                configurable: true,
                enumerable: false,
                value: options.cause,
                writable: false,
            });
        }
    }
}

export class StreamingRequestTimeoutError extends StreamingError {}

export class StreamingClosedError extends StreamingError {}

export class StreamingHandshakeError extends StreamingError {}

export class StreamingSupersededError extends StreamingError {}

export function wrapStreamingError(
    reason: unknown,
    context: StreamingErrorContext,
    fallback?: string,
): StreamingError {
    if (reason instanceof StreamingError) {
        return reason;
    }

    let message = fallback ?? String(reason);
    if (reason instanceof Error) {
        message = reason.message;
    } else if (typeof reason === "string" && reason) {
        message = reason;
    } else if (isRecord(reason)) {
        const msg = reason.message ?? reason.error;
        if (typeof msg === "string" && msg) {
            message = msg;
        }
    }

    return new StreamingError(message, context, { cause: reason });
}
