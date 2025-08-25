import {beginCell} from "@ton/core";
import {
    loadWalletIdV5R1,
    storeWalletIdV5R1,
    WalletIdV5R1,
    WalletIdV5R1ClientContext,
    WalletIdV5R1CustomContext
} from "./WalletV5R1WalletId";

describe('Wallet V5R1 wallet id', () => {
    it('Should serialise wallet id', () => {
        const walletId: WalletIdV5R1<WalletIdV5R1ClientContext> = {
            networkGlobalId: -239,
            context: {
                walletVersion: 'v5r1',
                workchain: 0,
                subwalletNumber: 0
            }
        }

        const actual = beginCell().store(storeWalletIdV5R1(walletId)).endCell();

        const context = beginCell()
            .storeUint(1, 1)
            .storeInt(walletId.context.workchain, 8)
            .storeUint(0, 8)
            .storeUint(walletId.context.subwalletNumber, 15)
            .endCell().beginParse().loadInt(32);

        const expected = beginCell().storeInt(BigInt(context) ^ BigInt(walletId.networkGlobalId), 32).endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should deserialise wallet id', () => {
        const expected: WalletIdV5R1<WalletIdV5R1ClientContext> = {
            networkGlobalId: -239,
            context: {
                walletVersion: 'v5r1',
                workchain: 0,
                subwalletNumber: 0
            }
        }

        const context = beginCell()
            .storeUint(1, 1)
            .storeInt(expected.context.workchain, 8)
            .storeUint(0, 8)
            .storeUint(expected.context.subwalletNumber, 15)
            .endCell().beginParse().loadInt(32);

        const actual = loadWalletIdV5R1(beginCell().storeInt(BigInt(context) ^ BigInt(expected.networkGlobalId), 32).endCell().beginParse(), expected.networkGlobalId);


        expect(expected).toEqual(actual);
    });
    it('Should deserialize correctly in all modes', async () => {
        const getRandom = (min:number, max:number) => {
            return Math.round(Math.random() * (max - min) + min);
        }

        const subwalletMax = (2 ** 15) - 1;
        const randomSubwallet = () => getRandom(1, subwalletMax - 2);
        const randomBunch = Array(10).fill(0).map(randomSubwallet);

        for(let networkId of [-239, -3]) {
            for(let testWc of [0, -1]) {
                for(let testSubwallet of [0, subwalletMax, ...randomBunch]) {
                    const expected: WalletIdV5R1<WalletIdV5R1ClientContext> = {
                        networkGlobalId: networkId,
                        context: {
                            walletVersion: 'v5r1',
                            workchain: testWc,
                            subwalletNumber: testSubwallet
                        }
                    }
                    const packed = beginCell().store(storeWalletIdV5R1(expected)).endCell();

                    let unpacked = loadWalletIdV5R1(packed.beginParse(), networkId);
                    expect(unpacked).toEqual(expected);

                    const intVal = BigInt(packed.beginParse().loadInt(32));
                    unpacked     = loadWalletIdV5R1(intVal, networkId);
                    expect(unpacked).toEqual(expected);

                    const buffVal = packed.beginParse().loadBuffer(4);
                    unpacked      = loadWalletIdV5R1(buffVal, networkId);
                    expect(unpacked).toEqual(expected);
                }
            }
        }
    });

    it('Should serialise wallet id', () => {
        const walletId: WalletIdV5R1<WalletIdV5R1CustomContext> = {
            networkGlobalId: -3,
            context: 239239239
        }

        const context = beginCell()
            .storeUint(0, 1)
            .storeUint(walletId.context, 31)
            .endCell().beginParse().loadInt(32);


        const actual = beginCell().store(storeWalletIdV5R1(walletId)).endCell();

        const expected = beginCell()
            .storeInt(BigInt(context) ^ BigInt(walletId.networkGlobalId), 32)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should deserialise wallet id', () => {
        const expected: WalletIdV5R1<WalletIdV5R1CustomContext> = {
            networkGlobalId: -3,
            context: 239239239
        }

        const context = beginCell()
            .storeUint(0, 1)
            .storeUint(expected.context, 31)
            .endCell().beginParse().loadInt(32);

        const actual = loadWalletIdV5R1(beginCell()
            .storeInt(BigInt(context) ^ BigInt(expected.networkGlobalId), 32)
            .endCell().beginParse(), expected.networkGlobalId);


        expect(expected).toEqual(actual);
    });
})
