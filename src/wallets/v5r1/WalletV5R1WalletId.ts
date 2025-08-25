import {
    beginCell,
    BitReader,
    BitString,
    Builder,
    Slice
} from '@ton/core';


/**
 * schema:
 * wallet_id -- int32
 * wallet_id = global_id ^ context_id
 * context_id_client$1 = wc:int8 wallet_version:uint8 counter:uint15
 * context_id_backoffice$0 = counter:uint31
 *
 *
 * calculated default values serialisation:
 *
 * global_id = -239, workchain = 0, wallet_version = 0', subwallet_number = 0 (client context)
 * gives wallet_id = 2147483409
 *
 * global_id = -239, workchain = -1, wallet_version = 0', subwallet_number = 0 (client context)
 * gives wallet_id = 8388369
 *
 * global_id = -3, workchain = 0, wallet_version = 0', subwallet_number = 0 (client context)
 * gives wallet_id = 2147483645
 *
 * global_id = -3, workchain = -1, wallet_version = 0', subwallet_number = 0 (client context)
 * gives wallet_id = 8388605
 */
export interface WalletIdV5R1<C extends WalletIdV5R1ClientContext | WalletIdV5R1CustomContext = WalletIdV5R1ClientContext | WalletIdV5R1CustomContext> {
    /**
     * -239 is mainnet, -3 is testnet
     */
    readonly networkGlobalId: number;

    readonly context: C;
}

export interface WalletIdV5R1ClientContext {
    readonly walletVersion: 'v5r1';

    readonly workchain: number;

    readonly subwalletNumber: number;
}

/**
 * 31-bit unsigned integer
 */
export type WalletIdV5R1CustomContext = number;

export function isWalletIdV5R1ClientContext(context: WalletIdV5R1ClientContext | WalletIdV5R1CustomContext): context is WalletIdV5R1ClientContext {
    return typeof context !== 'number';
}

const walletV5R1VersionsSerialisation: Record<WalletIdV5R1ClientContext['walletVersion'], number> = {
    v5r1: 0
};

/**
 * @param value serialized wallet id
 * @param networkGlobalId -239 is mainnet, -3 is testnet
 */
export function loadWalletIdV5R1(value: bigint | Buffer | Slice, networkGlobalId: number): WalletIdV5R1 {
    const val = new BitReader(
        new BitString(
            typeof value === 'bigint' ?
                Buffer.from(value.toString(16).padStart(8, '0'), 'hex') :
                value instanceof Slice ? value.loadBuffer(4) : value,
            0,
            32
        )
    ).loadInt(32);

    const context = BigInt(val) ^ BigInt(networkGlobalId);

    const bitReader = beginCell().storeInt(context, 32).endCell().beginParse();

    const isClientContext = bitReader.loadUint(1);
    if (isClientContext) {
        const workchain = bitReader.loadInt(8);
        const walletVersionRaw = bitReader.loadUint(8);
        const subwalletNumber = bitReader.loadUint(15);

        const walletVersion = Object.entries(walletV5R1VersionsSerialisation).find(
            ([_, value]) => value === walletVersionRaw
        )?.[0] as WalletIdV5R1ClientContext['walletVersion'] | undefined;

        if (walletVersion === undefined) {
            throw new Error(
                `Can't deserialize walletId: unknown wallet version ${walletVersionRaw}`
            );
        }

        return {
            networkGlobalId,
            context: {
                walletVersion,
                workchain,
                subwalletNumber
            }
        }
    } else {
        const context = bitReader.loadUint(31);
        return {
            networkGlobalId,
            context
        }
    }
}

export function storeWalletIdV5R1(walletId: WalletIdV5R1) {
    return (builder: Builder) => {
        let context;
        if (isWalletIdV5R1ClientContext(walletId.context)) {
            context = beginCell()
                .storeUint(1, 1)
                .storeInt(walletId.context.workchain, 8)
                .storeUint(walletV5R1VersionsSerialisation[walletId.context.walletVersion], 8)
                .storeUint(walletId.context.subwalletNumber, 15)
                .endCell().beginParse().loadInt(32);
        } else {
            context = beginCell()
                .storeUint(0, 1)
                .storeUint(walletId.context, 31)
                .endCell().beginParse().loadInt(32);
        }

        return builder.storeInt(BigInt(walletId.networkGlobalId) ^ BigInt(context), 32);
    }
}
