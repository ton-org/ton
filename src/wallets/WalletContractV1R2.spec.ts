import { v1r2Tests } from "./WalletContractV1R2.trait";
import { Blockchain, SandboxContract } from "@ton/sandbox";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { Cell, toNano } from "@ton/core";
import { WalletContractV1R2 } from "./WalletContractV1R2";

const setup = async () => {
    const blockchain = await Blockchain.create();
    const keyPair = await mnemonicToPrivateKey(["v1r2"]);

    const deployer = await blockchain.treasury("deployer");

    const contract = blockchain.openContract(
        WalletContractV1R2.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
        }),
    );

    const deployResult = await deployer.send({
        to: contract.address,
        value: toNano("1111"),
        init: contract.init,
    });

    const getPublicKey = async (
        contract: SandboxContract<WalletContractV1R2>,
    ) => {
        const state = await blockchain.provider(contract.address).getState();
        if (state.state.type === "active") {
            const ds = Cell.fromBoc(state.state.data!)[0].beginParse();
            ds.loadUint(32);
            return ds.loadBuffer(32);
        } else {
            return Buffer.from([]);
        }
    };

    return {
        blockchain,
        deployer,
        keyPair,
        contract,
        deployResult,
        getPublicKey,
    };
};

v1r2Tests(setup);
