/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomTestKey, testAddress } from "../../utils/testUtils";
import { createTestClient4 } from "../../utils/createTestClient4";
import { Address, internal, toNano } from "@ton/core";
import { WalletContractV2R1 } from "./r1";
import { tillNextSeqno } from "../../utils/testWallets";

describe("WalletContractV2R1", () => {
    it("should produce different transfer body when created with domain (signature differs)", () => {
        const key = randomTestKey("v2r1-domain");
        const walletDefault = WalletContractV2R1.create({
            workchain: 0,
            publicKey: key.publicKey,
        });
        const walletWithDomain = WalletContractV2R1.create({
            workchain: 0,
            publicKey: key.publicKey,
            domain: { type: "l2", globalId: 42 },
        });
        const args = {
            seqno: 1,
            secretKey: key.secretKey,
            messages: [
                internal({
                    to: testAddress("domain"),
                    value: toNano("0.01"),
                    bounce: false,
                }),
            ],
        };
        expect(
            walletDefault
                .createTransfer(args)
                .equals(walletWithDomain.createTransfer(args)),
        ).toBe(false);
    });

    it.skip("should has balance and correct address", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV2R1.create({
                workchain: 0,
                publicKey: key.publicKey,
            }),
        );
        let balance = await contract.getBalance();

        // Check parameters
        expect(
            contract.address.equals(
                Address.parse(
                    "EQD3ES67JiTYq5y2eE1-fivl5kANn-gKDDjvpbxNCQWPzs4D",
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
            WalletContractV2R1.create({
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

    it.skip("should perform extra currency transfer", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV2R1.create({
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
                    body: "Hello, extra currency v2r1!",
                }),
            ],
        });

        // Perform transfer
        await contract.send(transfer);
        await tillNextSeqno(contract, seqno);
    });
});
