/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import axios, { AxiosAdapter, InternalAxiosRequestConfig, AxiosInstance } from "axios";
import { Address, beginCell, Cell, comment, Contract, ContractProvider, ContractState, external, loadTransaction, openContract, OpenedContract, parseTuple, serializeTuple, StateInit, storeMessage, toNano, Transaction, TupleItem, TupleReader } from "@ton/core";
import { Maybe } from "../utils/maybe";
import { toUrlSafe } from "../utils/toUrlSafe";
import { z } from 'zod';

export type TonClient4Parameters = {

    /**
     * API endpoint
     */
    endpoint: string;

    /**
     * HTTP request timeout in milliseconds.
     */
    timeout?: number;

    /**
     * HTTP Adapter for axios
     */
    httpAdapter?: AxiosAdapter;

    /**
     * HTTP request interceptor for axios
     */
    requestInterceptor?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
}

export class TonClient4 {

    #endpoint: string;
    #timeout: number;
    #adapter?: AxiosAdapter;
    #axios: AxiosInstance

    constructor(args: TonClient4Parameters) {
        this.#axios = axios.create()
        this.#endpoint = args.endpoint;
        this.#timeout = args.timeout || 5000;
        this.#adapter = args.httpAdapter;
        if (args.requestInterceptor) {
            this.#axios.interceptors.request.use(args.requestInterceptor)
        }
    }

    /**
     * Get Last Block
     * @returns last block info
     */
    async getLastBlock() {
        let res = await this.#axios.get(this.#endpoint + '/block/latest', { adapter: this.#adapter, timeout: this.#timeout });
        let lastBlock = lastBlockCodec.safeParse(res.data);
        if (!lastBlock.success) {
            throw Error('Mailformed response: ' + lastBlock.error.format()._errors.join(', '));
        }
        return lastBlock.data;
    }

    /**
     * Get block info
     * @param seqno block sequence number
     * @returns block info
     */
    async getBlock(seqno: number) {
        let res = await this.#axios.get(this.#endpoint + '/block/' + seqno, { adapter: this.#adapter, timeout: this.#timeout });
        let block = blockCodec.safeParse(res.data);
        if (!block.success) {
            throw Error('Mailformed response');
        }
        if (!block.data.exist) {
            throw Error('Block is out of scope');
        }
        return block.data.block;
    }

    /**
     * Get block info by unix timestamp
     * @param ts unix timestamp
     * @returns block info
     */
    async getBlockByUtime(ts: number) {
        let res = await this.#axios.get(this.#endpoint + '/block/utime/' + ts, { adapter: this.#adapter, timeout: this.#timeout });
        let block = blockCodec.safeParse(res.data);
        if (!block.success) {
            throw Error('Mailformed response');
        }
        if (!block.data.exist) {
            throw Error('Block is out of scope');
        }
        return block.data.block;
    }

    /**
     * Get block info by unix timestamp
     * @param seqno block sequence number
     * @param address account address
     * @returns account info
     */
    async getAccount(seqno: number, address: Address) {
        let res = await this.#axios.get(this.#endpoint + '/block/' + seqno + '/' + address.toString({ urlSafe: true }), { adapter: this.#adapter, timeout: this.#timeout });
        let account = accountCodec.safeParse(res.data);
        if (!account.success) {
            throw Error('Mailformed response');
        }
        return account.data;
    }

    /**
     * Get account lite info (without code and data)
     * @param seqno block sequence number
     * @param address account address
     * @returns account lite info
     */
    async getAccountLite(seqno: number, address: Address) {
        let res = await this.#axios.get(this.#endpoint + '/block/' + seqno + '/' + address.toString({ urlSafe: true }) + '/lite', { adapter: this.#adapter, timeout: this.#timeout });
        let account = accountLiteCodec.safeParse(res.data);
        if (!account.success) {
            throw Error('Mailformed response');
        }
        return account.data;
    }

    /**
     * Check if contract is deployed
     * @param address addres to check
     * @returns true if contract is in active state
     */
    async isContractDeployed(seqno: number, address: Address) {
        let account = await this.getAccountLite(seqno, address);

        return account.account.state.type === 'active';
    }

    /**
     * Check if account was updated since
     * @param seqno block sequence number
     * @param address account address
     * @param lt account last transaction lt
     * @returns account change info
     */
    async isAccountChanged(seqno: number, address: Address, lt: bigint) {
        let res = await this.#axios.get(this.#endpoint + '/block/' + seqno + '/' + address.toString({ urlSafe: true }) + '/changed/' + lt.toString(10), { adapter: this.#adapter, timeout: this.#timeout });
        let changed = changedCodec.safeParse(res.data);
        if (!changed.success) {
            throw Error('Mailformed response');
        }
        return changed.data;
    }

    /**
     * Load unparsed account transactions
     * @param address address
     * @param lt last transaction lt
     * @param hash last transaction hash
     * @returns unparsed transactions
     */
    async getAccountTransactions(address: Address, lt: bigint, hash: Buffer) {
        let res = await this.#axios.get(this.#endpoint + '/account/' + address.toString({ urlSafe: true }) + '/tx/' + lt.toString(10) + '/' + toUrlSafe(hash.toString('base64')), { adapter: this.#adapter, timeout: this.#timeout });
        let transactions = transactionsCodec.safeParse(res.data);
        if (!transactions.success) {
            throw Error('Mailformed response');
        }
        let data = transactions.data;
        let tx: {
            block: {
                workchain: number;
                seqno: number;
                shard: string;
                rootHash: string;
                fileHash: string;
            },
            tx: Transaction
        }[] = [];
        let cells = Cell.fromBoc(Buffer.from(data.boc, 'base64'));
        for (let i = 0; i < data.blocks.length; i++) {
            tx.push({
                block: data.blocks[i],
                tx: loadTransaction(cells[i].beginParse())
            });
        }
        return tx;
    }

    /**
     * Load parsed account transactions
     * @param address address
     * @param lt last transaction lt
     * @param hash last transaction hash
     * @param count number of transactions to load
     * @returns parsed transactions
     */
    async getAccountTransactionsParsed(address: Address, lt: bigint, hash: Buffer, count: number = 20) {
        let res = await this.#axios.get(
            this.#endpoint + '/account/' + address.toString({ urlSafe: true }) + '/tx/parsed/' + lt.toString(10) + '/' + toUrlSafe(hash.toString('base64')),
            {
                adapter: this.#adapter,
                timeout: this.#timeout,
                params: {
                    count
                }
            }
        );
        let parsedTransactionsRes = parsedTransactionsCodec.safeParse(res.data);

        if (!parsedTransactionsRes.success) {
            throw Error('Mailformed response');
        }

        return parsedTransactionsRes.data as ParsedTransactions;
    }

    /**
     * Get network config
     * @param seqno block sequence number
     * @param ids optional config ids
     * @returns network config
     */
    async getConfig(seqno: number, ids?: number[]) {
        let tail = '';
        if (ids && ids.length > 0) {
            tail = '/' + [...ids].sort().join(',');
        }
        let res = await this.#axios.get(this.#endpoint + '/block/' + seqno + '/config' + tail, { adapter: this.#adapter, timeout: this.#timeout });
        let config = configCodec.safeParse(res.data);
        if (!config.success) {
            throw Error('Mailformed response');
        }
        return config.data;
    }

    /**
     * Execute run method
     * @param seqno block sequence number
     * @param address account address
     * @param name method name
     * @param args method arguments
     * @returns method result
     */
    async runMethod(seqno: number, address: Address, name: string, args?: TupleItem[]) {
        let tail = args && args.length > 0 ? '/' + toUrlSafe(serializeTuple(args).toBoc({ idx: false, crc32: false }).toString('base64')) : '';
        let url = this.#endpoint + '/block/' + seqno + '/' + address.toString({ urlSafe: true }) + '/run/' + encodeURIComponent(name) + tail;
        let res = await this.#axios.get(url, { adapter: this.#adapter, timeout: this.#timeout });
        let runMethod = runMethodCodec.safeParse(res.data);
        if (!runMethod.success) {
            throw Error('Mailformed response');
        }
        let resultTuple = runMethod.data.resultRaw ? parseTuple(Cell.fromBoc(Buffer.from(runMethod.data.resultRaw, 'base64'))[0]) : [];
        return {
            exitCode: runMethod.data.exitCode,
            result: resultTuple,
            resultRaw: runMethod.data.resultRaw,
            block: runMethod.data.block,
            shardBlock: runMethod.data.shardBlock,
            reader: new TupleReader(resultTuple),
        };
    }

    /**
     * Send external message
     * @param message message boc
     * @returns message status
     */
    async sendMessage(message: Buffer) {
        let res = await this.#axios.post(this.#endpoint + '/send', { boc: message.toString('base64') }, { adapter: this.#adapter, timeout: this.#timeout });
        let send = sendCodec.safeParse(res.data);
        if (!send.success) {
            throw Error('Mailformed response');
        }
        return { status: res.data.status };
    }

    /**
     * Open smart contract
     * @param contract contract
     * @returns opened contract
     */
    open<T extends Contract>(contract: T) {
        return openContract<T>(contract, (args) => createProvider(this, null, args.address, args.init));
    }

    /**
     * Open smart contract
     * @param block block number
     * @param contract contract
     * @returns opened contract
     */
    openAt<T extends Contract>(block: number, contract: T) {
        return openContract<T>(contract, (args) => createProvider(this, block, args.address, args.init));
    }

    /**
     * Create provider
     * @param address address
     * @param init optional init data
     * @returns provider
     */
    provider(address: Address, init?: StateInit | null) {
        return createProvider(this, null, address, init ?? null);
    }

    /**
     * Create provider at specified block number
     * @param block block number
     * @param address address
     * @param init optional init data
     * @returns provider
     */
    providerAt(block: number, address: Address, init?: StateInit | null) {
        return createProvider(this, block, address, init ?? null);
    }
}

function createProvider(client: TonClient4, block: number | null, address: Address, init: StateInit | null): ContractProvider {
    return {
        async getState(): Promise<ContractState> {

            // Resolve block
            let sq = block;
            if (sq === null) {
                let res = await client.getLastBlock();
                sq = res.last.seqno;
            }

            // Load state
            let state = await client.getAccount(sq, address);

            // Convert state
            let last = state.account.last ? { lt: BigInt(state.account.last.lt), hash: Buffer.from(state.account.last.hash, 'base64') } : null;
            let storage: {
                type: 'uninit';
            } | {
                type: 'active';
                code: Maybe<Buffer>;
                data: Maybe<Buffer>;
            } | {
                type: 'frozen';
                stateHash: Buffer;
            };
            if (state.account.state.type === 'active') {
                storage = {
                    type: 'active',
                    code: state.account.state.code ? Buffer.from(state.account.state.code, 'base64') : null,
                    data: state.account.state.data ? Buffer.from(state.account.state.data, 'base64') : null,
                };
            } else if (state.account.state.type === 'uninit') {
                storage = {
                    type: 'uninit',
                };
            } else if (state.account.state.type === 'frozen') {
                storage = {
                    type: 'frozen',
                    stateHash: Buffer.from(state.account.state.stateHash, 'base64'),
                };
            } else {
                throw Error('Unsupported state');
            }

            return {
                balance: BigInt(state.account.balance.coins),
                last: last,
                state: storage
            };
        },
        async get(name, args) {
            if (typeof name !== 'string') {
                throw new Error('Method name must be a string for TonClient4 provider');
            }

            let sq = block;
            if (sq === null) {
                let res = await client.getLastBlock();
                sq = res.last.seqno;
            }
            let method = await client.runMethod(sq, address, name, args);
            if (method.exitCode !== 0 && method.exitCode !== 1) {
                throw Error('Exit code: ' + method.exitCode);
            }
            return {
                stack: new TupleReader(method.result),
            };
        },
        async external(message) {

            // Resolve last
            let last = await client.getLastBlock();

            // Resolve init
            let neededInit: StateInit | null = null;
            if (init && (await client.getAccountLite(last.last.seqno, address)).account.state.type !== 'active') {
                neededInit = init;
            }

            // Send with state init
            const ext = external({
                to: address,
                init: neededInit,
                body: message
            });
            let pkg = beginCell()
                .store(storeMessage(ext))
                .endCell()
                .toBoc();
            await client.sendMessage(pkg);
        },
        async internal(via, message) {

            // Resolve last
            let last = await client.getLastBlock();

            // Resolve init
            let neededInit: StateInit | null = null;
            if (init && (await client.getAccountLite(last.last.seqno, address)).account.state.type !== 'active') {
                neededInit = init;
            }

            // Resolve bounce
            let bounce = true;
            if (message.bounce !== null && message.bounce !== undefined) {
                bounce = message.bounce;
            }

            // Resolve value
            let value: bigint;
            if (typeof message.value === 'string') {
                value = toNano(message.value);
            } else {
                value = message.value;
            }

            // Resolve body
            let body: Cell | null = null;
            if (typeof message.body === 'string') {
                body = comment(message.body);
            } else if (message.body) {
                body = message.body;
            }

            // Send internal message
            await via.send({
                to: address,
                value,
                ec: message.ec,
                bounce,
                sendMode: message.sendMode,
                init: neededInit,
                body
            });
        },
        open<T extends Contract>(contract: T): OpenedContract<T> {
            return openContract<T>(contract, (args) => createProvider(client, block, args.address, args.init ?? null));
        },
        async getTransactions(address: Address, lt: bigint, hash: Buffer, limit?: number): Promise<Transaction[]> {
            // Resolve last
            const useLimit = typeof limit === 'number';
            if (useLimit && limit <= 0) {
                return [];
            }

            // Load transactions
            let transactions: Transaction[] = [];
            do {
                const txs = await client.getAccountTransactions(address, lt, hash);

                const firstTx = txs[0].tx;
                const [firstLt, firstHash] = [firstTx.lt, firstTx.hash()];
                const needSkipFirst = transactions.length > 0 && firstLt === lt && firstHash.equals(hash);
                if (needSkipFirst) {
                    txs.shift();
                }

                if (txs.length === 0) {
                    break;
                }
                const lastTx = txs[txs.length - 1].tx;
                const [lastLt, lastHash] = [lastTx.lt, lastTx.hash()];
                if (lastLt === lt && lastHash.equals(hash)) {
                    break;
                }

                transactions.push(...txs.map(tx => tx.tx));
                lt = lastLt;
                hash = lastHash;
            } while (useLimit && transactions.length < limit);

            // Apply limit
            if (useLimit) {
                transactions = transactions.slice(0, limit);
            }

            // Return transactions
            return transactions;
        }
    }
}

//
// Codecs
//

const lastBlockCodec = z.object({
    last: z.object({
        seqno: z.number(),
        shard: z.string(),
        workchain: z.number(),
        fileHash: z.string(),
        rootHash: z.string()
    }),
    init: z.object({
        fileHash: z.string(),
        rootHash: z.string()
    }),
    stateRootHash: z.string(),
    now: z.number()
});

const blockCodec = z.union([z.object({
    exist: z.literal(false)
}), z.object({
    exist: z.literal(true),
    block: z.object({
        shards: z.array(z.object({
            workchain: z.number(),
            seqno: z.number(),
            shard: z.string(),
            rootHash: z.string(),
            fileHash: z.string(),
            transactions: z.array(z.object({
                account: z.string(),
                hash: z.string(),
                lt: z.string()
            }))
        }))
    })
})]);

// {"lastPaid":1653099243,"duePayment":null,"used":{"bits":119,"cells":1,"publicCells":0}}

const storageStatCodec = z.object({
    lastPaid: z.number(),
    duePayment: z.union([z.null(), z.string()]),
    used: z.object({
        bits: z.number(),
        cells: z.number(),
        publicCells: z.number()
    })
});

const accountCodec = z.object({
    account: z.object({
        state: z.union([
            z.object({ type: z.literal('uninit') }),
            z.object({ type: z.literal('active'), code: z.union([z.string(), z.null()]), data: z.union([z.string(), z.null()]) }),
            z.object({ type: z.literal('frozen'), stateHash: z.string() })
        ]),
        balance: z.object({
            coins: z.string()
        }),
        last: z.union([
            z.null(),
            z.object({
                lt: z.string(),
                hash: z.string()
            })
        ]),
        storageStat: z.union([z.null(), storageStatCodec])
    }),
    block: z.object({
        workchain: z.number(),
        seqno: z.number(),
        shard: z.string(),
        rootHash: z.string(),
        fileHash: z.string()
    })
});

const accountLiteCodec = z.object({
    account: z.object({
        state: z.union([
            z.object({ type: z.literal('uninit') }),
            z.object({ type: z.literal('active'), codeHash: z.string(), dataHash: z.string() }),
            z.object({ type: z.literal('frozen'), stateHash: z.string() })
        ]),
        balance: z.object({
            coins: z.string()
        }),
        last: z.union([
            z.null(),
            z.object({
                lt: z.string(),
                hash: z.string()
            })
        ]),
        storageStat: z.union([z.null(), storageStatCodec])
    })
});

const changedCodec = z.object({
    changed: z.boolean(),
    block: z.object({
        workchain: z.number(),
        seqno: z.number(),
        shard: z.string(),
        rootHash: z.string(),
        fileHash: z.string()
    })
});

const runMethodCodec = z.object({
    exitCode: z.number(),
    resultRaw: z.union([z.string(), z.null()]),
    block: z.object({
        workchain: z.number(),
        seqno: z.number(),
        shard: z.string(),
        rootHash: z.string(),
        fileHash: z.string()
    }),
    shardBlock: z.object({
        workchain: z.number(),
        seqno: z.number(),
        shard: z.string(),
        rootHash: z.string(),
        fileHash: z.string()
    })
});

const configCodec = z.object({
    config: z.object({
        cell: z.string(),
        address: z.string(),
        globalBalance: z.object({
            coins: z.string()
        })
    })
});

const sendCodec = z.object({
    status: z.number()
});

const blocksCodec = z.array(z.object({
    workchain: z.number(),
    seqno: z.number(),
    shard: z.string(),
    rootHash: z.string(),
    fileHash: z.string()
}));

const transactionsCodec = z.object({
    blocks: blocksCodec,
    boc: z.string()
});

const parsedAddressExternalCodec = z.object({
    bits: z.number(),
    data: z.string()
});

const parsedMessageInfoCodec = z.union([
    z.object({
        type: z.literal('internal'),
        value: z.string(),
        dest: z.string(),
        src: z.string(),
        bounced: z.boolean(),
        bounce: z.boolean(),
        ihrDisabled: z.boolean(),
        createdAt: z.number(),
        createdLt: z.string(),
        fwdFee: z.string(),
        ihrFee: z.string()
    }),
    z.object({
        type: z.literal('external-in'),
        dest: z.string(),
        src: z.union([parsedAddressExternalCodec, z.null()]),
        importFee: z.string()
    }),
    z.object({
        type: z.literal('external-out'),
        dest: z.union([parsedAddressExternalCodec, z.null()])
    })
]);

const parsedStateInitCodec = z.object({
    splitDepth: z.union([z.number(), z.null()]),
    code: z.union([z.string(), z.null()]),
    data: z.union([z.string(), z.null()]),
    special: z.union([z.object({ tick: z.boolean(), tock: z.boolean() }), z.null()])
});

const parsedMessageCodec = z.object({
    body: z.string(),
    info: parsedMessageInfoCodec,
    init: z.union([parsedStateInitCodec, z.null()])
});

const accountStatusCodec = z.union([z.literal('uninitialized'), z.literal('frozen'), z.literal('active'), z.literal('non-existing')]);

const txBodyCodec = z.union([
    z.object({ type: z.literal('comment'), comment: z.string() }),
    z.object({ type: z.literal('payload'), cell: z.string() }),
]);

const parsedOperationItemCodec = z.union([
    z.object({ kind: z.literal('ton'), amount: z.string() }),
    z.object({ kind: z.literal('token'), amount: z.string() })
]);

const supportedMessageTypeCodec = z.union([
    z.literal('jetton::excesses'),
    z.literal('jetton::transfer'),
    z.literal('jetton::transfer_notification'),
    z.literal('deposit'),
    z.literal('deposit::ok'),
    z.literal('withdraw'),
    z.literal('withdraw::all'),
    z.literal('withdraw::delayed'),
    z.literal('withdraw::ok'),
    z.literal('airdrop')
]);

const opCodec = z.object({
    type: supportedMessageTypeCodec,
    options: z.optional(z.record(z.string()))
});

const parsedOperationCodec = z.object({
    address: z.string(),
    comment: z.optional(z.string()),
    items: z.array(parsedOperationItemCodec),
    op: z.optional(opCodec)
});

const parsedTransactionCodec = z.object({
    address: z.string(),
    lt: z.string(),
    hash: z.string(),
    prevTransaction: z.object({
        lt: z.string(),
        hash: z.string()
    }),
    time: z.number(),
    outMessagesCount: z.number(),
    oldStatus: accountStatusCodec,
    newStatus: accountStatusCodec,
    fees: z.string(),
    update: z.object({
        oldHash: z.string(),
        newHash: z.string()
    }),
    inMessage: z.union([parsedMessageCodec, z.null()]),
    outMessages: z.array(parsedMessageCodec),
    parsed: z.object({
        seqno: z.union([z.number(), z.null()]),
        body: z.union([txBodyCodec, z.null()]),
        status: z.union([z.literal('success'), z.literal('failed'), z.literal('pending')]),
        dest: z.union([z.string(), z.null()]),
        kind: z.union([z.literal('out'), z.literal('in')]),
        amount: z.string(),
        resolvedAddress: z.string(),
        bounced: z.boolean(),
        mentioned: z.array(z.string())
    }),
    operation: parsedOperationCodec
});

const parsedTransactionsCodec = z.object({
    blocks: blocksCodec,
    transactions: z.array(parsedTransactionCodec)
});

export type ParsedTransaction = z.infer<typeof parsedTransactionCodec>;
export type ParsedTransactions = {
    blocks: z.infer<typeof blocksCodec>,
    transactions: ParsedTransaction[]
};
