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
import {
    createWalletTransferV5R1ExtensionAuth, createWalletTransferV5R1SignedAuth,
} from "./signing/createWalletTransfer";
import {ExternallySingedAuthSendArgs, SingedAuthSendArgs} from "./signing/singer";
import {OutActionWalletV5} from "./WalletV5Utils";
import {
    isWalletIdV5R1ClientContext,
    storeWalletIdV5R1,
    WalletIdV5R1,
    WalletIdV5R1ClientContext,
    WalletIdV5R1CustomContext
} from "./WalletV5R1Utils";


export type WalletV5R1BasicSendArgs = {
    seqno: number;
    timeout?: Maybe<number>;
}

export type SingedAuthWallet5R1SendArgs = WalletV5R1BasicSendArgs
    & SingedAuthSendArgs
    & { authType?: 'external' | 'internal';};

export type ExternallySingedAuthWallet5R1SendArgs = WalletV5R1BasicSendArgs
    & ExternallySingedAuthSendArgs
    & {  authType?: 'external' | 'internal'; };

export type ExtensionAuthWallet5R1SendArgs = WalletV5R1BasicSendArgs & {
    authType: 'extension';
    queryId?: bigint;
}

export type WalletV5R1SendArgs =
    | SingedAuthWallet5R1SendArgs
    | ExtensionAuthWallet5R1SendArgs


export class WalletContractV5R1 implements Contract {

    static OpCodes = {
        auth_extension: 0x6578746e,
        auth_signed_external: 0x7369676e,
        auth_signed_internal: 0x73696e74
    }

    static create<C extends WalletIdV5R1ClientContext | WalletIdV5R1CustomContext>(args: C extends WalletIdV5R1ClientContext ?{
        walletId?: Maybe<WalletIdV5R1<C>>,
        publicKey: Buffer
    } : {
        workChain?: number
        publicKey: Buffer
        walletId?: Maybe<Partial<WalletIdV5R1<C>>>
    }) {
        let workChain = 0;

        if ('workChain' in args && args.workChain != undefined) {
            workChain = args.workChain;
        }

        if (args.walletId?.context && isWalletIdV5R1ClientContext(args.walletId.context) && args.walletId.context.workChain != undefined) {
            workChain = args.walletId.context.workChain;
        }

        return new WalletContractV5R1(workChain, args.publicKey, {
            networkGlobalId: args.walletId?.networkGlobalId ?? -239,
            context: args.walletId?.context ?? {
                workChain: 0,
                walletVersion: 'v5r1',
                subwalletNumber: 0
            }
        });
    }

    readonly address: Address;
    readonly init: { data: Cell, code: Cell };

    private constructor(
        workChain: number,
        readonly publicKey: Buffer,
        readonly walletId: WalletIdV5R1<WalletIdV5R1ClientContext | WalletIdV5R1CustomContext>,
    ) {
        this.walletId = walletId;

        // Build initial code and data
        let code = Cell.fromBoc(Buffer.from('te6cckECFAEAAoEAART/APSkE/S88sgLAQIBIAINAgFIAwQC3NAg10nBIJFbj2Mg1wsfIIIQZXh0br0hghBzaW50vbCSXwPgghBleHRuuo60gCDXIQHQdNch+kAw+kT4KPpEMFi9kVvg7UTQgQFB1yH0BYMH9A5voTGRMOGAQNchcH/bPOAxINdJgQKAuZEw4HDiEA8CASAFDAIBIAYJAgFuBwgAGa3OdqJoQCDrkOuF/8AAGa8d9qJoQBDrkOuFj8ACAUgKCwAXsyX7UTQcdch1wsfgABGyYvtRNDXCgCAAGb5fD2omhAgKDrkPoCwBAvIOAR4g1wsfghBzaWduuvLgin8PAeaO8O2i7fshgwjXIgKDCNcjIIAg1yHTH9Mf0x/tRNDSANMfINMf0//XCgAK+QFAzPkQmiiUXwrbMeHywIffArNQB7Dy0IRRJbry4IVQNrry4Ib4I7vy0IgikvgA3gGkf8jKAMsfAc8Wye1UIJL4D95w2zzYEAP27aLt+wL0BCFukmwhjkwCIdc5MHCUIccAs44tAdcoIHYeQ2wg10nACPLgkyDXSsAC8uCTINcdBscSwgBSMLDy0InXTNc5MAGk6GwShAe78uCT10rAAPLgk+1V4tIAAcAAkVvg69csCBQgkXCWAdcsCBwS4lIQseMPINdKERITAJYB+kAB+kT4KPpEMFi68uCR7UTQgQFB1xj0BQSdf8jKAEAEgwf0U/Lgi44UA4MH9Fvy4Iwi1woAIW4Bs7Dy0JDiyFADzxYS9ADJ7VQAcjDXLAgkji0h8uCS0gDtRNDSAFETuvLQj1RQMJExnAGBAUDXIdcKAPLgjuLIygBYzxbJ7VST8sCN4gAQk1vbMeHXTNC01sNe=', 'base64'))[0];
        let data = beginCell()
            .storeUint(1, 1) // is signature auth allowed
            .storeUint(0, 32) // Seqno
            .store(storeWalletIdV5R1(this.walletId))
            .storeBuffer(this.publicKey, 32)
            .storeBit(0) // Empty plugins dict
            .endCell();
        this.init = { code, data };
        this.address = contractAddress(workChain, { code, data });
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
            Dictionary.Values.BigInt(1),
            extensions
        );

        return dict.keys().map(addressHex => {
            const wc = this.address.workChain;
            return Address.parseRaw(`${wc}:${addressHex.toString(16).padStart(64, '0')}`);
        })
    }

    /**
     * Get is secret-key authentication enabled
     */
    async getIsSecretKeyAuthEnabled(provider: ContractProvider) {
        let res = await provider.get('is_signature_allowed', []);
        return res.stack.readBoolean();
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
    async sendTransfer(provider: ContractProvider, args: WalletV5R1SendArgs & { messages: MessageRelaxed[];  sendMode: SendMode }) {
        const transfer = this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Sign and send add extension request
     */
    async sendAddExtension(provider: ContractProvider, args: WalletV5R1SendArgs & { extensionAddress: Address }) {
        const request = this.createAddExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send remove extension request
     */
    async sendRemoveExtension(provider: ContractProvider, args: WalletV5R1SendArgs & { extensionAddress: Address, }) {
        const request = this.createRemoveExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send actions batch
     */
    async sendActionsBatch(provider: ContractProvider, args: WalletV5R1SendArgs & { actions: OutActionWalletV5[] }) {
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
    createTransfer(args: WalletV5R1SendArgs & { messages: MessageRelaxed[]; sendMode: SendMode }) {
        const { messages, ...rest } = args;
        return this.createActionsBatch({
            ...rest,
            actions: this.createActions({ messages, sendMode: args.sendMode })
        })
    }

    /**
     * Create signed transfer async
     */
    createTransferAndSignRequestAsync(args: ExternallySingedAuthWallet5R1SendArgs & { messages: MessageRelaxed[]; sendMode: SendMode }) {
        const { messages, sendMode, ...rest } = args;
        return this.createAndSignRequestAsync({
            ...rest,
            actions: this.createActions({ messages, sendMode })
        })
    }

    /**
     * Create signed add extension request
     */
    createAddExtension(args: WalletV5R1SendArgs & { extensionAddress: Address }) {
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
    createRemoveExtension(args: WalletV5R1SendArgs & { extensionAddress: Address }) {
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
    createActionsBatch(args: WalletV5R1SendArgs & { actions: OutActionWalletV5[] }) {
        if (args.authType === 'extension') {
            return createWalletTransferV5R1ExtensionAuth(args)
        }

        return createWalletTransferV5R1SignedAuth({
            ...args,
            walletId: storeWalletIdV5R1(this.walletId)
        })
    }

    /**
     * Create asynchronously signed request
     */
    createAndSignRequestAsync(args: ExternallySingedAuthWallet5R1SendArgs & { actions: OutActionWalletV5[] }) {
        return createWalletTransferV5R1SignedAuth({
            ...args,
            walletId: storeWalletIdV5R1(this.walletId)
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
