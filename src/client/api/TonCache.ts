/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface TonCache {
    set(namespace: string, key: string, value: string | null): Promise<void>;
    get(namespace: string, key: string): Promise<string | null>;
}

export class InMemoryCache implements TonCache {
    private cache = new Map<string, string>();

    set = async (namespace: string, key: string, value: string | null) => {
        if (value !== null) {
            this.cache.set(namespace + "$$" + key, value);
        } else {
            this.cache.delete(namespace + "$$" + key);
        }
    };

    get = async (namespace: string, key: string) => {
        let res = this.cache.get(namespace + "$$" + key);
        if (res !== undefined) {
            return res;
        } else {
            return null;
        }
    };
}
