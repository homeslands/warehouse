import AsyncStorage from '@react-native-async-storage/async-storage'

import type { MaterialBatch } from '@/entities/inventory'
import { item as stockItem, unit } from '@/entities/inventory/model/fixtures'
import {
  MAX_ITEMS,
  stopExportDraftPersistence,
  useExportDraft,
  type ExportLine,
} from '@/features/export-draft'
import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { parseLabel } from '@/features/scan-material'

import { applyScan, planScan, readLabel, type LotOf } from './plan-scan'

const BAO = unit({ unitSlug: 'bao', unitCode: 'BAO', unitName: 'Bao', conversionRate: 1 })
const TAN = unit({
  unitSlug: 'tan',
  unitCode: 'T',
  unitName: 'Tấn',
  conversionRate: 20,
  isBaseUnit: false,
})
const XM = stockItem({
  slug: 'i-xm',
  materialSlug: 'xm',
  materialCode: 'VT-XM',
  materialName: 'Xi măng',
  baseUnit: { slug: 'bao', code: 'BAO', name: 'Bao' },
  units: [TAN, BAO],
  availableQuantity: 50,
})
const SON = stockItem({
  slug: 'i-son',
  materialSlug: 'son',
  materialCode: 'VT-SN',
  materialName: 'Sơn',
  baseUnit: { slug: 'lon', code: 'LON', name: 'Lon' },
  units: [],
  availableQuantity: 3,
})
const NO_UNIT = stockItem({
  slug: 'i-x',
  materialSlug: 'x',
  materialCode: 'VT-X',
  materialName: 'Không đơn vị',
  baseUnit: null,
  units: [],
})
const STOCK = [XM, SON, NO_UNIT]

/** Dòng Xi măng: mặc định đơn vị gốc (bao), lô tự động. */
const xmLine = (over: Partial<ExportLine> = {}) =>
  makeLine(0, {
    materialSlug: 'xm',
    materialCode: 'VT-XM',
    materialName: 'Xi măng',
    unitSlug: 'bao',
    unitName: 'Bao',
    base: null,
    ...over,
  })

const batch = (slug: string, availableQuantity: number): MaterialBatch => ({
  slug,
  entryDate: '2026-01-01',
  expiryDate: null,
  quantity: availableQuantity,
  remainingQuantity: availableQuantity,
  reservedQuantity: 0,
  availableQuantity,
  status: 1,
  materialSlug: 'xm',
  baseUnit: null,
})
const noLots: LotOf = () => undefined
const plan = (lines: ExportLine[], text: string, lotOf: LotOf = noLots) =>
  planScan(makeDraft(lines), parseLabel(text), STOCK, lotOf)

describe('planScan', () => {
  it('không khớp vật tư nào → notFound', () => {
    expect(plan([], 'VT-ZZ*S1')).toEqual({ kind: 'error', reason: 'notFound', code: 'VT-ZZ' })
  })

  it('chưa có dòng → dòng mới đơn vị gốc, lô tự động, chưa giá, SL 1, kèm serial', () => {
    const r = plan([], ' vt-xm * s1 ')
    expect(r).toMatchObject({
      kind: 'add',
      line: {
        key: 'xm|bao|',
        materialSlug: 'xm',
        unitSlug: 'bao',
        unitName: 'Bao',
        conversionRate: 1,
        quantity: 1,
        unitPrice: null,
        batchSlug: null,
        base: null,
        serials: ['S1'],
      },
    })
  })

  it('nhãn chỉ Mã → dòng mới không có serial', () => {
    const r = plan([], 'VT-XM')
    expect(r.kind === 'add' && r.line.serials).toBeUndefined()
  })

  it('serial đã có ở BẤT KỲ dòng nào → duplicateSerial (kèm tên dòng), trước cả noUnit', () => {
    const lines = [makeLine(1, { materialName: 'Thép', serials: ['S1'] })]
    expect(plan(lines, 'VT-XM*s1')).toEqual({
      kind: 'error',
      reason: 'duplicateSerial',
      serial: 'S1',
      materialName: 'Thép',
      key: lines[0]!.key,
    })
    expect(plan(lines, 'VT-X*S1')).toMatchObject({ reason: 'duplicateSerial' })
  })

  it('vật tư chưa có đơn vị → noUnit', () => {
    expect(plan([], 'VT-X')).toEqual({
      kind: 'error',
      reason: 'noUnit',
      materialName: 'Không đơn vị',
    })
  })

  it('đơn vị gốc từ baseUnit khi units[] rỗng', () => {
    expect(plan([], 'VT-SN')).toMatchObject({
      kind: 'add',
      line: { unitSlug: 'lon', unitName: 'Lon', quantity: 1 },
    })
  })

  it('dòng đích: ưu tiên đơn vị gốc + lô tự động; cộng 1 và nối serial', () => {
    const lots = xmLine({ batchSlug: 'lo-1', quantity: 2, key: 'xm|bao|lo-1' })
    const auto = xmLine({ quantity: 3, serials: ['A'] })
    const r = plan([lots, auto], 'VT-XM*B')
    expect(r).toEqual({
      kind: 'update',
      key: 'xm|bao|',
      patch: { quantity: 4, serials: ['A', 'B'] },
    })
  })

  it('không có dòng lô tự động → dòng đơn vị gốc lô bất kỳ (đầu tiên)', () => {
    const l1 = xmLine({ batchSlug: 'lo-1', quantity: 2, key: 'xm|bao|lo-1' })
    const l2 = xmLine({ batchSlug: 'lo-2', quantity: 2, key: 'xm|bao|lo-2' })
    const r = plan([l1, l2], 'VT-XM', () => batch('lo-1', 10))
    expect(r).toEqual({ kind: 'update', key: 'xm|bao|lo-1', patch: { quantity: 3, serials: [] } })
  })

  it('dòng đơn vị khác gốc giữ nguyên → tạo dòng đơn vị gốc riêng', () => {
    const tan = xmLine({ unitSlug: 'tan', unitName: 'Tấn', conversionRate: 20, quantity: 1 })
    const r = plan([{ ...tan, key: 'xm|tan|' }], 'VT-XM')
    expect(r).toMatchObject({ kind: 'add', line: { key: 'xm|bao|', quantity: 1 } })
  })

  it('đủ 200 dòng → full khi cần dòng mới; vẫn cộng được vào dòng đã có', () => {
    const many = Array.from({ length: MAX_ITEMS - 1 }, (_, n) => makeLine(n + 1))
    const full = [...many, xmLine({ quantity: 1 })]
    expect(plan(full, 'VT-SN')).toEqual({ kind: 'error', reason: 'full', materialName: 'Sơn' })
    expect(plan(full, 'VT-XM')).toMatchObject({ kind: 'update', patch: { quantity: 2 } })
  })

  it('vượt tồn → overStock (kèm available theo đơn vị dòng)', () => {
    expect(plan([xmLine({ quantity: 50 })], 'VT-XM')).toEqual({
      kind: 'error',
      reason: 'overStock',
      materialName: 'Xi măng',
      unitName: 'Bao',
      available: 50,
    })
  })

  it('dòng mới cũng kiểm tồn, trừ các dòng khác cùng vật tư (quy về đơn vị gốc)', () => {
    // 2,5 tấn = 50 bao → hết.
    const tan = {
      ...xmLine({ unitSlug: 'tan', conversionRate: 20, quantity: 2.5 }),
      key: 'xm|tan|',
    }
    expect(plan([tan], 'VT-XM')).toMatchObject({ reason: 'overStock', available: 0 })
    const tan2 = { ...tan, quantity: 2.45 } // còn 1 bao
    expect(plan([tan2], 'VT-XM')).toMatchObject({ kind: 'add', line: { quantity: 1 } })
  })

  it('dòng có lô: tồn theo lô; không biết lô (null) → cho qua', () => {
    const l = xmLine({ batchSlug: 'lo-1', quantity: 2, key: 'xm|bao|lo-1' })
    expect(plan([l], 'VT-XM', () => batch('lo-1', 2))).toMatchObject({
      reason: 'overStock',
      available: 2,
    })
    expect(plan([l], 'VT-XM')).toMatchObject({ kind: 'update', patch: { quantity: 3 } })
  })
})

describe('applyScan', () => {
  const store = () => useExportDraft.getState()
  const seed = (lines: ExportLine[] = []) =>
    useExportDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh', formSlug: 'px-1' },
      draft: makeDraft(lines),
      saving: false,
    })

  beforeEach(async () => {
    jest.useFakeTimers()
    await AsyncStorage.clear()
    store().reset()
  })
  afterEach(() => {
    stopExportDraftPersistence()
    jest.useRealTimers()
  })

  it('chưa có bản nháp / đang lưu → busy, không đổi gì', () => {
    expect(applyScan('VT-XM', STOCK, noLots)).toEqual({ ok: false, reason: 'busy' })
    seed()
    useExportDraft.setState({ saving: true })
    expect(applyScan('VT-XM', STOCK, noLots)).toEqual({ ok: false, reason: 'busy' })
    expect(store().draft!.lines).toHaveLength(0)
  })

  it('quét liên tiếp: thêm dòng rồi cộng dồn, nối serial', () => {
    seed()
    expect(applyScan('VT-XM*s1', STOCK, noLots)).toEqual({
      ok: true,
      key: 'xm|bao|',
      materialName: 'Xi măng',
      materialCode: 'VT-XM',
      quantity: 1,
      unitName: 'Bao',
      serial: 'S1',
    })
    expect(applyScan('VT-XM', STOCK, noLots)).toMatchObject({ ok: true, quantity: 2, serial: null })
    expect(applyScan('VT-XM*S2', STOCK, noLots)).toMatchObject({ ok: true, quantity: 3 })
    expect(store().draft!.lines).toEqual([
      expect.objectContaining({ key: 'xm|bao|', quantity: 3, serials: ['S1', 'S2'] }),
    ])
  })

  it('lỗi trả lý do + mã (kèm chi tiết), bản nháp giữ nguyên', () => {
    seed([xmLine({ quantity: 50, serials: ['S1'] })])
    const before = store().draft
    expect(applyScan(' vt-zz*1 ', STOCK, noLots)).toEqual({
      ok: false,
      reason: 'notFound',
      code: 'vt-zz',
    })
    expect(applyScan('VT-SN*s1', STOCK, noLots)).toEqual({
      ok: false,
      reason: 'duplicateSerial',
      code: 'VT-SN',
      serial: 'S1',
      materialName: 'Xi măng',
      key: 'xm|bao|',
    })
    expect(applyScan('VT-XM', STOCK, noLots)).toEqual({
      ok: false,
      reason: 'overStock',
      code: 'VT-XM',
      materialName: 'Xi măng',
      unitName: 'Bao',
      available: 50,
    })
    expect(applyScan('VT-X', STOCK, noLots)).toEqual({
      ok: false,
      reason: 'noUnit',
      code: 'VT-X',
      materialName: 'Không đơn vị',
    })
    expect(store().draft).toBe(before)
  })

  it('nhãn chỉ có * (không Mã) → notFound với chuỗi gốc', () => {
    seed()
    expect(applyScan(' *S1 ', STOCK, noLots)).toEqual({
      ok: false,
      reason: 'notFound',
      code: '*S1',
    })
  })
})

describe('mã vật tư có *', () => {
  const STAR = stockItem({
    slug: 'i-star',
    materialSlug: 'star',
    materialCode: 'VT-XM*01',
    materialName: 'Mã có sao',
    baseUnit: { slug: 'cai', code: 'C', name: 'Cái' },
    units: [],
  })
  const stock = [XM, STAR]

  it('readLabel: nguyên chuỗi khớp một mã → nhãn chỉ Mã, serial null; không thì parseLabel', () => {
    expect(readLabel(' vt-xm*01 ', stock)).toEqual({ code: 'vt-xm*01', serial: null })
    expect(readLabel('VT-XM*02', stock)).toEqual({ code: 'VT-XM', serial: '02' })
  })

  it('applyScan: nguyên chuỗi khớp → cộng vào vật tư đó, không serial', () => {
    jest.useFakeTimers()
    useExportDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh', formSlug: 'px-1' },
      draft: makeDraft([]),
      saving: false,
    })
    expect(applyScan('VT-XM*01', stock, noLots)).toMatchObject({
      ok: true,
      materialName: 'Mã có sao',
      quantity: 1,
      serial: null,
    })
    expect(applyScan('VT-XM*02', stock, noLots)).toMatchObject({
      ok: true,
      materialName: 'Xi măng',
      serial: '02',
    })
    expect(useExportDraft.getState().draft!.lines.map((l) => l.serials)).toEqual([
      undefined,
      ['02'],
    ])
    useExportDraft.getState().reset()
    stopExportDraftPersistence()
    jest.useRealTimers()
  })
})
