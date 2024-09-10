/* Made by @Gusarich and @Miandic */

import { 
    // MultisigOrder,
    TonClient 
} from '../index';
import {
    Cell,
    Address,
    beginCell,
    type MessageRelaxed,
    type ContractProvider,
} from '@ton/core';
import { getSecureRandomBytes, keyPairFromSeed, sign } from '@ton/crypto';
import { testAddress, ContractSystem, type Treasure } from '@ton/emulator';
import { MultisigWallet } from './MultisigWallet';
import { MultisigOrderBuilder } from './MultisigOrderBuilder';
import { createTestClient } from '../utils/createTestClient';

function createInternalMessage(
    bounce: boolean,
    dest: Address,
    value: bigint,
    body: Cell,
    // mode: number = 3
): MessageRelaxed {
    return {
        info: {
            bounce,
            bounced: false,
            createdAt: 0,
            createdLt: 0n,
            dest,
            forwardFee: 0n,
            ihrDisabled: true,
            ihrFee: 0n,
            type: 'internal',
            value: {
                coins: value,
            },
        },
        body,
    };
}

describe('MultisigWallet', () => {
    var publicKeys: Buffer[];
    var secretKeys: Buffer[];
    var system: ContractSystem;
    var treasure: Treasure;
    var client: TonClient;

    function createProvider(multisig: MultisigWallet): ContractProvider {
        const stateInit = multisig.init;
        return system.provider({
            address: multisig.address,
            init: {
                code: stateInit.code!,
                data: stateInit.data!,
            },
        });
    }

    // function signOrder(
    //     order: MultisigOrder,
    // ): MultisigOrder {
    //     for (let i = 0; i < 3; i++) {
    //         const key = secretKeys[i];
    //         if (typeof key !== 'undefined') {
    //             order.sign(i, key);
    //         }
    //     }
    //     return order;
    // }

    beforeAll(async () => {
        publicKeys = [];
        secretKeys = [];
        for (let i = 0; i < 10; i += 1) {
            let kp = keyPairFromSeed(await getSecureRandomBytes(32));
            publicKeys.push(kp.publicKey);
            secretKeys.push(kp.secretKey);
        }
        client = createTestClient('mainnet');
    });

    beforeEach(async () => {
        system = await ContractSystem.create();
        treasure = system.treasure('my-treasure');
    });

    it('should create MultisigWallet object', () => {
        // let multisig = 
        new MultisigWallet(publicKeys, 0, 123, 2);
    });

    it('should create MultisigWallet object from client', async () => {
        // let multisig = 
        new MultisigWallet(publicKeys, 0, 123, 2, { client });
    });

    it('should throw in fromAddress if no provider and no client', async () => {
        expect(MultisigWallet.fromAddress(
            Address.parse(
                'EQADBXugwmn4YvWsQizHdWGgfCTN_s3qFP0Ae0pzkU-jwzoE'
            ),
            {}
        )).rejects.toThrowError('Either provider or client must be specified');
    });

    it('should throw in fromAddress if the contract is inactive', async () => {
        expect(MultisigWallet.fromAddress(
            Address.parse(
                'EQCzD8HVMlGCbXf3oOBxXBt5AfjhmmWKAC9fsJvJLFEO0SQt'
            ),
            { client }
        )).rejects.toThrowError('Contract must be active');
    });

    it('should deploy via internal message', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        // let provider = createProvider(multisig);

        await multisig.deployInternal(treasure);
        let txs = await system.run();
        expect(txs).toHaveLength(2);
        expect(txs[1]?.endStatus).toEqual('active');
    });

    it('should deploy via external message', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        let provider = createProvider(multisig);

        await treasure.send({
            sendMode: 0,
            to: multisig.address,
            value: 1000000000n,
            body: Cell.EMPTY,
            bounce: false,
        });
        await system.run();
        await multisig.deployExternal(provider);
        let txs = await system.run();
        expect(txs).toHaveLength(1);
        expect(txs[0]?.endStatus).toEqual('active');
    });

    it('should throw in deployExternal if there is no provider', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        expect(multisig.deployExternal()).rejects.toThrowError('you must specify provider if there is no such property in MultisigWallet instance');
    });

    it('should deploy via external message with provider from property', async () => {
        let multisigTmp = new MultisigWallet(publicKeys, 0, 123, 2);
        let provider = createProvider(multisigTmp);
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2, { provider });

        await treasure.send({
            sendMode: 0,
            to: multisig.address,
            value: 1000000000n,
            body: Cell.EMPTY,
            bounce: false,
        });
        await system.run();
        await multisig.deployExternal();
        let txs = await system.run();
        expect(txs).toHaveLength(1);
        expect(txs[0]?.endStatus).toEqual('active');
    });

    it('should load contract from address', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        let provider = createProvider(multisig);
        await multisig.deployInternal(treasure);
        await system.run();

        let multisigFromProvider = await MultisigWallet.fromAddress(
            multisig.address,
            { provider }
        );
        expect(multisig.address.toRawString()).toEqual(
            multisigFromProvider?.address.toRawString()
        );
        expect(multisig.owners.keys().toString()).toEqual(
            multisigFromProvider?.owners.keys().toString()
        );
        expect(multisig.owners.values().toString()).toEqual(
            multisigFromProvider?.owners.values().toString()
        );

        const testMultisigAddress = Address.parse(
            'EQADBXugwmn4YvWsQizHdWGgfCTN_s3qFP0Ae0pzkU-jwzoE'
        );
        let multisigFromClient = await MultisigWallet.fromAddress(
            testMultisigAddress,
            { client }
        );
        expect(testMultisigAddress.toRawString()).toEqual(
            multisigFromClient?.address.toRawString()
        );
        expect(multisigFromClient?.owners.keys().toString()).toEqual('0,1,2');
        expect(multisigFromClient?.owners.values().toString()).toEqual(
            [
                Buffer.from(
                    '51ce50ebcced0fdcc7520a2cacf653c81fb49f34f9c570a9e1bb23c7f7186d8d00',
                    'hex'
                ),
                Buffer.from(
                    'f7a92e5a7b97b81fdc366c4c77298cfd1e9b97ba04feecf0c1d85d63d16d9f2000',
                    'hex'
                ),
                Buffer.from(
                    '6ec29f8fd53761b94291d5801cda5d0d00c48d78dc6c147ec4c6e088c3d93d8400',
                    'hex'
                ),
            ].toString()
        );
    });

    it('should find order by public key', () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        for (let i = 0; i < publicKeys.length; i += 1) {
            const key = publicKeys[i];

            if (typeof key !== 'undefined') {
                expect(multisig.getOwnerIdByPubkey(key)).toEqual(i);
            }
        }
    });

    it('should accept orders', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        let provider = createProvider(multisig);
        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let orderBuilder = new MultisigOrderBuilder(123);
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );

        const key = secretKeys[3];
        if (key) {
            await multisig.sendOrder(orderBuilder.build(), key, provider);
        }

        let txs = await system.run();
        expect(txs).toHaveLength(1);
        if (txs[0]?.description.type == 'generic') {
            expect(txs[0].description.aborted).toBeFalsy;
        }
    });

    it('should accept orders sent by `sendWithoutSecretKey` method', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        let provider = createProvider(multisig);
        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let orderBuilder = new MultisigOrderBuilder(123);
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );

        const order = orderBuilder.build();

        const key = secretKeys[3];
        if (key) {
            const signature = sign(order.toCell(3).hash(), key);
            await multisig.sendOrderWithoutSecretKey(
                orderBuilder.build(),
                signature,
                3,
                provider
            );
        }

        let txs = await system.run();
        expect(txs).toHaveLength(1);
        if (txs[0]?.description.type == 'generic') {
            expect(txs[0].description.aborted).toBeFalsy;
        }
    });

    it('should throw in sendOrder if there is no provider', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        // let provider = createProvider(multisig);
        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let order = new MultisigOrderBuilder(123);
        order.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        order.addMessage(
            createInternalMessage(
                true,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        order.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );

        const key = secretKeys[3];

        if (key) {
            expect(multisig.sendOrder(order.build(), key))
                .rejects.toThrowError('you must specify provider if there is no such property in MultisigWallet instance');
        }
    });

    it('should accept orders with provider from property', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        multisig.provider = createProvider(multisig);

        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let orderBuilder = new MultisigOrderBuilder(123);
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );

        const key = secretKeys[3];
        if (key) {
            await multisig.sendOrder(orderBuilder.build(), key);
        }

        let txs = await system.run();
        expect(txs).toHaveLength(1);
        if (txs[0]?.description.type == 'generic') {
            expect(txs[0].description.aborted).toBeFalsy();
        }
    });

    it('should accept multiple orders and send messages', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 5);
        let provider = createProvider(multisig);
        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let orderBuilder = new MultisigOrderBuilder(123);
        orderBuilder.addMessage(
            createInternalMessage(
                false,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                false,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );
        let order = orderBuilder.build();

        for (let i = 0; i < 4; i += 1) {
            const key = secretKeys[i];
            if (key) {
                await multisig.sendOrder(order, key, provider);
            }
            await system.run();
        }

        const key = secretKeys[7];
        if (key) {
            await multisig.sendOrder(order, key, provider);
        }

        let txs = await system.run();
        expect(txs).toHaveLength(5);
    });

    it('should accept orders with multiple signatures and send messages', async () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 5);
        let provider = createProvider(multisig);
        await multisig.deployInternal(treasure, 10000000000n);
        await system.run();

        let orderBuilder = new MultisigOrderBuilder(123);
        orderBuilder.addMessage(
            createInternalMessage(
                false,
                testAddress('address1'),
                1000000000n,
                Cell.EMPTY
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                false,
                testAddress('address2'),
                0n,
                beginCell().storeUint(3, 123).endCell()
            ),
            3
        );
        orderBuilder.addMessage(
            createInternalMessage(
                true,
                testAddress('address1'),
                2000000000n,
                Cell.EMPTY
            ),
            3
        );
        let order = orderBuilder.build();

        for (let i = 0; i < 5; i += 1) {
            const key = secretKeys[i];
            if (key) {
                order.sign(i, key);
            }
        }

        const key = secretKeys[0];
        if (key) {
            await multisig.sendOrder(order, key, provider);
        }

        let txs = await system.run();
        expect(txs).toHaveLength(5);
    });

    it('should throw in getOwnerIdByPubkey on invalid public key', () => {
        let multisig = new MultisigWallet(publicKeys, 0, 123, 2);
        expect(() => multisig.getOwnerIdByPubkey(Buffer.alloc(32))).toThrow(
            'public key is not an owner'
        );
    });
});
