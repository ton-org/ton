/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomTestKey } from "../../utils/randomTestKey";
import { tillNextSeqno } from "../../utils/testWallets";
import { WalletContractV4 } from "./WalletContractV4";
import { createTestClient4 } from "../../utils/createTestClient4";
import {
    Address,
    beginCell,
    internal,
    OpenedContract,
    toNano,
} from "@ton/core";
import { TonClient4 } from "../../client/TonClient4";
import { KeyPair } from "@ton/crypto";

describe("WalletContractV4", () => {
    it("should has balance and correct address", async () => {
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

    it.skip("should perform transfer", async () => {
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
                    value: "0.1",
                    body: "Hello world: 1",
                }),
                internal({
                    to: "kQD6oPnzaaAMRW24R8F0_nlSsJQni0cGHntR027eT9_sgtwt",
                    value: "0.1",
                    body: "Hello world: 2",
                }),
            ],
        });

        // Perform transfer
        await contract.send(transfer);
        // Awaiting update
        await tillNextSeqno(contract, seqno);
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
