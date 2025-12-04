/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createTestClient4 } from "../utils/createTestClient4";
import { Address } from "@ton/core";
import {
    configParse5,
    configParse13,
    configParse17,
    configParse18,
    configParseValidatorSet,
    configParseBridge,
    configParse12,
    parseFullConfig,
    loadConfigParamById,
    loadConfigParamsAsSlice,
    configParse7,
    configParse9,
    configParse10,
    configParse14,
    configParseBlockLimits,
    configParse31,
    configParse44,
    configParse45,
    loadJettonBridgeParams,
} from "./ConfigParser";

const client = createTestClient4("mainnet");
const KNOWN_BLOCK = 31091335;

const BLOCK_AT_31_10_25 = 53519168;

const TESTNET_BLOCK = 32762926;
const testnetClient = createTestClient4("testnet");

describe("ConfigContract", () => {
    it("should return correct burning config", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [13])
        ).config.cell;
        const config13 = configParse13(
            loadConfigParamById(serializedConfigsCell, 13).beginParse(),
        );

        expect(config13).toEqual({
            deposit: 1000000000n,
            bitPrice: 1n,
            cellPrice: 500n,
        });
    });

    it("should return correct complaint pricing", async () => {
        const serializedConfigsCell = (await client.getConfig(KNOWN_BLOCK, [5]))
            .config.cell;
        const config5 = configParse5(
            loadConfigParamById(serializedConfigsCell, 5).beginParse(),
        );

        expect(
            config5!.blackholeAddr!.equals(
                Address.parse(
                    "Ef___________________________________________7Sg",
                ),
            ),
        ).toBe(true);
        expect(config5!.feeBurnNominator).toEqual(1);
        expect(config5!.feeBurnDenominator).toEqual(2);
    });

    it("should return correct workckain description", async () => {
        const serializedConfigsCell = (
            await client.getConfig(KNOWN_BLOCK, [12])
        ).config.cell;
        const config12 = configParse12(
            loadConfigParamById(serializedConfigsCell, 12).beginParse(),
        );

        expect(config12!.get(0)).toEqual({
            enabledSince: 1573821854,
            actialMinSplit: 0,
            min_split: 0,
            max_split: 4,
            basic: true,
            active: true,
            accept_msgs: true,
            flags: 0,
            zerostateRootHash: Buffer.from(
                "55b13f6d0e1d0c34c9c2160f6f918e92d82bf9ddcf8de2e4c94a3fdf39d15446",
                "hex",
            ),
            zerostateFileHash: Buffer.from(
                "ee0bedfe4b32761fb35e9e1d8818ea720cad1a0e7b4d2ed673c488e72e910342",
                "hex",
            ),
            version: 0,
            format: {
                vmMode: 0n,
                vmVersion: -1,
            },
            workchain_v2: undefined,
        });
    });

    it("should parse config7", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [7])
        ).config.cell;
        const config7 = configParse7(
            loadConfigParamById(serializedConfigsCell, 7).beginParse(),
        );

        expect(config7).toEqual({
            toMint: {
                "239": 666666666666n,
                "4294967279": 1000000000000n,
            },
        });
    });

    it("should parse config9", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [9])
        ).config.cell;
        const config9 = configParse9(
            loadConfigParamById(serializedConfigsCell, 9).beginParse(),
        );

        expect(config9).toEqual(
            new Set([
                0, 1, 9, 10, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 28,
                34,
            ]),
        );
    });

    it("should parse config10", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [10])
        ).config.cell;
        const config10 = configParse10(
            loadConfigParamById(serializedConfigsCell, 10).beginParse(),
        );

        expect(config10).toEqual(
            new Set([
                0, 1, 9, 10, 12, 14, 15, 16, 17, 32, 34, 36, -1001, -1000,
            ]),
        );
    });

    it("should parse config14", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [14])
        ).config.cell;
        const config14 = configParse14(
            loadConfigParamById(serializedConfigsCell, 14).beginParse(),
        );

        expect(config14).toEqual({
            masterchainBlockFee: 1700000000n,
            workchainBlockFee: 1000000000n,
        });
    });

    it("should parse config22", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [22])
        ).config.cell;
        const config22 = configParseBlockLimits(
            loadConfigParamById(serializedConfigsCell, 22).beginParse(),
        );

        expect(config22).toEqual({
            bytes: {
                underload: 131072,
                softLimit: 524288,
                hardLimit: 1048576,
            },
            gas: {
                underload: 200000,
                softLimit: 1000000,
                hardLimit: 2500000,
            },
            ltDelta: {
                underload: 1000,
                softLimit: 5000,
                hardLimit: 10000,
            },
        });
    });

    it("should parse config23", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [23])
        ).config.cell;
        const config23 = configParseBlockLimits(
            loadConfigParamById(serializedConfigsCell, 23).beginParse(),
        );

        expect(config23).toEqual({
            bytes: {
                underload: 262144,
                softLimit: 1048576,
                hardLimit: 2097152,
            },
            gas: {
                underload: 2000000,
                softLimit: 10000000,
                hardLimit: 20000000,
            },
            ltDelta: {
                underload: 1000,
                softLimit: 5000,
                hardLimit: 10000,
            },
        });
    });

    it("should parse config31", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [31])
        ).config.cell;
        const config31 = configParse31(
            loadConfigParamById(serializedConfigsCell, 31).beginParse(),
        );

        expect(config31.map((e) => e.toString())).toEqual([
            Address.parse(
                "-1:0000000000000000000000000000000000000000000000000000000000000000",
            ).toString(),
            Address.parse(
                "-1:0ebd7ff9ca70e06e9e22a8922f5ae75211a9d6a34a8094e8e1587b606bdbb662",
            ).toString(),
            Address.parse(
                "-1:3333333333333333333333333333333333333333333333333333333333333333",
            ).toString(),
            Address.parse(
                "-1:3b9bbfd0ad5338b9700f0833380ee17d463e51c1ae671ee6f08901bde899b202",
            ).toString(),
            Address.parse(
                "-1:4d5c0210b35daddaa219fac459dba0fdefb1fae4e97a0d0797739fe050d694ca",
            ).toString(),
            Address.parse(
                "-1:dd24c4a1f2b88f8b7053513b5cc6c5a31bc44b2a72dcb4d8c0338af0f0d37ec5",
            ).toString(),
            Address.parse(
                "-1:ead7da389bde317c5fb285807ce507baad31c35fe5534b3c418785e901f64c68",
            ).toString(),
        ]);
    });

    it("should parse config44", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [44])
        ).config.cell;
        const config44 = configParse44(
            loadConfigParamById(serializedConfigsCell, 44).beginParse(),
        );

        expect(config44.suspendedUntil).toEqual(1803189600);
        expect(config44.addresses.length).toEqual(180);
        expect(config44.addresses[4].toString()).toEqual(
            Address.parse(
                "0:0927afd84711fea63794c619ded2288c7479b3ec16c927f0360ed76603f6df06",
            ).toString(),
        );
    });

    it("should parse config45", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [45])
        ).config.cell;
        const config45 = configParse45(
            loadConfigParamById(serializedConfigsCell, 45).beginParse(),
        );

        expect(
            config45.map((e) => ({
                hash: e.hash.toString("hex"),
                gasUsed: e.gasUsed,
            })),
        ).toEqual([
            {
                hash: "89468f02c78e570802e39979c8516fc38df07ea76a48357e0536f2ba7b3ee37b",
                gasUsed: 1000n,
            },
        ]);
    });

    it("should parse jettonBridgeParams", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25, [79])
        ).config.cell;
        const config79 = loadJettonBridgeParams(
            loadConfigParamById(serializedConfigsCell, 79).beginParse(),
        );

        expect(config79?.bridgeAddress.toString()).toEqual(
            Address.parse(
                "Ef-1JetbPF9ubc1ga-57oHoOyDA1IShJt-BVlJnA9rrVTfrB",
            ).toString(),
        );
        expect(config79?.jettonBridgePrices?.bridgeBurnFee).toEqual(
            1000000000n,
        );
        expect(config79?.oracles.length).toEqual(9);
        expect(config79?.oracles[3].addr.toString()).toEqual(
            Address.parse(
                "Uf8ceN7cTemTe4ZV6AIbg5f8LsHZsYV1UaiGntvkME0KtKP8",
            ).toString(),
        );
    });

    it("should return correct workchain_v2 description", async () => {
        const serializedConfigsCell = (
            await testnetClient.getConfig(TESTNET_BLOCK, [12])
        ).config.cell;

        const config12 = configParse12(
            loadConfigParamById(serializedConfigsCell, 12).beginParse(),
        );
        const wcData = config12.get(0)!;

        expect(wcData.workchain_v2).not.toBeUndefined();

        // https://test-explorer.toncenter.com/config?workchain=-1&shard=8000000000000000&seqno=32764024&roothash=B17E08E4F2C06630D5DF348BE2D2545784515B772AB645CE9A05DA37AFB80D48&filehash=5A60AAA67F3F20BB7F1DAA5A14CEA90CDDA508FB3B18B64EF1144183833B8618#configparam12

        expect(wcData).toEqual({
            enabledSince: 1573821854,
            actialMinSplit: 0,
            min_split: 0,
            max_split: 0,
            basic: true,
            active: true,
            accept_msgs: true,
            flags: 0,
            zerostateRootHash: Buffer.from(
                "55b13f6d0e1d0c34c9c2160f6f918e92d82bf9ddcf8de2e4c94a3fdf39d15446",
                "hex",
            ),
            zerostateFileHash: Buffer.from(
                "ee0bedfe4b32761fb35e9e1d8818ea720cad1a0e7b4d2ed673c488e72e910342",
                "hex",
            ),
            version: 0,
            format: {
                vmMode: 0n,
                vmVersion: -1,
            },
            workchain_v2: {
                split_merge_timings: {
                    split_merge_delay: 100,
                    split_merge_interval: 100,
                    min_split_merge_interval: 30,
                    max_split_merge_delay: 1000,
                },
                persistent_state_split_depth: 4,
            },
        });
    });

    it("should return correct config17", async () => {
        const serializedConfigsCell = (
            await client.getConfig(KNOWN_BLOCK, [17])
        ).config.cell;
        const config17 = configParse17(
            loadConfigParamById(serializedConfigsCell, 17).beginParse(),
        );

        expect(config17).toEqual({
            minStake: 300000000000000n,
            maxStake: 10000000000000000n,
            minTotalStake: 75000000000000000n,
            maxStakeFactor: 196608,
        });
    });

    it("should return correct config18", async () => {
        const serializedConfigsCell = (
            await client.getConfig(KNOWN_BLOCK, [18])
        ).config.cell;
        const config18 = configParse18(
            loadConfigParamById(serializedConfigsCell, 18).beginParse(),
        );

        expect(config18[0]).toEqual({
            utime_since: 0,
            bit_price_ps: 1n,
            cell_price_ps: 500n,
            mc_bit_price_ps: 1000n,
            mc_cell_price_ps: 500000n,
        });
    });

    it("should return correct prevValidators", async () => {
        const serializedConfigsCell = (
            await client.getConfig(KNOWN_BLOCK, [32])
        ).config.cell;
        const config32 = configParseValidatorSet(
            loadConfigParamById(serializedConfigsCell, 32).beginParse(),
        );

        expect(config32!.timeSince).toEqual(1689145096);
        expect(config32!.timeUntil).toEqual(1689210632);
        expect(config32!.total).toEqual(331);
        expect(config32!.main).toEqual(100);
        expect(config32!.totalWeight).toEqual(1152921504606846812n);
        expect(config32!.list.get(0)).toEqual({
            publicKey: Buffer.from(
                "9828e815ea69180cac1ae2b02f15f285a9cef71ec11c7709acc31128a303448c",
                "hex",
            ),
            weight: 5077814413300977n,
            adnlAddress: Buffer.from(
                "e2e5cadaa61c6d84f86a3618d496ea0bd98c79edc796af9895b82fb83cb666b9",
                "hex",
            ),
        });
    });

    it("should return correct ethereum bridge", async () => {
        const serializedConfigsCell = (
            await client.getConfig(KNOWN_BLOCK, [71])
        ).config.cell;
        const config71 = configParseBridge(
            loadConfigParamById(serializedConfigsCell, 71).beginParse(),
        );

        expect(
            config71!.bridgeAddress.equals(
                Address.parse(
                    "Ef_dJMSh8riPi3BTUTtcxsWjG8RLKnLctNjAM4rw8NN-xWdr",
                ),
            ),
        ).toBe(true);
        expect(
            config71!.oracleMultisigAddress.equals(
                Address.parse(
                    "Ef87m7_QrVM4uXAPCDM4DuF9Rj5Rwa5nHubwiQG96JmyAjQY",
                ),
            ),
        ).toBe(true);
        expect(
            config71!.oracles.get(
                "Ef8DfObDUrNqz66pr_7xMbUYckUFbIIvRh1FSNeVSLWrvo1M",
            ),
        ).toEqual(
            Buffer.from(
                "000000000000000000000000cf4a7c26186aa41390e246fa04115a0495085ab9",
                "hex",
            ),
        );
        expect(config71!.externalChainAddress).toEqual(
            Buffer.from(
                "000000000000000000000000582d872a1b094fc48f5de31d3b73f2d9be47def1",
                "hex",
            ),
        );
    });

    it("should not raise error when loading full config", async () => {
        const serializedConfigsCell = (
            await client.getConfig(BLOCK_AT_31_10_25)
        ).config.cell;
        parseFullConfig(loadConfigParamsAsSlice(serializedConfigsCell));
    });
    it("should not raise error when parsing testnet config", async () => {
        const serializedConfigsCell = (
            await testnetClient.getConfig(TESTNET_BLOCK)
        ).config.cell;

        parseFullConfig(loadConfigParamsAsSlice(serializedConfigsCell));
    });
});
