/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { keyPairFromSeed, sha256, sha256_sync } from "@ton/crypto";

export function randomTestKey(seed: string) {
    const hash = sha256_sync(seed);

    return keyPairFromSeed(hash);
}
