import { TupleItem, TupleReader } from '@ton/core';
import { stackItemSchema } from './types';
import { parseStackItem } from './parseStackItem';

export function parseStack(src: unknown[]) {
  let stack: TupleItem[] = [];

  for (let s of src) {
      stack.push(parseStackItem(stackItemSchema.parse(s)));
  }

  return new TupleReader(stack);
}
