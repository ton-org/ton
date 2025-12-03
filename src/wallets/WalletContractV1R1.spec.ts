import { toNano } from "@ton/core";
import { WalletContractV1R1 } from "./WalletContractV1R1"; 
import { mnemonicToPrivateKey } from "@ton/crypto";

import { Blockchain } from "@ton/sandbox";

import { v1r1Tests } from "./WalletContractV1R1.trait";


const setup = async () => {
    const blockchain = await  Blockchain.create();  
    const keyPair = await mnemonicToPrivateKey(['v1r1']);

    const deployer = await blockchain.treasury("deployer");

    const contract = blockchain.openContract(WalletContractV1R1.create({ workchain: 0, publicKey: keyPair.publicKey }));

    const deployResult = await deployer.send({
        to: contract.address,
        value: toNano('1111'),
        init: contract.init,
    })

    return { blockchain, deployer, keyPair, contract, deployResult };
}


v1r1Tests(setup);