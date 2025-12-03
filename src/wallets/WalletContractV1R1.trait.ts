import '@ton/test-utils';

import { internal, toNano } from "@ton/core";
import { WalletContractV1R1 } from "./WalletContractV1R1"; 
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";

import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from "@ton/sandbox";


type V1R1SetupResult = {
    blockchain: Blockchain, 
    deployer: SandboxContract<TreasuryContract>, 
    keyPair: KeyPair, 
    contract: SandboxContract<WalletContractV1R1 & Record<string, any>>, 
    deployResult: SendMessageResult
}

export const v1r1Tests = async (setup: () => Promise<V1R1SetupResult>) => { 
    it('should deploy contract', async () => {
        const { deployer, contract, deployResult } = await setup();
        
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contract.address,
            deploy: true,
        });
    });

    it("should perform transfer", async () => {
        const { contract, keyPair } = await setup();
        
        const seqno = await contract.getSeqno();
        const transferResult = await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano('1'),
            })
        });

        expect(transferResult.transactions).toHaveTransaction({
            from: contract.address,
            to: contract.address,
            value: toNano('1')
        });
    });

    it('should return exitCode 33 if seqno is invalid', async () => {
        const { contract, keyPair } = await setup();
        
        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano('1'),
            })
        });

        await expect(() =>  
            contract.sendTransfer({
                seqno,
            secretKey: keyPair.secretKey,
            message: internal({
                to: contract.address,
                value: toNano('1'),
            })
        })).toThrowExitCode(33);
    });
    
    it("should return exitCode 34 if the signature is invalid", async () => {
        const { contract } = await setup();

        const invalidKeyPair = await mnemonicToPrivateKey(['Invalid mnemonic']);
        
        const seqno = await contract.getSeqno();

        await expect(() =>  
            contract.sendTransfer({
                seqno,
                secretKey: invalidKeyPair.secretKey,
                message: internal({
                    to: contract.address,
                    value: toNano('1'),
                })
        })).toThrowExitCode(34);
    });
};
