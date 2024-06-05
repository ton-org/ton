import { MessageRelaxed, SendMode } from "@ton/core";
import { Maybe } from "../utils/maybe";
import { SingedAuthSendArgs, ExternallySingedAuthSendArgs } from "./signing/singer";


export type WalletV3BasicSendArgs = {
    seqno: number,
    messages: MessageRelaxed[]
    sendMode?: Maybe<SendMode>,
    timeout?: Maybe<number>,
}

export type SingedAuthWallet3SendArgs = WalletV3BasicSendArgs & SingedAuthSendArgs;
export type ExternallySingedAuthWallet3SendArgs = WalletV3BasicSendArgs & ExternallySingedAuthSendArgs;
