import { TonStreaming } from "../TonStreaming";
import { StreamingSubscription } from "./types";

function makeMockClient() {
    return {
        connect: jest.fn<Promise<void>, [StreamingSubscription | undefined]>(),
        subscribe: jest.fn<Promise<void>, [StreamingSubscription]>(),
        unsubscribe: jest.fn<Promise<void>, [any]>(),
        close: jest.fn<void, []>(),
        on: jest.fn().mockReturnValue(() => undefined),
        off: jest.fn<void, [any, any]>(),
        get connected() {
            return false;
        },
    };
}

describe("TonStreaming", () => {
    it("accepts a streaming client", () => {
        const client = makeMockClient();

        expect(() => new TonStreaming(client)).not.toThrow();
    });

    it("throws when constructed without a client", () => {
        expect(() => new TonStreaming(undefined as never)).toThrow(
            "A streaming client must be provided",
        );
    });

    it("forwards connect params to the wrapped client", async () => {
        const client = makeMockClient();
        const streaming = new TonStreaming(client);
        const subscription: StreamingSubscription = {
            addresses: ["EQC123"],
            types: ["transactions"],
        };

        await streaming.connect(subscription);

        expect(client.connect).toHaveBeenCalledWith(subscription);
        expect(client.close).not.toHaveBeenCalled();
    });

    it("closes the client when connect fails", async () => {
        const client = makeMockClient();
        client.connect.mockRejectedValue(new Error("connect failed"));
        const streaming = new TonStreaming(client);

        await expect(
            streaming.connect({
                addresses: ["EQC123"],
                types: ["transactions"],
            }),
        ).rejects.toThrow("connect failed");

        expect(client.close).toHaveBeenCalledTimes(1);
    });

    it("closes the client when subscribe fails", async () => {
        const client = makeMockClient();
        client.subscribe.mockRejectedValue(new Error("subscribe failed"));
        const streaming = new TonStreaming(client);

        await expect(
            streaming.subscribe({
                addresses: ["EQC123"],
                types: ["transactions"],
            }),
        ).rejects.toThrow("subscribe failed");

        expect(client.close).toHaveBeenCalledTimes(1);
    });
});
