import { Cell } from '@ton/core';

export function parseObject(x: any): any {
  const typeName = x['@type'];
  switch(typeName) {
      case 'tvm.list':
      case 'tvm.tuple':
          return x.elements.map(parseObject);
      case 'tvm.cell':
          return Cell.fromBoc(Buffer.from(x.bytes, 'base64'))[0];
      case 'tvm.stackEntryCell':
          return parseObject(x.cell);
      case 'tvm.stackEntryTuple':
          return parseObject(x.tuple);
      case 'tvm.stackEntryNumber':
          return parseObject(x.number);
      case 'tvm.numberDecimal':
          return BigInt(x.number);
      default:
          throw Error('Unsupported item type: ' + typeName);
  }
}