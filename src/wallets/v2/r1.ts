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
import { createWalletTransferV2 } from "../signing/createWalletTransfer";

export class WalletContractV2R1 implements Contract {
    static create(args: { workchain: number; publicKey: Buffer }) {
        return new WalletContractV2R1(args.workchain, args.publicKey);
    }

    readonly workchain: number;
    readonly publicKey: Buffer;
    readonly address: Address;
    readonly init: { data: Cell; code: Cell };

    constructor(workchain: number, publicKey: Buffer) {
        this.workchain = workchain;
        this.publicKey = publicKey;

        // Build initial code and data
        let code = Cell.fromBoc(
            Buffer.from(
                "te6cckEBAQEAVwAAqv8AIN0gggFMl7qXMO1E0NcLH+Ck8mCDCNcYINMf0x8B+CO78mPtRNDTH9P/0VExuvKhA/kBVBBC+RDyovgAApMg10qW0wfUAvsA6NGkyMsfy//J7VShNwu2",
                "base64",
            ),
        )[0];
        let data = beginCell()
            .storeUint(0, 32) // Seqno
            .storeBuffer(publicKey)
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
     * Create signed transfer
     */
    createTransfer(args: {
        seqno: number;
        secretKey: Buffer;
        messages: MessageRelaxed[];
        sendMode?: Maybe<SendMode>;
        timeout?: Maybe<number>;
    }) {
        let sendMode = SendMode.PAY_GAS_SEPARATELY;
        if (args.sendMode !== null && args.sendMode !== undefined) {
            sendMode = args.sendMode;
        }
        return createWalletTransferV2({
            seqno: args.seqno,
            sendMode,
            secretKey: args.secretKey,
            messages: args.messages,
            timeout: args.timeout,
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
