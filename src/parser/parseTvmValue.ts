import { Cell, type TupleItem } from '@ton/core'
import type { TvmValue } from './types'

export function parseTvmValue(x: TvmValue): TupleItem {
  const typeName = x['@type']
  switch (typeName) {
    // TODO: Check how list parsing works
    case 'tvm.list':
      return { type: 'tuple', items: x.elements.map(parseTvmValue) }
    case 'tvm.stackEntryList':
      return parseTvmValue(x.list)
    case 'tvm.tuple':
      return { type: 'tuple', items: x.elements.map(parseTvmValue) }
    case 'tvm.stackEntryTuple':
      return parseTvmValue(x.tuple)
    case 'tvm.cell':
      return { type: 'cell', cell: Cell.fromBoc(Buffer.from(x.bytes, 'base64'))[0] }
    case 'tvm.stackEntryCell':
      return parseTvmValue(x.cell)
    case 'tvm.numberDecimal':
      return { type: 'int', value: BigInt(x.number) }
    case 'tvm.stackEntryNumber':
      return parseTvmValue(x.number)
    case 'tvm.slice':
      return { type: 'slice', cell: Cell.fromBoc(Buffer.from(x.bytes, 'base64'))[0] }
    case 'tvm.stackEntrySlice':
      return parseTvmValue(x.slice)
    default:
      throw Error('Unsupported item type: ' + typeName)
  }
}
