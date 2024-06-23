import type { TvmTuple, TvmList } from './tvmValues';

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