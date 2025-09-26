import { Maybe } from "../../utils/maybe";
import {
    Address,
    beginCell,
    Builder,
    Cell,
    MessageRelaxed,
    SendMode,
    StateInit, storeMessageRelaxed,
    storeStateInit
} from "@ton/core";
import { SendArgsSignable, SendArgsSigned } from "../signing/singer";

export type WalletV4ExtendedSendArgs = {
    seqno: number,
    timeout?: Maybe<number>,
}

export type OutActionWalletV4 =
    {
        type: 'sendMsg',
        messages: MessageRelaxed[]
        sendMode?: Maybe<SendMode>,
    } | {
        type: 'addAndDeployPlugin',
        workchain: number,
        stateInit: StateInit,
        body: Cell,
        forwardAmount: bigint
    } | {
        type: 'addPlugin',
        address: Address,
        forwardAmount: bigint,
        queryId?: bigint,
    } | {
        type: 'removePlugin',
        address: Address,
        forwardAmount: bigint,
        queryId?: bigint,
    };

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