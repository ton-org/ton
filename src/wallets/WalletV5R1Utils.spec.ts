import {
    beginCell,
    SendMode,
    storeMessageRelaxed,
    Address,
    MessageRelaxed, OutActionSendMsg, OutAction
} from "@ton/core";
import {OutActionExtended} from "./WalletV5Utils";
import {
    loadOutListExtendedV5R1,
    loadWalletIdV5R1,
    storeOutActionExtendedV5R1, storeOutListExtendedV5R1,
    storeWalletIdV5R1,
    WalletIdV5R1,
    WalletIdV5R1ClientContext, WalletIdV5R1CustomContext
} from "./WalletV5R1Utils";

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

describe('Wallet V5R1 utils', () => {
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

    it('Should serialise wallet id', () => {
        const walletId: WalletIdV5R1<WalletIdV5R1ClientContext> = {
            networkGlobalId: -239,
            context: {
                walletVersion: 'v5r1',
                workChain: 0,
                subwalletNumber: 0
            }
        }

        const actual = beginCell().store(storeWalletIdV5R1(walletId)).endCell();

        const context = beginCell()
            .storeUint(1, 1)
            .storeInt(walletId.context.workChain, 8)
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
                workChain: 0,
                subwalletNumber: 0
            }
        }

        const context = beginCell()
            .storeUint(1, 1)
            .storeInt(expected.context.workChain, 8)
            .storeUint(0, 8)
            .storeUint(expected.context.subwalletNumber, 15)
            .endCell().beginParse().loadInt(32);

        const actual = loadWalletIdV5R1(beginCell().storeInt(BigInt(context) ^ BigInt(expected.networkGlobalId), 32).endCell().beginParse(), expected.networkGlobalId);


        expect(expected).toEqual(actual);
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
