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
    OutActionSendMsg,
    Sender,
    SendMode,
} from "@ton/core";
import { Maybe } from "../../utils/maybe";
import { createWalletTransferV5R1 } from "../signing/createWalletTransfer";
import { SendArgsSignable, SendArgsSigned } from "../signing/singer";
import { OutActionWalletV5 } from "../v5beta/WalletV5OutActions";
import {
    isWalletIdV5R1ClientContext,
    storeWalletIdV5R1,
    WalletIdV5R1,
    WalletIdV5R1ClientContext,
    WalletIdV5R1CustomContext,
} from "./WalletV5R1WalletId";

export type WalletV5R1BasicSendArgs = {
    seqno: number;
    timeout?: Maybe<number>;
};

export type WalletV5R1SendArgsSinged = WalletV5R1BasicSendArgs &
    SendArgsSigned & { authType?: "external" | "internal" };

export type WalletV5R1SendArgsSignable = WalletV5R1BasicSendArgs &
    SendArgsSignable & { authType?: "external" | "internal" };

export type Wallet5VR1SendArgsExtensionAuth = WalletV5R1BasicSendArgs & {
    authType: "extension";
    queryId?: bigint;
};

export type WalletV5R1SendArgs =
    | WalletV5R1SendArgsSinged
    | WalletV5R1SendArgsSignable
    | Wallet5VR1SendArgsExtensionAuth;

export type WalletV5R1PackedCell<T> = T extends WalletV5R1SendArgsSignable
    ? Promise<Cell>
    : Cell;

export class WalletContractV5R1 implements Contract {
    static OpCodes = {
        auth_extension: 0x6578746e,
        auth_signed_external: 0x7369676e,
        auth_signed_internal: 0x73696e74,
    };

    static create<
        C extends WalletIdV5R1ClientContext | WalletIdV5R1CustomContext,
    >(
        args: C extends WalletIdV5R1ClientContext
            ? {
                  walletId?: Maybe<WalletIdV5R1<C>>;
                  publicKey: Buffer;
              }
            : {
                  workchain?: number;
                  publicKey: Buffer;
                  walletId?: Maybe<Partial<WalletIdV5R1<C>>>;
              },
    ) {
        let workchain = 0;

        if ("workchain" in args && args.workchain != undefined) {
            workchain = args.workchain;
        }

        if (
            args.walletId?.context &&
            isWalletIdV5R1ClientContext(args.walletId.context) &&
            args.walletId.context.workchain != undefined
        ) {
            workchain = args.walletId.context.workchain;
        }

        return new WalletContractV5R1(workchain, args.publicKey, {
            networkGlobalId: args.walletId?.networkGlobalId ?? -239,
            context: args.walletId?.context ?? {
                workchain: 0,
                walletVersion: "v5r1",
                subwalletNumber: 0,
            },
        });
    }

    readonly address: Address;
    readonly init: { data: Cell; code: Cell };

    constructor(
        workchain: number,
        readonly publicKey: Buffer,
        readonly walletId: WalletIdV5R1<
            WalletIdV5R1ClientContext | WalletIdV5R1CustomContext
        >,
    ) {
        this.walletId = walletId;

        // https://github.com/ton-blockchain/wallet-contract-v5/blob/4fab977f4fae3a37c1aac216ed2b7e611a9bc2af/build/wallet_v5.compiled.json
        let code = Cell.fromBoc(
            Buffer.from(
                "b5ee9c7241021401000281000114ff00f4a413f4bcf2c80b01020120020d020148030402dcd020d749c120915b8f6320d70b1f2082106578746ebd21821073696e74bdb0925f03e082106578746eba8eb48020d72101d074d721fa4030fa44f828fa443058bd915be0ed44d0810141d721f4058307f40e6fa1319130e18040d721707fdb3ce03120d749810280b99130e070e2100f020120050c020120060902016e07080019adce76a2684020eb90eb85ffc00019af1df6a2684010eb90eb858fc00201480a0b0017b325fb51341c75c875c2c7e00011b262fb513435c280200019be5f0f6a2684080a0eb90fa02c0102f20e011e20d70b1f82107369676ebaf2e08a7f0f01e68ef0eda2edfb218308d722028308d723208020d721d31fd31fd31fed44d0d200d31f20d31fd3ffd70a000af90140ccf9109a28945f0adb31e1f2c087df02b35007b0f2d0845125baf2e0855036baf2e086f823bbf2d0882292f800de01a47fc8ca00cb1f01cf16c9ed542092f80fde70db3cd81003f6eda2edfb02f404216e926c218e4c0221d73930709421c700b38e2d01d72820761e436c20d749c008f2e09320d74ac002f2e09320d71d06c712c2005230b0f2d089d74cd7393001a4e86c128407bbf2e093d74ac000f2e093ed55e2d20001c000915be0ebd72c08142091709601d72c081c12e25210b1e30f20d74a111213009601fa4001fa44f828fa443058baf2e091ed44d0810141d718f405049d7fc8ca0040048307f453f2e08b8e14038307f45bf2e08c22d70a00216e01b3b0f2d090e2c85003cf1612f400c9ed54007230d72c08248e2d21f2e092d200ed44d0d2005113baf2d08f54503091319c01810140d721d70a00f2e08ee2c8ca0058cf16c9ed5493f2c08de20010935bdb31e1d74cd0b4d6c35e",
                "hex",
            ),
        )[0];
        let data = beginCell()
            .storeUint(1, 1) // is signature auth allowed
            .storeUint(0, 32) // Seqno
            .store(storeWalletIdV5R1(this.walletId))
            .storeBuffer(this.publicKey, 32)
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
        if (state.state.type === "active") {
            let res = await provider.get("seqno", []);
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
        if (state.state.type === "active") {
            const result = await provider.get("get_extensions", []);
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

        const dict: Dictionary<bigint, bigint> = Dictionary.loadDirect(
            Dictionary.Keys.BigUint(256),
            Dictionary.Values.BigInt(1),
            extensions,
        );

        return dict.keys().map((addressHex) => {
            const wc = this.address.workChain;
            return Address.parseRaw(
                `${wc}:${addressHex.toString(16).padStart(64, "0")}`,
            );
        });
    }

    /**
     * Get is secret-key authentication enabled
     */
    async getIsSecretKeyAuthEnabled(provider: ContractProvider) {
        let res = await provider.get("is_signature_allowed", []);
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
    async sendTransfer(
        provider: ContractProvider,
        args: WalletV5R1SendArgs & {
            messages: MessageRelaxed[];
            sendMode: SendMode;
        },
    ) {
        const transfer = await this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Sign and send add extension request
     */
    async sendAddExtension(
        provider: ContractProvider,
        args: WalletV5R1SendArgs & { extensionAddress: Address },
    ) {
        const request = await this.createAddExtension(args);
        await this.send(provider, request);
    }

    /**
     * Sign and send remove extension request
     */
    async sendRemoveExtension(
        provider: ContractProvider,
        args: WalletV5R1SendArgs & { extensionAddress: Address },
    ) {
        const request = await this.createRemoveExtension(args);
        await this.send(provider, request);
    }

    private createActions(args: {
        messages: MessageRelaxed[];
        sendMode: SendMode;
    }) {
        const actions: OutActionSendMsg[] = args.messages.map((message) => ({
            type: "sendMsg",
            mode: args.sendMode,
            outMsg: message,
        }));
        return actions;
    }

    /**
     * Create signed transfer
     */
    createTransfer<T extends WalletV5R1SendArgs>(
        args: T & { messages: MessageRelaxed[]; sendMode: SendMode },
    ): WalletV5R1PackedCell<T> {
        return this.createRequest({
            actions: this.createActions({
                messages: args.messages,
                sendMode: args.sendMode,
            }),
            ...args,
        });
    }

    /**
     * Create signed add extension request
     */
    createAddExtension<T extends WalletV5R1SendArgs>(
        args: T & { extensionAddress: Address },
    ): WalletV5R1PackedCell<T> {
        return this.createRequest({
            actions: [
                {
                    type: "addExtension",
                    address: args.extensionAddress,
                },
            ],
            ...args,
        });
    }

    /**
     * Create signed remove extension request
     */
    createRemoveExtension<T extends WalletV5R1SendArgs>(
        args: T & { extensionAddress: Address },
    ): WalletV5R1PackedCell<T> {
        return this.createRequest({
            actions: [
                {
                    type: "removeExtension",
                    address: args.extensionAddress,
                },
            ],
            ...args,
        });
    }

    /**
     * Create signed request or extension auth request
     */
    createRequest<T extends WalletV5R1SendArgs>(
        args: T & { actions: OutActionWalletV5[] },
    ): WalletV5R1PackedCell<T> {
        if (args.authType === "extension") {
            return createWalletTransferV5R1(
                args as Wallet5VR1SendArgsExtensionAuth & {
                    actions: OutActionWalletV5[];
                },
            ) as WalletV5R1PackedCell<T>;
        }

        return createWalletTransferV5R1({
            ...(args as (
                | WalletV5R1SendArgsSinged
                | WalletV5R1SendArgsSignable
            ) & { actions: OutActionWalletV5[] }),
            walletId: storeWalletIdV5R1(this.walletId),
        }) as WalletV5R1PackedCell<T>;
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
                    sendMode:
                        args.sendMode ??
                        SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
                    messages: [
                        internal({
                            to: args.to,
                            value: args.value,
                            extracurrency: args.extracurrency,
                            init: args.init,
                            body: args.body,
                            bounce: args.bounce,
                        }),
                    ],
                });
                await this.send(provider, transfer);
            },
        };
    }
}
