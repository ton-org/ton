import {
    beginCell,
    Builder,
    loadOutList,
    type OutActionSendMsg,
    Slice,
    storeOutList
} from '@ton/core';
import {
    isOutActionExtended,
    type OutActionAddExtension,
    type OutActionExtended,
    type OutActionRemoveExtension,
    type OutActionSetIsPublicKeyEnabled
} from "./WalletV5OutActions";

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

export function storeOutActionExtendedV5Beta(action: OutActionExtended) {
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

export function loadOutActionV5BetaExtended(slice: Slice): OutActionExtended {
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

export function storeOutListExtendedV5Beta(actions: (OutActionExtended | OutActionSendMsg)[]) {
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
            .store(storeOutActionExtendedV5Beta(action))
            .storeRef(beginCell().store(storeOutListExtendedV5Beta(rest)).endCell())
    }
}

export function loadOutListExtendedV5Beta(slice: Slice): (OutActionExtended | OutActionSendMsg)[] {
    const actions: (OutActionExtended | OutActionSendMsg)[] = [];

    while (slice.loadUint(1)) {
        const action = loadOutActionV5BetaExtended(slice);
        actions.push(action);

        slice = slice.loadRef().beginParse();
    }

    const commonAction  = loadOutList(slice.loadRef().beginParse());
    if (commonAction.some(i => i.type === 'setCode')) {
        throw new Error("Can't deserialize actions list: only sendMsg actions are allowed for wallet v5");
    }

    return actions.concat(commonAction as OutActionSendMsg[]);
}
