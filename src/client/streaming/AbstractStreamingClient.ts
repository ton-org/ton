/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { StreamingClosedError, StreamingSupersededError } from "./errors";
import type { StreamingErrorContext, StreamingTransport } from "./errors";
import type { StreamingError } from "./errors";
import {
    type ResolvedStreamingSubscription,
    resolveStreamingSubscription,
    sameSubscription,
} from "./subscriptionState";
import { TypedEventEmitter } from "./TypedEventEmitter";
import type { StreamingEventMap, StreamingSubscription } from "./types";
import { type Deferred, deferred } from "./utils";

export type DesiredSubscription = {
    snapshot: ResolvedStreamingSubscription;
    waiter: Deferred<void>;
};

export abstract class AbstractStreamingClient extends TypedEventEmitter<StreamingEventMap> {
    readonly #url: string;
    readonly #transport: StreamingTransport;
    #reconcilePromise: Promise<void> | null = null;
    #applied: ResolvedStreamingSubscription | null = null;
    #desired: DesiredSubscription | null = null;

    constructor(transport: StreamingTransport, url: string) {
        super();
        this.#transport = transport;
        this.#url = url;
    }

    subscribe(params: StreamingSubscription): Promise<void> {
        const snapshot = resolveStreamingSubscription(params);
        if (
            this.ready &&
            this.#applied &&
            sameSubscription(this.#applied, snapshot)
        ) {
            return Promise.resolve();
        }

        if (
            this.#desired &&
            !this.#desired.waiter.settled &&
            sameSubscription(this.#desired.snapshot, snapshot)
        ) {
            return this.#desired.waiter.promise;
        }

        // onSupersede() must run before the waiter rejection so that SSE
        // can abort the in-flight fetch before the rejection propagates.
        this.onSupersede();

        this.#desired?.waiter.reject(
            new StreamingSupersededError(
                "Streaming subscribe was superseded by a newer snapshot",
                this.ctx("subscribe"),
            ),
        );

        const desired: DesiredSubscription = {
            snapshot,
            waiter: deferred<void>(),
        };
        this.#desired = desired;
        this.#reconcile();
        return desired.waiter.promise;
    }

    async close(): Promise<void> {
        const error = new StreamingClosedError(
            "Streaming transport is closing",
            this.ctx("close"),
        );
        this.#applied = null;
        this.#rejectDesiredWaiter(error);
        await this.closeTransport(error);
        await this.#reconcilePromise;
        this.removeAllListeners();
    }

    get ready(): boolean {
        return this.isSessionReady;
    }

    protected get url(): string {
        return this.#url;
    }

    protected abstract get isSessionReady(): boolean;

    protected abstract applySubscription(
        desired: DesiredSubscription,
    ): Promise<"ready" | "replaced">;

    protected abstract closeTransport(error: StreamingError): Promise<void>;

    protected onSupersede(): void {}

    protected ctx(
        phase: string,
        extra?: Partial<StreamingErrorContext>,
    ): StreamingErrorContext {
        return {
            transport: this.#transport,
            endpoint: this.#url,
            phase,
            ...extra,
        };
    }

    protected isSuperseded(desired: DesiredSubscription): boolean {
        return this.#desired !== desired;
    }

    #rejectDesiredWaiter(reason: unknown): void {
        const desired = this.#desired;
        this.#desired = null;
        desired?.waiter.reject(reason);
    }

    #reconcile(): void {
        if (this.#reconcilePromise) {
            return;
        }

        this.#reconcilePromise = (async () => {
            try {
                while (this.#desired) {
                    const target = this.#desired;
                    if (
                        this.ready &&
                        this.#applied &&
                        sameSubscription(this.#applied, target.snapshot)
                    ) {
                        if (this.#desired !== target) {
                            continue;
                        }
                        target.waiter.resolve();
                        break;
                    }

                    let outcome: "ready" | "replaced";
                    try {
                        outcome = await this.applySubscription(target);
                    } catch (error) {
                        if (this.isSuperseded(target)) {
                            continue;
                        }
                        throw error;
                    }

                    if (outcome === "replaced") {
                        continue;
                    }

                    this.#applied = target.snapshot;
                    if (this.#desired === target) {
                        this.#desired = null;
                        target.waiter.resolve();
                        break;
                    }
                }
            } catch (error) {
                this.#rejectDesiredWaiter(error);
            } finally {
                this.#reconcilePromise = null;
            }
        })();
    }
}
