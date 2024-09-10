/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Prando from 'prando';
import { keyPairFromSeed, type KeyPair } from '@ton/crypto';

export function randomTestKey(seed: string): KeyPair {
    let random = new Prando(seed);
    let res = Buffer.alloc(32);
    for (let i = 0; i < res.length; i++) {
        res[i] = random.nextInt(0, 256);
    }
    return keyPairFromSeed(res);
}