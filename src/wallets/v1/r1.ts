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
    SignatureDomain,
} from "@ton/core";
import { Maybe } from "../../utils/maybe";
import { createWalletTransferV1 } from "../signing/createWalletTransfer";

export class WalletContractV1R1 implements Contract {
    static create(args: {
        workchain: number;
        publicKey: Buffer;
        domain?: SignatureDomain;
    }) {
        return new WalletContractV1R1(
            args.workchain,
            args.publicKey,
            args.domain,
        );
    }

    readonly workchain: number;
    readonly publicKey: Buffer;
    readonly address: Address;
    readonly init: { data: Cell; code: Cell };
    public domain?: SignatureDomain;

    constructor(
        workchain: number,
        publicKey: Buffer,
        domain?: SignatureDomain,
    ) {
        this.workchain = workchain;
        this.publicKey = publicKey;
        this.domain = domain;

        // Build initial code and data
        let code = Cell.fromBoc(
            Buffer.from(
                "te6cckEBAQEARAAAhP8AIN2k8mCBAgDXGCDXCx/tRNDTH9P/0VESuvKhIvkBVBBE+RDyovgAAdMfMSDXSpbTB9QC+wDe0aTIyx/L/8ntVEH98Ik=",
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
            return Cell.fromBoc(state.state.data!)[0].beginParse().loadUint(32);
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
            message?: Maybe<MessageRelaxed>;
            sendMode?: Maybe<SendMode>;
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
        message?: Maybe<MessageRelaxed>;
        sendMode?: Maybe<SendMode>;
    }) {
        let sendMode = SendMode.PAY_GAS_SEPARATELY;
        if (args.sendMode !== null && args.sendMode !== undefined) {
            sendMode = args.sendMode;
        }
        return createWalletTransferV1({
            seqno: args.seqno,
            sendMode,
            secretKey: args.secretKey,
            message: args.message,
            domain: this.domain,
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
                    message: internal({
                        to: args.to,
                        value: args.value,
                        extracurrency: args.extracurrency,
                        init: args.init,
                        body: args.body,
                        bounce: args.bounce,
                    }),
                });
                await this.send(provider, transfer);
            },
        };
    }
}
