import { Builder, Cell } from "@ton/core";
import { sign } from "@ton/crypto";

export type SingedAuthSendArgs = {
    secretKey: Buffer;
}

export type ExternallySingedAuthSendArgs = {
    signer: (message: Cell) => Promise<Buffer>;
}

export function signPayload<T extends SingedAuthSendArgs | ExternallySingedAuthSendArgs>(
    args: T,
    signingMessage: Builder,
    packMessage: (signature: Buffer, signingMessage: Builder) => Cell
): T extends ExternallySingedAuthSendArgs ? Promise<Cell> : Cell {

    if ('secretKey' in args) {
        /**
         * Client provider an secretKey to sign transaction.
         */
        return packMessage(
            sign(signingMessage.endCell().hash(), args.secretKey),
            signingMessage
        ) as T extends ExternallySingedAuthSendArgs ? Promise<Cell> : Cell;
    }
    else {
        /**
         * Client use external storage for secretKey.
         * In this case lib could create a request to external resource to sign transaction.
         */
        return args.signer(signingMessage.endCell())
            .then(signature => packMessage(signature, signingMessage)) as T extends ExternallySingedAuthSendArgs ? Promise<Cell> : Cell;
    }
}
