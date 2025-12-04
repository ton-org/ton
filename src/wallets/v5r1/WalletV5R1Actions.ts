import {
    beginCell,
    Builder,
    Cell,
    loadOutList,
    OutActionSendMsg,
    SendMode,
    Slice,
    storeOutList,
} from "@ton/core";
import {
    isOutActionBasic,
    isOutActionExtended,
    OutActionAddExtension,
    OutActionExtended,
    OutActionRemoveExtension,
    OutActionSetIsPublicKeyEnabled,
    OutActionWalletV5,
} from "../v5beta/WalletV5OutActions";
import { WalletV5R1SendArgs } from "./WalletContractV5R1";

const outActionSetIsPublicKeyEnabledTag = 0x04;
function storeOutActionSetIsPublicKeyEnabled(
    action: OutActionSetIsPublicKeyEnabled,
) {
    return (builder: Builder) => {
        builder
            .storeUint(outActionSetIsPublicKeyEnabledTag, 8)
            .storeUint(action.isEnabled ? 1 : 0, 1);
    };
}

const outActionAddExtensionTag = 0x02;
function storeOutActionAddExtension(action: OutActionAddExtension) {
    return (builder: Builder) => {
        builder
            .storeUint(outActionAddExtensionTag, 8)
            .storeAddress(action.address);
    };
}

const outActionRemoveExtensionTag = 0x03;
function storeOutActionRemoveExtension(action: OutActionRemoveExtension) {
    return (builder: Builder) => {
        builder
            .storeUint(outActionRemoveExtensionTag, 8)
            .storeAddress(action.address);
    };
}

export function storeOutActionExtendedV5R1(action: OutActionExtended) {
    switch (action.type) {
        case "setIsPublicKeyEnabled":
            return storeOutActionSetIsPublicKeyEnabled(action);
        case "addExtension":
            return storeOutActionAddExtension(action);
        case "removeExtension":
            return storeOutActionRemoveExtension(action);
        default:
            throw new Error(
                "Unknown action type" + (action as OutActionExtended)?.type,
            );
    }
}

export function loadOutActionExtendedV5R1(slice: Slice): OutActionExtended {
    const tag = slice.loadUint(8);

    switch (tag) {
        case outActionSetIsPublicKeyEnabledTag:
            return {
                type: "setIsPublicKeyEnabled",
                isEnabled: !!slice.loadUint(1),
            };
        case outActionAddExtensionTag:
            return {
                type: "addExtension",
                address: slice.loadAddress(),
            };
        case outActionRemoveExtensionTag:
            return {
                type: "removeExtension",
                address: slice.loadAddress(),
            };
        default:
            throw new Error(
                `Unknown extended out action tag 0x${tag.toString(16)}`,
            );
    }
}

export function storeOutListExtendedV5R1(
    actions: (OutActionExtended | OutActionSendMsg)[],
) {
    const extendedActions = actions.filter(isOutActionExtended);
    const basicActions = actions.filter(isOutActionBasic);

    return (builder: Builder) => {
        const outListPacked = basicActions.length
            ? beginCell().store(storeOutList(basicActions))
            : null;
        builder.storeMaybeRef(outListPacked);

        if (extendedActions.length === 0) {
            builder.storeUint(0, 1);
        } else {
            const [first, ...rest] = extendedActions;
            builder.storeUint(1, 1).store(storeOutActionExtendedV5R1(first));
            if (rest.length > 0) {
                builder.storeRef(packExtendedActionsRec(rest));
            }
        }
    };
}

function packExtendedActionsRec(extendedActions: OutActionExtended[]): Cell {
    const [first, ...rest] = extendedActions;
    let builder = beginCell().store(storeOutActionExtendedV5R1(first));
    if (rest.length > 0) {
        builder = builder.storeRef(packExtendedActionsRec(rest));
    }
    return builder.endCell();
}

export function loadOutListExtendedV5R1(
    slice: Slice,
): (OutActionExtended | OutActionSendMsg)[] {
    const actions: (OutActionExtended | OutActionSendMsg)[] = [];
    const outListPacked = slice.loadMaybeRef();
    if (outListPacked) {
        const loadedActions = loadOutList(outListPacked.beginParse());
        if (loadedActions.some((a) => a.type !== "sendMsg")) {
            throw new Error(
                "Can't deserialize actions list: only sendMsg actions are allowed for wallet v5r1",
            );
        }

        actions.push(...(loadedActions as OutActionSendMsg[]));
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
 * Safety rules -- actions of external messages must have +2 in the SendMode. Internal messages actions may have arbitrary SendMode.
 */
export function toSafeV5R1SendMode(
    sendMode: SendMode,
    authType: WalletV5R1SendArgs["authType"],
) {
    if (authType === "internal" || authType === "extension") {
        return sendMode;
    }

    return sendMode | SendMode.IGNORE_ERRORS;
}

export function patchV5R1ActionsSendMode(
    actions: OutActionWalletV5[],
    authType: WalletV5R1SendArgs["authType"],
): OutActionWalletV5[] {
    return actions.map((action) =>
        action.type === "sendMsg"
            ? {
                  ...action,
                  mode: toSafeV5R1SendMode(action.mode, authType),
              }
            : action,
    );
}
