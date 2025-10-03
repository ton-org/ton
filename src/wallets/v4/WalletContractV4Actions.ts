import { Maybe } from "../../utils/maybe";
import {
    Address,
    beginCell,
    Builder,
    Cell,
    MessageRelaxed,
    SendMode,
    StateInit,
    loadMessageRelaxed,
    loadStateInit,
    storeMessageRelaxed,
    storeStateInit, Slice
} from "@ton/core";
import { SendArgsSignable, SendArgsSigned } from "../signing/singer";

export type WalletV4ExtendedSendArgs = {
    seqno: number,
    timeout?: Maybe<number>,
}

export interface OutActionSendMsg {
    type: 'sendMsg',
    messages: MessageRelaxed[]
    sendMode?: Maybe<SendMode>,
}

export interface OutActionAddAndDeployPlugin {
    type: 'addAndDeployPlugin',
    workchain: number,
    stateInit: StateInit,
    body: Cell,
    forwardAmount: bigint
}

export interface OutActionAddPlugin {
    type: 'addPlugin',
    address: Address,
    forwardAmount: bigint,
    queryId?: bigint,
}

export interface OutActionRemovePlugin {
    type: 'removePlugin',
    address: Address,
    forwardAmount: bigint,
    queryId?: bigint,
}

export type OutActionWalletV4 =
    | OutActionSendMsg
    | OutActionAddAndDeployPlugin
    | OutActionAddPlugin
    | OutActionRemovePlugin;

export type WalletV4SendArgsSigned = WalletV4ExtendedSendArgs & SendArgsSigned;
export type WalletV4SendArgsSignable = WalletV4ExtendedSendArgs & SendArgsSignable;
export type WalletV4SendArgs = WalletV4SendArgsSigned | WalletV4SendArgsSignable;

export function storeExtendedAction(action: OutActionWalletV4) {
    return (builder: Builder) => {
        switch (action.type) {
            case 'sendMsg':
                builder.storeUint(0, 8);
                for (let m of action.messages) {
                    builder.storeUint(action.sendMode ?? SendMode.NONE, 8);
                    builder.storeRef(beginCell().store(storeMessageRelaxed(m)));
                }
                break;
            case 'addAndDeployPlugin':
                builder.storeUint(1, 8);
                builder.storeInt(action.workchain, 8);
                builder.storeCoins(action.forwardAmount);
                builder.storeRef(beginCell().store(storeStateInit(action.stateInit)));
                builder.storeRef(action.body);
                break;
            case 'addPlugin':
                builder.storeUint(2, 8);
                builder.storeInt(action.address.workChain, 8);
                builder.storeBuffer(action.address.hash);
                builder.storeCoins(action.forwardAmount);
                builder.storeUint(action.queryId ?? 0n, 64);
                break;
            case 'removePlugin':
                builder.storeUint(3, 8);
                builder.storeInt(action.address.workChain, 8);
                builder.storeBuffer(action.address.hash);
                builder.storeCoins(action.forwardAmount);
                builder.storeUint(action.queryId ?? 0n, 64);
                break;
            default:
                throw new Error(`Unsupported plugin action`);
        }
    }
}

export function loadExtendedAction(slice: Slice): OutActionWalletV4 {
    const actionType = slice.loadUint(8);
    switch (actionType) {
        case 0: {
            const messages: MessageRelaxed[] = [];
            let sendModeValue: SendMode | undefined = undefined;

            while (slice.remainingRefs > 0) {
                if (slice.remainingBits < 8) {
                    throw new Error('Invalid sendMsg action: insufficient bits for send mode');
                }

                const mode = slice.loadUint(8) as SendMode;
                const messageCell = slice.loadRef();
                const message = loadMessageRelaxed(messageCell.beginParse());

                if (sendModeValue === undefined) {
                    sendModeValue = mode;
                } else if (sendModeValue !== mode) {
                    throw new Error('Invalid sendMsg action: mixed send modes are not supported');
                }

                messages.push(message);
            }

            return {
                type: 'sendMsg',
                messages,
                sendMode: sendModeValue,
            };
        }

        case 1: {
            const workchain = slice.loadInt(8);
            const forwardAmount = slice.loadCoins();
            const stateInit = loadStateInit(slice.loadRef().beginParse());
            const body = slice.loadRef();

            return {
                type: 'addAndDeployPlugin',
                workchain,
                stateInit,
                body,
                forwardAmount,
            };
        }

        case 2: {
            const workchain = slice.loadInt(8);
            const hash = slice.loadBuffer(32);
            const forwardAmount = slice.loadCoins();
            const queryId = slice.loadUintBig(64);

            return {
                type: 'addPlugin',
                address: new Address(workchain, hash),
                forwardAmount,
                queryId: queryId === 0n ? undefined : queryId,
            };
        }

        case 3: {
            const workchain = slice.loadInt(8);
            const hash = slice.loadBuffer(32);
            const forwardAmount = slice.loadCoins();
            const queryId = slice.loadUintBig(64);

            return {
                type: 'removePlugin',
                address: new Address(workchain, hash),
                forwardAmount,
                queryId: queryId === 0n ? undefined : queryId,
            };
        }

        default:
            throw new Error(`Unsupported action with opcode ${actionType}`);
    }
}
