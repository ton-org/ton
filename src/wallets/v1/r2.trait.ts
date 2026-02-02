import { internal, toNano } from "@ton/core";
import { WalletContractV1R2 } from "./r2";
import { v1r1Tests } from "./r1.trait";

export const v1r2Tests = async (setup: Parameters<typeof v1r1Tests>[0]) => {
    v1r1Tests(setup);

    it("should produce different transfer body when created with domain (signature differs)", async () => {
        const { keyPair, contract } = await setup();
        const walletDefault = WalletContractV1R2.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
        });
        const walletWithDomain = WalletContractV1R2.create({
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

    it("should have seqno get method", async () => {
        const { blockchain, contract } = await setup();

        await blockchain.runGetMethod(contract.address, "seqno", []);
    });
};
