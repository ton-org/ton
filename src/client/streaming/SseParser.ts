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

/**
 * Incremental parser for the `text/event-stream` format (SSE).
 *
 * Buffers incoming chunks and emits complete events.
 * Handles multi-line `data:` fields, strips a leading BOM, and ignores
 * comment lines (`:` prefix).
 */
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

        while (true) {
            const boundary = this.#findBoundary();
            if (boundary === null) {
                break;
            }

            const part = this.#normalizeChunk(this.#buffer.slice(0, boundary.index));
            this.#buffer = this.#buffer.slice(boundary.index + boundary.length);
            this.#dispatch(part);
        }
    }

    /**
     * Flush the final buffered event at end-of-stream.
     *
     * Per the SSE parsing model, a trailing event without an empty-line
     * separator must still be dispatched when the stream ends.
     */
    finish(): void {
        if (this.#buffer.length === 0) {
            return;
        }

        const part = this.#normalizeChunk(this.#buffer);
        this.#buffer = "";
        this.#dispatch(part);
    }

    #findBoundary(): { index: number; length: number } | null {
        const delimiters = ["\r\n\r\n", "\n\n", "\r\r"];

        let best: { index: number; length: number } | null = null;
        for (const delimiter of delimiters) {
            const index = this.#buffer.indexOf(delimiter);
            if (index !== -1 && (best === null || index < best.index)) {
                best = { index, length: delimiter.length };
            }
        }

        return best;
    }

    #normalizeChunk(part: string): string {
        return part.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
