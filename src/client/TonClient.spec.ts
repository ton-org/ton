import { Address, beginCell } from '@ton/core';
import { TonClient } from './TonClient';

let describeConditional = process.env.TEST_CLIENTS ? describe : describe.skip;

describeConditional('TonClient', () => {
    let client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    });
    const testAddress = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');

    it('should get contract state', async () => {
        let state = await client.getContractState(testAddress);
        console.log(state);
    });

    it('should get balance', async () => {
        let balance = await client.getBalance(testAddress);
        console.log(balance);
    });

    it('should get transactions', async () => {
        let transactions = await client.getTransactions(testAddress, { limit: 3 });
        console.log(transactions);
    });

    it('should get single transaction', async () => {
        let info = await client.getTransaction(testAddress, '37508996000003', 'xiwW9EROcDMWFibmm2YNW/2kTaDW5qwRJxveEf4xUQA=');
        console.log(info);
    });

    it('should run method', async () => {
        let seqno = await client.runMethod(testAddress, 'seqno');
        console.log(seqno);
    });

    it('should get mc info', async () => {
        let info = await client.getMasterchainInfo();

        let shardInfo = await client.getShardTransactions(info.workchain, info.latestSeqno, info.shard);
        let wcShards = await client.getWorkchainShards(info.latestSeqno);

        console.log(info, shardInfo, wcShards);
    });

    it('should check contract is deployed', async () => {
        expect(await client.isContractDeployed(testAddress)).toBe(true);
    });

    it('should get extra currency info', async () => {
        // EC is rolled out only in testned yet
        let testClient = new TonClient({
            endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC'
        });

        let testAddr = Address.parse("0:D36CFC9E0C57F43C1A719CB9F540ED87A694693AE1535B7654B645F52814AFD7");

        let res = await testClient.getContractState(testAddr);
        let expectedEc = res.extra_currencies?.find(e => e.id == 100)!;
        expect(expectedEc).not.toBeUndefined();
        expect(BigInt(expectedEc.amount)).toBe(10000000n);
    });

    it('should locate source/result tx', async () => {
        let source = Address.parse('UQDDT0TOC4PMp894jtCo3-d1-8ltSjXMX2EuWww_pCNibsUH');
        let createdLt = '37508996000002';

        let infoSource = await client.tryLocateSourceTx(source, testAddress, createdLt);
        console.log(infoSource);

        let infoResult = await client.tryLocateResultTx(source, testAddress, createdLt);
        console.log(infoResult);
    });
});