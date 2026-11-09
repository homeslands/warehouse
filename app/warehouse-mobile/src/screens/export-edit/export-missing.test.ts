import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { exportMissing, exportMissingLabel } from './export-missing'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)

describe('exportMissing', () => {
  it('missing receiver + a null-price line → header then line, in screen order', () => {
    const base = makeDraft([makeLine(1), makeLine(2, { unitPrice: null })])
    const d = { ...base, header: { ...base.header, receiver: '' } }
    expect(exportMissing(d, t)).toEqual([
      { id: 'header:receiver', group: 'receiver', target: { kind: 'header', field: 'receiver' } },
      {
        id: 'line:m-2|u-2|:price',
        group: 'price',
        target: { kind: 'line', key: 'm-2|u-2|', field: 'price' },
      },
    ])
  })

  it('header fields follow Loại, Mã, PO, Người nhận, HĐ order', () => {
    const base = makeDraft([makeLine(1)])
    const d = {
      ...base,
      header: {
        ...base.header,
        code: '',
        purchaseOrder: '',
        receiver: '',
        invoiceCode: 'x'.repeat(65),
      },
    }
    expect(exportMissing(d, t).map((i) => i.group)).toEqual([
      'code',
      'purchaseOrder',
      'receiver',
      'invoiceCode',
    ])
  })

  it('no lines → lines item', () => {
    expect(exportMissing(makeDraft([]), t)).toEqual([
      { id: 'lines', group: 'lines', target: { kind: 'lines' } },
    ])
  })

  it('per line: quantity before price; bad numbers count', () => {
    const d = makeDraft([
      makeLine(1, { quantity: 0, unitPrice: -1 }),
      makeLine(2, { unitPrice: 0 }),
    ])
    expect(exportMissing(d, t).map((i) => [i.group, i.id])).toEqual([
      ['quantity', 'line:m-1|u-1|:quantity'],
      ['price', 'line:m-1|u-1|:price'],
    ])
  })

  it('too many lines and duplicate keys are reported after the per-line items', () => {
    const many = Array.from({ length: 201 }, (_, i) => makeLine(i + 1))
    expect(exportMissing(makeDraft(many), t).map((i) => i.group)).toEqual(['tooMany'])
    const dup = makeDraft([makeLine(1), makeLine(1, { key: makeLine(1).key })])
    expect(exportMissing(dup, t).map((i) => i.group)).toEqual(['duplicate'])
  })

  it('complete draft → []', () => {
    expect(exportMissing(makeDraft([makeLine(1)]), t)).toEqual([])
  })
})

describe('exportMissingLabel', () => {
  it('reads like the mockup', () => {
    const label = exportMissingLabel(t)
    expect(label('receiver', 1)).toBe('Người nhận')
    expect(label('price', 1)).toBe('1 đơn giá')
    expect(label('quantity', 2)).toBe('2 số lượng')
    expect(label('lines', 1)).toBe('Chưa có vật tư')
  })
})
