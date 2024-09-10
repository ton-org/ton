import {
    beginCell,
    SendMode,
    storeMessageRelaxed,
    Address,
    type MessageRelaxed,
    type OutActionSendMsg,
    type OutAction,
    Cell
} from "@ton/core";
import type {OutActionExtended} from "../v5beta/WalletV5OutActions";
import {
    loadOutListExtendedV5R1,
    storeOutActionExtendedV5R1,
    storeOutListExtendedV5R1,
    toSafeV5R1SendMode,
} from "./WalletV5R1Actions";

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

const mockMessageRelaxed2: MessageRelaxed = {
    info: {
        type: 'internal',
        ihrDisabled: true,
        bounce: false,
        bounced: false,
        dest: Address.parseRaw('0:' + '2'.repeat(64)),
        value: {
            coins: 1n
        },
        ihrFee: 1n,
        forwardFee: 1n,
        createdLt: 12345n,
        createdAt: 123456
    },
    body: beginCell().storeUint(0,8).endCell(),
    init: null
}

const mockAddress = Address.parseRaw('0:' + '1'.repeat(64))

describe('Wallet V5R1 actions', () => {
    const outActionSetIsPublicKeyEnabledTag = 0x04;
    const outActionAddExtensionTag = 0x02;
    const outActionRemoveExtensionTag = 0x03;
    const outActionSendMsgTag = 0x0ec3c86d;

    it('Should serialise setIsPublicKeyEnabled action with true flag', () => {
        const action = storeOutActionExtendedV5R1({
            type: 'setIsPublicKeyEnabled',
            isEnabled: true
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionSetIsPublicKeyEnabledTag, 8)
            .storeBit(1)
        .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise setIsPublicKeyEnabled action with false flag', () => {
        const action = storeOutActionExtendedV5R1({
            type: 'setIsPublicKeyEnabled',
            isEnabled: false
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionSetIsPublicKeyEnabledTag, 8)
            .storeBit(0)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise add extension action', () => {
        const action = storeOutActionExtendedV5R1({
            type: 'addExtension',
            address: mockAddress
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionAddExtensionTag, 8)
            .storeAddress(mockAddress)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
    });

    it('Should serialise remove extension action', () => {
        const action = storeOutActionExtendedV5R1({
            type: 'removeExtension',
            address: mockAddress
        }) ;

        const actual = beginCell().store(action).endCell();

        const expected = beginCell()
            .storeUint(outActionRemoveExtensionTag, 8)
            .storeAddress(mockAddress)
            .endCell();

        expect(expected.equals(actual)).toBeTruthy();
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

        const actual = beginCell().store(storeOutListExtendedV5R1(actions)).endCell();

        const expected =
            beginCell()
                .storeUint(1, 1)
                .storeRef(
                    beginCell()
                        .storeRef(beginCell().endCell())
                        .storeUint(outActionSendMsgTag, 32)
                        .storeUint(sendMode1, 8)
                        .storeRef(beginCell().store(storeMessageRelaxed(mockMessageRelaxed1)).endCell())
                        .endCell()
                )
                .storeUint(1, 1)
                .storeUint(outActionAddExtensionTag, 8)
                .storeAddress(mockAddress)
                .storeRef(
                    beginCell()
                        .storeUint(outActionSetIsPublicKeyEnabledTag, 8)
                        .storeBit(isPublicKeyEnabled ? 1 : 0)
                    .endCell()
                )
                .endCell()



        expect(actual.equals(expected)).toBeTruthy();
    });

    it('Should serialize extended out list and produce the expected boc', () => {
        const sendMode1 = SendMode.PAY_GAS_SEPARATELY+ SendMode.IGNORE_ERRORS;
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

        const actual = beginCell().store(storeOutListExtendedV5R1(actions)).endCell();
        const expected = Cell.fromBoc(Buffer.from('b5ee9c72410105010046000245c0a000888888888888888888888888888888888888888888888888888888888888888c0104020a0ec3c86d0302030000001cc000000000000000000000000000000304409c06218f', 'hex'))[0];
        if (typeof expected !== 'undefined') {
            expect(actual.equals(expected)).toBeTruthy();
        }
    });

    it('Should serialize extended out list and produce the expected boc for complex structures', () => {
        const sendMode1 = SendMode.PAY_GAS_SEPARATELY+ SendMode.IGNORE_ERRORS;
        const sendMode2 = SendMode.NONE;
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
                type: 'removeExtension',
                address: mockAddress
            },
            {
                type: 'sendMsg',
                mode: sendMode1,
                outMsg: mockMessageRelaxed1
            },
            {
                type: 'sendMsg',
                mode: sendMode2,
                outMsg: mockMessageRelaxed2
            }
        ]

        const actual = beginCell().store(storeOutListExtendedV5R1(actions)).endCell();
        const expected = Cell.fromBoc(Buffer.from('b5ee9c724101080100ab000245c0a000888888888888888888888888888888888888888888888888888888888888888c0106020a0ec3c86d030205020a0ec3c86d00030400000068420011111111111111111111111111111111111111111111111111111111111111110808404404000000000000c0e40007890000001cc00000000000000000000000000001030440070045038002222222222222222222222222222222222222222222222222222222222222223037cc71d6', 'hex'))[0];
        if (typeof expected !== 'undefined') {
            expect(actual.equals(expected)).toBeTruthy();
        }
    });

    it('Should deserialize extended out list', () => {
        const sendMode1 = SendMode.PAY_GAS_SEPARATELY;
        const isPublicKeyEnabled = true;

        const expected: (OutActionExtended | OutAction)[] = [
            {
                type: 'sendMsg',
                mode: sendMode1,
                outMsg: mockMessageRelaxed1
            },
            {
                type: 'addExtension',
                address: mockAddress
            },
            {
                type: 'setIsPublicKeyEnabled',
                isEnabled: isPublicKeyEnabled
            }
        ]

        const serialized =
            beginCell()
                .storeUint(1, 1)
                .storeRef(
                    beginCell()
                        .storeRef(beginCell().endCell())
                        .storeUint(outActionSendMsgTag, 32)
                        .storeUint(sendMode1, 8)
                        .storeRef(beginCell().store(storeMessageRelaxed(mockMessageRelaxed1)).endCell())
                        .endCell()
                )
                .storeUint(1, 1)
                .storeUint(outActionAddExtensionTag, 8)
                .storeAddress(mockAddress)
                .storeRef(
                    beginCell()
                        .storeUint(outActionSetIsPublicKeyEnabledTag, 8)
                        .storeBit(isPublicKeyEnabled ? 1 : 0)
                        .endCell()
                )
                .endCell()

        const actual = loadOutListExtendedV5R1(serialized.beginParse())

        expect(expected.length).toEqual(actual.length);
        expected.forEach((item1, index) => {
            const item2 = actual[index];
            expect(item1.type).toEqual(item2?.type);

            if (item1.type === 'sendMsg' && item2?.type === 'sendMsg') {
                expect(item1.mode).toEqual(item2.mode);
                expect(item1.outMsg.body.equals(item2.outMsg.body)).toBeTruthy();
                expect(item1.outMsg.info).toEqual(item2.outMsg.info);
                expect(item1.outMsg.init).toEqual(item2.outMsg.init);
            }

            if (item1.type === 'addExtension' && item2?.type === 'addExtension') {
                expect(item1.address.equals(item2.address)).toBeTruthy();
            }

            if (item1.type === 'setIsPublicKeyEnabled' && item2?.type === 'setIsPublicKeyEnabled') {
                expect(item1.isEnabled).toEqual(item2.isEnabled);
            }
        })
    });

    it('Check toSaveSendMode: add + 2 to externals', () => {
        const notSafeSendMode = SendMode.PAY_GAS_SEPARATELY;
        const authType = 'external';
        const safeSendMode = toSafeV5R1SendMode(notSafeSendMode, authType);

        expect(safeSendMode).toEqual(notSafeSendMode + SendMode.IGNORE_ERRORS);
    });

    it('Check toSaveSendMode: keep mode for internals', () => {
        const notSafeSendMode = SendMode.PAY_GAS_SEPARATELY;
        const authType = 'internal';
        const safeSendMode = toSafeV5R1SendMode(notSafeSendMode, authType);

        expect(safeSendMode).toEqual(notSafeSendMode);
    });

    it('Check toSaveSendMode: keep mode for extensions', () => {
        const notSafeSendMode = SendMode.PAY_GAS_SEPARATELY;
        const authType = 'extension';
        const safeSendMode = toSafeV5R1SendMode(notSafeSendMode, authType);

        expect(safeSendMode).toEqual(notSafeSendMode);
    });

    it("Check toSaveSendMode: don't add + 2 twice for externals", () => {
        const safeSendMode = SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS;
        const authType = 'external';
        const actualSafeSendMode = toSafeV5R1SendMode(safeSendMode, authType);

        expect(actualSafeSendMode).toEqual(safeSendMode);
    });

    it("Check toSaveSendMode: don't add + 2 twice for internals", () => {
        const safeSendMode = SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS;
        const authType = 'internal';
        const actualSafeSendMode = toSafeV5R1SendMode(safeSendMode, authType);

        expect(actualSafeSendMode).toEqual(safeSendMode);
    });
})
