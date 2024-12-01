import { z } from 'zod';

// Plain types for TON Virtual Machine values
type TvmNumberDecimal = { '@type': 'tvm.numberDecimal', number: string };
type TvmStackEntryNumber = { '@type': 'tvm.stackEntryNumber', number: TvmNumberDecimal };

type TvmSlice = { '@type': 'tvm.slice', bytes: string };
type TvmStackEntrySlice = { '@type': 'tvm.stackEntrySlice', slice: TvmSlice };

type TvmCell = { '@type': 'tvm.cell', bytes: string };
type TvmStackEntryCell = { '@type': 'tvm.stackEntryCell', cell: TvmCell };

// Structured types for TON Virtual Machine values
export type TvmList = { '@type': 'tvm.list', elements: TvmValue[] };
type TvmStackEntryList = { '@type': 'tvm.stackEntryList', list: TvmList };

export type TvmTuple = { '@type': 'tvm.tuple', elements: TvmValue[] };
type TvmStackEntryTuple = { '@type': 'tvm.stackEntryTuple', tuple: TvmTuple };

// Union of all TON Virtual Machine values
type TvmCommonValue = TvmNumberDecimal | TvmCell | TvmSlice | TvmList | TvmTuple;
type TvmStackEntryValue = TvmStackEntryCell | TvmStackEntryNumber | TvmStackEntrySlice | TvmStackEntryList | TvmStackEntryTuple;
export type TvmValue = TvmCommonValue | TvmStackEntryValue;


// zod definitions

const serializedCellSchema = z.object({
  bytes: z.string(),
});
type SerializedCell = z.infer<typeof serializedCellSchema>;

const nullSchema = z.union([
  z.tuple([z.literal('null')]),
  z.tuple([z.literal('null'), z.null().optional()]),
]);
type NullStackItem = z.infer<typeof nullSchema>;

const numSchema = z.tuple([z.literal('num'), z.string()]);
type NumStackItem = z.infer<typeof numSchema>;

const cellSchema = z.tuple([z.literal('cell'), serializedCellSchema]);
type CellStackItem = z.infer<typeof cellSchema>;

const sliceSchema = z.tuple([z.literal('slice'), serializedCellSchema]);
type SliceStackItem = z.infer<typeof sliceSchema>;

const builderSchema = z.tuple([z.literal('builder'), serializedCellSchema]);
type BuilderStackItem = z.infer<typeof builderSchema>;

const tupleSchema = z.tuple([z.literal('tuple'), z.unknown() as z.ZodType<TvmTuple>]);
type TupleStackItem = z.infer<typeof tupleSchema>;

const listSchema = z.tuple([z.literal('list'), z.unknown() as z.ZodType<TvmList>]);
type ListStackItem = z.infer<typeof listSchema>;

export const stackItemSchema = z.union([
  nullSchema,
  numSchema,
  cellSchema,
  sliceSchema,
  builderSchema,
  tupleSchema,
  listSchema,
]);
export type StackItem = NullStackItem | NumStackItem | CellStackItem | SliceStackItem | BuilderStackItem | TupleStackItem | ListStackItem;
