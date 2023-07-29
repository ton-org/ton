/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { HttpApi } from "./api/HttpApi";
import { AxiosAdapter } from 'axios';
import { Address, beginCell, Cell, comment, Contract, ContractProvider, ContractState, external, loadTransaction, Message, openContract, storeMessage, toNano, Transaction, TupleItem, TupleReader } from '@ton/core';
import { Maybe } from "../utils/maybe";

export type TonClientParameters = {
    /**
     * API Endpoint
     */
    endpoint: string;

    /**
     * HTTP request timeout in milliseconds.
     */
    timeout?: number;

    /**
     * API Key
     */
    apiKey?: string;

    /**
     * HTTP Adapter for axios
     */
    httpAdapter?: AxiosAdapter;
}

export class TonClient {
    readonly parameters: TonClientParameters;

    #api: HttpApi;

    constructor(parameters: TonClientParameters) {
        this.parameters = {
            endpoint: parameters.endpoint
        };
        this.#api = new HttpApi(this.parameters.endpoint, {
            timeout: parameters.timeout,
            apiKey: parameters.apiKey,
            adapter: parameters.httpAdapter
        });
    }

    /**
     * Get Address Balance
     * @param address address for balance check
     * @returns balance
     */
    async getBalance(address: Address) {
        return (await this.getContractState(address)).balance;
    }

    /**
     * Invoke get method
     * @param address contract address
     * @param name name of method
     * @param params optional parameters
     * @returns stack and gas_used field
     */
    async runMethod(address: Address, name: string, stack: TupleItem[] = []): Promise<{ gas_used: number, stack: TupleReader }> {
        let res = await this.#api.callGetMethod(address, name, stack);
        if (res.exit_code !== 0) {
            throw Error('Unable to execute get method. Got exit_code: ' + res.exit_code);
        }
        return { gas_used: res.gas_used, stack: parseStack(res.stack) };
    }

    /**
     * Invoke get method
     * @param address contract address
     * @param name name of method
     * @param params optional parameters
     * @returns stack and gas_used field
     * @deprecated use runMethod instead
     */
    async callGetMethod(address: Address, name: string, stack: TupleItem[] = []): Promise<{ gas_used: number, stack: TupleReader }> {
        return this.runMethod(address, name, stack);
    }

    /**
     * Invoke get method that returns error code instead of throwing error
     * @param address contract address
     * @param name name of method
     * @param params optional parameters
     * @returns stack and gas_used field
    */
    async runMethodWithError(address: Address, name: string, params: any[] = []): Promise<{ gas_used: number, stack: TupleReader, exit_code: number }> {
        let res = await this.#api.callGetMethod(address, name, params);
        return { gas_used: res.gas_used, stack: parseStack(res.stack), exit_code: res.exit_code };
    }

    /**
     * Invoke get method that returns error code instead of throwing error
     * @param address contract address
     * @param name name of method
     * @param params optional parameters
     * @returns stack and gas_used field
     * @deprecated use runMethodWithError instead
     */
    async callGetMethodWithError(address: Address, name: string, stack: TupleItem[] = []): Promise<{ gas_used: number, stack: TupleReader }> {
        return this.runMethodWithError(address, name, stack);
    }

    /**
     * Get transactions
     * @param address address
     */
    async getTransactions(address: Address, opts: { limit: number, lt?: string, hash?: string, to_lt?: string, inclusive?: boolean }): Promise<(Transaction & {
        hash: String;
    })[]> {
        // Fetch transactions
        let tx = await this.#api.getTransactions(address, opts);
        return tx.map<Transaction & { hash: String; }>(t => ({ hash: t.transaction_id.hash, ...loadTransaction(Cell.fromBoc(Buffer.from(t.data, 'base64'))[0].beginParse()) }))
    }

    /**
     * Get transaction by it's id
     * @param address address
     * @param lt logical time
     * @param hash transaction hash
     * @returns transaction or null if not exist
     */
    async getTransaction(address: Address, lt: string, hash: string): Promise<Transaction & { hash: string } | null> {
        let res = await this.#api.getTransaction(address, lt, hash);
        return res ? { hash: res.transaction_id.hash, ...loadTransaction(Cell.fromBoc(Buffer.from(res.data, 'base64'))[0].beginParse()) } : null;
    }

    /**
     * Fetch latest masterchain info
     * @returns masterchain info
     */
    async getMasterchainInfo() {
        let r = await this.#api.getMasterchainInfo();
        return {
            workchain: r.init.workchain,
            shard: r.last.shard,
            initSeqno: r.init.seqno,
            latestSeqno: r.last.seqno
        }
    }

    /**
     * Fetch latest workchain shards
     * @param seqno masterchain seqno
     */
    async getWorkchainShards(seqno: number) {
        let r = await this.#api.getShards(seqno);
        return r.map((m) => ({
            workchain: m.workchain,
            shard: m.shard,
            seqno: m.seqno
        }));
    }

    /**
     * Fetch transactions inf shards
     * @param workchain
     * @param seqno
     * @param shard
     */
    async getShardTransactions(workchain: number, seqno: number, shard: string) {
        let tx = await this.#api.getBlockTransactions(workchain, seqno, shard);
        if (tx.incomplete) {
            throw Error('Unsupported');
        }
        return tx.transactions.map((v) => ({
            account: Address.parseRaw(v.account),
            lt: v.lt,
            hash: v.hash
        }))
    }

    /**
     * Send message to a network
     * @param src source message
     */
    async sendMessage(src: Message) {
        const boc = beginCell()
            .store(storeMessage(src))
            .endCell()
            .toBoc();
        await this.#api.sendBoc(boc);
    }

    /**
     * Send file to a network
     * @param src source file
     */
    async sendFile(src: Buffer) {
        await this.#api.sendBoc(src);
    }

    /**
     * Estimate fees for external message
     * @param address target address
     * @returns 
     */
    async estimateExternalMessageFee(address: Address, args: {
        body: Cell,
        initCode: Cell | null,
        initData: Cell | null,
        ignoreSignature: boolean
    }) {
        return await this.#api.estimateFee(address, { body: args.body, initCode: args.initCode, initData: args.initData, ignoreSignature: args.ignoreSignature });
    }

    /**
     * Send external message to contract
     * @param contract contract to send message
     * @param src message body
     */
    async sendExternalMessage(contract: Contract, src: Cell) {
        if (await this.isContractDeployed(contract.address) || !contract.init) {
            const message = external({
                to: contract.address,
                body: src
            });
            await this.sendMessage(message);
        } else {
            const message = external({
                to: contract.address,
                init: { code: contract.init.code, data: contract.init.data },
                body: src
            });
            await this.sendMessage(message);
        }
    }

    /**
     * Check if contract is deployed
     * @param address addres to check
     * @returns true if contract is in active state
     */
    async isContractDeployed(address: Address) {
        return (await this.getContractState(address)).state === 'active';
    }

    /**
     * Resolves contract state
     * @param address contract address
     */
    async getContractState(address: Address) {
        let info = await this.#api.getAddressInformation(address);
        let balance = BigInt(info.balance);
        let state = info.state as 'frozen' | 'active' | 'uninitialized';
        return {
            balance,
            state,
            code: info.code !== '' ? Buffer.from(info.code, 'base64') : null,
            data: info.data !== '' ? Buffer.from(info.data, 'base64') : null,
            lastTransaction: info.last_transaction_id.lt !== '0' ? {
                lt: info.last_transaction_id.lt,
                hash: info.last_transaction_id.hash,
            } : null,
            blockId: {
                workchain: info.block_id.workchain,
                shard: info.block_id.shard,
                seqno: info.block_id.seqno
            },
            timestampt: info.sync_utime
        };
    }

    /**
     * Open contract
     * @param src source contract
     * @returns contract
     */
    open<T extends Contract>(src: T) {
        return openContract<T>(src, (args) => createProvider(this, args.address, args.init));
    }

    /**
     * Create a provider
     * @param address address
     * @param init optional init
     * @returns provider
     */
    provider(address: Address, init: { code: Cell | null, data: Cell | null } | null) {
        return createProvider(this, address, init);
    }
}

function parseStack(src: any[]) {
    let stack: TupleItem[] = [];
    for (let s of src) {
        if (s[0] === 'num') {
            let val = s[1] as string;
            if (val.startsWith('-')) {
                stack.push({ type: 'int', value: -BigInt(val.slice(1)) });
            } else {
                stack.push({ type: 'int', value: BigInt(val) });
            }
        } else if (s[0] === 'null') {
            stack.push({ type: 'null' });
        } else if (s[0] === 'cell') {
            stack.push({ type: 'cell', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] });
        } else if (s[0] === 'slice') {
            stack.push({ type: 'slice', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] });
        } else if (s[0] === 'builder') {
            stack.push({ type: 'builder', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] });
        } else {
            throw Error('Unsupported stack item type: ' + s[0])
        }
    }
    return new TupleReader(stack);
}

function createProvider(client: TonClient, address: Address, init: { code: Cell | null, data: Cell | null } | null): ContractProvider {
    return {
        async getState(): Promise<ContractState> {
            let state = await client.getContractState(address);
            let balance = state.balance;
            let last = state.lastTransaction ? { lt: BigInt(state.lastTransaction.lt), hash: Buffer.from(state.lastTransaction.hash, 'base64') } : null;
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
            if (state.state === 'active') {
                storage = {
                    type: 'active',
                    code: state.code ? state.code : null,
                    data: state.data ? state.data : null,
                };
            } else if (state.state === 'uninitialized') {
                storage = {
                    type: 'uninit',
                };
            } else if (state.state === 'frozen') {
                storage = {
                    type: 'frozen',
                    stateHash: Buffer.alloc(0),
                };
            } else {
                throw Error('Unsupported state');
            }
            return {
                balance,
                last,
                state: storage,
            };
        },
        async get(name, args) {
            let method = await client.callGetMethod(address, name, args);
            return { stack: method.stack };
        },
        async external(message) {

            //
            // Resolve init
            //

            let neededInit: { code: Cell | null, data: Cell | null } | null = null;
            if (init && !await client.isContractDeployed(address)) {
                neededInit = init;
            }

            //
            // Send package
            //

            const ext = external({
                to: address,
                init: neededInit ? { code: neededInit.code, data: neededInit.data } : null,
                body: message
            })
            let boc = beginCell()
                .store(storeMessage(ext))
                .endCell()
                .toBoc();
            await client.sendFile(boc);
        },
        async internal(via, message) {

            // Resolve init
            let neededInit: { code: Cell | null, data: Cell | null } | null = null;
            if (init && (!await client.isContractDeployed(address))) {
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
                bounce,
                sendMode: message.sendMode,
                init: neededInit,
                body
            });
        }
    }
}
