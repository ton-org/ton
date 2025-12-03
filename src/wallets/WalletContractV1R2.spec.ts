import { v1r2Tests } from "./WalletContractV1R2.trait";
import { Blockchain } from "@ton/sandbox";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { toNano } from "@ton/core";
import { WalletContractV1R2 } from "./WalletContractV1R2";

const setup = async () => {
    const blockchain = await  Blockchain.create();  
    const keyPair = await mnemonicToPrivateKey(['v1r2']);

    const deployer = await blockchain.treasury("deployer");

    const contract = blockchain.openContract(WalletContractV1R2.create({ workchain: 0, publicKey: keyPair.publicKey }));

    const deployResult = await deployer.send({
        to: contract.address,
        value: toNano('1111'),
        init: contract.init,
    })

    return { blockchain, deployer, keyPair, contract, deployResult };
}

v1r2Tests(setup);