/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ensureError } from "./utils";

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
                writable: true,
            });
        }
    }
}

export class StreamingTransportError extends StreamingError {}

export class StreamingProtocolError extends StreamingError {}

export class StreamingRequestTimeoutError extends StreamingError {}

export class StreamingClosedError extends StreamingError {}

export class StreamingHandshakeError extends StreamingError {}

/**
 * Wrap an unknown reason into a typed streaming error. If the reason is
 * already an instance of the target class, it is returned as-is.
 */
export function createStreamingError<TError extends StreamingError>(
    ErrorCtor: new (
        message: string,
        context: StreamingErrorContext,
        options?: { cause?: unknown },
    ) => TError,
    reason: unknown,
    context: StreamingErrorContext,
    fallback?: string,
): TError {
    if (reason instanceof ErrorCtor) {
        return reason;
    }

    const error = ensureError(reason, fallback);
    return new ErrorCtor(error.message, context, { cause: reason });
}
