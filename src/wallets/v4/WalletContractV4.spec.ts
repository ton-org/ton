/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import "@ton/test-utils";
import { Blockchain } from "@ton/sandbox";
import { randomTestKey, testAddress } from "../../utils/testUtils";
import { tillNextSeqno } from "../../utils/testWallets";
import { WalletContractV4 } from "./WalletContractV4";
import { createTestClient4 } from "../../utils/createTestClient4";
import {
    Address,
    beginCell,
    internal,
    OpenedContract,
    SendMode,
    toNano,
} from "@ton/core";
import { TonClient4 } from "../../client/TonClient4";
import { KeyPair } from "@ton/crypto";

describe("WalletContractV4", () => {
    it("should produce different transfer body when created with domain (signature differs)", () => {
        const key = randomTestKey("v4-domain");
        const walletDefault = WalletContractV4.create({
            workchain: 0,
            publicKey: key.publicKey,
        });
        const walletWithDomain = WalletContractV4.create({
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
            WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }),
        );
        let balance = await contract.getBalance();

        // Check parameters
        expect(
            contract.address.equals(
                Address.parse(
                    "EQDnBF4JTFKHTYjulEJyNd4dstLGH1m51UrLdu01_tw4z2Au",
                ),
            ),
        ).toBe(true);
        expect(balance > 0n).toBe(true);
    });

    it("should deploy a funded wallet and deliver both messages on its first transfer", async () => {
        const blockchain = await Blockchain.create();
        const treasury = await blockchain.treasury("treasury");
        const key = randomTestKey("v4-first-transfer");
        const wallet = blockchain.openContract(
            WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }),
        );

        // Fund the address before its first external message deploys the wallet.
        await treasury.send({
            to: wallet.address,
            value: toNano("1"),
            bounce: false,
        });

        const seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno,
            secretKey: key.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [
                internal({ to: treasury.address, value: toNano("0.1") }),
                internal({ to: treasury.address, value: toNano("0.2") }),
            ],
        });
        const result = await wallet.send(transfer);

        expect(result.transactions).toHaveTransaction({
            to: wallet.address,
            deploy: true,
            success: true,
        });
        for (const amount of ["0.1", "0.2"]) {
            expect(result.transactions).toHaveTransaction({
                from: wallet.address,
                to: treasury.address,
                value: toNano(amount),
                success: true,
            });
        }
        expect(await wallet.getSeqno()).toBe(seqno + 1);
    });

    it.skip("should perform extra currency transfer", async () => {
        // Create contract
        let client = createTestClient4();
        let key = randomTestKey("v4-treasure");
        let contract = client.open(
            WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }),
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
                    body: "Hello extra currency v4",
                }),
            ],
        });

        // Perform transfer
        await contract.send(transfer);
        // Awaiting update
        await tillNextSeqno(contract, seqno);
    });

    describe("plugins", () => {
        let client: TonClient4;
        let walletKey: KeyPair;
        let contract: OpenedContract<WalletContractV4>;

        let randomAddress: Address;

        let pluginKey: KeyPair;
        let pluginContract: OpenedContract<WalletContractV4>;

        beforeEach(() => {
            client = createTestClient4();
            walletKey = randomTestKey("v4-treasure");
            contract = client.open(
                WalletContractV4.create({
                    workchain: 0,
                    publicKey: walletKey.publicKey,
                }),
            );
            pluginContract = client.open(
                WalletContractV4.create({
                    workchain: 0,
                    publicKey: walletKey.publicKey,
                }),
            );

            randomAddress = WalletContractV4.create({
                workchain: 0,
                publicKey: randomTestKey("v4-test-plugin").publicKey,
            }).address;
        });

        it.skip("should install plugin", async () => {
            let seqno = await contract.getSeqno();
            await contract.sendRequest({
                seqno: await contract.getSeqno(),
                secretKey: walletKey.secretKey,
                action: {
                    type: "addPlugin",
                    address: randomAddress,
                    forwardAmount: toNano("0.01"),
                },
            });

            await tillNextSeqno(contract, seqno);
        });

        it.skip("should return plugin in get methods", async () => {
            expect(
                await contract.getIsPluginInstalled(randomAddress),
            ).toBeTruthy();
            const plugins = await contract.getPluginsArray();
            expect(
                plugins.find((plugin) => plugin.equals(randomAddress)),
            ).toBeTruthy();
        });

        it.skip("should uninstall plugin", async () => {
            let seqno = await contract.getSeqno();
            await contract.sendRequest({
                seqno: await contract.getSeqno(),
                secretKey: walletKey.secretKey,
                action: {
                    type: "removePlugin",
                    address: randomAddress,
                    forwardAmount: toNano("0.01"),
                },
            });
            await tillNextSeqno(contract, seqno);
        });

        it("should return plugin in get methods", async () => {
            expect(
                await contract.getIsPluginInstalled(randomAddress),
            ).toBeFalsy();
            const plugins = await contract.getPluginsArray();
            plugins.forEach((plugin) => {
                expect(plugin.equals(randomAddress)).toBeFalsy();
            });
        });

        it.skip("should install and deploy plugin", async () => {
            let seqno = await contract.getSeqno();
            await contract.sendRequest({
                seqno: await contract.getSeqno(),
                secretKey: walletKey.secretKey,
                action: {
                    type: "addAndDeployPlugin",
                    workchain: 0,
                    stateInit: pluginContract.init,
                    body: beginCell().endCell(),
                    forwardAmount: toNano("0.1"),
                },
            });

            await tillNextSeqno(contract, seqno);
        });

        it.skip("should withdraw funds by plugin request", async () => {
            let seqno = await contract.getSeqno();
            await pluginContract.sendPluginRequestFunds(
                pluginContract.sender(walletKey.secretKey),
                {
                    forwardAmount: toNano("0.01"),
                    toncoinsToWithdraw: toNano("0.05"),
                },
            );

            await tillNextSeqno(contract, seqno);
        });

        it.skip("should delete plugin by plugin request", async () => {
            let seqno = await pluginContract.getSeqno();

            await pluginContract.sendPluginRemovePlugin(
                pluginContract.sender(walletKey.secretKey),
                toNano("0.01"),
            );

            await tillNextSeqno(contract, seqno);
        });
    });
});
