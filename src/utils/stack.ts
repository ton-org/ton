import { z } from 'zod';

// Plain types for TON Virtual Machine values
type NumberDecimal = { '@type': 'tvm.numberDecimal', number: string };
type StackEntryNumber = { '@type': 'tvm.stackEntryNumber', number: NumberDecimal };

type Slice = { '@type': 'tvm.slice', bytes: string };
type StackEntrySlice = { '@type': 'tvm.stackEntrySlice', slice: Slice };

type Cell = { '@type': 'tvm.cell', bytes: string };
type StackEntryCell = { '@type': 'tvm.stackEntryCell', cell: Cell };

// Structured types for TON Virtual Machine values
export type List = { '@type': 'tvm.list', elements: Value[] };
type StackEntryList = { '@type': 'tvm.stackEntryList', list: List };

export type Tuple = { '@type': 'tvm.tuple', elements: Value[] };
type StackEntryTuple = { '@type': 'tvm.stackEntryTuple', tuple: Tuple };

// Union of all TON Virtual Machine values
type CommonValue = NumberDecimal | Cell | Slice | List | Tuple;
type StackEntryValue = StackEntryCell | StackEntryNumber | StackEntrySlice | StackEntryList | StackEntryTuple;
export type Value = CommonValue | StackEntryValue;


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

const tupleSchema = z.tuple([z.literal('tuple'), z.unknown() as z.ZodType<Tuple>]);
type TupleStackItem = z.infer<typeof tupleSchema>;

const listSchema = z.tuple([z.literal('list'), z.unknown() as z.ZodType<List>]);
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
