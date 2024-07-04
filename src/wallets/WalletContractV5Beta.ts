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
import {Maybe} from "../utils/maybe";
import {ExternallySingedAuthSendArgs, SingedAuthSendArgs} from "./signing/singer";
import {OutActionWalletV5} from "./WalletV5Utils";
import {
    createWalletTransferV5BetaExtensionAuth,
    createWalletTransferV5BetaSignedAuth
} from "./signing/createWalletTransfer";
import {storeWalletIdV5Beta, WalletIdV5Beta} from "./WalletV5betaUtils";


export type WalletV5BetaBasicSendArgs = {
    seqno: number;
    timeout?: Maybe<number>;
}

export type SingedAuthWallet5BetaSendArgs = WalletV5BetaBasicSendArgs
    & SingedAuthSendArgs
    & { authType?: 'external' | 'internal';};

export type ExternallySingedAuthWallet5BetaSendArgs = WalletV5BetaBasicSendArgs
    & ExternallySingedAuthSendArgs
    & {  authType?: 'external' | 'internal'; };

export type ExtensionAuthWallet5SendArgs = WalletV5BetaBasicSendArgs & {
    authType: 'extension';
}

export type Wallet5SendArgs =
    | SingedAuthWallet5BetaSendArgs
    | ExtensionAuthWallet5SendArgs


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
            workChain: args?.walletId?.workChain ?? 0,
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

        // Build initial code and data
        let code = Cell.fromBoc(Buffer.from('te6cckEBAQEAIwAIQgLkzzsvTG1qYeoPK1RH0mZ4WyavNjfbLe7mvNGqgm80Eg3NjhE=', 'base64'))[0];
        let data = beginCell()
            .storeInt(0, 33) // Seqno
            .store(storeWalletIdV5Beta(this.walletId))
            .storeBuffer(this.publicKey, 32)
            .storeBit(0) // Empty plugins dict
            .endCell();
        this.init = { code, data };
        this.address = contractAddress(this.walletId.workChain, { code, data });
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
            return Address.parseRaw(`${wc}:${addressHex.toString(16)}`);
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
    async sendTransfer(provider: ContractProvider, args: Wallet5SendArgs & { messages: MessageRelaxed[];  sendMode: SendMode }) {
        const transfer = this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Sign and send add extension request
     */
    async sendAddExtension(provider: ContractProvider, args: Wallet5SendArgs & { extensionAddress: Address }) {
        const request = this.createAddExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send remove extension request
     */
    async sendRemoveExtension(provider: ContractProvider, args: Wallet5SendArgs & { extensionAddress: Address, }) {
        const request = this.createRemoveExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send actions batch
     */
    async sendActionsBatch(provider: ContractProvider, args: Wallet5SendArgs & { actions: OutActionWalletV5[] }) {
        const request = this.createActionsBatch(args);
        await this.send(provider, request);
    }

    private createActions( args: {  messages: MessageRelaxed[], sendMode: SendMode }) {
        const actions: OutActionSendMsg[] = args.messages.map(message => ({ type: 'sendMsg', mode: args.sendMode, outMsg: message}));
        return actions;
    }

    /**
     * Create signed transfer
     */
    createTransfer(args: Wallet5SendArgs & { messages: MessageRelaxed[]; sendMode: SendMode }) {
        const { messages, ...rest } = args;
        return this.createActionsBatch({
            ...rest,
            actions: this.createActions({ messages, sendMode: args.sendMode })
        })
    }

    /**
     * Create signed transfer async
     */
    createTransferAndSignRequestAsync(args: ExternallySingedAuthWallet5BetaSendArgs & { messages: MessageRelaxed[]; sendMode: SendMode }) {
        const { messages, sendMode, ...rest } = args;
        return this.createAndSignRequestAsync({
            ...rest,
            actions: this.createActions({ messages, sendMode })
        })
    }

    /**
     * Create signed add extension request
     */
    createAddExtension(args: Wallet5SendArgs & { extensionAddress: Address }) {
        const { extensionAddress, ...rest } = args;
        return this.createActionsBatch({
            actions: [{
                type: 'addExtension',
                address: extensionAddress
            }],
            ...rest
        })
    }

    /**
     * Create signed remove extension request
     */
    createRemoveExtension(args: Wallet5SendArgs & { extensionAddress: Address }) {
        const { extensionAddress, ...rest } = args;
        return this.createActionsBatch({
            actions: [{
                type: 'removeExtension',
                address: extensionAddress
            }],
            ...rest
        })
    }

    /**
     * Create signed request or extension auth request
     */
    createActionsBatch(args: Wallet5SendArgs & { actions: OutActionWalletV5[] }) {
        if (args.authType === 'extension') {
            return createWalletTransferV5BetaExtensionAuth(args)
        }

        return createWalletTransferV5BetaSignedAuth({
            ...args,
            walletId: storeWalletIdV5Beta(this.walletId)
        })
    }

    /**
     * Create asynchronously signed request
     */
    createAndSignRequestAsync(args: ExternallySingedAuthWallet5BetaSendArgs & { actions: OutActionWalletV5[] }) {
        return createWalletTransferV5BetaSignedAuth({
            ...args,
            walletId: storeWalletIdV5Beta(this.walletId)
        })
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
