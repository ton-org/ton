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
    internal,
    MessageRelaxed,
    Sender,
    SendMode,
} from "@ton/core";
import { Maybe } from "../../utils/maybe";
import { createWalletTransferV3 } from "../signing/createWalletTransfer";
import {
    WalletV3SendArgsSignable,
    WalletV3SendArgsSigned,
} from "../WalletContractV3Types";

export class WalletContractV3R1 implements Contract {
    static create(args: {
        workchain: number;
        publicKey: Buffer;
        walletId?: Maybe<number>;
    }) {
        return new WalletContractV3R1(
            args.workchain,
            args.publicKey,
            args.walletId,
        );
    }

    readonly workchain: number;
    readonly publicKey: Buffer;
    readonly address: Address;
    readonly walletId: number;
    readonly init: { data: Cell; code: Cell };

    constructor(
        workchain: number,
        publicKey: Buffer,
        walletId?: Maybe<number>,
    ) {
        // Resolve parameters
        this.workchain = workchain;
        this.publicKey = publicKey;
        if (walletId !== null && walletId !== undefined) {
            this.walletId = walletId;
        } else {
            this.walletId = 698983191 + workchain;
        }

        // Build initial code and data
        let code = Cell.fromBoc(
            Buffer.from(
                "te6cckEBAQEAYgAAwP8AIN0gggFMl7qXMO1E0NcLH+Ck8mCDCNcYINMf0x/TH/gjE7vyY+1E0NMf0x/T/9FRMrryoVFEuvKiBPkBVBBV+RDyo/gAkyDXSpbTB9QC+wDo0QGkyMsfyx/L/8ntVD++buA=",
                "base64",
            ),
        )[0];
        let data = beginCell()
            .storeUint(0, 32) // Seqno
            .storeUint(this.walletId, 32)
            .storeBuffer(publicKey)
            .endCell();
        this.init = { code, data };
        this.address = contractAddress(workchain, { code, data });
    }

    /**
     * Get wallet balance
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
        args: {
            seqno: number;
            secretKey: Buffer;
            messages: MessageRelaxed[];
            sendMode?: Maybe<SendMode>;
            timeout?: Maybe<number>;
        },
    ) {
        let transfer = this.createTransfer(args);
        await this.send(provider, transfer);
    }

    /**
     * Create transfer
     */
    createTransfer<T extends WalletV3SendArgsSigned | WalletV3SendArgsSignable>(
        args: T,
    ) {
        return createWalletTransferV3<T>({
            ...args,
            sendMode: args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
            walletId: this.walletId,
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
