/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type SseEvent = {
    event?: string;
    data: string;
    id?: string;
};

const MAX_BUFFER_SIZE = 4 * 1024 * 1024; // 4 MB

export class SseParser {
    #buffer = "";
    #onEvent: (event: SseEvent) => void;
    #isStartOfStream = true;

    constructor(onEvent: (event: SseEvent) => void) {
        this.#onEvent = onEvent;
    }

    feed(chunk: string): void {
        if (chunk.length === 0) {
            return;
        }

        if (this.#isStartOfStream) {
            this.#isStartOfStream = false;
            if (chunk.charCodeAt(0) === 0xfeff) {
                chunk = chunk.slice(1);
            }
        }

        this.#buffer += chunk;

        if (this.#buffer.length > MAX_BUFFER_SIZE) {
            throw new Error(
                `SSE buffer exceeded ${MAX_BUFFER_SIZE} bytes without an event boundary`,
            );
        }

        while (true) {
            const boundary = this.#findBoundary();
            if (boundary === null) {
                break;
            }

            const part = this.#normalizeChunk(
                this.#buffer.slice(0, boundary.index),
            );
            this.#buffer = this.#buffer.slice(boundary.index + boundary.length);
            this.#dispatch(part);
        }
    }

    // SSE spec requires dispatching trailing events without a blank-line delimiter.
    finish(): void {
        if (this.#buffer.length === 0) {
            return;
        }

        const part = this.#normalizeChunk(this.#buffer);
        this.#buffer = "";
        this.#dispatch(part);
    }

    #findBoundary(): { index: number; length: number } | null {
        const nnIndex = this.#buffer.indexOf("\n\n");
        // \n\n is the overwhelmingly common SSE delimiter.
        // Only scan for rare \r\n\r\n and \r\r if \r exists in the buffer.
        if (this.#buffer.indexOf("\r") === -1) {
            return nnIndex === -1 ? null : { index: nnIndex, length: 2 };
        }

        const crlfIndex = this.#buffer.indexOf("\r\n\r\n");
        const crIndex = this.#buffer.indexOf("\r\r");

        let best: { index: number; length: number } | null = null;
        if (nnIndex !== -1) {
            best = { index: nnIndex, length: 2 };
        }
        if (crlfIndex !== -1 && (best === null || crlfIndex < best.index)) {
            best = { index: crlfIndex, length: 4 };
        }
        if (crIndex !== -1 && (best === null || crIndex < best.index)) {
            best = { index: crIndex, length: 2 };
        }

        return best;
    }

    #normalizeChunk(part: string): string {
        return part.includes("\r") ? part.replace(/\r\n?/g, "\n") : part;
    }

    #dispatch(part: string): void {
        if (!part) {
            return;
        }

        let event: string | undefined;
        let id: string | undefined;
        const dataLines: string[] = [];

        for (const line of part.split("\n")) {
            if (!line || line.startsWith(":")) {
                continue;
            }

            const colonIndex = line.indexOf(":");
            const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
            let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
            if (value.startsWith(" ")) {
                value = value.slice(1);
            }

            switch (field) {
                case "event":
                    event = value;
                    break;
                case "data":
                    dataLines.push(value);
                    break;
                case "id":
                    if (!value.includes("\u0000")) {
                        id = value;
                    }
                    break;
                default:
                    break;
            }
        }

        if (dataLines.length === 0) {
            return;
        }

        this.#onEvent({
            event,
            data: dataLines.join("\n"),
            id,
        });
    }
}
