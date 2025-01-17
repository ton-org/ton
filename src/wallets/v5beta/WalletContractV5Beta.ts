/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    internal,
    MessageRelaxed,
    OutActionSendMsg, Sender,
    SendMode
} from "@ton/core";
import {Maybe} from "../../utils/maybe";
import {SendArgsSignable, SendArgsSigned} from "../signing/singer";
import {OutActionWalletV5} from "./WalletV5OutActions";
import {createWalletTransferV5Beta} from "../signing/createWalletTransfer";
import {storeWalletIdV5Beta, WalletIdV5Beta} from "./WalletV5BetaWalletId";


export type WalletV5BetaBasicSendArgs = {
    seqno: number;
    timeout?: Maybe<number>;
}

export type WalletV5BetaSendArgsSigned = WalletV5BetaBasicSendArgs
    & SendArgsSigned
    & { authType?: 'external' | 'internal';};

export type WalletV5BetaSendArgsSignable = WalletV5BetaBasicSendArgs
    & SendArgsSignable
    & {  authType?: 'external' | 'internal'; };

export type WalletV5BetaSendArgsExtensionAuth = WalletV5BetaBasicSendArgs & {
    authType: 'extension';
}

export type WalletV5BetaSendArgs =
    | WalletV5BetaSendArgsSigned
    | WalletV5BetaSendArgsSignable
    | WalletV5BetaSendArgsExtensionAuth


export type WalletV5BetaPackedCell<T> =  T extends WalletV5BetaSendArgsSignable ? Promise<Cell> : Cell;

/**
 * @deprecated
 * use WalletContractV5R1 instead
 */
export class WalletContractV5Beta implements Contract {

    static OpCodes = {
        auth_extension: 0x6578746e,
        auth_signed_external: 0x7369676e,
        auth_signed_internal: 0x73696e74
    }

    static create(args: {
        walletId?: Partial<WalletIdV5Beta>,
        publicKey: Buffer
    }) {
        const walletId = {
            networkGlobalId: args.walletId?.networkGlobalId ?? -239,
            workchain: args?.walletId?.workchain ?? 0,
            subwalletNumber: args?.walletId?.subwalletNumber ?? 0,
            walletVersion: args?.walletId?.walletVersion ?? 'v5'
        }
        return new WalletContractV5Beta(walletId, args.publicKey);
    }

    readonly address: Address;
    readonly init: { data: Cell, code: Cell };

    private constructor(
        readonly walletId: WalletIdV5Beta,
        readonly publicKey: Buffer
    ) {
        this.walletId = walletId;

        // https://github.com/tonkeeper/w5/commit/fa1b372a417a32af104fe1b949b6b31d29cee349 code with library
        let code = Cell.fromBoc(Buffer.from('te6cckEBAQEAIwAIQgLkzzsvTG1qYeoPK1RH0mZ4WyavNjfbLe7mvNGqgm80Eg3NjhE=', 'base64'))[0];
        let data = beginCell()
            .storeInt(0, 33) // Seqno
            .store(storeWalletIdV5Beta(this.walletId))
            .storeBuffer(this.publicKey, 32)
            .storeBit(0) // Empty plugins dict
            .endCell();
        this.init = { code, data };
        this.address = contractAddress(this.walletId.workchain, { code, data });
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

    /**
     * Get Wallet Extensions
     */
    async getExtensions(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type === 'active') {
            const result = await provider.get('get_extensions', []);
            return result.stack.readCellOpt();
        } else {
            return null;
        }
    }

    /**
     * Get Wallet Extensions
     */
    async getExtensionsArray(provider: ContractProvider) {
        const extensions = await this.getExtensions(provider);
        if (!extensions) {
            return [];
        }

        const dict:  Dictionary<bigint, bigint> = Dictionary.loadDirect(
            Dictionary.Keys.BigUint(256),
            Dictionary.Values.BigInt(8),
            extensions
        );

        return dict.keys().map(key => {
            const wc = dict.get(key)!;
            const addressHex = key ^ (wc + 1n);
            return Address.parseRaw(`${wc}:${addressHex.toString(16).padStart(64, "0")}`);
        })
    }

    /**
     * Get is secret-key authentication enabled
     */
    async getIsSecretKeyAuthEnabled(provider: ContractProvider) {
        let res = await provider.get('get_is_signature_auth_allowed', []);
        const result = res.stack.readNumber();
        return result !== 0;
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
    async sendTransfer(provider: ContractProvider, args: WalletV5BetaSendArgs & { messages: MessageRelaxed[];  sendMode: SendMode }) {
        const transfer = await this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Sign and send add extension request
     */
    async sendAddExtension(provider: ContractProvider, args: WalletV5BetaSendArgs & { extensionAddress: Address }) {
        const request = await this.createAddExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send remove extension request
     */
    async sendRemoveExtension(provider: ContractProvider, args: WalletV5BetaSendArgs & { extensionAddress: Address, }) {
        const request = await this.createRemoveExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send actions batch
     */
    async sendActionsBatch(provider: ContractProvider, args: WalletV5BetaSendArgs & { actions: OutActionWalletV5[] }) {
        const request = await this.createRequest(args);
        await this.send(provider, request);
    }

    private createActions( args: {  messages: MessageRelaxed[], sendMode: SendMode }) {
        const actions: OutActionSendMsg[] = args.messages.map(message => ({ type: 'sendMsg', mode: args.sendMode, outMsg: message}));
        return actions;
    }

    /**
     * Create signed transfer
     */
    createTransfer<T extends WalletV5BetaSendArgs>(args: T & { messages: MessageRelaxed[]; sendMode: SendMode }): WalletV5BetaPackedCell<T> {
        return this.createRequest({
            ...args,
            actions: this.createActions({ messages: args.messages, sendMode: args.sendMode })
        })
    }


    /**
     * Create signed add extension request
     */
    createAddExtension<T extends WalletV5BetaSendArgs>(args: T & { extensionAddress: Address }): WalletV5BetaPackedCell<T> {
        return this.createRequest({
            ...args,
            actions: [{
                type: 'addExtension',
                address: args.extensionAddress
            }]
        })
    }

    /**
     * Create signed remove extension request
     */
    createRemoveExtension<T extends WalletV5BetaSendArgs>(args: T & { extensionAddress: Address }): WalletV5BetaPackedCell<T> {
        return this.createRequest({
            ...args,
            actions: [{
                type: 'removeExtension',
                address: args.extensionAddress
            }]
        })
    }

    /**
     * Create signed request or extension auth request
     */
    createRequest<T extends WalletV5BetaSendArgs>(args: T & { actions: OutActionWalletV5[] }):
        WalletV5BetaPackedCell<T> {
        if (args.authType === 'extension') {
            return createWalletTransferV5Beta(
                args as WalletV5BetaSendArgsExtensionAuth & { actions: OutActionWalletV5[] }
            ) as WalletV5BetaPackedCell<T>
        }

        return createWalletTransferV5Beta({
            ...(args as (WalletV5BetaSendArgsSigned | WalletV5BetaSendArgsSignable) & { actions: OutActionWalletV5[] }),
            walletId: storeWalletIdV5Beta(this.walletId)
        }) as WalletV5BetaPackedCell<T>;
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
                    sendMode: args.sendMode ?? SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
                    messages: [internal({
                        to: args.to,
                        value: args.value,
                        ec: args.ec,
                        init: args.init,
                        body: args.body,
                        bounce: args.bounce
                    })]
                });
                await this.send(provider, transfer);
            }
        };
    }
}
