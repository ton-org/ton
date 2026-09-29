import { AxiosAdapter } from "axios";
import { HttpApi } from "./HttpApi";
import { TonCache } from "./TonCache";
import { TonClient } from "../TonClient";

const SHARD = "-9223372036854775808";

function blockId(seqno: number) {
    return {
        "@type": "ton.blockIdExt",
        workchain: 0,
        shard: SHARD,
        seqno,
        root_hash: "A".repeat(44),
        file_hash: "B".repeat(44),
    };
}

// Answers `shards` and `getBlockTransactions` without network access and
// counts the calls per method.
function mockAdapter() {
    const calls: Record<string, number> = {};
    const adapter: AxiosAdapter = async (config) => {
        const { method, params } = JSON.parse(config.data);
        calls[method] = (calls[method] ?? 0) + 1;
        const result =
            method === "shards"
                ? { "@type": "blocks.shards", shards: [blockId(params.seqno)] }
                : {
                      "@type": "blocks.transactions",
                      id: blockId(params.seqno),
                      req_count: 0,
                      incomplete: false,
                      transactions: [],
                  };
        return {
            data: { ok: true, result },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
        };
    };
    return { adapter, calls };
}

// A cache that stores nothing, e.g. to keep memory flat in a long-running
// process.
const noopCache: TonCache = {
    get: async () => null,
    set: async () => {},
};

describe("HttpApi", () => {
    it("should use the cache passed in the parameters", async () => {
        const { adapter } = mockAdapter();
        const stored: string[] = [];
        const cache: TonCache = {
            get: async () => null,
            set: async (namespace, key) => {
                stored.push(`${namespace}:${key}`);
            },
        };
        const api = new HttpApi("http://mock/jsonRPC", { adapter, cache });

        await api.getShards(1);
        await api.getBlockTransactions(0, 2, SHARD);

        expect(api.cache).toBe(cache);
        expect(stored).toEqual(["ton-shard:1", `ton-shard-tx:0:${SHARD}:2`]);
    });

    it("should not keep loaded shards and block transactions in memory", async () => {
        const { adapter, calls } = mockAdapter();
        const api = new HttpApi("http://mock/jsonRPC", {
            adapter,
            cache: noopCache,
        });

        await api.getShards(1);
        await api.getShards(1);
        await api.getBlockTransactions(0, 1, SHARD);
        await api.getBlockTransactions(0, 1, SHARD);

        // Nothing is cached, so every call reaches the API
        expect(calls).toEqual({ shards: 2, getBlockTransactions: 2 });
    });

    it("should still load concurrent requests for the same block once", async () => {
        const { adapter, calls } = mockAdapter();
        const api = new HttpApi("http://mock/jsonRPC", {
            adapter,
            cache: noopCache,
        });

        await Promise.all([api.getShards(1), api.getShards(1)]);
        await Promise.all([
            api.getBlockTransactions(0, 1, SHARD),
            api.getBlockTransactions(0, 1, SHARD),
        ]);

        expect(calls).toEqual({ shards: 1, getBlockTransactions: 1 });
    });

    it("should serve repeated requests from the default cache", async () => {
        const { adapter, calls } = mockAdapter();
        const api = new HttpApi("http://mock/jsonRPC", { adapter });

        const first = await api.getShards(1);
        const second = await api.getShards(1);

        expect(second).toEqual(first);
        expect(calls).toEqual({ shards: 1 });
    });
});

describe("TonClient", () => {
    it("should pass the cache to HttpApi", () => {
        const client = new TonClient({
            endpoint: "http://mock/jsonRPC",
            cache: noopCache,
        });

        expect(client["api"].cache).toBe(noopCache);
    });
});
