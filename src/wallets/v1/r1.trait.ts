import "@ton/test-utils";

import { beginCell, internal, toNano } from "@ton/core";
import { WalletContractV1R1 } from "./r1";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";

import {
    Blockchain,
    SandboxContract,
    SendMessageResult,
    TreasuryContract,
} from "@ton/sandbox";

type V1R1SetupResult = {
    blockchain: Blockchain;
    deployer: SandboxContract<TreasuryContract>;
    keyPair: KeyPair;
    contract: SandboxContract<WalletContractV1R1>;
    deployResult: SendMessageResult;
    getPublicKey: (contract: SandboxContract<any>) => Promise<Buffer>;
};

export const v1r1Tests = async (setup: () => Promise<V1R1SetupResult>) => {
    it("should deploy contract", async () => {
        const { deployer, contract, deployResult } = await setup();

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contract.address,
            deploy: true,
        });
    });

    it("should have seqno equals 0 after deployment", async () => {
        const { contract } = await setup();
        expect(await contract.getSeqno()).toBe(0);
    });

    it("should have public key equals to the deployed public key", async () => {
        const { contract, keyPair, getPublicKey } = await setup();
        expect(await getPublicKey(contract)).toEqual(keyPair.publicKey);
    });

    it("should perform transfer", async () => {
        const { contract, keyPair } = await setup();

        const body = beginCell().storeStringTail("some body").endCell();
        const init = {
            code: beginCell().storeStringTail("code").endCell(),
            data: beginCell().storeStringTail("data").endCell(),
        };

        const seqno = await contract.getSeqno();
        const transferResult = await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano("1"),
                body,
                init,
            }),
        });

        expect(transferResult.transactions).toHaveTransaction({
            from: contract.address,
            to: contract.address,
            body,
            initCode: init.code,
            initData: init.data,
            value: toNano("1"),
        });
    });

    it("should update seqno after transfer", async () => {
        const { contract, keyPair } = await setup();

        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano("1"),
            }),
        });

        expect(await contract.getSeqno()).not.toBe(seqno);
    });

    it("should not update public key after transfer", async () => {
        const { contract, keyPair, getPublicKey } = await setup();

        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
        });

        expect(await getPublicKey(contract)).toEqual(keyPair.publicKey);
    });

    it("should return exitCode 32 when unexists get method is called on the contract", async () => {
        const { blockchain, contract } = await setup();
        await expect(() =>
            blockchain.provider(contract.address).get("unexists_method", []),
        ).toThrowExitCode(32);
    });

    it("should return exitCode 33 if seqno is invalid", async () => {
        const { contract, keyPair } = await setup();

        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano("1"),
            }),
        });

        await expect(() =>
            contract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                message: internal({
                    to: contract.address,
                    value: toNano("1"),
                }),
            }),
        ).toThrowExitCode(33);
    });

    it("should return exitCode 34 if the signature is invalid", async () => {
        const { contract } = await setup();

        const invalidKeyPair = await mnemonicToPrivateKey(["Invalid mnemonic"]);

        const seqno = await contract.getSeqno();

        await expect(() =>
            contract.sendTransfer({
                seqno,
                secretKey: invalidKeyPair.secretKey,
                message: internal({
                    to: contract.address,
                    value: toNano("1"),
                }),
            }),
        ).toThrowExitCode(34);
    });
};
