/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function toUrlSafe(src: string) {
    while (src.indexOf("/") >= 0) {
        src = src.replace("/", "_");
    }
    while (src.indexOf("+") >= 0) {
        src = src.replace("+", "-");
    }
    while (src.indexOf("=") >= 0) {
        src = src.replace("=", "");
    }
    return src;
}
