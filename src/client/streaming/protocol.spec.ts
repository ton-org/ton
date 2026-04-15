import { parseStreamingEvent } from "./protocol";
import type {
    StreamingActionsEvent,
    StreamingTraceEvent,
    StreamingTransactionsEvent,
} from "./types";

describe("parseStreamingEvent", () => {
    it("parses actions with a generic but structured details object", () => {
        const event = parseStreamingEvent({
            type: "actions",
            finality: "confirmed",
            trace_external_hash_norm: "trace-1",
            actions: [
                {
                    trace_id: "trace-id-1",
                    action_id: "action-id-1",
                    start_lt: "1",
                    end_lt: "2",
                    start_utime: 10,
                    end_utime: 11,
                    trace_end_lt: "2",
                    trace_end_utime: 11,
                    trace_mc_seqno_end: 123,
                    transactions: ["tx-1", "tx-2"],
                    success: true,
                    type: "ton_transfer",
                    details: {
                        source: "src",
                        destination: "dst",
                        value: "1000",
                        value_extra_currencies: null,
                        comment: "hello",
                        encrypted: false,
                    },
                    accounts: ["src", "dst"],
                    finality: "confirmed",
                },
                {
                    trace_id: "trace-id-2",
                    action_id: "action-id-2",
                    start_lt: "3",
                    end_lt: "4",
                    start_utime: 12,
                    end_utime: 13,
                    trace_end_lt: "4",
                    trace_end_utime: 13,
                    trace_mc_seqno_end: 124,
                    transactions: ["tx-3"],
                    success: true,
                    type: "jetton_transfer",
                    details: {
                        asset: "jetton",
                        sender: "sender",
                        receiver: "receiver",
                        sender_jetton_wallet: "sender-wallet",
                        receiver_jetton_wallet: "receiver-wallet",
                        amount: "1",
                        comment: "jetton transfer",
                        is_encrypted_comment: false,
                        query_id: "42",
                        response_destination: "sender",
                        custom_payload: null,
                        forward_payload: "te6cck...",
                        forward_amount: "1",
                    },
                    accounts: ["sender", "receiver"],
                    finality: "confirmed",
                },
            ],
        });

        expect(event.type).toBe("actions");

        const actionsEvent = event as StreamingActionsEvent;
        expect(actionsEvent.actions[0].type).toBe("ton_transfer");
        expect(actionsEvent.actions[1].type).toBe("jetton_transfer");
        expect(actionsEvent.actions[0].details).toMatchObject({
            source: "src",
            destination: "dst",
            comment: "hello",
        });
        expect(actionsEvent.actions[1].details).toMatchObject({
            asset: "jetton",
            forward_amount: "1",
        });
    });

    it("passes through deep transaction content as-is", () => {
        const transactionsEvent = parseStreamingEvent({
            type: "transactions",
            finality: "confirmed",
            trace_external_hash_norm: "trace-1",
            transactions: [
                {
                    account: "wallet",
                    hash: "tx-1",
                    lt: "1",
                    now: 123,
                    mc_block_seqno: 456,
                    trace_id: "trace-1",
                    prev_trans_hash: "tx-0",
                    prev_trans_lt: "0",
                    orig_status: "active",
                    end_status: "active",
                    total_fees: "100",
                    total_fees_extra_currencies: {},
                    block_ref: {
                        workchain: 0,
                        shard: "8000000000000000",
                        seqno: 123,
                    },
                    in_msg: {
                        hash: "msg-1",
                        source: null,
                        destination: "wallet",
                        value: null,
                        value_extra_currencies: {},
                        fwd_fee: null,
                        ihr_fee: null,
                        extra_flags: null,
                        created_lt: null,
                        created_at: null,
                        opcode: "0x00000000",
                        decoded_opcode: null,
                        ihr_disabled: null,
                        bounce: null,
                        bounced: null,
                        import_fee: null,
                        message_content: {
                            hash: "body-1",
                            body: "te6cck...",
                            decoded: null,
                        },
                        init_state: null,
                    },
                    out_msgs: [],
                    description: {
                        type: "ord",
                        aborted: false,
                    },
                    finality: "confirmed",
                    emulated: false,
                },
            ],
        });

        expect(transactionsEvent.type).toBe("transactions");
        const txEvent = transactionsEvent as StreamingTransactionsEvent;
        expect(txEvent.transactions[0].hash).toBe("tx-1");
        expect(txEvent.transactions[0].in_msg?.source).toBeNull();
        expect(txEvent.transactions[0].in_msg?.value).toBeNull();
    });

    it("passes through trace content with richer decoding", () => {
        const traceEvent = parseStreamingEvent({
            type: "trace",
            finality: "confirmed",
            trace_external_hash_norm: "trace-1",
            trace: {
                tx_hash: "tx-1",
                in_msg_hash: "msg-1",
                children: [],
            },
            transactions: {
                "tx-1": {
                    account: "wallet",
                    hash: "tx-1",
                    lt: "1",
                    now: 123,
                    mc_block_seqno: 456,
                    trace_id: "trace-1",
                    prev_trans_hash: "tx-0",
                    prev_trans_lt: "0",
                    orig_status: "active",
                    end_status: "active",
                    total_fees: "100",
                    total_fees_extra_currencies: {},
                    in_msg: {
                        hash: "msg-1",
                        source: "wallet",
                        destination: "wallet",
                        value: "1000",
                        value_extra_currencies: {},
                        fwd_fee: "1",
                        ihr_fee: "0",
                        extra_flags: "0",
                        created_lt: "1",
                        created_at: "123",
                        opcode: "0x00000000",
                        decoded_opcode: "text_comment",
                        ihr_disabled: true,
                        bounce: false,
                        bounced: false,
                        import_fee: null,
                        message_content: {
                            hash: "body-1",
                            body: "te6cck...",
                            decoded: {
                                "@type": "text_comment",
                                type: "text_comment",
                                comment: "streaming wallet e2e ton transfer",
                            },
                        },
                        init_state: null,
                    },
                    out_msgs: [],
                    description: {
                        type: "ord",
                    },
                },
            },
        });

        expect(traceEvent.type).toBe("trace");
        const parsedTrace = traceEvent as StreamingTraceEvent;
        expect(parsedTrace.trace.tx_hash).toBe("tx-1");
        expect(
            parsedTrace.transactions["tx-1"].in_msg?.message_content?.decoded?.[
                "@type"
            ],
        ).toBe("text_comment");
    });

    it("validates envelope but passes through unknown deep fields", () => {
        const event = parseStreamingEvent({
            type: "transactions",
            finality: "pending",
            trace_external_hash_norm: "trace-1",
            transactions: [
                {
                    account: "wallet",
                    hash: "tx-1",
                    some_future_field: "unknown-value",
                    nested: { deep: { data: true } },
                },
            ],
        });

        const txEvent = event as StreamingTransactionsEvent;
        expect((txEvent.transactions[0] as any).some_future_field).toBe(
            "unknown-value",
        );
    });

    it("rejects invalid envelope (missing type)", () => {
        expect(() => parseStreamingEvent({ finality: "confirmed" })).toThrow(
            "streaming message.type must be a string",
        );
    });

    it("rejects invalid envelope (bad transactions shape)", () => {
        expect(() =>
            parseStreamingEvent({
                type: "transactions",
                finality: "pending",
                trace_external_hash_norm: "t",
                transactions: "oops",
            }),
        ).toThrow("transactions.transactions must be an array");
    });
});
