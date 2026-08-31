/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { toUrlSafe } from "./toUrlSafe";

describe("toUrlSafe", () => {
    it("should convert base64 to url-safe base64", () => {
        expect(toUrlSafe("a/b+c=d")).toBe("a_b-cd");
    });

    it("should replace every occurrence, not just the first", () => {
        expect(toUrlSafe("////")).toBe("____");
        expect(toUrlSafe("++++")).toBe("----");
        expect(toUrlSafe("====")).toBe("");
        expect(toUrlSafe("/+=/+=/+=")).toBe("_-_-_-");
    });

    it("should leave strings without special characters unchanged", () => {
        expect(toUrlSafe("")).toBe("");
        expect(toUrlSafe("abcABC123-_")).toBe("abcABC123-_");
    });
});
