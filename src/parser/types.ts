type TvmNumberDecimal = { '@type': 'tvm.numberDecimal', number: string };
type TvmStackEntryNumber = { '@type': 'tvm.stackEntryNumber', number: TvmNumberDecimal };

type TvmSlice = { '@type': 'tvm.slice', bytes: string };
type TvmStackEntrySlice = { '@type': 'tvm.stackEntrySlice', slice: TvmSlice };

type TvmCell = { '@type': 'tvm.cell', bytes: string };
type TvmStackEntryCell = { '@type': 'tvm.stackEntryCell', cell: TvmCell };

export type TvmType = TvmNumberDecimal | TvmCell | TvmSlice | TvmList | TvmTuple
  | TvmStackEntryCell | TvmStackEntryNumber | TvmStackEntrySlice | TvmStackEntryTuple;

// TODO: It doesn't seem lists are used
type TvmList = { '@type': 'tvm.list', elements: any[] };

type TvmTuple = { '@type': 'tvm.tuple', elements: TvmType[] };
type TvmStackEntryTuple = { '@type': 'tvm.stackEntryTuple', tuple: TvmTuple };

type SerializedCell = { bytes: string };

type NullStackItem = ['null'];
type NumStackItem = ['num', string];
type CellStackItem = ['cell', SerializedCell];
type SliceStackItem = ['slice', SerializedCell];
type BuilderStackItem = ['builder', SerializedCell];

type TupleStackItem = ['tuple', TvmTuple];
type ListStackItem = ['list', TvmList];

export type StackItem = NullStackItem | NumStackItem 
  | CellStackItem | SliceStackItem | BuilderStackItem
  | TupleStackItem | ListStackItem;