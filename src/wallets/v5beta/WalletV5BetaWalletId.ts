import {
    BitReader,
    BitString,
    Builder,
    Slice
} from '@ton/core';


export interface WalletIdV5Beta {
    readonly walletVersion: 'v5';

    /**
     * -239 is mainnet, -3 is testnet
     */
    readonly networkGlobalId: number;

    readonly workChain: number;

    readonly subwalletNumber: number;
}

const walletV5BetaVersionsSerialisation: Record<WalletIdV5Beta['walletVersion'], number> = {
    v5: 0
};
export function loadWalletIdV5Beta(value: bigint | Buffer | Slice): WalletIdV5Beta {
    const bitReader = new BitReader(
        new BitString(
            typeof value === 'bigint' ?
                Buffer.from(value.toString(16), 'hex') :
                value instanceof Slice ? value.loadBuffer(10) : value,
            0,
            80
        )
    );
    const networkGlobalId = bitReader.loadInt(32);
    const workChain = bitReader.loadInt(8);
    const walletVersionRaw = bitReader.loadUint(8);
    const subwalletNumber = bitReader.loadUint(32);

    const walletVersion = Object.entries(walletV5BetaVersionsSerialisation).find(
        ([_, value]) => value === walletVersionRaw
    )?.[0] as WalletIdV5Beta['walletVersion'] | undefined;

    if (walletVersion === undefined) {
        throw new Error(
            `Can't deserialize walletId: unknown wallet version ${walletVersionRaw}`
        );
    }

    return { networkGlobalId, workChain, walletVersion, subwalletNumber }
}

export function storeWalletIdV5Beta(walletId: WalletIdV5Beta) {
    return (builder: Builder) => {
        builder.storeInt(walletId.networkGlobalId, 32);
        builder.storeInt(walletId.workChain, 8);
        builder.storeUint(walletV5BetaVersionsSerialisation[walletId.walletVersion], 8);
        builder.storeUint(walletId.subwalletNumber, 32);
    }
}
