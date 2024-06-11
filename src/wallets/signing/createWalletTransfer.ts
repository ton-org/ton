/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beginCell, Builder, Cell, MessageRelaxed, OutActionSendMsg, storeMessageRelaxed } from "@ton/core";
import { sign } from "@ton/crypto";
import { Maybe } from "../../utils/maybe";
import {
    ExternallySingedAuthWallet5SendArgs,
    SingedAuthWallet5SendArgs,
    WalletV5BasicSendArgs,
    WalletContractV5
} from "../WalletContractV5";
import {
    OutActionExtended,
    storeOutListExtended
} from "../WalletV5Utils";
import { signPayload } from "./singer";
import { ExternallySingedAuthWallet4SendArgs, SingedAuthWallet4SendArgs } from "../WalletContractV4";
import { ExternallySingedAuthWallet3SendArgs, SingedAuthWallet3SendArgs } from "../WalletContractV3";


function packSignatureToFront(signature: Buffer, signingMessage: Builder): Cell {
    const body = beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
        .endCell();

    return body;
}

function packSignatureToTail(signature: Buffer, signingMessage: Builder): Cell {
    const body = beginCell()
        .storeBuilder(signingMessage)
        .storeBuffer(signature)
        .endCell();

    return body;
}

export function createWalletTransferV1(args: { seqno: number, sendMode: number, message: Maybe<MessageRelaxed>, secretKey: Buffer }) {

    // Create message
    let signingMessage = beginCell()
        .storeUint(args.seqno, 32);
    if (args.message) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(beginCell().store(storeMessageRelaxed(args.message)));
    }

    // Sign message
    let signature = sign(signingMessage.endCell().hash(), args.secretKey);

    // Body
    const body = beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
        .endCell();

    return body;
}

export function createWalletTransferV2(args: { seqno: number, sendMode: number, messages: MessageRelaxed[], secretKey: Buffer, timeout?: Maybe<number> }) {

    // Check number of messages
    if (args.messages.length > 4) {
        throw Error("Maximum number of messages in a single transfer is 4");
    }

    // Create message
    let signingMessage = beginCell()
        .storeUint(args.seqno, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }
    for (let m of args.messages) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(beginCell().store(storeMessageRelaxed(m)));
    }

    // Sign message
    let signature = sign(signingMessage.endCell().hash(), args.secretKey);

    // Body
    const body = beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
        .endCell();

    return body;
}

export function createWalletTransferV3<T extends ExternallySingedAuthWallet3SendArgs | SingedAuthWallet3SendArgs>(
    args: T & { sendMode: number, walletId: number }
) {

    // Check number of messages
    if (args.messages.length > 4) {
        throw Error("Maximum number of messages in a single transfer is 4");
    }

    // Create message to sign
    let signingMessage = beginCell()
        .storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }
    signingMessage.storeUint(args.seqno, 32);
    for (let m of args.messages) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(beginCell().store(storeMessageRelaxed(m)));
    }

    return signPayload(
        args,
        signingMessage,
        packSignatureToFront,
    ) as T extends ExternallySingedAuthWallet3SendArgs ? Promise<Cell> : Cell;
}

export function createWalletTransferV4<T extends ExternallySingedAuthWallet4SendArgs | SingedAuthWallet4SendArgs>(
    args: T & { sendMode: number, walletId: number }
) {

    // Check number of messages
    if (args.messages.length > 4) {
        throw Error("Maximum number of messages in a single transfer is 4");
    }

    let signingMessage = beginCell()
        .storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }
    signingMessage.storeUint(args.seqno, 32);
    signingMessage.storeUint(0, 8); // Simple order
    for (let m of args.messages) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(beginCell().store(storeMessageRelaxed(m)));
    }

    return signPayload(
        args,
        signingMessage,
        packSignatureToFront,
    ) as T extends ExternallySingedAuthWallet4SendArgs ? Promise<Cell> : Cell;
}

export function createWalletTransferV5ExtensionAuth(args: WalletV5BasicSendArgs & { actions: (OutActionSendMsg | OutActionExtended)[], walletId: (builder: Builder) => void }) {
    // Check number of actions
    if (args.actions.length > 255) {
        throw Error("Maximum number of OutActions in a single request is 255");
    }

    return beginCell()
        .storeUint(WalletContractV5.OpCodes.auth_extension, 32)
        .store(storeOutListExtended(args.actions))
        .endCell();
}

export function createWalletTransferV5SignedAuth<T extends ExternallySingedAuthWallet5SendArgs | SingedAuthWallet5SendArgs>
(args: T & { actions: (OutActionSendMsg | OutActionExtended)[], walletId: (builder: Builder) => void }): T extends ExternallySingedAuthWallet5SendArgs ? Promise<Cell> : Cell {
    // Check number of actions
    if (args.actions.length > 255) {
        throw Error("Maximum number of OutActions in a single request is 255");
    }

    const signingMessage = beginCell()
        .storeUint(args.authType === 'internal'
            ? WalletContractV5.OpCodes.auth_signed_internal
            : WalletContractV5.OpCodes.auth_signed_external, 32)
        .store(args.walletId);

    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }

    signingMessage
        .storeUint(args.seqno, 32)
        .store(storeOutListExtended(args.actions));

    return signPayload(
        args,
        signingMessage,
        packSignatureToTail,
    ) as T extends ExternallySingedAuthWallet5SendArgs ? Promise<Cell> : Cell;
}
