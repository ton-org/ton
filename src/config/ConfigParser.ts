import { Address, Slice, Cell, Dictionary, DictionaryValue, Builder } from "@ton/core";

export function configParseMasterAddress(slice: Slice | null | undefined) {
    if (slice) {
        return new Address(-1, slice.loadBuffer(32));
    } else {
        return null;
    }
}

function readPublicKey(slice: Slice) {
    // 8e81278a
    if (slice.loadUint(32) !== 0x8e81278a) {
        throw Error('Invalid config');
    }
    return slice.loadBuffer(32);
}

const ValidatorDescriptionDictValue: DictionaryValue<{publicKey: Buffer, weight: bigint, adnlAddress: Buffer|null}> = {
    serialize(src: any, builder: Builder): void {
        throw Error("not implemented")
    },
    parse(src: Slice): {publicKey: Buffer, weight: bigint, adnlAddress: Buffer|null} {
        const header = src.loadUint(8);
        if (header === 0x53) {
            return {
                publicKey: readPublicKey(src),
                weight: src.loadUintBig(64),
                adnlAddress: null
            };
        } else if (header === 0x73) {
            return {
                publicKey: readPublicKey(src),
                weight: src.loadUintBig(64),
                adnlAddress: src.loadBuffer(32)
            };
        } else {
            throw Error('Invalid config');
        }
    }
}

export function parseValidatorSet(slice: Slice) {
    const header = slice.loadUint(8);
    if (header === 0x11) {
        const timeSince = slice.loadUint(32);
        const timeUntil = slice.loadUint(32);
        const total = slice.loadUint(16);
        const main = slice.loadUint(16);
        const list = slice.loadDictDirect(Dictionary.Keys.Uint(16), ValidatorDescriptionDictValue);
        return {
            timeSince,
            timeUntil,
            total,
            main,
            totalWeight: null,
            list
        };
    } else if (header === 0x12) {
        const timeSince = slice.loadUint(32);
        const timeUntil = slice.loadUint(32);
        const total = slice.loadUint(16);
        const main = slice.loadUint(16);
        const totalWeight = slice.loadUintBig(64);
        const list = slice.loadDict(Dictionary.Keys.Uint(16), ValidatorDescriptionDictValue);
        return {
            timeSince,
            timeUntil,
            total,
            main,
            totalWeight,
            list
        };
    }
}

export function parseBridge(slice: Slice) {
    const bridgeAddress = new Address(-1, slice.loadBuffer(32));
    const oracleMultisigAddress = new Address(-1, slice.loadBuffer(32));
    const oraclesDict = slice.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Buffer(32));
    const oracles = new Map<string, Buffer>();
    for (const [local, remote] of oraclesDict) {
        oracles.set(new Address(-1, local).toString(), remote);
    }   
    const externalChainAddress = slice.loadBuffer(32);
    return {
        bridgeAddress,
        oracleMultisigAddress,
        oracles,
        externalChainAddress
    }
}

export function configParseMasterAddressRequired(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    return configParseMasterAddress(slice)!;
}

export function configParse5(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic === 0x01) {
        const blackholeAddr = slice.loadBit() ? new Address(-1, slice.loadBuffer(32)): null;
        const feeBurnNominator = slice.loadUint(32);
        const feeBurnDenominator = slice.loadUint(32);
        return {
            blackholeAddr,
            feeBurnNominator,
            feeBurnDenominator
        };
    }
    throw new Error('Invalid config');
}

export function configParse6(slice: Slice | null | undefined) {
    if (!slice) {
        // no param in mainnet for now, so throwing will cause crash of parseFullConfig()
        return null
    }
    const mintNewPrice = slice.loadCoins();
    const mintAddPrice = slice.loadCoins();
    return {
        mintNewPrice,
        mintAddPrice
    };
}

export function configParse7(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const extraCurrencies = slice.loadDict(Dictionary.Keys.BigUint(32), Dictionary.Values.BigVarUint(5));
    return [...extraCurrencies].map(e => ({
      id: e[0],
      amount: e[1],
    }))
}

export function configParseParamsIds(slice: Slice | null | undefined, unsigned: boolean) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const key = unsigned ? Dictionary.Keys.Uint(32) : Dictionary.Keys.Int(32)
    return slice.loadDictDirect(key, Dictionary.Values.Uint(0)).keys();
}

export function configParse13(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic === 0x1a) {
        const deposit = slice.loadCoins();
        const bitPrice = slice.loadCoins();
        const cellPrice = slice.loadCoins();
        return {
            deposit,
            bitPrice,
            cellPrice
        };
    }
    throw new Error('Invalid config');
}

export function configParse14(slice: Slice | null | undefined) {
     if (!slice) {
        throw Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic === 0x6b) {
        const masterchainBlockFee = slice.loadCoins();
        const workchainBlockFee = slice.loadCoins();
        return {
            masterchainBlockFee,
            workchainBlockFee
        };
    }
    throw new Error('Invalid config');
}

export function configParse15(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const validatorsElectedFor = slice.loadUint(32);
    const electorsStartBefore = slice.loadUint(32);
    const electorsEndBefore = slice.loadUint(32);
    const stakeHeldFor = slice.loadUint(32);
    return {
        validatorsElectedFor,
        electorsStartBefore,
        electorsEndBefore,
        stakeHeldFor
    };
}

export function configParse16(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }

    const maxValidators = slice.loadUint(16);
    const maxMainValidators = slice.loadUint(16);
    const minValidators = slice.loadUint(16);
    return {
        maxValidators,
        maxMainValidators,
        minValidators
    };
}

export function configParse17(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }

    const minStake = slice.loadCoins();
    const maxStake = slice.loadCoins();
    const minTotalStake = slice.loadCoins();
    const maxStakeFactor = slice.loadUint(32);

    return {
        minStake,
        maxStake,
        minTotalStake,
        maxStakeFactor
    };
}

export type StoragePrices = {
    utime_since: number,
    bit_price_ps: bigint,
    cell_price_ps: bigint,
    mc_bit_price_ps: bigint,
    mc_cell_price_ps: bigint
}
const StoragePricesDictValue: DictionaryValue<StoragePrices> = {
    serialize(src: any, builder: Builder): void {
        throw Error("not implemented")
    },
    parse(src: Slice): StoragePrices {
        const header = src.loadUint(8);
        if (header !== 0xcc) {
            throw Error('Invalid config');
        }
        const utime_since = src.loadUint(32);
        const bit_price_ps = src.loadUintBig(64);
        const cell_price_ps = src.loadUintBig(64);
        const mc_bit_price_ps = src.loadUintBig(64);
        const mc_cell_price_ps = src.loadUintBig(64);
        return {
            utime_since,
            bit_price_ps,
            cell_price_ps,
            mc_bit_price_ps,
            mc_cell_price_ps
        }
    }
}
export function configParse18(slice: Slice | null | undefined): StoragePrices[] {
    if (!slice) {
        throw Error('Invalid config');
    }
    return slice.loadDictDirect(Dictionary.Keys.Buffer(4), StoragePricesDictValue).values()
}

export function configParse8(slice: Slice | null | undefined) {
    if (!slice) {
        return {
            version: 0,
            capabilities: 0n
        }
    }

    const version = slice.loadUint(32);
    const capabilities = slice.loadUintBig(64);
    return {
        version,
        capabilities
    }
}

export function configParse40(slice: Slice | null | undefined) {
    if (!slice) {
        return null;
    }

    const header = slice.loadUint(8);
    if (header !== 1) {
        throw Error('Invalid config');
    }

    const defaultFlatFine = slice.loadCoins();
    const defaultProportionaFine = slice.loadCoins();
    const severityFlatMult = slice.loadUint(16);
    const severityProportionalMult = slice.loadUint(16);
    const unfunishableInterval = slice.loadUint(16);
    const longInterval = slice.loadUint(16);
    const longFlatMult = slice.loadUint(16);
    const longProportionalMult = slice.loadUint(16);
    const mediumInterval = slice.loadUint(16);
    const mediumFlatMult = slice.loadUint(16);
    const mediumProportionalMult = slice.loadUint(16);
    return {
        defaultFlatFine,
        defaultProportionaFine,
        severityFlatMult,
        severityProportionalMult,
        unfunishableInterval,
        longInterval,
        longFlatMult,
        longProportionalMult,
        mediumInterval,
        mediumFlatMult,
        mediumProportionalMult
    };
}


export function configParseWorkchainDescriptor(slice: Slice): WorkchainDescriptor {
    const constructorTag = slice.loadUint(8);

    if (!(constructorTag == 0xA6 || constructorTag == 0xA7)) {
        throw Error('Invalid config');
    }
    const enabledSince = slice.loadUint(32);
    const actialMinSplit = slice.loadUint(8);
    const min_split = slice.loadUint(8);
    const max_split = slice.loadUint(8);
    const basic = slice.loadBit();
    const active = slice.loadBit();
    const accept_msgs = slice.loadBit();
    const flags = slice.loadUint(13);
    const zerostateRootHash = slice.loadBuffer(32);
    const zerostateFileHash = slice.loadBuffer(32);
    const version = slice.loadUint(32);

    // Only basic format supported
    if (!slice.loadUint(4)) {
        throw Error('Invalid config');
    }

    const vmVersion = slice.loadInt(32);
    const vmMode = slice.loadUintBig(64);

    let extension: WorkchainDescriptor['workchain_v2'] = undefined;

    if(constructorTag == 0xA7) {
        const splitMergeTimings = parseWorkchainSplitMergeTimings(slice)
        const stateSplitDepth   = slice.loadUint(8);

        if(stateSplitDepth > 63) {
            throw RangeError(`Invalid persistent_state_split_depth: ${stateSplitDepth} expected <= 63`);
        }

        extension = {
            split_merge_timings: splitMergeTimings,
            persistent_state_split_depth: stateSplitDepth
        }
    }

    return {
        enabledSince,
        actialMinSplit,
        min_split,
        max_split,
        basic,
        active,
        accept_msgs,
        flags,
        zerostateRootHash,
        zerostateFileHash,
        version,
        format: {
            vmVersion,
            vmMode
        },
        workchain_v2: extension
    };
}

/*
wc_split_merge_timings#0
  split_merge_delay:uint32 split_merge_interval:uint32
  min_split_merge_interval:uint32 max_split_merge_delay:uint32
  = WcSplitMergeTimings;
*/
export type WcSplitMergeTimings = {
    split_merge_delay: number,
    split_merge_interval: number,
    min_split_merge_interval: number,
    max_split_merge_delay: number
}
export type WorkchainDescriptor = {
    enabledSince: number,
    actialMinSplit: number,
    min_split: number,
    max_split: number,
    basic: boolean,
    active: boolean,
    accept_msgs: boolean,
    flags: number,
    zerostateRootHash: Buffer,
    zerostateFileHash: Buffer,
    version: number,
    format: {
        vmVersion: number,
        vmMode: bigint
    },
    workchain_v2?: { // Result of https://github.com/ton-blockchain/ton/commit/774371bdc9f6107fd05106c1fd559e8903e0513d
        split_merge_timings: WcSplitMergeTimings,
        persistent_state_split_depth: number
    }
}

function parseWorkchainSplitMergeTimings(slice: Slice) : WcSplitMergeTimings {
    if(slice.loadUint(4) !== 0){
        throw Error(`Invalid WcSplitMergeTimings tag expected 0!`);
    }
    return {
        split_merge_delay: slice.loadUint(32),
        split_merge_interval: slice.loadUint(32),
        min_split_merge_interval: slice.loadUint(32),
        max_split_merge_delay: slice.loadUint(32)
    }
}
const WorkchainDescriptorDictValue: DictionaryValue<WorkchainDescriptor> = {
    serialize(src: any, builder: Builder): void {
        throw Error("not implemented")
    },
    parse(src: Slice): WorkchainDescriptor {
        return configParseWorkchainDescriptor(src)
    }
}

export function configParse12(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }

    const wd = slice.loadDict(Dictionary.Keys.Uint(32), WorkchainDescriptorDictValue);
    if (wd) {
        return wd
    }
    throw Error('No workchains exist')
}

export function configParseValidatorSet(slice: Slice | null | undefined) {
    if (!slice) {
        return null;
    }
    return parseValidatorSet(slice);
}

export function configParseBridge(slice: Slice | null | undefined) {
    if (!slice) {
        return null;
    }
    return parseBridge(slice);
}

export function configParseTokenBridge(slice: Slice | null | undefined) {
    if (!slice) {
        return null;
    }
        
    const magic = slice.loadUint(8)
    if (magic !== 0x01) {
        throw new Error('Invalid msg prices param');
    }

    const bridgeAddress = new Address(-1, slice.loadBuffer(32))
    const oracleAddress = new Address(-1, slice.loadBuffer(32))

    const oraclesRaw = slice.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Buffer(32))
    const oracles = [...oraclesRaw].map(e => ({
      addr: new Address(-1, e[0]),
      pubkey: e[1],
    }))

    const flags = slice.loadUintBig(8)

    const pricesRef = slice.loadRef().beginParse()

    const bridgeBurnFee = pricesRef.loadCoins()
    const bridgeMintFee = pricesRef.loadCoins()
    const walletMinTonsForStorage = pricesRef.loadCoins()
    const walletGasConsumption = pricesRef.loadCoins()
    const minterMinTonsForStorage = pricesRef.loadCoins()
    const discoverGasConsumption = pricesRef.loadCoins()

    const externalChainAddress = slice.loadBuffer(32)

    return {
        bridgeAddress,
        oracleAddress,
        oracles,
        flags,
        tokenBridgeParams: {
            bridgeBurnFee,
            bridgeMintFee,
            walletMinTonsForStorage,
            walletGasConsumption,
            minterMinTonsForStorage,
            discoverGasConsumption
        },
        externalChainAddress
    }
}

function parseGasLimitsInternal(slice: Slice) {
    const tag = slice.loadUint(8);
    if (tag === 0xde) {
        const gasPrice = slice.loadUintBig(64);
        const gasLimit = slice.loadUintBig(64);
        const specialGasLimit = slice.loadUintBig(64);
        const gasCredit = slice.loadUintBig(64);
        const blockGasLimit = slice.loadUintBig(64);
        const freezeDueLimit = slice.loadUintBig(64);
        const deleteDueLimit = slice.loadUintBig(64);
        return {
            gasPrice,
            gasLimit,
            specialGasLimit,
            gasCredit,
            blockGasLimit,
            freezeDueLimit,
            deleteDueLimit
        };
    } else if (tag === 0xdd) {
        const gasPrice = slice.loadUintBig(64);
        const gasLimit = slice.loadUintBig(64);
        const gasCredit = slice.loadUintBig(64);
        const blockGasLimit = slice.loadUintBig(64);
        const freezeDueLimit = slice.loadUintBig(64);
        const deleteDueLimit = slice.loadUintBig(64);
        return {
            gasPrice,
            gasLimit,
            gasCredit,
            blockGasLimit,
            freezeDueLimit,
            deleteDueLimit
        }
    } else {
        throw Error('Invalid config');
    }
}

export type GasLimitsPrices = ReturnType<typeof configParseGasLimitsPrices>;
export function configParseGasLimitsPrices(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const tag = slice.loadUint(8);
    if (tag === 0xd1) {
        const flatLimit = slice.loadUintBig(64);
        const flatGasPrice = slice.loadUintBig(64);
        const other = parseGasLimitsInternal(slice);
        return {
            flatLimit,
            flatGasPrice,
            other
        }
    } else {
        throw Error('Invalid config');
    }
}

function configParseLimitParams(slice: Slice) {
    const paramsLimitTag = slice.loadUint(8);

    if (paramsLimitTag === 0xc3) {
        const underload = slice.loadUintBig(32);
        const softLimit = slice.loadUintBig(32);
        const hardLimit = slice.loadUintBig(32);

        return {
            underload,
            softLimit,
            hardLimit
        };
    }
    throw Error('Invalid config');
}

export type BlockLimits = ReturnType<typeof configParseBlockLimits>;
export function configParseBlockLimits(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }

    const blockLimitTag = slice.loadUint(8);

    if (blockLimitTag === 0x5d) {
        const bytes = configParseLimitParams(slice);
        const gas = configParseLimitParams(slice);
        const ltDelta = configParseLimitParams(slice);

        return {
            bytes,
            gas,
            ltDelta
        };
    }

    throw Error('Invalid config');
}

export type MsgPrices = ReturnType<typeof configParseMsgPrices>
export function configParseMsgPrices(slice: Slice | null | undefined) {
    if (!slice) {
        throw new Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic !== 0xea) {
        throw new Error('Invalid msg prices param');
    }
    return {
        lumpPrice: slice.loadUintBig(64),
        bitPrice: slice.loadUintBig(64),
        cellPrice: slice.loadUintBig(64),
        ihrPriceFactor: slice.loadUint(32),
        firstFrac: slice.loadUint(16),
        nextFrac: slice.loadUint(16)
    };
}

// catchain_config#c1 mc_catchain_lifetime:uint32 shard_catchain_lifetime:uint32 
//   shard_validators_lifetime:uint32 shard_validators_num:uint32 = CatchainConfig;

// catchain_config_new#c2 flags:(## 7) { flags = 0 } shuffle_mc_validators:Bool
//   mc_catchain_lifetime:uint32 shard_catchain_lifetime:uint32
//   shard_validators_lifetime:uint32 shard_validators_num:uint32 = CatchainConfig;


export function configParse28(slice: Slice | null | undefined) {
    if (!slice) {
        throw new Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic === 0xc1) {
        const masterCatchainLifetime = slice.loadUint(32);
        const shardCatchainLifetime = slice.loadUint(32);
        const shardValidatorsLifetime = slice.loadUint(32);
        const shardValidatorsCount = slice.loadUint(32);
        return {
            masterCatchainLifetime,
            shardCatchainLifetime,
            shardValidatorsLifetime,
            shardValidatorsCount
        };
    }
    if (magic === 0xc2) {
        const flags = slice.loadUint(7);
        const suffleMasterValidators = slice.loadBit();
        const masterCatchainLifetime = slice.loadUint(32);
        const shardCatchainLifetime = slice.loadUint(32);
        const shardValidatorsLifetime = slice.loadUint(32);
        const shardValidatorsCount = slice.loadUint(32);
        return {
            flags,
            suffleMasterValidators,
            masterCatchainLifetime,
            shardCatchainLifetime,
            shardValidatorsLifetime,
            shardValidatorsCount
        }
    }
    throw new Error('Invalid config');
}

// consensus_config#d6 round_candidates:# { round_candidates >= 1 }
//   next_candidate_delay_ms:uint32 consensus_timeout_ms:uint32
//   fast_attempts:uint32 attempt_duration:uint32 catchain_max_deps:uint32
//   max_block_bytes:uint32 max_collated_bytes:uint32 = ConsensusConfig;

// consensus_config_new#d7 flags:(## 7) { flags = 0 } new_catchain_ids:Bool
//   round_candidates:(## 8) { round_candidates >= 1 }
//   next_candidate_delay_ms:uint32 consensus_timeout_ms:uint32
//   fast_attempts:uint32 attempt_duration:uint32 catchain_max_deps:uint32
//   max_block_bytes:uint32 max_collated_bytes:uint32 = ConsensusConfig;

// consensus_config_v3#d8 flags:(## 7) { flags = 0 } new_catchain_ids:Bool
//   round_candidates:(## 8) { round_candidates >= 1 }
//   next_candidate_delay_ms:uint32 consensus_timeout_ms:uint32
//   fast_attempts:uint32 attempt_duration:uint32 catchain_max_deps:uint32
//   max_block_bytes:uint32 max_collated_bytes:uint32 
//   proto_version:uint16 = ConsensusConfig;

export function configParse29(slice: Slice | null | undefined) {
    if (!slice) {
        throw new Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic === 0xd6) {
        const roundCandidates = slice.loadUint(32);
        const nextCandidateDelay = slice.loadUint(32);
        const consensusTimeout = slice.loadUint(32);
        const fastAttempts = slice.loadUint(32);
        const attemptDuration = slice.loadUint(32);
        const catchainMaxDeps = slice.loadUint(32);
        const maxBlockBytes = slice.loadUint(32);
        const maxColaltedBytes = slice.loadUint(32);
        return {
            roundCandidates,
            nextCandidateDelay,
            consensusTimeout,
            fastAttempts,
            attemptDuration,
            catchainMaxDeps,
            maxBlockBytes,
            maxColaltedBytes
        }
    } else if (magic === 0xd7) {
        const flags = slice.loadUint(7);
        const newCatchainIds = slice.loadBit();
        const roundCandidates = slice.loadUint(8);
        const nextCandidateDelay = slice.loadUint(32);
        const consensusTimeout = slice.loadUint(32);
        const fastAttempts = slice.loadUint(32);
        const attemptDuration = slice.loadUint(32);
        const catchainMaxDeps = slice.loadUint(32);
        const maxBlockBytes = slice.loadUint(32);
        const maxColaltedBytes = slice.loadUint(32);
        return {
            flags,
            newCatchainIds,
            roundCandidates,
            nextCandidateDelay,
            consensusTimeout,
            fastAttempts,
            attemptDuration,
            catchainMaxDeps,
            maxBlockBytes,
            maxColaltedBytes
        }
    } else if (magic === 0xd8) {
        const flags = slice.loadUint(7);
        const newCatchainIds = slice.loadBit();
        const roundCandidates = slice.loadUint(8);
        const nextCandidateDelay = slice.loadUint(32);
        const consensusTimeout = slice.loadUint(32);
        const fastAttempts = slice.loadUint(32);
        const attemptDuration = slice.loadUint(32);
        const catchainMaxDeps = slice.loadUint(32);
        const maxBlockBytes = slice.loadUint(32);
        const maxColaltedBytes = slice.loadUint(32);
        const protoVersion = slice.loadUint(16);
        return {
            flags,
            newCatchainIds,
            roundCandidates,
            nextCandidateDelay,
            consensusTimeout,
            fastAttempts,
            attemptDuration,
            catchainMaxDeps,
            maxBlockBytes,
            maxColaltedBytes,
            protoVersion
        }
    } else if (magic === 0xd9) {
        const flags = slice.loadUint(7);
        const newCatchainIds = slice.loadBit();
        const roundCandidates = slice.loadUint(8);
        const nextCandidateDelay = slice.loadUint(32);
        const consensusTimeout = slice.loadUint(32);
        const fastAttempts = slice.loadUint(32);
        const attemptDuration = slice.loadUint(32);
        const catchainMaxDeps = slice.loadUint(32);
        const maxBlockBytes = slice.loadUint(32);
        const maxColaltedBytes = slice.loadUint(32);
        const protoVersion = slice.loadUint(16);
        const catchainMaxBlocksCoeff = slice.loadUint(32);
        return {
            flags,
            newCatchainIds,
            roundCandidates,
            nextCandidateDelay,
            consensusTimeout,
            fastAttempts,
            attemptDuration,
            catchainMaxDeps,
            maxBlockBytes,
            maxColaltedBytes,
            protoVersion,
            catchainMaxBlocksCoeff
        }
    }
    throw new Error('Invalid config');
}

export function configParse31(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }

    const rawAddrsDict = slice.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Uint(0))
    
    return [...rawAddrsDict].map(e => new Address(-1, e[0]))
}

export function configParse44(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic !== 0x00) {
        throw new Error('Invalid config');
    }

    // buffer36 = uint288
    const rawAddrsDict = slice.loadDict(Dictionary.Keys.Buffer(36), Dictionary.Values.Uint(0));
    const suspendedUntil = slice.loadUintBig(32);
    
    // uint288 = [wc:int32 addr:uint256]
    const constructedAddrs = [...rawAddrsDict].map(e => new Address(
      e[0].readInt32BE(),
      e[0].subarray(4),
    ));

    return {
        addresses: constructedAddrs,
        suspendedUntil
    };
}

export function configParse45(slice: Slice | null | undefined) {
    if (!slice) {
        throw Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic !== 0xc0) {
        throw new Error('Invalid config');
    }

    const precompiledContracts = slice.loadDict(Dictionary.Keys.Buffer(32), {
      serialize: () => { throw Error('not implemented') },
      parse: (src: Slice) => {
        const tag = src.loadUint(8);
        if (tag === 0xb0) {
            return src.loadUintBig(64);
        }
        throw new Error('Invalid config');
      },
    })

    return [...precompiledContracts].map((e) => ({
        hash: e[0],
        gasUsed: e[1]
    }))
}

// cfg_vote_cfg#36 min_tot_rounds:uint8 max_tot_rounds:uint8 min_wins:uint8 max_losses:uint8 min_store_sec:uint32 max_store_sec:uint32 bit_price:uint32 cell_price:uint32 = ConfigProposalSetup;
export function parseProposalSetup(slice: Slice) {
    const magic = slice.loadUint(8);
    if (magic !== 0x36) {
        throw new Error('Invalid config');
    }
    const minTotalRounds = slice.loadUint(8);
    const maxTotalRounds = slice.loadUint(8);
    const minWins = slice.loadUint(8);
    const maxLoses = slice.loadUint(8);
    const minStoreSec = slice.loadUint(32);
    const maxStoreSec = slice.loadUint(32);
    const bitPrice = slice.loadUint(32);
    const cellPrice = slice.loadUint(32);
    return { minTotalRounds, maxTotalRounds, minWins, maxLoses, minStoreSec, maxStoreSec, bitPrice, cellPrice };
}

// cfg_vote_setup#91 normal_params:^ConfigProposalSetup critical_params:^ConfigProposalSetup = ConfigVotingSetup;
export function parseVotingSetup(slice: Slice | null | undefined) {
    if (!slice) {
        throw new Error('Invalid config');
    }
    const magic = slice.loadUint(8);
    if (magic !== 0x91) {
        throw new Error('Invalid config');
    }
    const normalParams = parseProposalSetup(slice.loadRef().beginParse());
    const criticalParams = parseProposalSetup(slice.loadRef().beginParse());
    return { normalParams, criticalParams };
}


function loadConfigParams(configBase64: string): Dictionary<number, Cell> {
    const comfigMap = Cell.fromBase64(configBase64).beginParse().loadDictDirect(
        Dictionary.Keys.Int(32),
        Dictionary.Values.Cell()
    );
    return comfigMap
}

export function loadConfigParamById(configBase64: string, id: number): Cell {
    return loadConfigParams(configBase64).get(id)!
}

export function loadConfigParamsAsSlice(configBase64: string): Map<number, Slice> {
    const pramsAsCells = loadConfigParams(configBase64);
    const params = new Map<number, Slice>();
    for (const [key, value] of pramsAsCells) {
        params.set(key, value.beginParse());
    }
    return params
}

export function parseFullConfig(configs: Map<number, Slice>) {
    return {
        configAddress: configParseMasterAddressRequired(configs.get(0)),
        electorAddress: configParseMasterAddressRequired(configs.get(1)),
        minterAddress: configParseMasterAddress(configs.get(2)),
        feeCollectorAddress: configParseMasterAddress(configs.get(3)),
        dnsRootAddress: configParseMasterAddress(configs.get(4)),
        burningConfig: configParse5(configs.get(5)),
        extraCurrenciesMintPrices: configParse6(configs.get(6)),
        extraCurrencies: configParse7(configs.get(7)),
        globalVersion: configParse8(configs.get(8)),
        configMandatoryParams: configParseParamsIds(configs.get(9), true),
        configCriticalParams: configParseParamsIds(configs.get(10), false),
        voting: parseVotingSetup(configs.get(11)),
        workchains: configParse12(configs.get(12)),
        complaintCost: configParse13(configs.get(13)),
        blockCreationRewards: configParse14(configs.get(14)),
        validators: {
            ...configParse15(configs.get(15)),
            ...configParse16(configs.get(16)),
            ...configParse17(configs.get(17))
        },
        storagePrices: configParse18(configs.get(18)),
        gasPrices: {
            masterchain: configParseGasLimitsPrices(configs.get(20)),
            workchain: configParseGasLimitsPrices(configs.get(21)),
        },
        blockLimits : {
            masterchain: configParseBlockLimits(configs.get(22)),
            workchain: configParseBlockLimits(configs.get(23)),
        },
        msgPrices: {
            masterchain: configParseMsgPrices(configs.get(24)),
            workchain: configParseMsgPrices(configs.get(25)),
        },
        catchain: configParse28(configs.get(28)),
        consensus: configParse29(configs.get(29)),
        fundamentalSmartContracts: configParse31(configs.get(31)),
        validatorSets: {
            prevValidators: configParseValidatorSet(configs.get(32)),
            prevTempValidators: configParseValidatorSet(configs.get(33)),
            currentValidators: configParseValidatorSet(configs.get(34)),
            currentTempValidators: configParseValidatorSet(configs.get(35)),
            nextValidators: configParseValidatorSet(configs.get(36)),
            nextTempValidators: configParseValidatorSet(configs.get(37))
        },
        validatorsPunish: configParse40(configs.get(40)),
        suspended: configParse44(configs.get(44)),
        precompiledContracts: configParse45(configs.get(45)),
        bridges: {
            ethereum: configParseBridge(configs.get(71)),
            binance: configParseBridge(configs.get(72)),
            polygon: configParseBridge(configs.get(73))
        },
        tokenBridges: {
            ethereum: configParseTokenBridge(configs.get(79)),
            binance: configParseTokenBridge(configs.get(81)),
            polygon: configParseTokenBridge(configs.get(82)),
        }
    };
}