import {
    Address,
    beginCell,
    BitReader,
    BitString,
    Builder,
    loadOutList,
    OutActionSendMsg,
    Slice,
    storeOutList
} from '@ton/core';

export interface OutActionAddExtension {
    type: 'addExtension';
    address: Address;
}

export interface OutActionRemoveExtension {
    type: 'removeExtension';
    address: Address;
}

export interface OutActionSetIsPublicKeyEnabled {
    type: 'setIsPublicKeyEnabled';
    isEnabled: boolean;
}

export type OutActionExtended = OutActionSetIsPublicKeyEnabled | OutActionAddExtension | OutActionRemoveExtension;
export type OutActionWalletV5 = OutActionExtended | OutActionSendMsg;

const outActionSetIsPublicKeyEnabledTag = 0x20cbb95a;
function storeOutActionSetIsPublicKeyEnabled(action: OutActionSetIsPublicKeyEnabled) {
    return (builder: Builder) => {
        builder.storeUint(outActionSetIsPublicKeyEnabledTag, 32).storeUint(action.isEnabled ? 1 : 0, 1)
    }
}

const outActionAddExtensionTag = 0x1c40db9f;
function storeOutActionAddExtension(action: OutActionAddExtension) {
    return (builder: Builder) => {
        builder.storeUint(outActionAddExtensionTag, 32).storeAddress(action.address)
    }
}

const outActionRemoveExtensionTag = 0x5eaef4a4;
function storeOutActionRemoveExtension(action: OutActionRemoveExtension) {
    return (builder: Builder) => {
        builder.storeUint(outActionRemoveExtensionTag, 32).storeAddress(action.address)
    }
}

export function storeOutActionExtended(action: OutActionExtended) {
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

export function loadOutActionExtended(slice: Slice): OutActionExtended {
    const tag = slice.loadUint(32);

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

export function isOutActionExtended(action: OutActionSendMsg | OutActionExtended): action is OutActionExtended {
    return (
        action.type === 'setIsPublicKeyEnabled' || action.type === 'addExtension' || action.type === 'removeExtension'
    );
}

export function storeOutListExtended(actions: (OutActionExtended | OutActionSendMsg)[]) {
    const [action, ...rest] = actions;

    if (!action || !isOutActionExtended(action)) {
        if (actions.some(isOutActionExtended)) {
            throw new Error("Can't serialize actions list: all extended actions must be placed before out actions");
        }

        return (builder: Builder) => {
            builder
                .storeUint(0, 1)
                .storeRef(beginCell().store(storeOutList(actions as OutActionSendMsg[])).endCell())
        }
    }

    return (builder: Builder) => {
        builder.storeUint(1, 1)
            .store(storeOutActionExtended(action))
            .storeRef(beginCell().store(storeOutListExtended(rest)).endCell())
    }
}

export function loadOutListExtended(slice: Slice): (OutActionExtended | OutActionSendMsg)[] {
    const actions: (OutActionExtended | OutActionSendMsg)[] = [];

    while (slice.loadUint(1)) {
        const action = loadOutActionExtended(slice);
        actions.push(action);

        slice = slice.loadRef().beginParse();
    }

    const commonAction  = loadOutList(slice.loadRef().beginParse());
    if (commonAction.some(i => i.type === 'setCode')) {
        throw new Error("Can't deserialize actions list: only sendMsg actions are allowed for wallet v5");
    }

    return actions.concat(commonAction as OutActionSendMsg[]);
}

export interface WalletId {
    readonly walletVersion: 'v5';

    /**
     * -239 is mainnet, -3 is testnet
     */
    readonly networkGlobalId: number;

    readonly workChain: number;

    readonly subwalletNumber: number;
}

const walletVersionsSerialisation: Record<WalletId['walletVersion'], number> = {
    v5: 0
};
export function loadWalletId(value: bigint | Buffer | Slice): WalletId {
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

    const walletVersion = Object.entries(walletVersionsSerialisation).find(
        ([_, value]) => value === walletVersionRaw
    )?.[0] as WalletId['walletVersion'] | undefined;

    if (walletVersion === undefined) {
        throw new Error(
            `Can't deserialize walletId: unknown wallet version ${walletVersionRaw}`
        );
    }

    return { networkGlobalId, workChain, walletVersion, subwalletNumber }
}

export function storeWalletId(walletId: WalletId) {
    return (builder: Builder) => {
        builder.storeInt(walletId.networkGlobalId, 32);
        builder.storeInt(walletId.workChain, 8);
        builder.storeUint(walletVersionsSerialisation[walletId.walletVersion], 8);
        builder.storeUint(walletId.subwalletNumber, 32);
    }
}
