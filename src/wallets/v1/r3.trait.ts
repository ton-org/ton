import { internal, toNano } from "@ton/core";
import { SandboxContract } from "@ton/sandbox";
import { WalletContractV1R3 } from "./r3";
import { v1r2Tests } from "./r2.trait";

type V1R3SetupResult = Omit<
    Awaited<ReturnType<Parameters<typeof v1r2Tests>[0]>>,
    "contract"
> & {
    contract: SandboxContract<WalletContractV1R3>;
};

export const v1r3Tests = async (setup: () => Promise<V1R3SetupResult>) => {
    v1r2Tests(setup);

    it("should produce different transfer body when created with domain (signature differs)", async () => {
        const { keyPair, contract } = await setup();
        const walletDefault = WalletContractV1R3.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
        });
        const walletWithDomain = WalletContractV1R3.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
            domain: { type: "l2", globalId: 42 },
        });
        const args = {
            seqno: 1,
            secretKey: keyPair.secretKey,
            message: internal({ to: contract.address, value: toNano("1") }),
        };
        expect(
            walletDefault
                .createTransfer(args)
                .equals(walletWithDomain.createTransfer(args)),
        ).toBe(false);
    });

    it("should have get_public_key get method", async () => {
        const { blockchain, contract } = await setup();

        await blockchain.runGetMethod(contract.address, "get_public_key", []);
    });
};
