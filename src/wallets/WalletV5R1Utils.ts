import {
    Address,
    beginCell, BitBuilder,
    BitReader,
    BitString,
    Builder, Cell,
    loadOutList,
    OutActionSendMsg, SendMode,
    Slice,
    storeOutList
} from '@ton/core';
import {
    isOutActionBasic,
    isOutActionExtended,
    OutActionAddExtension,
    OutActionExtended,
    OutActionRemoveExtension,
    OutActionSetIsPublicKeyEnabled, OutActionWalletV5
} from "./WalletV5Utils";
import {WalletV5R1SendArgs} from "./WalletContractV5R1";


const outActionSetIsPublicKeyEnabledTag = 0x04;
function storeOutActionSetIsPublicKeyEnabled(action: OutActionSetIsPublicKeyEnabled) {
    return (builder: Builder) => {
        builder.storeUint(outActionSetIsPublicKeyEnabledTag, 8).storeUint(action.isEnabled ? 1 : 0, 1)
    }
}

const outActionAddExtensionTag = 0x02;
function storeOutActionAddExtension(action: OutActionAddExtension) {
    return (builder: Builder) => {
        builder.storeUint(outActionAddExtensionTag, 8).storeAddress(action.address)
    }
}

const outActionRemoveExtensionTag = 0x03;
function storeOutActionRemoveExtension(action: OutActionRemoveExtension) {
    return (builder: Builder) => {
        builder.storeUint(outActionRemoveExtensionTag, 8).storeAddress(action.address)
    }
}

export function storeOutActionExtendedV5R1(action: OutActionExtended) {
    switch (action.type) {
        case 'setIsPublicKeyEnabled':
            return storeOutActionSetIsPublicKeyEnabled(action);
        case 'addExtension':
            return storeOutActionAddExtension(action);
        case 'removeExtension':
            return storeOutActionRemoveExtension(action);
        default:
            throw new Error('Unknown action type' + (action as OutActionExtended)?.type);
    }
}

export function loadOutActionExtendedV5R1(slice: Slice): OutActionExtended {
    const tag = slice.loadUint(8);

    switch (tag) {
        case outActionSetIsPublicKeyEnabledTag:
            return {
                type: 'setIsPublicKeyEnabled',
                isEnabled: !!slice.loadUint(1)
            }
        case outActionAddExtensionTag:
            return {
                type: 'addExtension',
                address: slice.loadAddress()
            }
        case outActionRemoveExtensionTag:
            return {
                type: 'removeExtension',
                address: slice.loadAddress()
            }
        default:
            throw new Error(`Unknown extended out action tag 0x${tag.toString(16)}`);
    }
}

export function storeOutListExtendedV5R1(actions: (OutActionExtended | OutActionSendMsg)[]) {
    const extendedActions = actions.filter(isOutActionExtended);
    const basicActions = actions.filter(isOutActionBasic);

    return (builder: Builder) => {
        const outListPacked = basicActions.length ? beginCell().store(storeOutList(basicActions.slice().reverse())) : null;
        builder.storeMaybeRef(outListPacked);

        if (extendedActions.length === 0) {
            builder.storeUint(0, 1);
        } else {
            const [first, ...rest] = extendedActions;
            builder
                .storeUint(1, 1)
                .store(storeOutActionExtendedV5R1(first));
            if (rest.length > 0) {
                builder.storeRef(packExtendedActionsRec(rest));
            }
        }
    }
}

function packExtendedActionsRec(extendedActions: OutActionExtended[]): Cell {
    const [first, ...rest] = extendedActions;
    let builder = beginCell()
        .store(storeOutActionExtendedV5R1(first));
    if (rest.length > 0) {
        builder = builder.storeRef(packExtendedActionsRec(rest));
    }
    return builder.endCell();
}

export function loadOutListExtendedV5R1(slice: Slice): (OutActionExtended | OutActionSendMsg)[] {
    const actions: (OutActionExtended | OutActionSendMsg)[] = [];
    const outListPacked = slice.loadMaybeRef();
    if (outListPacked) {
        const loadedActions =loadOutList(outListPacked.beginParse());
        if (loadedActions.some(a => a.type !== 'sendMsg')) {
            throw new Error("Can't deserialize actions list: only sendMsg actions are allowed for wallet v5r1");
        }

        actions.push(...loadedActions as OutActionSendMsg[]);
    }

    if (slice.loadBoolean()) {
        const action = loadOutActionExtendedV5R1(slice);
        actions.push(action);
    }

    while (slice.remainingRefs > 0) {
        slice = slice.loadRef().beginParse();
        const action = loadOutActionExtendedV5R1(slice);
        actions.push(action);
    }

    return actions;
}

/**
 * wallet_id -- int32
 * wallet_id = global_id ^ context_id
 * context_id_client$1 = wc:int8 wallet_version:uint8 counter:uint15
 * context_id_backoffice$0 = counter:uint31
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

    readonly workChain: number;

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
                Buffer.from(value.toString(16), 'hex') :
                value instanceof Slice ? value.loadBuffer(4) : value,
            0,
            32
        )
    ).loadInt(32);

    const context = BigInt(val) ^ BigInt(networkGlobalId);

    const bitReader = beginCell().storeInt(context, 32).endCell().beginParse();

    const isClientContext = bitReader.loadUint(1);
    if (isClientContext) {
        const workChain = bitReader.loadInt(8);
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
                workChain,
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
                .storeInt(walletId.context.workChain, 8)
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

/**
 * при экстернале обязателен флаг +2 в sendmode, при интернале - любой sendmode
 */
export function toSafeV5R1SendMode(sendMode: SendMode, authType: WalletV5R1SendArgs['authType']) {
    if (authType === 'internal' || authType === 'extension') {
        return sendMode;
    }

    return sendMode | SendMode.IGNORE_ERRORS
}

export function patchV5R1ActionsSendMode(actions: OutActionWalletV5[], authType: WalletV5R1SendArgs['authType']): OutActionWalletV5[] {
    return actions.map(action => action.type === 'sendMsg' ? ({
        ...action,
        mode: toSafeV5R1SendMode(action.mode, authType)
    }) : action)

}
