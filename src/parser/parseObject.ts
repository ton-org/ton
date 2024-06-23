import { Cell, type TupleItem } from '@ton/core';
import type { TvmValue } from './types';

export function parseObject(x: TvmValue): TupleItem {
  const typeName = x['@type'];
  switch(typeName) {
      case 'tvm.list':
      case 'tvm.tuple':
          return {
              type: 'tuple',
              items: x.elements.map(parseObject)
          };
      case 'tvm.cell':
          return {
            type: 'cell',
            cell: Cell.fromBoc(Buffer.from(x.bytes, 'base64'))[0]
          };
      case 'tvm.stackEntryCell':
          return parseObject(x.cell);
      case 'tvm.stackEntryTuple':
          return parseObject(x.tuple);
      case 'tvm.stackEntryNumber':
          return parseObject(x.number);
      case 'tvm.numberDecimal':
          return {
            type: 'int',
            value: BigInt(x.number)
          };
      case 'tvm.slice':
          return {
            type: 'slice',
            cell: Cell.fromBoc(Buffer.from(x.bytes, 'base64'))[0]
          };
      case 'tvm.stackEntrySlice':
          return parseObject(x.slice);
      default:
          throw Error('Unsupported item type: ' + typeName);
  }
}
