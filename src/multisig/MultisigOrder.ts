/* Made by @Gusarich and @Miandic */

import { sign, signVerify } from '@ton/crypto';
import { beginCell, Cell } from '@ton/core';
import { MultisigWallet } from './MultisigWallet';

export class MultisigOrder {
    public readonly payload: Cell;
    public signatures: { [key: number]: Buffer } = {};

    private constructor(payload: Cell) {
        this.payload = payload;
    }

    public static fromCell(cell: Cell): MultisigOrder {
        let s = cell.beginParse();
        let signatures = s.loadMaybeRef()?.beginParse();
        const messagesCell = s.asCell();

        let order = new MultisigOrder(messagesCell);

        if (signatures) {
            while (signatures.remainingBits > 0) {
                const signature = signatures.loadBuffer(64);
                const ownerId = signatures.loadUint(8);
                order.signatures[ownerId] = signature;
                if (signatures.remainingRefs > 0) {
                    signatures = signatures.loadRef().asSlice();
                } else {
                    signatures.skip(1);
                }
            }
            signatures.endParse();
        }

        return order;
    }

    public static fromPayload(payload: Cell): MultisigOrder {
        return new MultisigOrder(payload);
    }

    public addSignature(
        ownerId: number,
        signature: Buffer,
        multisig: MultisigWallet
    ) {
        const signingHash = this.payload.hash();
        if (
            !signVerify(
                signingHash,
                signature,
                multisig.owners.get(ownerId)!.slice(0, -1)
            )
        ) {
            throw Error('invalid signature');
        }
        this.signatures[ownerId] = signature;
    }

    public sign(ownerId: number, secretKey: Buffer) {
        const signingHash = this.payload.hash();
        this.signatures[ownerId] = sign(signingHash, secretKey);
        return signingHash;
    }

    public unionSignatures(other: MultisigOrder) {
        this.signatures = Object.assign({}, this.signatures, other.signatures);
    }

    public clearSignatures() {
        this.signatures = {};
    }

    public toCell(ownerId: number): Cell {
        let b = beginCell().storeBit(0);

        for (const ownerId in this.signatures) {
            const signature = this.signatures[ownerId];

            if (typeof signature === 'undefined') {
                continue;
            }

            b = beginCell()
                .storeBit(1)
                .storeRef(
                    beginCell()
                        .storeBuffer(signature)
                        .storeUint(parseInt(ownerId), 8)
                        .storeBuilder(b)
                        .endCell()
                );
        }

        return beginCell()
            .storeUint(ownerId, 8)
            .storeBuilder(b)
            .storeBuilder(this.payload.asBuilder())
            .endCell();
    }
}
