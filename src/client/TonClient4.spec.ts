import { Address, beginCell } from "@ton/core";
import { TonClient } from "./TonClient";
import { TonClient4 } from "./TonClient4";
import { backoff } from "../utils/time";

type ECMap = { [k: number]: bigint };

let describeConditional = process.env.TEST_CLIENTS ? describe : describe.skip;

describeConditional("TonClient", () => {
    let client = new TonClient4({
        endpoint: "https://mainnet-v4.tonhubapi.com",
    });
    const testAddress = Address.parse(
        "EQBicYUqh1j9Lnqv9ZhECm0XNPaB7_HcwoBb3AJnYYfqB38_",
    );

    let seqno!: number;
    beforeAll(async () => {
        let last = await client.getLastBlock();
        seqno = last.last.seqno;
    });

    it("should get account with transactions", async () => {
        let account = await client.getAccount(seqno, testAddress);
        let accountLite = await client.getAccountLite(seqno, testAddress);

        let transactions = await client.getAccountTransactions(
            testAddress,
            BigInt(accountLite.account.last!.lt),
            Buffer.from(accountLite.account.last!.hash, "base64"),
        );
        let result = await client.isAccountChanged(
            seqno,
            testAddress,
            BigInt(accountLite.account.last!.lt),
        );
        console.log(transactions, result);

        console.log(account, accountLite);
    });

    it("should get account parsed transactions", async () => {
        let accountLite = await backoff(
            async () => await client.getAccountLite(seqno, testAddress),
            true,
        );
        let parsedTransactions = await backoff(
            async () =>
                await client.getAccountTransactionsParsed(
                    testAddress,
                    BigInt(accountLite.account.last!.lt),
                    Buffer.from(accountLite.account.last!.hash, "base64"),
                    10,
                ),
            true,
        );

        console.log(parsedTransactions.transactions.length);
    }, 60_000);

    it("should get config", async () => {
        let config = await client.getConfig(seqno);
        console.log(config);
    });

    it("should get block", async () => {
        let result = await client.getBlock(seqno);
        console.log(result);
    });

    it("should get extra currency info", async () => {
        let testAddresses = [
            "-1:0000000000000000000000000000000000000000000000000000000000000000",
            "0:C4CAC12F5BC7EEF4CF5EC84EE68CCF860921A06CA0395EC558E53E37B13C3B08",
            "0:F5FFA780ACEE2A41663C1E32F50D771327275A42FC9D3FAB4F4D9CDE11CCA897",
        ].map((a) => Address.parse(a));

        let knownEc = [239, 4294967279];
        let expectedEc: ECMap[] = [
            { 239: 663333333334n, 4294967279: 998444444446n },
            { 239: 989097920n },
            { 239: 666666666n, 4294967279: 777777777n },
        ];

        for (let i = 0; i < testAddresses.length; i++) {
            let res = await backoff(
                async () => await client.getAccount(seqno, testAddresses[i]),
                false,
            );
            let resLite = await backoff(
                async () =>
                    await client.getAccountLite(seqno, testAddresses[i]),
                false,
            );
            let expected = expectedEc[i];

            for (let testEc of knownEc) {
                let expCur = expected[testEc];
                if (expCur) {
                    expect(
                        BigInt(res.account.balance.currencies[testEc]),
                    ).toEqual(expCur);
                    expect(
                        BigInt(resLite.account.balance.currencies[testEc]),
                    ).toEqual(expCur);
                }
            }
        }
    });

    it("should run method", async () => {
        let result = await client.runMethod(seqno, testAddress, "seqno");
        console.log(result);
    });
});
