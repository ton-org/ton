import { TupleItem, TupleReader } from '@ton/core';
import { parseStackItem } from './parseStackItem';

export function parseStack(src: any[]) {
  let stack: TupleItem[] = [];

  for (let s of src) {
      stack.push(parseStackItem(s));
  }

  return new TupleReader(stack);
}