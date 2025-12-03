import { v1r3Tests } from "./WalletContractV1R3.trait";
import { Blockchain } from "@ton/sandbox";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { toNano } from "@ton/core";
import { WalletContractV1R3 } from "./WalletContractV1R3";

const setup = async () => {
    const blockchain = await  Blockchain.create();  
    const keyPair = await mnemonicToPrivateKey(['v1r3']);

    const deployer = await blockchain.treasury("deployer");

    const contract = blockchain.openContract(WalletContractV1R3.create({ workchain: 0, publicKey: keyPair.publicKey }));

    const deployResult = await deployer.send({
        to: contract.address,
        value: toNano('1111'),
        init: contract.init,
    })

    return { blockchain, deployer, keyPair, contract, deployResult };
}

v1r3Tests(setup);