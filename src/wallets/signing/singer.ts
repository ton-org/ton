import { Builder, Cell, domainSign, SignatureDomain } from "@ton/core";

export type SendArgsSigned = {
    secretKey: Buffer;
    domain?: SignatureDomain;
};

export type SendArgsSignable = {
    signer: (message: Cell) => Promise<Buffer>;
};

export function signPayload<T extends SendArgsSigned | SendArgsSignable>(
    args: T,
    signingMessage: Builder,
    packMessage: (signature: Buffer, signingMessage: Builder) => Cell,
): T extends SendArgsSignable ? Promise<Cell> : Cell {
    if ("secretKey" in args) {
        /**
         * Client provider an secretKey to sign transaction.
         */
        const signature = domainSign({
            data: signingMessage.endCell().hash(),
            secretKey: args.secretKey,
            domain: args.domain,
        });
        return packMessage(
            signature,
            signingMessage,
        ) as T extends SendArgsSignable ? Promise<Cell> : Cell;
    } else {
        /**
         * Client use external storage for secretKey.
         * In this case lib could create a request to external resource to sign transaction.
         */
        return args
            .signer(signingMessage.endCell())
            .then((signature) =>
                packMessage(signature, signingMessage),
            ) as T extends SendArgsSignable ? Promise<Cell> : Cell;
    }
}
