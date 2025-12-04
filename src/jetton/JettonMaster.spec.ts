/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Address } from "@ton/core";
import { createTestClient } from "../utils/createTestClient";
import { JettonMaster } from "./JettonMaster";
import { JettonWallet } from "./JettonWallet";

describe('JettonMaster', () => {
    it.skip('should resolve jetton wallet address', async () => {
        let client = createTestClient('mainnet');
        let master = client.open(JettonMaster.create(Address.parse('EQDQoc5M3Bh8eWFephi9bClhevelbZZvWhkqdo80XuY_0qXv')));
        let walletAddress = await master.getWalletAddress(Address.parse('EQCo6VT63H1vKJTiUo6W4M8RrTURCyk5MdbosuL5auEqpz-C'));
        let jettonData = await master.getJettonData();
        expect(walletAddress.equals(Address.parse('EQDslTlGmbLTFi0j4MPT7UVggWR7XRDI2bW6vmNG6Tc_FBDE'))).toBe(true);
        expect(jettonData.mintable).toBe(true);
        expect(jettonData.adminAddress.equals(Address.parse('EQCppzUtmGSMg3FIRlFLzhToqbaC0xjmjzOn0o7H4M8Aua1t'))).toBe(true);
        
        let wallet = client.open(JettonWallet.create(walletAddress));
        let balance = await wallet.getBalance();
        expect(balance).toBe(0n);
    });
});
