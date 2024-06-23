// Plain types for TON Virtual Machine values
type TvmNumberDecimal = { '@type': 'tvm.numberDecimal', number: string };
type TvmStackEntryNumber = { '@type': 'tvm.stackEntryNumber', number: TvmNumberDecimal };

type TvmSlice = { '@type': 'tvm.slice', bytes: string };
type TvmStackEntrySlice = { '@type': 'tvm.stackEntrySlice', slice: TvmSlice };

type TvmCell = { '@type': 'tvm.cell', bytes: string };
type TvmStackEntryCell = { '@type': 'tvm.stackEntryCell', cell: TvmCell };

// Structured types for TON Virtual Machine values
// TODO: Check how list parsing works
export type TvmList = { '@type': 'tvm.list', elements: TvmValue[] };
type TvmStackEntryList = { '@type': 'tvm.stackEntryList', list: TvmList };

export type TvmTuple = { '@type': 'tvm.tuple', elements: TvmValue[] };
type TvmStackEntryTuple = { '@type': 'tvm.stackEntryTuple', tuple: TvmTuple };

// Union of all TON Virtual Machine values
type TvmCommonValue = TvmNumberDecimal | TvmCell | TvmSlice | TvmList | TvmTuple;
type TvmStackEntryValue = TvmStackEntryCell | TvmStackEntryNumber | TvmStackEntrySlice | TvmStackEntryList | TvmStackEntryTuple;
export type TvmValue = TvmCommonValue | TvmStackEntryValue;
