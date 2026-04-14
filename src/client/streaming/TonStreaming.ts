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

/**
 * Unified façade over a single Streaming API v2-compatible client.
 *
 * It preserves the transport-specific implementation underneath, but exposes a
 * single event and lifecycle surface for callers that do not want to depend on
 * `StreamingSse` or `StreamingWebSocket` directly.
 */
export class TonStreaming {
    readonly #client: StreamingClient;

    constructor(client: StreamingClient) {
        if (!client) {
            throw new Error("A streaming client must be provided");
        }
        this.#client = client;
    }

    /**
     * Connect the wrapped client.
     *
     * When `params` are provided they become the active subscription snapshot.
     * This is especially useful for SSE clients, where the subscription is
     * established as part of the initial HTTP request.
     */
    async connect(params?: StreamingSubscription): Promise<void> {
        await this.#runAtomically(async () => {
            await this.#client.connect(params);
        });
    }

    /**
     * Replace the current subscription snapshot on the wrapped client.
     */
    async subscribe(params: StreamingSubscription): Promise<void> {
        await this.#runAtomically(async () => {
            await this.#client.subscribe(params);
        });
    }

    /**
     * Remove specific addresses or trace hashes from the wrapped client.
     */
    async unsubscribe(params: StreamingUnsubscribe): Promise<void> {
        await this.#runAtomically(async () => {
            await this.#client.unsubscribe(params);
        });
    }

    /**
     * Register an event listener on the wrapped client.
     * Returns an unsubscribe function that removes the listener.
     */
    on<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): () => void {
        return this.#client.on(event, handler);
    }

    /** Remove an event listener from the wrapped client. */
    off<K extends keyof StreamingEventMap>(
        event: K,
        handler: (data: StreamingEventMap[K]) => void,
    ): void {
        this.#client.off(event, handler);
    }

    /** Close the wrapped connection and clean up. */
    close(): void {
        this.#client.close();
    }

    /** Whether the wrapped client is currently connected. */
    get connected(): boolean {
        return this.#client.connected;
    }

    async #runAtomically<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            this.close();
            throw error;
        }
    }
}
