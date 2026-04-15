/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class TypedEventEmitter<TEvents extends Record<string, unknown>> {
    #listeners = new Map<
        keyof TEvents,
        Set<(data: TEvents[keyof TEvents]) => void>
    >();

    on<K extends keyof TEvents>(
        event: K,
        handler: (data: TEvents[K]) => void,
    ): () => void {
        const handlers = this.#getOrCreateHandlers(event);
        handlers.add(handler as (data: TEvents[keyof TEvents]) => void);
        return () => this.off(event, handler);
    }

    off<K extends keyof TEvents>(
        event: K,
        handler: (data: TEvents[K]) => void,
    ): void {
        const handlers = this.#listeners.get(event);
        if (!handlers) {
            return;
        }

        handlers.delete(handler as (data: TEvents[keyof TEvents]) => void);
        if (handlers.size === 0) {
            this.#listeners.delete(event);
        }
    }

    protected emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        const handlers = this.#listeners.get(event);
        if (!handlers || handlers.size === 0) {
            return;
        }

        for (const handler of [...handlers]) {
            try {
                handler(data as TEvents[keyof TEvents]);
            } catch (error) {
                queueMicrotask(() => {
                    throw error;
                });
            }
        }
    }

    protected removeAllListeners(): void {
        this.#listeners.clear();
    }

    #getOrCreateHandlers<K extends keyof TEvents>(
        event: K,
    ): Set<(data: TEvents[keyof TEvents]) => void> {
        let handlers = this.#listeners.get(event);
        if (!handlers) {
            handlers = new Set();
            this.#listeners.set(event, handlers);
        }
        return handlers;
    }
}
