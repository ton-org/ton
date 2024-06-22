import { Cell, TupleItem } from '@ton/core';
import { parseObject } from './parseObject';

export function parseStackItem(s: any): TupleItem {
  if (s[0] === 'num') {
      let val = s[1] as string;
      if (val.startsWith('-')) {
          return { type: 'int', value: -BigInt(val.slice(1)) };
      } else {
          return { type: 'int', value: BigInt(val) };
      }
  } else if (s[0] === 'null') {
      return { type: 'null' };
  } else if (s[0] === 'cell') {
      return { type: 'cell', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] };
  } else if (s[0] === 'slice') {
      return { type: 'slice', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] };
  } else if (s[0] === 'builder') {
      return { type: 'builder', cell: Cell.fromBoc(Buffer.from(s[1].bytes, 'base64'))[0] };
  } else if (s[0] === 'tuple' || s[0] === 'list') {
      return { type: 'tuple', items: s[1].elements.map(parseObject) };
  } else {
      throw Error('Unsupported stack item type: ' + s[0])
  }
}