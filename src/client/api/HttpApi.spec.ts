/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Address } from "@ton/core";
import type { AxiosAdapter } from "axios";
import { HttpApi } from "./HttpApi";

const message = {
    source: "",
    destination: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    value: "0",
    fwd_fee: "0",
    ihr_fee: "0",
    created_lt: "0",
    body_hash: "",
    msg_data: { "@type": "msg.dataRaw", body: "" },
};

const transaction = {
    data: "",
    utime: 1,
    transaction_id: { lt: "1", hash: "" },
    fee: "0",
    storage_fee: "0",
    other_fee: "0",
    out_msgs: [message],
};

function apiReturning(result: unknown) {
    const adapter: AxiosAdapter = async (config) => ({
        data: { ok: true, result },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
    });
    return new HttpApi("http://localhost", { adapter });
}

describe("HttpApi", () => {
    const address = Address.parse(
        "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    );

    it("parses transactions without in_msg", async () => {
        const res = await apiReturning([transaction]).getTransactions(address, {
            limit: 1,
        });
        expect(res).toHaveLength(1);
        expect(res[0].in_msg).toBeUndefined();
    });

    it("parses transactions with in_msg", async () => {
        const res = await apiReturning([
            { ...transaction, in_msg: message },
        ]).getTransactions(address, { limit: 1 });
        expect(res[0].in_msg?.destination).toBe(message.destination);
    });

    it("rejects malformed transactions", async () => {
        await expect(
            apiReturning([{ ...transaction, utime: "1" }]).getTransactions(
                address,
                { limit: 1 },
            ),
        ).rejects.toThrow("Malformed response");
    });
});
