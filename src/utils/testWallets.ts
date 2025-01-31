import { OpenedContract } from '@ton/core';
import { WalletContractV5R1 } from '../wallets/v5r1/WalletContractV5R1';
import { WalletContractV5Beta } from '../wallets/v5beta/WalletContractV5Beta';
import { WalletContractV4 } from '../wallets/WalletContractV4';
import { WalletContractV3R2 } from '../wallets/WalletContractV3R2';
import { WalletContractV3R1 } from '../wallets/WalletContractV3R1';
import { WalletContractV2R2 } from '../wallets/WalletContractV2R2';
import { WalletContractV2R1 } from '../wallets/WalletContractV2R1';
import { WalletContractV1R2 } from '../wallets/WalletContractV1R2';
import { WalletContractV1R1 } from '../wallets/WalletContractV1R1';


type WalletContract = WalletContractV5R1 | WalletContractV5Beta | WalletContractV4 | WalletContractV3R2 | WalletContractV3R1 | WalletContractV2R2 | WalletContractV2R1 | WalletContractV1R2 | WalletContractV1R1;

export const tillNextSeqno = async(wallet: OpenedContract<WalletContract>, oldSeqno: number, maxTries: number = 10) => {
    let seqNoAfter = oldSeqno;
    let tried = 0;

    do {
        await new Promise((resolve, reject) => {
            setTimeout(resolve, 2000);
        });
        seqNoAfter = await wallet.getSeqno();
        if(tried++ > maxTries) {
            throw Error("To many retries, transaction likely failed!");
        }
    } while(seqNoAfter == oldSeqno);
}
