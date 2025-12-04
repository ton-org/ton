/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomTestKey } from "../utils/randomTestKey";
import { createTestClient4 } from "../utils/createTestClient4";
import { Address, internal } from "@ton/core";
import { WalletContractV2R2 } from "./WalletContractV2R2";
import { tillNextSeqno } from "../utils/testWallets";

describe("WalletContractV2R2", () => {
    it("should has balance and correct address", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV2R2.create({
                workchain: 0,
                publicKey: key.publicKey,
            }),
        );
        let balance = await contract.getBalance();

        // Check parameters
        expect(
            contract.address.equals(
                Address.parse(
                    "EQAkAcNLtzCHudScK9Hsk9I_7SrunBWf_9VrA2xJmGebwEsl",
                ),
            ),
        ).toBe(true);
        expect(balance > 0n).toBe(true);
    });
    it.skip("should perform transfer", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV2R2.create({
                workchain: 0,
                publicKey: key.publicKey,
            }),
        );

        // Prepare transfer
        let seqno = await contract.getSeqno();
        let transfer = contract.createTransfer({
            seqno,
            secretKey: key.secretKey,
            messages: [
                internal({
                    to: "kQD6oPnzaaAMRW24R8F0_nlSsJQni0cGHntR027eT9_sgtwt",
                    value: "0.1",
                    body: "Hello, world!",
                }),
            ],
        });

        // Perform transfer
        await contract.send(transfer);
        await tillNextSeqno(contract, seqno);
    });

    it.skip("should perfrorm extra currency transfer", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV2R2.create({
                workchain: 0,
                publicKey: key.publicKey,
            }),
        );

        // Prepare transfer
        let seqno = await contract.getSeqno();
        let transfer = contract.createTransfer({
            seqno,
            secretKey: key.secretKey,
            messages: [
                internal({
                    to: "kQD6oPnzaaAMRW24R8F0_nlSsJQni0cGHntR027eT9_sgtwt",
                    value: "0.01",
                    extracurrency: { 100: BigInt(10 ** 6) },
                    body: "Hello, extra currency v2r2!",
                }),
            ],
        });

        // Perform transfer
        await contract.send(transfer);
        await tillNextSeqno(contract, seqno);
    });
});
