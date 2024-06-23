import { TupleItem, TupleReader } from '@ton/core';
import type { StackItem } from './types';
import { parseStackItem } from './parseStackItem';

export function parseStack(src: unknown[]) {
  let stack: TupleItem[] = [];

  for (let s of src) {
      stack.push(parseStackItem(s as StackItem));
  }

  return new TupleReader(stack);
}
