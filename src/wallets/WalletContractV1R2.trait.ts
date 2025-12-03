import { v1r1Tests } from "./WalletContractV1R1.trait";

export const v1r2Tests = async (setup: Parameters<typeof v1r1Tests>[0]) => {
  v1r1Tests(setup);

  it("should have seqno get method", async () => {
    const { blockchain, contract } = await setup();

    await blockchain.runGetMethod(contract.address, "seqno", []);
  });
};
