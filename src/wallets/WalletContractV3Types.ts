import { type MessageRelaxed, SendMode } from "@ton/core";
import type { Maybe } from "../utils/maybe";
import type { SendArgsSignable } from "./signing/singer";
import type { SendArgsSigned } from "./signing/singer";


export type WalletV3BasicSendArgs = {
    seqno: number,
    messages: MessageRelaxed[]
    sendMode?: Maybe<SendMode>,
    timeout?: Maybe<number>,
}

export type WalletV3SendArgsSigned = WalletV3BasicSendArgs & SendArgsSigned;
export type WalletV3SendArgsSignable = WalletV3BasicSendArgs & SendArgsSignable;
