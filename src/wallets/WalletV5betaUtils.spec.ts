import {
    beginCell,
    SendMode,
    storeMessageRelaxed,
    Address,
    OutAction,
    MessageRelaxed, OutActionSendMsg
} from "@ton/core";
import {
    loadOutListExtendedV5Beta, loadWalletIdV5Beta,
    storeOutActionExtendedV5Beta,
    storeOutListExtendedV5Beta, storeWalletIdV5Beta, WalletIdV5Beta,
} from "./WalletV5betaUtils";
import {OutActionExtended} from "./WalletV5Utils";

const mockMessageRelaxed1: MessageRelaxed = {
    info: {
        type: 'external-out',
        createdLt: 0n,
        createdAt: 0,
        dest: null,
        src: null
    },
    body: beginCell().storeUint(0,8).endCell(),
    init: null
}
const mockData = beginCell().storeUint(123, 32).endCell();
const mockAddress = Address.parseRaw('0:' + '1'.repeat(64))

describe('Wallet V5Beta utils', () => {
    const outActionSetIsPublicKeyEnabledTag = 0x20cbb95a;
    const outActionAddExtensionTag = 0x1c40db9f;
    const outActionRemoveExtensionTag = 0x5eaef4a4;
    const outActionSendMsgTag = 0x0ec3c86d;

    it('Should serialise setIsPublicKeyEnabled action with true flag', () => {
        const action = storeOutActionExtendedV5Beta({
            type: 'setIsPublicKeyEnabled',
            isEnabled: true
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionSetIsPublicKeyEnabledTag, 32)
            .storeBit(1)
        .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise setIsPublicKeyEnabled action with false flag', () => {
        const action = storeOutActionExtendedV5Beta({
            type: 'setIsPublicKeyEnabled',
            isEnabled: false
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionSetIsPublicKeyEnabledTag, 32)
            .storeBit(0)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise add extension action', () => {
        const action = storeOutActionExtendedV5Beta({
            type: 'addExtension',
            address: mockAddress
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionAddExtensionTag, 32)
            .storeAddress(mockAddress)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise remove extension action', () => {
        const action = storeOutActionExtendedV5Beta({
            type: 'removeExtension',
            address: mockAddress
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionRemoveExtensionTag, 32)
            .storeAddress(mockAddress)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

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

    it('Should serialize extended out list', () => {
        const sendMode1 = SendMode.PAY_GAS_SEPARATELY;
        const isPublicKeyEnabled = false;

        const actions: (OutActionExtended | OutActionSendMsg)[] = [
            {
                type: 'addExtension',
                address: mockAddress
            },
            {
                type: 'setIsPublicKeyEnabled',
                isEnabled: isPublicKeyEnabled
            },
            {
                type: 'sendMsg',
                mode: sendMode1,
                outMsg: mockMessageRelaxed1
            }
        ]

        const actual = beginCell().store(storeOutListExtendedV5Beta(actions)).endCell();

        const expected =
            beginCell()
                .storeUint(1, 1)
                .storeUint(outActionAddExtensionTag, 32)
                .storeAddress(mockAddress)
                .storeRef(
                    beginCell()
                        .storeUint(1, 1)
                        .storeUint(outActionSetIsPublicKeyEnabledTag, 32)
                        .storeBit(isPublicKeyEnabled ? 1 : 0)
                        .storeRef(
                            beginCell()
                                .storeUint(0, 1)
                                .storeRef(
                                    beginCell()
                                        .storeRef(beginCell().endCell())
                                        .storeUint(outActionSendMsgTag, 32)
                                        .storeUint(sendMode1, 8)
                                        .storeRef(beginCell().store(storeMessageRelaxed(mockMessageRelaxed1)).endCell())
                                        .endCell()
                                )
                                .endCell()
                        )
                        .endCell()
                )
                .endCell()



        expect(actual.equals(expected)).toBeTruthy();
    });

    it('Should deserialize extended out list', () => {
        const sendMode1 = SendMode.PAY_GAS_SEPARATELY;
        const isPublicKeyEnabled = true;

        const expected: (OutActionExtended | OutAction)[] = [
            {
                type: 'addExtension',
                address: mockAddress
            },
            {
                type: 'setIsPublicKeyEnabled',
                isEnabled: isPublicKeyEnabled
            },
            {
                type: 'sendMsg',
                mode: sendMode1,
                outMsg: mockMessageRelaxed1
            }
        ]

        const serialized =
            beginCell()
                .storeUint(1, 1)
                .storeUint(outActionAddExtensionTag, 32)
                .storeAddress(mockAddress)
                .storeRef(
                    beginCell()
                        .storeUint(1, 1)
                        .storeUint(outActionSetIsPublicKeyEnabledTag, 32)
                        .storeBit(isPublicKeyEnabled ? 1 : 0)
                        .storeRef(
                            beginCell()
                                .storeUint(0, 1)
                                .storeRef(
                                    beginCell()
                                        .storeRef(beginCell().endCell())
                                        .storeUint(outActionSendMsgTag, 32)
                                        .storeUint(sendMode1, 8)
                                        .storeRef(beginCell().store(storeMessageRelaxed(mockMessageRelaxed1)).endCell())
                                        .endCell()
                                )
                                .endCell()
                        )
                        .endCell()
                )
                .endCell()

        const actual = loadOutListExtendedV5Beta(serialized.beginParse())

        expect(expected.length).toEqual(actual.length);
        expected.forEach((item1, index) => {
            const item2 = actual[index];
            expect(item1.type).toEqual(item2.type);

            if (item1.type === 'sendMsg' && item2.type === 'sendMsg') {
                expect(item1.mode).toEqual(item2.mode);
                expect(item1.outMsg.body.equals(item2.outMsg.body)).toBeTruthy();
                expect(item1.outMsg.info).toEqual(item2.outMsg.info);
                expect(item1.outMsg.init).toEqual(item2.outMsg.init);
            }

            if (item1.type === 'addExtension' && item2.type === 'addExtension') {
                expect(item1.address.equals(item2.address)).toBeTruthy();
            }

            if (item1.type === 'setIsPublicKeyEnabled' && item2.type === 'setIsPublicKeyEnabled') {
                expect(item1.isEnabled).toEqual(item2.isEnabled);
            }
        })
    });
})
