/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {randomTestKey} from "../../utils/randomTestKey";
import {Address, Cell, internal, OpenedContract, SendMode} from "@ton/core";
import {WalletContractV5Beta} from "./WalletContractV5Beta";
import {KeyPair, sign} from "@ton/crypto";
import {Buffer} from "buffer";
import {createTestClient4} from "../../utils/createTestClient4";
import {TonClient4} from "../../client/TonClient4";

const getExtensionsArray = async (wallet: OpenedContract<WalletContractV5Beta>) => {
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

describe('WalletContractV5Beta', () => {
    let client: TonClient4;
    let walletKey: KeyPair;
    let wallet: OpenedContract<WalletContractV5Beta>;

    beforeEach(() => {
        client = createTestClient4();
        walletKey = randomTestKey('v5-treasure-1');
        wallet = client.open(WalletContractV5Beta.create({ walletId: { networkGlobalId: -3 }, publicKey: walletKey.publicKey }));

    })

    it('should has balance and correct address', async () => {
       const balance = await wallet.getBalance();

        expect(wallet.address.equals(Address.parse('EQAb3OyXDQyjOGf3HOXPXELTF8dhZP0onqMPz6fNQbleRqtY'))).toBeTruthy();
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

        await wallet.send(transfer);
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
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer signed async!'
            })]
        });

        await wallet.send(transfer);
    });

   it('should perform double transfer', async () => {
        const seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
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

        await wallet.send(transfer);
    });

    it('should add extension', async () => {
        const extensionKey = randomTestKey('v5-treasure-extension');
        const extensionContract = client.open(WalletContractV5Beta.create({ walletId: { workChain: 0, networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));


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
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [internal({
                to: wallet.address,
                value: '0.02',
                body: wallet.createTransfer({
                    seqno: seqno,
                    authType: 'extension',
                    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
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
        const extensionContract = client.open(WalletContractV5Beta.create({ walletId: { workChain: 0, networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));


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

    it('should send internal transfer via relayer', async () => {
        const relaerKey = randomTestKey('v5-treasure-relayer');
        const relayerContract = client.open(WalletContractV5Beta.create({ walletId: { workChain: 0, networkGlobalId: -3 }, publicKey: relaerKey.publicKey }));


        const seqno = await wallet.getSeqno();

        const relayerSeqno = await relayerContract.getSeqno();
        await relayerContract.sendTransfer({
            seqno: relayerSeqno,
            secretKey: relaerKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
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


    it('should disable secret key auth, send extension-auth tx, and enable it again', async () => {
        /* firstly add an extension that will take the control over the wallet */
        const extensionKey = randomTestKey('v5-treasure-extension');
        const extensionContract = client.open(WalletContractV5Beta.create({ walletId: { workChain: 0, networkGlobalId: -3 }, publicKey: extensionKey.publicKey }));

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

        /* disable secret key auth */
        seqno = await wallet.getSeqno();
        const isInitiallyEnabled = await wallet.getIsSecretKeyAuthEnabled();

        const waitUntilAuthValue = async (target: 'enabled' | 'disabled', attempt = 0): Promise<void> => {
            if (attempt >= 20) {
                throw new Error('Auth permissions were not changed in 20 blocks');
            }
            const isEnabledNow = await wallet.getIsSecretKeyAuthEnabled();
            if ((target === 'enabled' && isEnabledNow ) || (target === 'disabled' && !isEnabledNow)) {
                return;
            }

            await new Promise(r => setTimeout(r, 1500));
            return waitUntilAuthValue(target, attempt + 1);
        }

        if (isInitiallyEnabled) {
            await wallet.sendActionsBatch({
                seqno,
                secretKey: walletKey.secretKey,
                actions: [
                    {
                        type: 'setIsPublicKeyEnabled',
                        isEnabled: false
                    }
                ]
            });

            await waitUntilAuthValue('disabled');
        }

        /* should fail direct secret-key auth transfer from the wallet */
        seqno = await wallet.getSeqno();
        const transfer = wallet.createTransfer({
            seqno: seqno,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
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
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
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
                        mode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
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

        /* should fail direct secret-key auth transfer from the wallet */
        await wallet.sendTransfer({
            seqno: seqno + 1,
            secretKey: walletKey.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [internal({
                bounce: false,
                to: 'UQB-2r0kM28L4lmq-4V8ppQGcnO1tXC7FZmbnDzWZVBkp6jE',
                value: '0.01',
                body: 'Hello world single transfer after sk auth enabled!'
            })]
        });
    }, 120000);
});
