/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, internal, MessageRelaxed, Sender, SendMode,
    StateInit, TupleReader
} from "@ton/core";
import { Maybe } from "../../utils/maybe";
import { createWalletTransferV4 } from "../signing/createWalletTransfer";
import { SendArgsSignable, SendArgsSigned } from "../signing/singer";
import {
    WalletV4ExtendedSendArgs,
    WalletV4ExtendedSendArgsSignable,
    WalletV4ExtendedSendArgsSigned
} from "./WalletContractV4Actions";

export type WalletV4BasicSendArgs = {
    seqno: number,
    messages: MessageRelaxed[]
    sendMode?: Maybe<SendMode>,
    timeout?: Maybe<number>,
}

export type Wallet4SendArgsSigned = WalletV4BasicSendArgs & SendArgsSigned;
export type Wallet4SendArgsSignable = WalletV4BasicSendArgs & SendArgsSignable;

export class WalletContractV4 implements Contract {

    static create(args: { workchain: number, publicKey: Buffer, walletId?: Maybe<number> }) {
        return new WalletContractV4(args.workchain, args.publicKey, args.walletId);
    }

    readonly workchain: number;
    readonly publicKey: Buffer;
    readonly address: Address;
    readonly walletId: number;
    readonly init: { data: Cell, code: Cell };

    private constructor(workchain: number, publicKey: Buffer, walletId?: Maybe<number>) {

        // Resolve parameters
        this.workchain = workchain;
        this.publicKey = publicKey;
        if (walletId !== null && walletId !== undefined) {
            this.walletId = walletId;
        } else {
            this.walletId = 698983191 + workchain;
        }

        // Build initial code and data
        let code = Cell.fromBoc(Buffer.from('te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA==', 'base64'))[0];
        let data = beginCell()
            .storeUint(0, 32) // Seqno
            .storeUint(this.walletId, 32)
            .storeBuffer(this.publicKey)
            .storeBit(0) // Empty plugins dict
            .endCell();
        this.init = { code, data };
        this.address = contractAddress(workchain, { code, data });
    }

    /**
     * Get Wallet Balance
     */
    async getBalance(provider: ContractProvider) {
        let state = await provider.getState();
        return state.balance;
    }

    /**
     * Get Wallet Seqno
     */
    async getSeqno(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type === 'active') {
            let res = await provider.get('seqno', []);
            return res.stack.readNumber();
        } else {
            return 0;
        }
    }

    async getIsPluginInstalled(provider: ContractProvider, pluginAddress: Address) {
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return false;
        }

        const wc = BigInt(pluginAddress.workChain);
        const addrHash = BigInt('0x' + pluginAddress.hash.toString('hex'));
        const res = await provider.get('is_plugin_installed', [
            { type: 'int', value: wc },
            { type: 'int', value: addrHash }
        ]);

        return res.stack.readBoolean();
    }

    async getPluginList(provider: ContractProvider) {
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return [];
        }

        const res = await provider.get('get_plugin_list', []);
        const listReader = new TupleReader(res.stack.readLispList());
        const plugins: Address[] = [];

        while (listReader.remaining > 0) {
            const entry = listReader.readTuple();
            const workchain = entry.readNumber();
            const addrHash = entry.readBigNumber();
            const addressHex = addrHash.toString(16).padStart(64, '0');
            plugins.push(Address.parseRaw(`${workchain}:${addressHex}`));
        }

        return plugins;
    }

    /**
     * Send signed transfer
     */
    async send(provider: ContractProvider, message: Cell) {
        await provider.external(message);
    }

    /**
     * Sign and send transfer
     */
    async sendTransfer(provider: ContractProvider, args: {
        seqno: number,
        secretKey: Buffer,
        messages: MessageRelaxed[]
        sendMode?: Maybe<SendMode>,
        timeout?: Maybe<number>,
    }) {
        let transfer = this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Create signed transfer
     */
    createTransfer<T extends Wallet4SendArgsSigned | Wallet4SendArgsSignable>(args:T ){
        if ('secretKey' in args) {
            return this.createRequest({
                seqno: args.seqno,
                timeout: args.timeout,
                action: {
                    type: 'sendMsg',
                    messages: args.messages,
                    sendMode: args.sendMode,
                },
                secretKey: args.secretKey,
            }) as T extends SendArgsSignable ? Promise<Cell> : Cell;
        } else {
            return this.createRequest({
                seqno: args.seqno,
                timeout: args.timeout,
                action: {
                    type: 'sendMsg',
                    messages: args.messages,
                    sendMode: args.sendMode,
                },
                signer: args.signer,
            }) as T extends SendArgsSignable ? Promise<Cell> : Cell;
        }
    }

    async sendExtendedAction<T extends WalletV4ExtendedSendArgsSigned>(provider: ContractProvider, args: T) {
        const action = this.createRequest(args);
        await this.send(provider, action);
    }

    createRequest<T extends WalletV4ExtendedSendArgsSigned | WalletV4ExtendedSendArgsSignable>(args:T ){
        return createWalletTransferV4<T>({
            ...args,
            walletId: this.walletId
        });
    }

    /**
     * Create sender
     */
    sender(provider: ContractProvider, secretKey: Buffer): Sender {
        return {
            send: async (args) => {
                let seqno = await this.getSeqno(provider);
                let transfer = this.createTransfer({
                    seqno,
                    secretKey,
                    sendMode: args.sendMode,
                    messages: [internal({
                        to: args.to,
                        value: args.value,
                        extracurrency: args.extracurrency,
                        init: args.init,
                        body: args.body,
                        bounce: args.bounce
                    })]
                });
                await this.send(provider, transfer);
            }
        };
    }

    async sendPluginRequestFunds(provider: ContractProvider, sender: Sender, args: {
        forwardAmount: bigint,
        toncoinsToWithdraw: bigint,
        queryId?: bigint,
        sendMode?: SendMode
    }) {
        await provider.internal(sender, {
            value: args.forwardAmount,
            body: this.createPluginRequestFundsMessage(args),
            sendMode: args.sendMode
        })
    }

    createPluginRequestFundsMessage(args: { toncoinsToWithdraw: bigint, queryId?: bigint }) {
        return beginCell()
            .storeUint(0x706c7567, 32)
            .storeUint(args.queryId ?? 0, 64)
            .storeCoins(args.toncoinsToWithdraw)
            .storeDict(null)
            .endCell();
    }

    async sendPluginRemovePlugin(provider: ContractProvider, sender: Sender, amount: bigint, queryId?: bigint) {
        await provider.internal(sender, {
            value: amount,
            body: this.createPluginRemovePluginMessage(queryId),
        })
    }

    createPluginRemovePluginMessage(queryId?: bigint) {
        return beginCell()
            .storeUint(0x64737472, 32)
            .storeUint(queryId ?? 0, 64)
            .endCell()
    }
}
