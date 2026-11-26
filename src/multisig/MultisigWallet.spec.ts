import "@ton/test-utils";

import { ContractProvider, internal, SendMode, toNano } from "@ton/core";
import { keyPairFromSeed, sign } from "@ton/crypto";
import { Blockchain } from "@ton/sandbox";
import { MultisigOrder } from "./MultisigOrder";
import { MultisigOrderBuilder } from "./MultisigOrderBuilder";
import { MultisigWallet } from "./MultisigWallet";

const walletId = 123;
const now = 1_800_000_000;
const ownerKeys = [
    keyPairFromSeed(Buffer.alloc(32, 1)),
    keyPairFromSeed(Buffer.alloc(32, 2)),
];

async function setup() {
    const blockchain = await Blockchain.create();
    blockchain.now = now;
    const deployer = await blockchain.treasury("deployer");
    const wallet = new MultisigWallet(
        ownerKeys.map((key) => key.publicKey),
        0,
        walletId,
        2,
    );
    const contract = blockchain.openContract({
        address: wallet.address,
        init: wallet.init,
        async sendDeploy(_provider: ContractProvider) {
            await wallet.deployInternal(deployer.getSender(), toNano("10"));
        },
        async sendFirstSignature(
            provider: ContractProvider,
            order: MultisigOrder,
        ) {
            await wallet.sendOrder(order, ownerKeys[0].secretKey, provider);
        },
        async sendSecondSignature(
            provider: ContractProvider,
            order: MultisigOrder,
        ) {
            const signature = sign(
                order.toCell(1).hash(),
                ownerKeys[1].secretKey,
            );
            await wallet.sendOrderWithoutSecretKey(
                order,
                signature,
                1,
                provider,
            );
        },
    });
    return { blockchain, contract, deployer, wallet };
}

describe("MultisigWallet", () => {
    it("deploys internally and reloads its owner configuration from the active contract", async () => {
        const { blockchain, contract, deployer, wallet } = await setup();
        const result = await contract.sendDeploy();
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: wallet.address,
            deploy: true,
            success: true,
        });

        const restored = await MultisigWallet.fromAddress(wallet.address, {
            provider: blockchain.provider(wallet.address),
        });
        expect(restored.address.equals(wallet.address)).toBe(true);
        expect(restored.walletId).toBe(walletId);
        expect(restored.k).toBe(2);
        expect(restored.owners.size).toBe(ownerKeys.length);
        expect(
            ownerKeys.map(({ publicKey }) =>
                restored.getOwnerIdByPubkey(publicKey),
            ),
        ).toEqual([0, 1]);
    });

    it("sends a transfer only when both owners have signed the order", async () => {
        const { blockchain, contract, wallet } = await setup();
        await contract.sendDeploy();
        const recipient = await blockchain.treasury("recipient");
        const value = toNano("1");
        const builder = new MultisigOrderBuilder(walletId);
        builder.addMessage(
            internal({ to: recipient.address, value }),
            SendMode.PAY_GAS_SEPARATELY,
        );
        builder.queryId = BigInt(now + 7200) << 32n;
        const order = builder.build();

        const pending = await contract.sendFirstSignature(order);
        expect(pending.transactions).toHaveTransaction({
            to: wallet.address,
            success: true,
        });
        expect(pending.transactions).not.toHaveTransaction({
            from: wallet.address,
            to: recipient.address,
        });

        const executed = await contract.sendSecondSignature(order);
        expect(executed.transactions).toHaveTransaction({
            from: wallet.address,
            to: recipient.address,
            value,
            success: true,
        });
    });
});
