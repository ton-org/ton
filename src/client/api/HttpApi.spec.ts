import { Address } from "@ton/core";
import { HttpApi } from "./HttpApi";

it("includes the cursor when retrying getTransactions with the same options", async () => {
    const address = new Address(0, Buffer.alloc(32));
    const options = {
        lt: "42",
        hash: Buffer.alloc(32).toString("base64"),
        limit: 1,
        inclusive: true,
    };
    const transaction = {
        transaction_id: { lt: options.lt, hash: options.hash },
        data: "",
        utime: 0,
        fee: "0",
        storage_fee: "0",
        other_fee: "0",
        out_msgs: [],
    };
    const adapter = jest
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce({
            status: 200,
            data: { ok: true, result: [transaction] },
        });
    const api = new HttpApi("http://localhost", { adapter });

    await expect(api.getTransactions(address, options)).rejects.toThrow(
        "timeout",
    );
    expect(await api.getTransactions(address, options)).toEqual([transaction]);
    expect(adapter.mock.calls[1][0].data).toEqual(
        adapter.mock.calls[0][0].data,
    );
    expect(JSON.parse(adapter.mock.calls[1][0].data).params).not.toHaveProperty(
        "inclusive",
    );
});
