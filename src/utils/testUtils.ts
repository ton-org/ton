/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Address } from "@ton/core";
import { keyPairFromSeed, sha256_sync } from "@ton/crypto";

export function randomTestKey(seed: string) {
    const hash = sha256_sync(seed);

    return keyPairFromSeed(hash);
}

export function testAddress(seed: string, workchain: number = 0) {
    const hash = sha256_sync(seed);

    return new Address(workchain, hash);
}
