import { MessageRelaxed, SendMode } from "@ton/core";
import { Maybe } from "../utils/maybe";
import { SendArgsSignable } from "./signing/singer";
import {SendArgsSigned} from "./signing/singer";


export type WalletV3BasicSendArgs = {
    seqno: number,
    messages: MessageRelaxed[]
    sendMode?: Maybe<SendMode>,
    timeout?: Maybe<number>,
}

export type WalletV3SendArgsSigned = WalletV3BasicSendArgs & SendArgsSigned;
export type WalletV3SendArgsSignable = WalletV3BasicSendArgs & SendArgsSignable;
