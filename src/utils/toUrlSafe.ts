/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function toUrlSafe(src: string) {
    // Replace all occurrences in a single pass each. The previous
    // implementation used `while (indexOf >= 0) src = src.replace(...)`, which
    // replaces only the first match per call and re-scans from the start every
    // iteration — O(n^2) for inputs with many `/`, `+` or `=` characters.
    return src.replace(/\//g, "_").replace(/\+/g, "-").replace(/=/g, "");
}
