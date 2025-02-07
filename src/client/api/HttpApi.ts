/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { InMemoryCache, TonCache } from './TonCache';
import DataLoader from 'dataloader';
import axios, { AxiosAdapter } from 'axios';
import { Address, Cell, TupleItem } from '@ton/core';
import { z } from 'zod';

const version = require('../../../package.json').version as string;

const blockIdExt = z.object({
    '@type': z.literal('ton.blockIdExt'),
    workchain: z.number(),
    shard: z.string(),
    seqno: z.number(),
    root_hash: z.string(),
    file_hash: z.string()
});

const addressInformation = z.object({
    balance: z.union([z.number(), z.string()]),
    extra_currencies: z.optional(z.array(z.object({
        '@type': z.literal("extraCurrency"),
        id: z.number(),
        amount: z.string()
    }))),
    state: z.union([z.literal('active'), z.literal('uninitialized'), z.literal('frozen')]),
    data: z.string(),
    code: z.string(),
    last_transaction_id: z.object({
        '@type': z.literal('internal.transactionId'),
        lt: z.string(),
        hash: z.string()
    }),
    block_id: blockIdExt,
    sync_utime: z.number()
});

const bocResponse = z.object({
    '@type': z.literal('ok')
});

const feeResponse = z.object({
    '@type': z.literal('query.fees'),
    source_fees: z.object({
        '@type': z.literal('fees'),
        in_fwd_fee: z.number(),
        storage_fee: z.number(),
        gas_fee: z.number(),
        fwd_fee: z.number()
    })
});

const callGetMethod = z.object({
    gas_used: z.number(),
    exit_code: z.number(),
    stack: z.array(z.unknown())
});

const messageData = z.union([
    z.object({
        '@type': z.literal('msg.dataRaw'),
        'body': z.string()
    }),
    z.object({
        '@type': z.literal('msg.dataText'),
        'text': z.string()
    }),
    z.object({
        '@type': z.literal('msg.dataDecryptedText'),
        'text': z.string()
    }),
    z.object({
        '@type': z.literal('msg.dataEncryptedText'),
        'text': z.string()
    })
]);

const message = z.object({
    source: z.string(),
    destination: z.string(),
    value: z.string(),
    fwd_fee: z.string(),
    ihr_fee: z.string(),
    created_lt: z.string(),
    body_hash: z.string(),
    msg_data: messageData,
    message: z.string().optional()
});

const transaction = z.object({
    data: z.string(),
    utime: z.number(),
    transaction_id: z.object({
        lt: z.string(),
        hash: z.string()
    }),
    fee: z.string(),
    storage_fee: z.string(),
    other_fee: z.string(),
    in_msg: z.union([z.undefined(), message]),
    out_msgs: z.array(message)
});

const getTransactions = z.array(transaction);

const getMasterchain = z.object({
    state_root_hash: z.string(),
    last: blockIdExt,
    init: blockIdExt
});

const getShards = z.object({
    shards: z.array(blockIdExt)
});

const blockShortTxt = z.object({
    '@type': z.literal('blocks.shortTxId'),
    mode: z.number(),
    account: z.string(),
    lt: z.string(),
    hash: z.string()
})

const getBlockTransactions = z.object({
    id: blockIdExt,
    req_count: z.number(),
    incomplete: z.boolean(),
    transactions: z.array(blockShortTxt)
});

export type HTTPTransaction = z.TypeOf<typeof getTransactions>[number];
export type HTTPMessage = z.TypeOf<typeof message>;

class TypedCache<K, V> {
    readonly namespace: string;
    readonly cache: TonCache;
    readonly codec: z.ZodType<V>;
    readonly keyEncoder: (src: K) => string;

    constructor(namespace: string, cache: TonCache, codec: z.ZodType<V>, keyEncoder: (src: K) => string) {
        this.namespace = namespace;
        this.cache = cache;
        this.codec = codec;
        this.keyEncoder = keyEncoder;
    }

    async get(key: K) {
        let ex = await this.cache.get(this.namespace, this.keyEncoder(key));
        if (ex) {
            let decoded = this.codec.safeParse(JSON.parse(ex));
            if (decoded.success) {
                return decoded.data;
            }
        }
        return null;
    }

    async set(key: K, value: V | null) {
        if (value !== null) {
            await this.cache.set(this.namespace, this.keyEncoder(key), JSON.stringify(value));
        } else {
            await this.cache.set(this.namespace, this.keyEncoder(key), null);
        }
    }
}

export interface HttpApiParameters {

    /**
     * HTTP request timeout in milliseconds.
     */
    timeout?: number;

    /**
     * API Key
     */
    apiKey?: string;

    /**
     * Adapter for Axios
     */
    adapter?: AxiosAdapter;
}

interface HttpApiResolvedParameters extends HttpApiParameters {
    timeout: number;
}

export class HttpApi {
    readonly endpoint: string;
    readonly cache: TonCache;

    private readonly parameters: HttpApiResolvedParameters;
    private shardCache: TypedCache<number, z.TypeOf<typeof blockIdExt>[]>;
    private shardLoader: DataLoader<number, z.TypeOf<typeof blockIdExt>[]>;
    private shardTransactionsCache: TypedCache<{ workchain: number, shard: string, seqno: number }, z.TypeOf<typeof getBlockTransactions>>;
    private shardTransactionsLoader: DataLoader<{ workchain: number, shard: string, seqno: number }, z.TypeOf<typeof getBlockTransactions>, string>;

    constructor(endpoint: string, parameters?: HttpApiParameters) {
        this.endpoint = endpoint;
        this.cache = new InMemoryCache();

        this.parameters = {
            timeout: parameters?.timeout || 30000, // 30 seconds by default
            apiKey: parameters?.apiKey,
            adapter: parameters?.adapter
        }

        // Shard
        this.shardCache = new TypedCache('ton-shard', this.cache, z.array(blockIdExt), (src) => src + '');
        this.shardLoader = new DataLoader(async (src) => {
            return await Promise.all(src.map(async (v) => {
                const cached = await this.shardCache.get(v);
                if (cached) {
                    return cached;
                }
                let loaded = (await this.doCall('shards', { seqno: v }, getShards)).shards;
                await this.shardCache.set(v, loaded);
                return loaded;
            }));
        });

        // Shard Transactions
        this.shardTransactionsCache = new TypedCache('ton-shard-tx', this.cache, getBlockTransactions, (src) => src.workchain + ':' + src.shard + ':' + src.seqno);
        this.shardTransactionsLoader = new DataLoader(async (src) => {
            return await Promise.all(src.map(async (v) => {
                const cached = await this.shardTransactionsCache.get(v);
                if (cached) {
                    return cached;
                }
                let loaded = await this.doCall('getBlockTransactions', { workchain: v.workchain, seqno: v.seqno, shard: v.shard }, getBlockTransactions);
                await this.shardTransactionsCache.set(v, loaded);
                return loaded;
            }));
        }, { cacheKeyFn: (src) => src.workchain + ':' + src.shard + ':' + src.seqno });
    }

    getAddressInformation(address: Address) {
        return this.doCall('getAddressInformation', { address: address.toString() }, addressInformation);
    }

    async getTransactions(address: Address, opts: { limit: number, lt?: string, hash?: string, to_lt?: string, inclusive?: boolean, archival?: boolean }) {
        const inclusive = opts.inclusive;
        delete opts.inclusive;

        // Convert hash
        let hash: string | undefined = undefined;
        if (opts.hash) {
            hash = Buffer.from(opts.hash, 'base64').toString('hex');
        }

        // Adjust limit
        let limit = opts.limit;
        if (opts.hash && opts.lt && inclusive !== true) {
            limit++;
        }

        // Do request
        let res = await this.doCall('getTransactions', { address: address.toString(), ...opts, limit, hash }, getTransactions);
        if (res.length > limit) {
            res = res.slice(0, limit);
        }

        // Adjust result
        if (opts.hash && opts.lt && inclusive !== true) {
            res.shift();
            return res;
        } else {
            return res;
        }
    }

    async getMasterchainInfo() {
        return await this.doCall('getMasterchainInfo', {}, getMasterchain);
    }

    async getShards(seqno: number) {
        return await this.shardLoader.load(seqno);
    }

    async getBlockTransactions(workchain: number, seqno: number, shard: string) {
        return await this.shardTransactionsLoader.load({ workchain, seqno, shard });
    }

    async getTransaction(address: Address, lt: string, hash: string) {
        let convHash = Buffer.from(hash, 'base64').toString('hex');
        let res = await this.doCall('getTransactions', { address: address.toString(), lt, hash: convHash, limit: 1 }, getTransactions);
        let ex = res.find((v) => v.transaction_id.lt === lt && v.transaction_id.hash === hash);
        if (ex) {
            return ex;
        } else {
            return null;
        }
    }

    async callGetMethod(address: Address, method: string, stack: TupleItem[]) {
        return await this.doCall('runGetMethod', { address: address.toString(), method, stack: serializeStack(stack) }, callGetMethod);
    }

    async sendBoc(body: Buffer) {
        await this.doCall('sendBoc', { boc: body.toString('base64') }, bocResponse);
    }

    async estimateFee(address: Address, args: {
        body: Cell,
        initCode: Cell | null,
        initData: Cell | null,
        ignoreSignature: boolean
    }) {
        return await this.doCall('estimateFee', {
            address: address.toString(),
            body: args.body.toBoc().toString('base64'),
            'init_data': args.initData ? args.initData.toBoc().toString('base64') : '',
            'init_code': args.initCode ? args.initCode.toBoc().toString('base64') : '',
            ignore_chksig: args.ignoreSignature
        }, feeResponse);
    }

    async tryLocateResultTx(source: Address, destination: Address, created_lt: string) {
        return await this.doCall('tryLocateResultTx', { source: source.toString(), destination: destination.toString(), created_lt }, transaction);
    }

    async tryLocateSourceTx(source: Address, destination: Address, created_lt: string) {
        return await this.doCall('tryLocateSourceTx', { source: source.toString(), destination: destination.toString(), created_lt }, transaction);
    }

    private async doCall<T>(method: string, body: any, codec: z.ZodType<T>) {
        let headers: Record<string, any> = {
            'Content-Type': 'application/json',
            'X-Ton-Client-Version': version,
        }
        if (this.parameters.apiKey) {
            headers['X-API-Key'] = this.parameters.apiKey
        }
        let res = await axios.post<{ ok: boolean, result: T }>(this.endpoint, JSON.stringify({
            id: '1',
            jsonrpc: '2.0',
            method: method,
            params: body
        }), {
            headers,
            timeout: this.parameters.timeout,
            adapter: this.parameters.adapter
        })
        if (res.status !== 200 || !res.data.ok) {
            throw Error('Received error: ' + JSON.stringify(res.data));
        }
        let decoded = codec.safeParse(res.data.result);
        if (decoded.success) {
            return decoded.data;
        } else {
            throw Error('Malformed response: ' + decoded.error.format()._errors.join(', '));
        }
    }
}

function serializeStack(src: TupleItem[]) {
    let stack: any[] = [];
    for (let s of src) {
        if (s.type === 'int') {
            stack.push(['num', s.value.toString()]);
        } else if (s.type === 'cell') {
            stack.push(['tvm.Cell', s.cell.toBoc().toString('base64')]);
        } else if (s.type === 'slice') {
            stack.push(['tvm.Slice', s.cell.toBoc().toString('base64')]);
        } else if (s.type === 'builder') {
            stack.push(['tvm.Builder', s.cell.toBoc().toString('base64')]);
        } else {
            throw Error('Unsupported stack item type: ' + s.type)
        }
    }
    return stack;
}
