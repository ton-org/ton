import { Address, Slice, Cell, Dictionary, type DictionaryValue, Builder } from "@ton/core";

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
    serialize(_src: any, _builder: Builder): void {
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

export function parseValidatorSet(slice: Slice): {
    timeSince: number;
    timeUntil: number;
    total: number;
    main: number;
    totalWeight: null | bigint;
    list: Dictionary<number, {
        publicKey: Buffer;
        weight: bigint;
        adnlAddress: Buffer | null;
    }>;
} | undefined {
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

    return;
}

export function parseBridge(slice: Slice): {
    bridgeAddress: Address;
    oracleMultisigAddress: Address;
    oracles: Map<string, Buffer>;
    externalChainAddress: Buffer;
} {
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

export function configParseMasterAddressRequired(slice: Slice | null | undefined): Address {
    if (!slice) {
        throw Error('Invalid config');
    }

    return configParseMasterAddress(slice)!;
}

export function configParse5(slice: Slice | null | undefined): {
    blackholeAddr: Address | null;
    feeBurnNominator: number;
    feeBurnDenominator: number;
} {
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

export function configParse13(slice: Slice | null | undefined): {
    deposit: bigint;
    bitPrice: bigint;
    cellPrice: bigint;
} {
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

export function configParse15(slice: Slice | null | undefined): {
    validatorsElectedFor: number;
    electorsStartBefore: number;
    electorsEndBefore: number;
    stakeHeldFor: number;
} {
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

export function configParse16(slice: Slice | null | undefined): {
    maxValidators: number;
    maxMainValidators: number;
    minValidators: number;
} {
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

export function configParse17(slice: Slice | null | undefined): {
    minStake: bigint;
    maxStake: bigint;
    minTotalStake: bigint;
    maxStakeFactor: number;
} {
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
    serialize(_src: any, _builder: Builder): void {
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

export function configParse8(slice: Slice | null | undefined): {
    version: number;
    capabilities: bigint;
} {
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

export function configParse40(slice: Slice | null | undefined): {
    defaultFlatFine: bigint;
    defaultProportionaFine: bigint;
    severityFlatMult: number;
    severityProportionalMult: number;
    unfunishableInterval: number;
    longInterval: number
    longFlatMult: number
    mediumInterval: number
    mediumFlatMult: number
    longProportionalMult: number
    mediumProportionalMult: number;
} | null {
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
    if (slice.loadUint(8) !== 0xA6) {
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
    if (slice.loadBit()) {
        throw Error('Invalid config');
    }
    const vmVersion = slice.loadUint(32);
    const vmMode = slice.loadUintBig(64);

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
        }
    };
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
    }
}

const WorkchainDescriptorDictValue: DictionaryValue<WorkchainDescriptor> = {
    serialize(_src: any, _builder: Builder): void {
        throw Error("not implemented")
    },
    parse(src: Slice): WorkchainDescriptor {
        if (src.loadUint(8) !== 0xA6) {
            throw Error('Invalid config');
        }
        const enabledSince = src.loadUint(32);
        const actialMinSplit = src.loadUint(8);
        const min_split = src.loadUint(8);
        const max_split = src.loadUint(8);
        const basic = src.loadBit();
        const active = src.loadBit();
        const accept_msgs = src.loadBit();
        const flags = src.loadUint(13);
        const zerostateRootHash = src.loadBuffer(32);
        const zerostateFileHash = src.loadBuffer(32);
        const version = src.loadUint(32);
    
        // Only basic format supported
        if (src.loadBit()) {
            throw Error('Invalid config');
        }
        const vmVersion = src.loadUint(32);
        const vmMode = src.loadUintBig(64);
    
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
            }
        };
    }
}

export function configParse12(slice: Slice | null | undefined): Dictionary<number, WorkchainDescriptor> {
    if (!slice) {
        throw Error('Invalid config');
    }

    const wd = slice.loadDict(Dictionary.Keys.Uint(32), WorkchainDescriptorDictValue);

    if (wd) {
        return wd
    }

    throw Error('No workchains exist')
}

export function configParseValidatorSet(slice: Slice | null | undefined): {
    timeSince: number;
    timeUntil: number;
    total: number;
    main: number;
    totalWeight: null | bigint;
    list: Dictionary<number, {
        publicKey: Buffer;
        weight: bigint;
        adnlAddress: Buffer | null;
    }>;
} | null | undefined {
    if (!slice) {
        return null;
    }
    return parseValidatorSet(slice);
}

export function configParseBridge(slice: Slice | null | undefined): {
    bridgeAddress: Address;
    oracleMultisigAddress: Address;
    oracles: Map<string, Buffer>;
    externalChainAddress: Buffer;
} | null {
    if (!slice) {
        return null;
    }
    return parseBridge(slice);
}

function parseGasLimitsInternal(slice: Slice): { 
    gasPrice: bigint;
    gasLimit: bigint;
    specialGasLimit: bigint;
    gasCredit: bigint;
    blockGasLimit: bigint;
    freezeDueLimit: bigint;
    deleteDueLimit: bigint;
} | { 
    gasPrice: bigint;
    gasLimit: bigint;
    gasCredit: bigint;
    blockGasLimit: bigint;
    freezeDueLimit: bigint;
    deleteDueLimit: bigint;
} {
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

export function configParseGasLimitsPrices(slice: Slice | null | undefined): { 
    flatLimit: bigint;
    flatGasPrice: bigint;
    other: { 
        gasPrice: bigint;
        gasLimit: bigint;
        specialGasLimit: bigint;
        gasCredit: bigint;
        blockGasLimit: bigint;
        freezeDueLimit: bigint;
        deleteDueLimit: bigint;
    } | { 
        gasPrice: bigint;
        gasLimit: bigint;
        gasCredit: bigint;
        blockGasLimit: bigint;
        freezeDueLimit: bigint;
        deleteDueLimit: bigint;
    };

} {
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

export type MsgPrices = ReturnType<typeof configParseMsgPrices>

export function configParseMsgPrices(slice: Slice | null | undefined): {
    lumpPrice: bigint;
    bitPrice: bigint;
    cellPrice: bigint;
    ihrPriceFactor: number;
    firstFrac: number;
    nextFrac: number;
} {
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


export function configParse28(slice: Slice | null | undefined): { 
    masterCatchainLifetime: number;
    shardCatchainLifetime: number;
    shardValidatorsLifetime: number;
    shardValidatorsCount: number;
} | { 
    flags: number;
    suffleMasterValidators: boolean;
    masterCatchainLifetime: number;
    shardCatchainLifetime: number;
    shardValidatorsLifetime: number;
    shardValidatorsCount: number;
} {
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

export function configParse29(slice: Slice | null | undefined): { 
    roundCandidates: number;
    nextCandidateDelay: number;
    consensusTimeout: number;
    fastAttempts: number;
    attemptDuration: number;
    catchainMaxDeps: number;
    maxBlockBytes: number;
    maxColaltedBytes: number;
} | { 
    flags: number;
    newCatchainIds: boolean;
    roundCandidates: number;
    nextCandidateDelay: number;
    consensusTimeout: number;
    fastAttempts: number;
    attemptDuration: number;
    catchainMaxDeps: number;
    maxBlockBytes: number;
    maxColaltedBytes: number;
} | { 
    flags: number;
    newCatchainIds: boolean;
    roundCandidates: number;
    nextCandidateDelay: number;
    consensusTimeout: number;
    fastAttempts: number;
    attemptDuration: number;
    catchainMaxDeps: number;
    maxBlockBytes: number;
    maxColaltedBytes: number;
    protoVersion: number;
} | { 
    flags: number;
    newCatchainIds: boolean;
    roundCandidates: number;
    nextCandidateDelay: number;
    consensusTimeout: number;
    fastAttempts: number;
    attemptDuration: number;
    catchainMaxDeps: number;
    maxBlockBytes: number;
    maxColaltedBytes: number;
    protoVersion: number;
    catchainMaxBlocksCoeff: number;
} {
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

// cfg_vote_cfg#36 min_tot_rounds:uint8 max_tot_rounds:uint8 min_wins:uint8 max_losses:uint8 min_store_sec:uint32 max_store_sec:uint32 bit_price:uint32 cell_price:uint32 = ConfigProposalSetup;
export function parseProposalSetup(slice: Slice): {
    minTotalRounds: number;
    maxTotalRounds: number;
    minWins: number;
    maxLoses: number;
    minStoreSec: number;
    maxStoreSec: number;
    bitPrice: number;
    cellPrice: number;
} {
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
export function parseVotingSetup(slice: Slice | null | undefined): {
    normalParams: {
        minTotalRounds: number;
        maxTotalRounds: number;
        minWins: number;
        maxLoses: number;
        minStoreSec: number;
        maxStoreSec: number;
        bitPrice: number;
        cellPrice: number;
    };
    criticalParams: {
        minTotalRounds: number;
        maxTotalRounds: number;
        minWins: number;
        maxLoses: number;
        minStoreSec: number;
        maxStoreSec: number;
        bitPrice: number;
        cellPrice: number;
    };
} {
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

export function parseFullConfig(configs: Map<number, Slice>): {
    configAddress: Address;
    electorAddress: Address;
    minterAddress: Address | null;
    feeCollectorAddress: Address | null;
    dnsRootAddress: Address | null;
    burningConfig: { 
        blackholeAddr: Address | null;
        feeBurnNominator: number;
        feeBurnDenominator: number;

    }; 
    globalVersion: { 
        version: number;
        capabilities: bigint;
    };
     workchains: Dictionary<number, WorkchainDescriptor>;
    voting: {
        normalParams: {
            minTotalRounds: number;
            maxTotalRounds: number;
            minWins: number;
            maxLoses: number;
            minStoreSec: number;
            maxStoreSec: number;
            bitPrice: number;
            cellPrice: number;
        };
        criticalParams: {
            minTotalRounds: number;
            maxTotalRounds: number;
            minWins: number;
            maxLoses: number;
            minStoreSec: number;
            maxStoreSec: number;
            bitPrice: number;
            cellPrice: number;
        };
    };
    validators: { 
        minStake: bigint;
        maxStake: bigint;
        minTotalStake: bigint;
        maxStakeFactor: number;
        maxValidators: number;
        maxMainValidators: number;
        minValidators: number;
        validatorsElectedFor: number;
        electorsStartBefore: number;
        electorsEndBefore: number;
        stakeHeldFor: number;
    }; 
    storagePrices: StoragePrices[];
    gasPrices: {
        masterchain: {
            flatLimit: bigint;
            flatGasPrice: bigint;
            other: {
                gasPrice: bigint;
                gasLimit: bigint;
                specialGasLimit: bigint;
                gasCredit: bigint;
                blockGasLimit: bigint;
                freezeDueLimit: bigint;
                deleteDueLimit: bigint;
            } | {
                gasPrice: bigint;
                gasLimit: bigint;
                gasCredit: bigint;
                blockGasLimit: bigint;
                freezeDueLimit: bigint;
                deleteDueLimit: bigint;
            };
        }; workchain: {
            flatLimit: bigint;
            flatGasPrice: bigint;
            other: {
                gasPrice: bigint;
                gasLimit: bigint;
                specialGasLimit: bigint;
                gasCredit: bigint;
                blockGasLimit: bigint;
                freezeDueLimit: bigint;
                deleteDueLimit: bigint;
            } | {
                gasPrice: bigint;
                gasLimit: bigint;
                gasCredit: bigint;
                blockGasLimit: bigint;
                freezeDueLimit: bigint;
                deleteDueLimit: bigint;
            };
        };
    };
    msgPrices: { 
        masterchain: { 
            lumpPrice: bigint;
            bitPrice: bigint;
            cellPrice: bigint;
            ihrPriceFactor: number;
            firstFrac: number;
            nextFrac: number;
        }; 
        workchain: { 
            lumpPrice: bigint;
            bitPrice: bigint;
            cellPrice: bigint;
            ihrPriceFactor: number;
            firstFrac: number;
            nextFrac: number;
        }; 
    };
    validatorSets: {
        prevValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
        prevTempValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
        currentValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
        currentTempValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
        nextValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
        nextTempValidators: {
            timeSince: number;
            timeUntil: number;
            total: number;
            main: number;
            totalWeight: null | bigint;
            list: Dictionary<number, {
                publicKey: Buffer;
                weight: bigint;
                adnlAddress: Buffer | null;
            }>;
        } | null | undefined;
    };
    validatorsPunish: { 
        defaultFlatFine: bigint;
        defaultProportionaFine: bigint;
        severityFlatMult: number;
        severityProportionalMult: number;
        unfunishableInterval: number;
        longInterval: number;
        longFlatMult: number;
        mediumInterval: number;
        mediumFlatMult: number;
        longProportionalMult: number;
        mediumProportionalMult: number;
    } | null;
    bridges: { 
        ethereum: { 
            bridgeAddress: Address;
            oracleMultisigAddress: Address;
            oracles: Map<string, Buffer>;
            externalChainAddress: Buffer;
        } | null;
        binance: { 
            bridgeAddress: Address;
            oracleMultisigAddress: Address;
            oracles: Map<string, Buffer>;
            externalChainAddress: Buffer;
        } | null;
        polygon: { 
            bridgeAddress: Address;
            oracleMultisigAddress: Address;
            oracles: Map<string, Buffer>;
            externalChainAddress: Buffer;
        } | null;
    }; 
    catchain: { 
        masterCatchainLifetime: number;
        shardCatchainLifetime: number;
        shardValidatorsLifetime: number;
        shardValidatorsCount: number;
    } | { 
        flags: number;
        suffleMasterValidators: boolean;
        masterCatchainLifetime: number;
        shardCatchainLifetime: number;
        shardValidatorsLifetime: number;
        shardValidatorsCount: number;
    }; 
    consensus: { 
        roundCandidates: number;
        nextCandidateDelay: number;
        consensusTimeout: number;
        fastAttempts: number;
        attemptDuration: number;
        catchainMaxDeps: number;
        maxBlockBytes: number;
        maxColaltedBytes: number;
    } | { 
        flags: number;
        newCatchainIds: boolean;
        roundCandidates: number;
        nextCandidateDelay: number;
        consensusTimeout: number;
        fastAttempts: number;
        attemptDuration: number;
        catchainMaxDeps: number;
        maxBlockBytes: number;
        maxColaltedBytes: number;
    } | { 
        flags: number;
        newCatchainIds: boolean;
        roundCandidates: number;
        nextCandidateDelay: number;
        consensusTimeout: number;
        fastAttempts: number;
        attemptDuration: number;
        catchainMaxDeps: number;
        maxBlockBytes: number;
        maxColaltedBytes: number;
        protoVersion: number;
    } | { 
        flags: number;
        newCatchainIds: boolean;
        roundCandidates: number;
        nextCandidateDelay: number;
        consensusTimeout: number;
        fastAttempts: number;
        attemptDuration: number;
        catchainMaxDeps: number;
        maxBlockBytes: number;
        maxColaltedBytes: number;
        protoVersion: number;
        catchainMaxBlocksCoeff: number;
    };
} {
    return {
        configAddress: configParseMasterAddressRequired(configs.get(0)),
        electorAddress: configParseMasterAddressRequired(configs.get(1)),
        minterAddress: configParseMasterAddress(configs.get(2)),
        feeCollectorAddress: configParseMasterAddress(configs.get(3)),
        dnsRootAddress: configParseMasterAddress(configs.get(4)),
        burningConfig: configParse5(configs.get(5)),
        globalVersion: configParse8(configs.get(8)),
        workchains: configParse12(configs.get(12)),
        voting: parseVotingSetup(configs.get(11)),
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
        msgPrices: {
            masterchain: configParseMsgPrices(configs.get(24)),
            workchain: configParseMsgPrices(configs.get(25)),
        },
        validatorSets: {
            prevValidators: configParseValidatorSet(configs.get(32)),
            prevTempValidators: configParseValidatorSet(configs.get(33)),
            currentValidators: configParseValidatorSet(configs.get(34)),
            currentTempValidators: configParseValidatorSet(configs.get(35)),
            nextValidators: configParseValidatorSet(configs.get(36)),
            nextTempValidators: configParseValidatorSet(configs.get(37))
        },
        validatorsPunish: configParse40(configs.get(40)),
        bridges: {
            ethereum: configParseBridge(configs.get(71)),
            binance: configParseBridge(configs.get(72)),
            polygon: configParseBridge(configs.get(73))
        },
        catchain: configParse28(configs.get(28)),
        consensus: configParse29(configs.get(29))
        // TODO: mint_new_price:Grams mint_add_price:Grams = ConfigParam 6;
        // TODO: to_mint:ExtraCurrencyCollection = ConfigParam 7
        // TODO: mandatory_params:(Hashmap 32 True) = ConfigParam 9
        // TODO: critical_params:(Hashmap 32 True) = ConfigParam 10
        // TODO: BlockCreateFees = ConfigParam 14
    };
}