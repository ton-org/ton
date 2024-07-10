import {beginCell} from "@ton/core";
import {
    loadWalletIdV5Beta,
    storeWalletIdV5Beta,
    WalletIdV5Beta
} from "./WalletV5BetaWalletId";

describe('Wallet V5Beta wallet id', () => {
    it('Should serialise wallet id', () => {
        const walletId: WalletIdV5Beta = {
            walletVersion: 'v5',
            networkGlobalId: -239,
            workChain: 0,
            subwalletNumber: 0
        }

        const actual = beginCell().store(storeWalletIdV5Beta(walletId)).endCell();

        const expected = beginCell()
            .storeInt(walletId.networkGlobalId, 32)
            .storeInt(walletId.workChain, 8)
            .storeUint(0, 8)
            .storeUint(walletId.subwalletNumber, 32)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should deserialise wallet id', () => {
        const expected: WalletIdV5Beta = {
            walletVersion: 'v5',
            networkGlobalId: -239,
            workChain: 0,
            subwalletNumber: 0
        }

        const actual = loadWalletIdV5Beta(beginCell()
            .storeInt(expected.networkGlobalId, 32)
            .storeInt(expected.workChain, 8)
            .storeUint(0, 8)
            .storeUint(expected.subwalletNumber, 32)
            .endCell().beginParse());


        expect(expected).toEqual(actual);
    });

    it('Should serialise wallet id', () => {
        const walletId: WalletIdV5Beta = {
            walletVersion: 'v5',
            networkGlobalId: -3,
            workChain: -1,
            subwalletNumber: 1234
        }

        const actual = beginCell().store(storeWalletIdV5Beta(walletId)).endCell();

        const expected = beginCell()
            .storeInt(walletId.networkGlobalId, 32)
            .storeInt(walletId.workChain, 8)
            .storeUint(0, 8)
            .storeUint(walletId.subwalletNumber, 32)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should deserialise wallet id', () => {
        const expected: WalletIdV5Beta = {
            walletVersion: 'v5',
            networkGlobalId: -239,
            workChain: -1,
            subwalletNumber: 1
        }

        const actual = loadWalletIdV5Beta(beginCell()
            .storeInt(expected.networkGlobalId, 32)
            .storeInt(expected.workChain, 8)
            .storeUint(0, 8)
            .storeUint(expected.subwalletNumber, 32)
            .endCell().beginParse());


        expect(expected).toEqual(actual);
    });
})
