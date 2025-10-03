import {Address, beginCell, internal, SendMode, StateInit} from "@ton/core";
import {getSecureRandomBytes} from "@ton/crypto";
import {
    loadExtendedAction,
    OutActionAddAndDeployPlugin,
    OutActionAddPlugin,
    OutActionRemovePlugin,
    OutActionSendMsg,
    storeExtendedAction
} from "./WalletContractV4Actions";

describe('Wallet V5R1 actions', () => {
    it('should serialize and deserialize OutActionSendMsg', async () => {
        const msg = {
            type: 'sendMsg',
            messages: [internal({
                to: new Address(0, Buffer.alloc(32, 0xaa)),
                value: '0.001',
            })],
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        } as OutActionSendMsg;
        const serialized = beginCell().store(storeExtendedAction(msg)).endCell();
        const deserialized = loadExtendedAction(serialized.beginParse());

        if (deserialized.type !== 'sendMsg') throw new Error();
        expect(deserialized.messages.length).toEqual(msg.messages.length);
        expect(deserialized.messages[0].info.dest!.toString()).toEqual(msg.messages[0].info.dest!.toString());
        expect(deserialized.sendMode).toEqual(msg.sendMode);
    });

    it('should serialize and deserialize OutActionAddAndDeployPlugin', () => {
        const stateInit: StateInit = {
            code: beginCell().storeUint(0xa, 4).endCell(),
            data: beginCell().storeUint(0xb, 4).endCell(),
        };
        const action: OutActionAddAndDeployPlugin = {
            type: 'addAndDeployPlugin',
            workchain: -1,
            stateInit,
            body: beginCell().storeUint(0xcc, 8).endCell(),
            forwardAmount: 1000n,
        };

        const serialized = beginCell().store(storeExtendedAction(action)).endCell();
        const deserialized = loadExtendedAction(serialized.beginParse());

        if (deserialized.type !== 'addAndDeployPlugin') throw new Error();
        expect(deserialized.workchain).toEqual(action.workchain);
        expect(deserialized.forwardAmount).toEqual(action.forwardAmount);
        expect(deserialized.body.equals(action.body)).toBe(true);
        expect(deserialized.stateInit.code?.equals(action.stateInit.code!)).toBe(true);
        expect(deserialized.stateInit.data?.equals(action.stateInit.data!)).toBe(true);
    });

    it('should serialize and deserialize OutActionAddPlugin', () => {
        const action: OutActionAddPlugin = {
            type: 'addPlugin',
            address: new Address(0, Buffer.alloc(32, 0xaa)),
            forwardAmount: 123n,
            queryId: 77n,
        };

        const serialized = beginCell().store(storeExtendedAction(action)).endCell();
        const deserialized = loadExtendedAction(serialized.beginParse());

        if (deserialized.type !== 'addPlugin') throw new Error();
        expect(deserialized.address.equals(action.address)).toBe(true);
        expect(deserialized.forwardAmount).toEqual(action.forwardAmount);
        expect(deserialized.queryId).toEqual(action.queryId);
    });

    it('should serialize and deserialize OutActionRemovePlugin', () => {
        const action: OutActionRemovePlugin = {
            type: 'removePlugin',
            address: new Address(0, Buffer.alloc(32, 0xbb)),
            forwardAmount: 987654321n,
        };

        const serialized = beginCell().store(storeExtendedAction(action)).endCell();
        const deserialized = loadExtendedAction(serialized.beginParse());

        if (deserialized.type !== 'removePlugin') throw new Error();
        expect(deserialized.address.equals(action.address)).toBe(true);
        expect(deserialized.forwardAmount).toEqual(action.forwardAmount);
        expect(deserialized.queryId).toBeUndefined();
    });
})
