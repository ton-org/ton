/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    StreamingClient,
    StreamingEventMap,
    StreamingSubscription,
    StreamingUnsubscribe,
} from "./types";

/** Unified façade over a streaming transport (SSE or WebSocket). */
export class TonStreaming {
    readonly #client: StreamingClient;

    constructor(client: StreamingClient) {
        if (!client) {
            throw new Error("A streaming client must be provided");
        }
        this.#client = client;
    }

    async connect(params?: StreamingSubscription): Promise<void> {
        await this.#closeOnError(() => this.#client.connect(params));
    }

    async subscribe(params: StreamingSubscription): Promise<void> {
        await this.#closeOnError(() => this.#client.subscribe(params));
    }

    async unsubscribe(params: StreamingUnsubscribe): Promise<void> {
        await this.#closeOnError(() => this.#client.unsubscribe(params));
    }

    on<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): () => void {
        return this.#client.on(event, handler);
    }

    off<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): void {
        this.#client.off(event, handler);
    }

    close(): void {
        this.#client.close();
    }

    get connected(): boolean {
        return this.#client.connected;
    }

    async #closeOnError<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            this.close();
            throw error;
        }
    }
}
