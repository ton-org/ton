import { SandboxContract } from "@ton/sandbox";
import { WalletContractV1R3 } from "./WalletContractV1R3";
import { v1r2Tests } from "./WalletContractV1R2.trait";

type V1R3SetupResult = Omit<
  Awaited<ReturnType<Parameters<typeof v1r2Tests>[0]>>,
  "contract"
> & {
  contract: SandboxContract<WalletContractV1R3>;
};

export const v1r3Tests = async (setup: () => Promise<V1R3SetupResult>) => {
  v1r2Tests(setup);

  it("should have get_public_key get method", async () => {
    const { blockchain, contract } = await setup();

    await blockchain.runGetMethod(contract.address, "get_public_key", []);
  });
};
