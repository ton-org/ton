import { 
    // Builder,
    Cell,
    storeStateInit,
    loadMessageRelaxed,
} from '@ton/core';
import type { MsgPrices, StoragePrices } from '../config/ConfigParser';

//
// Source: https://github.com/ton-foundation/ton/blob/ae5c0720143e231c32c3d2034cfe4e533a16d969/crypto/block/transaction.cpp#L425
//

export function computeStorageFees(data: {
    now: number
    lastPaid: number
    storagePrices: StoragePrices[]
    storageStat: { cells: number, bits: number, publicCells: number }
    special: boolean
    masterchain: boolean
}): bigint {
    const {
        lastPaid,
        now,
        storagePrices,
        storageStat,
        special,
        masterchain
    } = data;
    if (now <= lastPaid || storagePrices.length === 0 || now < (storagePrices[0]?.utime_since ?? 0) || special) {
        return BigInt(0);
    }
    let upto = Math.max(lastPaid, storagePrices[0]?.utime_since ?? 0);
    let total = BigInt(0);
    for (let i = 0; i < storagePrices.length && upto < now; i++) {
        let valid_until = (i < storagePrices.length - 1 ? Math.min(now, storagePrices[i + 1]?.utime_since ?? 0) : now);
        let payment = BigInt(0);
        if (upto < valid_until) {
            let delta = valid_until - upto;
            payment += (BigInt(storageStat.cells) * (masterchain ? storagePrices[i]?.mc_cell_price_ps ?? BigInt(0) : storagePrices[i]?.cell_price_ps ?? BigInt(0)));
            payment += (BigInt(storageStat.bits) * (masterchain ? storagePrices[i]?.mc_bit_price_ps ?? BigInt(0) : storagePrices[i]?.bit_price_ps ?? BigInt(0)));
            payment = payment * BigInt(delta);
        }
        upto = valid_until;
        total += payment;
    }

    return shr16ceil(total);
}

//
// Source: https://github.com/ton-foundation/ton/blob/ae5c0720143e231c32c3d2034cfe4e533a16d969/crypto/block/transaction.cpp#L1218
//

export function computeFwdFees(msgPrices: MsgPrices, cells: bigint, bits: bigint): bigint {
    return msgPrices.lumpPrice + (shr16ceil(msgPrices.bitPrice * bits + (msgPrices.cellPrice * cells)));
}

//
// Source: https://github.com/ton-foundation/ton/blob/ae5c0720143e231c32c3d2034cfe4e533a16d969/crypto/block/transaction.cpp#L761
//

export function computeGasPrices(gasUsed: bigint, prices: { flatLimit: bigint, flatPrice: bigint, price: bigint }): bigint {
    if (gasUsed <= prices.flatLimit) {
        return prices.flatPrice;
    } else {
        //  td::rshift(gas_price256 * (gas_used - cfg.flat_gas_limit), 16, 1) + cfg.flat_gas_price
        return prices.flatPrice + ((prices.price * (gasUsed - prices.flatLimit)) >> 16n);
    }
}

//
// Source: https://github.com/ton-foundation/ton/blob/ae5c0720143e231c32c3d2034cfe4e533a16d969/crypto/block/transaction.cpp#L530
//

export function computeExternalMessageFees(msgPrices: MsgPrices, cell: Cell): bigint {

    // Collect stats
    let storageStats = collectCellStats(cell);
    storageStats.bits -= cell.bits.length;
    storageStats.cells -= 1;

    return computeFwdFees(msgPrices, BigInt(storageStats.cells), BigInt(storageStats.bits));
}

export function computeMessageForwardFees(msgPrices: MsgPrices, cell: Cell): {
    fees: bigint;
    remaining: bigint;
} {
    let msg = loadMessageRelaxed(cell.beginParse());
    let storageStats: { bits: number, cells: number } = { bits: 0, cells: 0 };

    // Init
    if (msg.init) {
        const rawBuilder = new Cell().asBuilder();
        storeStateInit(msg.init)(rawBuilder);
        const raw = rawBuilder.endCell();

        let c = collectCellStats(raw);
        c.bits -= raw.bits.length;
        c.cells -= 1;
        storageStats.bits += c.bits;
        storageStats.cells += c.cells;
    }

    // Body
    let bc = collectCellStats(msg.body);
    bc.bits -= msg.body.bits.length;
    bc.cells -= 1;
    storageStats.bits += bc.bits;
    storageStats.cells += bc.cells;

    // NOTE: Extra currencies are ignored for now

    let fees = computeFwdFees(msgPrices, BigInt(storageStats.cells), BigInt(storageStats.bits));
    let res = (fees * BigInt(msgPrices.firstFrac)) >> 16n;
    let remaining = fees - res;
    return { fees: res, remaining };
}

function collectCellStats(cell: Cell): { bits: number, cells: number } {
    let bits = cell.bits.length;
    let cells = 1;
    for (let ref of cell.refs) {
        let r = collectCellStats(ref);
        cells += r.cells;
        bits += r.bits;
    }
    return { bits, cells };
}

function shr16ceil(src: bigint): bigint {
    let rem = src % 65536n;
    let res = src >> 16n;
    if (rem !== 0n) {
        res += 1n;
    }
    return res;
}