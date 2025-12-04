/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {randomTestKey} from "../../utils/randomTestKey";
import {Address, Cell, internal, OpenedContract, SendMode} from "@ton/core";
import {KeyPair, sign} from "@ton/crypto";
import {Buffer} from "buffer";
import {createTestClient4} from "../../utils/createTestClient4";
import {TonClient4} from "../../client/TonClient4";
import {WalletContractV5R1} from "./WalletContractV5R1";
import { tillNextSeqno } from "../../utils/testWallets";

const getExtensionsArray = async (wallet: OpenedContract<WalletContractV5R1>) => {
    try {
        return await wallet.getExtensionsArray();
    } catch (e) {
        // Handle toncenter bug. Toncenter incorrectly returns 'list' in the stack in case of empty extensions dict
        if (e && typeof e === 'object' && 'message' in e && e.message === 'Unsupported stack item type: list') {
            return [];
        }
        throw e;
    }
}

describe('WalletContractV5R1', () => {
    let client: TonClient4;
    let walletKey: KeyPair;
    let wallet: OpenedContract<WalletContractV5R1>;

    beforeEach(() => {
        client = createTestClient4();
        walletKey = randomTestKey('v5r1-treasure');
        wallet = client.open(WalletContractV5R1.create({ walletId: { networkGlobalId: -3 }, publicKey: walletKey.publicKey }));

    })

    it('should has balance and correct address', async () => {
       const balance = await wallet.getBalance();

        expect(wallet.address.equals(Address.parse('EQCqe9WqFhS8AfVGDP2xQiTLjbeolhLGsvIbbgQ6C3XT5gGs'))).toBeTruthy();
        expect(balance > 0n).toBe(true);
    });

    it('should perform single transfer', async () => {
        const seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer!'
            })]
        });

        const sendMode = getTransferSendMode(transfer);
        expect(sendMode).toBe(SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS);

        await wallet.send(transfer);
        await tillNextSeqno(wallet, seqno);
    });

    it('should perform extra currency transfer', async () => {
        const seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                extracurrency: {100: BigInt(10 ** 6)},
                body: 'Hello extra currency w5r1!'
            })]
        });

        await wallet.send(transfer);
        await tillNextSeqno(wallet, seqno);
    });

    it('should perform single transfer with async signing', async () => {
        const seqno = await wallet.getSeqno();

        const signer = (payload: Cell) => new Promise<Buffer>(r =>
            setTimeout(() => {
                const signature = sign(payload.hash(), walletKey.secretKey);
                r(signature)
            }, 100)
        );

        const transfer = await wallet.createTransfer({
            seqno,
            signer,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer signed async!'
            })]
        });

        const sendMode = getTransferSendMode(transfer);
        expect(sendMode).toBe(SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS);

        await wallet.send(transfer);
    });

   it('should perform double transfer', async () => {
        const seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world to extension'
            }), internal({
                bounce: false,
                to: 'UQDUyIkKoOR5iZ1Gz60JwKc7wPr3LcdHxOJpVDb9jAKY_pfk',
                value: '0.02',
                body: 'Hello world to relayer'
            })]
        });

       const sendMode = getTransferSendMode(transfer);
       expect(sendMode).toBe(SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS);

        await wallet.send(transfer);
    });

    it.skip('should add extension', async () => {
        const extensionKey = randomTestKey('v5-treasure-extension');
        const extensionContract = client.open(WalletContractV5R1.create({ walletId: { networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));


        let seqno = await wallet.getSeqno();
        const extensions = await getExtensionsArray(wallet);

        const extensionAlreadyAdded = extensions.some(address => address.equals(extensionContract.address));

        if (!extensionAlreadyAdded) {
            await wallet.sendAddExtension({
                seqno,
                secretKey: walletKey.secretKey,
                extensionAddress: extensionContract.address
            });

            const waitUntilExtensionAdded = async (attempt = 0): Promise<void> => {
                if (attempt >= 20) {
                    throw new Error('Extension was not added in 20 blocks');
                }
                const extensions = await getExtensionsArray(wallet);
                const extensionAdded = extensions.some(address => address.equals(extensionContract.address));
                if (extensionAdded) {
                    return;
                }

                await new Promise(r => setTimeout(r, 1500));
                return waitUntilExtensionAdded(attempt + 1);
            }

            await waitUntilExtensionAdded();
        }

        seqno = await wallet.getSeqno();

        const extensionsSeqno = await extensionContract.getSeqno();
        await extensionContract.sendTransfer({
            seqno: extensionsSeqno,
            secretKey: extensionKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                to: wallet.address,
                value: '0.02',
                body: wallet.createTransfer({
                    seqno: seqno,
                    authType: 'extension',
                    sendMode: SendMode.PAY_GAS_SEPARATELY,
                    messages: [internal({
                        bounce: false,
                        to: '0QD6oPnzaaAMRW24R8F0_nlSsJQni0cGHntR027eT9_sgoHo',
                        value: '0.03',
                        body: 'Hello world from plugin'
                    })]
                })
            })]
        });
    }, 60000);

    it('should remove extension', async () => {
        const extensionKey = randomTestKey('v5-treasure-extension');
        const extensionContract = client.open(WalletContractV5R1.create({ walletId: { networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));


        const seqno = await wallet.getSeqno();
        const extensions = await getExtensionsArray(wallet);

        const extensionAlreadyAdded = extensions.some(address => address.equals(extensionContract.address));

        if (extensionAlreadyAdded) {
            await wallet.sendRemoveExtension({
                seqno,
                secretKey: walletKey.secretKey,
                extensionAddress: extensionContract.address
            });
        }
    });

    it.skip('should send internal transfer via relayer', async () => {
        const relaerKey = randomTestKey('v5r1-treasure-relayer');
        const relayerContract = client.open(WalletContractV5R1.create({ walletId: { networkGlobalId: -3 }, publicKey: relaerKey.publicKey }));


        const seqno = await wallet.getSeqno();

        const relayerSeqno = await relayerContract.getSeqno();
        await relayerContract.sendTransfer({
            seqno: relayerSeqno,
            secretKey: relaerKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                to: wallet.address,
                value: '0.03',
                body: wallet.createTransfer({
                    seqno: seqno,
                    secretKey: walletKey.secretKey,
                    authType: 'internal',
                    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
                    messages: [internal({
                        bounce: false,
                        to: '0QD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG4so',
                        value: '0.04',
                        body: 'Hello world from relayer'
                    })]
                })
            })]
        });
    });


    it.skip('should disable secret key auth, send extension-auth tx, and enable it again', async () => {
        /* firstly add an extension that will take the control over the wallet */
        const extensionKey = randomTestKey('v5-treasure-extension');
        const extensionContract = client.open(WalletContractV5R1.create({ walletId: { networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));

        let seqno = await wallet.getSeqno();
        const extensions = await getExtensionsArray(wallet);

        const extensionAlreadyAdded = extensions.some(address => address.equals(extensionContract.address));

        if (!extensionAlreadyAdded) {
            await wallet.sendAddExtension({
                seqno,
                secretKey: walletKey.secretKey,
                extensionAddress: extensionContract.address
            });

            const waitUntilExtensionAdded = async (attempt = 0): Promise<void> => {
                if (attempt >= 30) {
                    throw new Error('Extension was not added in 30 blocks');
                }
                const extensions = await getExtensionsArray(wallet);
                const extensionAdded = extensions.some(address => address.equals(extensionContract.address));
                if (extensionAdded) {
                    return;
                }

                await new Promise(r => setTimeout(r, 1500));
                return waitUntilExtensionAdded(attempt + 1);
            }

            await waitUntilExtensionAdded();
        }

        /* disable secret key auth */
        seqno = await wallet.getSeqno();
        const isInitiallyEnabled = await wallet.getIsSecretKeyAuthEnabled();

        const waitUntilAuthValue = async (target: 'enabled' | 'disabled', attempt = 0): Promise<void> => {
            if (attempt >= 30) {
                throw new Error('Auth permissions were not changed in 30 blocks');
            }
            const isEnabledNow = await wallet.getIsSecretKeyAuthEnabled();
            if ((target === 'enabled' && isEnabledNow ) || (target === 'disabled' && !isEnabledNow)) {
                return;
            }

            await new Promise(r => setTimeout(r, 1500));
            return waitUntilAuthValue(target, attempt + 1);
        }

        if (isInitiallyEnabled) {
            const extensionsSeqno = await extensionContract.getSeqno();

            await extensionContract.sendTransfer({
                seqno: extensionsSeqno,
                secretKey: extensionKey.secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages: [internal({
                    to: wallet.address,
                    value: '0.02',
                    body: wallet.createRequest({
                        seqno,
                        authType: 'extension',
                        actions: [
                            {
                                type: 'setIsPublicKeyEnabled',
                                isEnabled: false
                            }
                        ]
                    })
                })]
            });

            await waitUntilAuthValue('disabled');
        }

        /* should fail direct secret-key auth transfer from the wallet */
        seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno: seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer that SHOULD FAIL!'
            })]
        });

        await expect(wallet.send(transfer)).rejects.toThrow();

        /* should perform transfer from the extension and enable auth by secret key  */

        const extensionsSeqno = await extensionContract.getSeqno();
        await extensionContract.sendTransfer({
            seqno: extensionsSeqno,
            secretKey: extensionKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                to: wallet.address,
                value: '0.03',
                body: wallet.createRequest({
                    seqno,
                    authType: 'extension',
                    actions: [
                        {
                          type: 'setIsPublicKeyEnabled',
                          isEnabled: true
                        },
                        {
                        type: "sendMsg",
                        mode: SendMode.IGNORE_ERRORS,
                        outMsg: internal({
                            bounce: false,
                            to: '0QD6oPnzaaAMRW24R8F0_nlSsJQni0cGHntR027eT9_sgoHo',
                            value: '0.03',
                            body: 'Hello world from plugin that controls the wallet!'
                        })
                    }]
                })
            })]
        });

        await waitUntilAuthValue('enabled');
        await new Promise(r => setTimeout(r, 5000));

        /* should not fail direct secret-key auth transfer from the wallet */
        seqno = await wallet.getSeqno();
        await wallet.sendTransfer({
            seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer after sk auth is enabled!'
            })]
        });
    }, 260000);
});

function getTransferSendMode(cell: Cell): SendMode {
    const outMsg = cell.beginParse().loadRef().beginParse();
    const bits = outMsg.remainingBits;
    return outMsg.skip(bits - 8).loadUint(8) as SendMode;
}
