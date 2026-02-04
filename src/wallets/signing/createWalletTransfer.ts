/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
    beginCell,
    Builder,
    Cell,
    domainSign,
    MessageRelaxed,
    OutActionSendMsg,
    SignatureDomain,
    storeMessageRelaxed,
    storeStateInit,
} from "@ton/core";
import { Maybe } from "../../utils/maybe";
import {
    WalletV5BetaSendArgsSignable,
    WalletContractV5Beta,
    WalletV5BetaPackedCell,
    WalletV5BetaSendArgs,
    WalletV5BetaSendArgsExtensionAuth,
} from "../v5beta/WalletContractV5Beta";
import { storeOutListExtendedV5Beta } from "../v5beta/WalletV5BetaActions";
import { signPayload } from "./singer";
import {
    WalletV3SendArgsSignable,
    WalletV3SendArgsSigned,
} from "../WalletContractV3Types";
import { OutActionExtended } from "../v5beta/WalletV5OutActions";
import {
    Wallet5VR1SendArgsExtensionAuth,
    WalletV5R1SendArgsSignable,
    WalletContractV5R1,
    WalletV5R1PackedCell,
    WalletV5R1SendArgs,
} from "../v5r1/WalletContractV5R1";
import {
    patchV5R1ActionsSendMode,
    storeOutListExtendedV5R1,
} from "../v5r1/WalletV5R1Actions";
import {
    OutActionWalletV4,
    storeExtendedAction,
    WalletV4SendArgs,
    WalletV4SendArgsSignable,
    WalletV4SendArgsSigned,
} from "../v4/WalletContractV4Actions";

function packSignatureToFront(
    signature: Buffer,
    signingMessage: Builder,
): Cell {
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

export function createWalletTransferV1(args: {
    seqno: number;
    sendMode: number;
    message: Maybe<MessageRelaxed>;
    secretKey: Buffer;
    domain?: SignatureDomain;
}) {
    // Create message
    let signingMessage = beginCell().storeUint(args.seqno, 32);
    if (args.message) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(
            beginCell().store(storeMessageRelaxed(args.message)),
        );
    }

    // Sign message
    let signature = domainSign({
        data: signingMessage.endCell().hash(),
        secretKey: args.secretKey,
        domain: args.domain,
    });

    // Body
    const body = beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
        .endCell();

    return body;
}

export function createWalletTransferV2(args: {
    seqno: number;
    sendMode: number;
    messages: MessageRelaxed[];
    secretKey: Buffer;
    timeout?: Maybe<number>;
    domain?: SignatureDomain;
}) {
    // Check number of messages
    if (args.messages.length > 4) {
        throw Error("Maximum number of messages in a single transfer is 4");
    }

    // Create message
    let signingMessage = beginCell().storeUint(args.seqno, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(
            args.timeout || Math.floor(Date.now() / 1e3) + 60,
            32,
        ); // Default timeout: 60 seconds
    }
    for (let m of args.messages) {
        signingMessage.storeUint(args.sendMode, 8);
        signingMessage.storeRef(beginCell().store(storeMessageRelaxed(m)));
    }

    // Sign message
    let signature = domainSign({
        data: signingMessage.endCell().hash(),
        secretKey: args.secretKey,
        domain: args.domain,
    });

    // Body
    const body = beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
        .endCell();

    return body;
}

export function createWalletTransferV3<
    T extends WalletV3SendArgsSignable | WalletV3SendArgsSigned,
>(args: T & { sendMode: number; walletId: number; domain?: SignatureDomain }) {
    // Check number of messages
    if (args.messages.length > 4) {
        throw Error("Maximum number of messages in a single transfer is 4");
    }

    // Create message to sign
    let signingMessage = beginCell().storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(
            args.timeout || Math.floor(Date.now() / 1e3) + 60,
            32,
        ); // Default timeout: 60 seconds
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
    ) as T extends WalletV3SendArgsSignable ? Promise<Cell> : Cell;
}

export function createWalletTransferV4<
    T extends WalletV4SendArgs & { action: OutActionWalletV4 },
>(args: T & { walletId: number; domain?: SignatureDomain }) {
    let signingMessage = beginCell().storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(
            args.timeout || Math.floor(Date.now() / 1e3) + 60,
            32,
        ); // Default timeout: 60 seconds
    }
    signingMessage.storeUint(args.seqno, 32);
    signingMessage.store(storeExtendedAction(args.action));

    return signPayload(
        args,
        signingMessage,
        packSignatureToFront,
    ) as T extends WalletV4SendArgsSignable ? Promise<Cell> : Cell;
}

export function createWalletTransferV5Beta<T extends WalletV5BetaSendArgs>(
    args: (T extends WalletV5BetaSendArgsExtensionAuth
        ? T & { actions: (OutActionSendMsg | OutActionExtended)[] }
        : T & {
              actions: (OutActionSendMsg | OutActionExtended)[];
              walletId: (builder: Builder) => void;
          }) & { domain?: SignatureDomain },
): WalletV5BetaPackedCell<T> {
    // Check number of actions
    if (args.actions.length > 255) {
        throw Error("Maximum number of OutActions in a single request is 255");
    }

    if (args.authType === "extension") {
        return beginCell()
            .storeUint(WalletContractV5Beta.OpCodes.auth_extension, 32)
            .store(storeOutListExtendedV5Beta(args.actions))
            .endCell() as WalletV5BetaPackedCell<T>;
    }

    const signingMessage = beginCell()
        .storeUint(
            args.authType === "internal"
                ? WalletContractV5Beta.OpCodes.auth_signed_internal
                : WalletContractV5Beta.OpCodes.auth_signed_external,
            32,
        )
        .store(args.walletId);

    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(
            args.timeout || Math.floor(Date.now() / 1e3) + 60,
            32,
        ); // Default timeout: 60 seconds
    }

    signingMessage
        .storeUint(args.seqno, 32)
        .store(storeOutListExtendedV5Beta(args.actions));

    return signPayload(
        args,
        signingMessage,
        packSignatureToTail,
    ) as T extends WalletV5BetaSendArgsSignable ? Promise<Cell> : Cell;
}

export function createWalletTransferV5R1<T extends WalletV5R1SendArgs>(
    args: (T extends Wallet5VR1SendArgsExtensionAuth
        ? T & { actions: (OutActionSendMsg | OutActionExtended)[] }
        : T & {
              actions: (OutActionSendMsg | OutActionExtended)[];
              walletId: (builder: Builder) => void;
          }) & { domain?: SignatureDomain },
): WalletV5R1PackedCell<T> {
    // Check number of actions
    if (args.actions.length > 255) {
        throw Error("Maximum number of OutActions in a single request is 255");
    }
    args = { ...args };

    if (args.authType === "extension") {
        return beginCell()
            .storeUint(WalletContractV5R1.OpCodes.auth_extension, 32)
            .storeUint(args.queryId ?? 0, 64)
            .store(storeOutListExtendedV5R1(args.actions))
            .endCell() as WalletV5R1PackedCell<T>;
    }

    args.actions = patchV5R1ActionsSendMode(args.actions, args.authType);

    const signingMessage = beginCell()
        .storeUint(
            args.authType === "internal"
                ? WalletContractV5R1.OpCodes.auth_signed_internal
                : WalletContractV5R1.OpCodes.auth_signed_external,
            32,
        )
        .store(args.walletId);

    if (args.seqno === 0) {
        for (let i = 0; i < 32; i++) {
            signingMessage.storeBit(1);
        }
    } else {
        signingMessage.storeUint(
            args.timeout || Math.floor(Date.now() / 1e3) + 60,
            32,
        ); // Default timeout: 60 seconds
    }

    signingMessage
        .storeUint(args.seqno, 32)
        .store(storeOutListExtendedV5R1(args.actions));

    return signPayload(
        args,
        signingMessage,
        packSignatureToTail,
    ) as T extends WalletV5R1SendArgsSignable ? Promise<Cell> : Cell;
}
