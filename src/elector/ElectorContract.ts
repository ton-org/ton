import {
    Address,
    Cell,
    Contract,
    TupleReader,
    TupleBuilder,
    Dictionary,
    DictionaryValue,
    Slice,
    Builder,
    ContractProvider,
} from "@ton/core";

const FrozenDictValue: DictionaryValue<{
    address: Address;
    weight: bigint;
    stake: bigint;
}> = {
    serialize(src: any, builder: Builder): void {
        throw Error("not implemented");
    },
    parse(src: Slice): { address: Address; weight: bigint; stake: bigint } {
        const address = new Address(-1, src.loadBuffer(32));
        const weight = src.loadUintBig(64);
        const stake = src.loadCoins();
        return { address, weight, stake };
    },
};

const EntitiesDictValue: DictionaryValue<{
    stake: bigint;
    address: Address;
    adnl: Buffer;
}> = {
    serialize(src: any, builder: Builder): void {
        throw Error("not implemented");
    },
    parse(src: Slice): { stake: bigint; address: Address; adnl: Buffer } {
        const stake = src.loadCoins();
        // skip time and maxFactor
        src.skip(64);
        const address = new Address(-1, src.loadBuffer(32));
        const adnl = src.loadBuffer(32);
        return { stake, address, adnl };
    },
};

export class ElectorContract implements Contract {
    // Please note that we are NOT loading address from config to avoid mistake and send validator money to a wrong contract
    readonly address: Address = Address.parseRaw(
        "-1:3333333333333333333333333333333333333333333333333333333333333333",
    );
    //readonly source: ContractSource = new UnknownContractSource('org.ton.elector', -1, 'Elector Contract');

    static create() {
        return new ElectorContract();
    }

    constructor() {}

    async getReturnedStake(
        provider: ContractProvider,
        address: Address,
    ): Promise<bigint> {
        if (address.workChain !== -1) {
            throw Error("Only masterchain addresses could have stake");
        }
        const res = await provider.get("compute_returned_stake", [
            { type: "int", value: BigInt("0x" + address.hash.toString("hex")) },
        ]);
        return res.stack.readBigNumber();
    }

    async getPastElectionsList(provider: ContractProvider) {
        const res = await provider.get("past_elections_list", []);
        const electionsListRaw = new TupleReader(res.stack.readLispList());

        const elections: {
            id: number;
            unfreezeAt: number;
            stakeHeld: number;
        }[] = [];

        while (electionsListRaw.remaining > 0) {
            const electionsListEntry = electionsListRaw.readTuple();
            const id = electionsListEntry.readNumber();
            const unfreezeAt = electionsListEntry.readNumber();
            electionsListEntry.pop(); // Ignore vset_hash
            const stakeHeld = electionsListEntry.readNumber();
            elections.push({ id, unfreezeAt, stakeHeld });
        }
        return elections;
    }

    async getPastElections(provider: ContractProvider) {
        const res = await provider.get("past_elections", []);
        const electionsRaw = new TupleReader(res.stack.readLispList());

        const elections: {
            id: number;
            unfreezeAt: number;
            stakeHeld: number;
            totalStake: bigint;
            bonuses: bigint;
            frozen: Map<
                string,
                { address: Address; weight: bigint; stake: bigint }
            >;
        }[] = [];

        while (electionsRaw.remaining > 0) {
            const electionsEntry = electionsRaw.readTuple();
            const id = electionsEntry.readNumber();
            const unfreezeAt = electionsEntry.readNumber();
            const stakeHeld = electionsEntry.readNumber();
            electionsEntry.pop(); // Ignore vset_hash
            const frozenDict = electionsEntry.readCell();
            const totalStake = electionsEntry.readBigNumber();
            const bonuses = electionsEntry.readBigNumber();
            let frozen: Map<
                string,
                { address: Address; weight: bigint; stake: bigint }
            > = new Map();
            const frozenData = frozenDict
                .beginParse()
                .loadDictDirect(Dictionary.Keys.Buffer(32), FrozenDictValue);
            for (const [key, value] of frozenData) {
                frozen.set(BigInt("0x" + key.toString("hex")).toString(10), {
                    address: value["address"],
                    weight: value["weight"],
                    stake: value["stake"],
                });
            }
            elections.push({
                id,
                unfreezeAt,
                stakeHeld,
                totalStake,
                bonuses,
                frozen,
            });
        }
        return elections;
    }

    async getElectionEntities(provider: ContractProvider) {
        //
        // NOTE: this method doesn't call get method since for some reason it doesn't work
        //

        const account = await provider.getState();

        if (account.state.type !== "active") {
            throw Error("Unexpected error");
        }
        const cell = Cell.fromBoc(account.state.data! as Buffer)[0];
        const cs = cell.beginParse();
        if (!cs.loadBit()) {
            return null;
        }
        // (es~load_uint(32), es~load_uint(32), es~load_grams(), es~load_grams(), es~load_dict(), es~load_int(1), es~load_int(1));
        const sc = cs.loadRef().beginParse();
        const startWorkTime = sc.loadUint(32);
        const endElectionsTime = sc.loadUint(32);
        const minStake = sc.loadCoins();
        const allStakes = sc.loadCoins();
        // var (stake, time, max_factor, addr, adnl_addr) = (cs~load_grams(), cs~load_uint(32), cs~load_uint(32), cs~load_uint(256), cs~load_uint(256));
        const entitiesData = sc.loadDict(
            Dictionary.Keys.Buffer(32),
            EntitiesDictValue,
        );
        let entities: {
            pubkey: Buffer;
            stake: bigint;
            address: Address;
            adnl: Buffer;
        }[] = [];
        // const failed = sc.loadBit();
        // const finished = sc.loadBit();

        if (entitiesData) {
            for (const [key, value] of entitiesData) {
                entities.push({
                    pubkey: key,
                    stake: value["stake"],
                    address: value["address"],
                    adnl: value["adnl"],
                });
            }
        }
        return {
            minStake,
            allStakes,
            endElectionsTime,
            startWorkTime,
            entities,
        };
    }

    // possible code for fetching data via get method if it is possible to set gas limit by request
    // async getElectionEntities(block: number) {

    //     const res = await this.client.runMethod(block, this.address, 'participant_list_extended');
    //     if (res.exitCode !== 0 && res.exitCode !== 1) {
    //         throw Error('Exit code: ' + res.exitCode);
    //     }

    //     let tuple = new TupleReader(res.result);
    //     const startWorkTime = tuple.readNumber();
    //     const endElectionsTime = tuple.readNumber();
    //     const minStake = tuple.readBigNumber();
    //     const allStakes = tuple.readBigNumber();
    //     let entriesTuple = tuple.readTuple();
    //     const entriesRaw = new TupleReader(entriesTuple.readLispList());
    //     let entities: { pubkey: Buffer, stake: bigint, address: Address, adnl: Buffer }[] = [];
    //     while (entriesRaw.remaining > 0) {
    //         const electionsEntry = entriesRaw.readTuple();
    //         const pubkey = electionsEntry.readBuffer();
    //         const stake = electionsEntry.readBigNumber();
    //         const address = electionsEntry.readAddress();
    //         const adnl = electionsEntry.readBuffer();
    //         entities.push({ pubkey, stake, address, adnl });
    //     }

    //     return { minStake, allStakes, endElectionsTime, startWorkTime, entities };
    // }

    async getActiveElectionId(provider: ContractProvider) {
        const res = await provider.get("active_election_id", []);
        const electionId = res.stack.readNumber();
        return electionId > 0 ? electionId : null;
    }

    async getComplaints(provider: ContractProvider, electionId: number) {
        const b = new TupleBuilder();
        b.writeNumber(electionId);
        const res = await provider.get("list_complaints", b.build());
        if (res.stack.peek().type === "null") {
            return [];
        }
        //let tuple = new TupleReader(res.result);
        const complaintsRaw = new TupleReader(res.stack.readLispList());

        const results: {
            id: bigint;
            publicKey: Buffer;
            createdAt: number;
            severity: number;
            paid: bigint;
            suggestedFine: bigint;
            suggestedFinePart: bigint;
            rewardAddress: Address;
            votes: number[];
            remainingWeight: bigint;
            vsetId: bigint;
        }[] = [];

        while (complaintsRaw.remaining > 0) {
            const complaintsEntry = complaintsRaw.readTuple();
            const id = complaintsEntry.readBigNumber();
            const completeUnpackedComplaint = complaintsEntry.readTuple();
            const unpackedComplaints = completeUnpackedComplaint.readTuple();
            const publicKey = Buffer.from(
                unpackedComplaints.readBigNumber().toString(16),
                "hex",
            );
            // prod_info#34 utime:uint32 mc_blk_ref:ExtBlkRef state_proof:^(MERKLE_PROOF Block)
            // prod_proof:^(MERKLE_PROOF ShardState) = ProducerInfo;
            // no_blk_gen from_utime:uint32 prod_info:^ProducerInfo = ComplaintDescr;
            // no_blk_gen_diff prod_info_old:^ProducerInfo prod_info_new:^ProducerInfo = ComplaintDescr;
            const description = unpackedComplaints.readCell();
            const createdAt = unpackedComplaints.readNumber();
            const severity = unpackedComplaints.readNumber();
            const rewardAddress = new Address(
                -1,
                Buffer.from(
                    unpackedComplaints.readBigNumber().toString(16),
                    "hex",
                ),
            );
            const paid = unpackedComplaints.readBigNumber();
            const suggestedFine = unpackedComplaints.readBigNumber();
            const suggestedFinePart = unpackedComplaints.readBigNumber();
            const votes: number[] = [];
            const votersListRaw = new TupleReader(
                completeUnpackedComplaint.readLispList(),
            );
            while (votersListRaw.remaining > 0) {
                votes.push(votersListRaw.readNumber());
            }
            const vsetId = completeUnpackedComplaint.readBigNumber();
            const remainingWeight = completeUnpackedComplaint.readBigNumber();

            results.push({
                id,
                publicKey,
                createdAt,
                severity,
                paid,
                suggestedFine,
                suggestedFinePart,
                rewardAddress,
                votes,
                remainingWeight,
                vsetId,
            });
        }
        return results;
    }
}
