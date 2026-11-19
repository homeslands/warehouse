import type { AvailableMaterial } from '@/entities/import-form'
import { useReceiveDraft } from './draft.store'
import { makeDraft, makeLine } from './fixtures'

import { addImportLines } from './add-import-lines'

const S1 = { slug: 's1', code: 'NCC1', name: 'Hoà Phát' }
const S2 = { slug: 's2', code: 'NCC2', name: 'Hà Tiên' }
const KG = { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true }
const BAO = {
  unitSlug: 'bao',
  unitCode: 'BAO',
  unitName: 'bao',
  conversionRate: 50,
  isBaseUnit: false,
}

const mat = (slug: string, over: Partial<AvailableMaterial> = {}): AvailableMaterial => ({
  slug,
  code: slug.toUpperCase(),
  name: `Vật tư ${slug}`,
  baseUnitSlug: 'kg',
  quantity: 10,
  suppliers: [],
  units: [BAO, KG],
  ...over,
})

const store = () => useReceiveDraft.getState()
const READER = { userSlug: 'u', userName: 'an', roleName: 'STAFF', scope: ['SUPPLIER_READ'] }
const NO_READ = { ...READER, scope: ['IMPORT_FORM_CREATE'] }
const opts = { supplierName: () => null as string | null, user: READER }

/** Phiếu `formSlug`, đầu phiếu `supplierSlug`; phiếu đã có thì các dòng server mang `lineSuppliers`. */
function seed(formSlug: string, supplierSlug: string | null, lineSuppliers?: (string | null)[]) {
  const slugs = lineSuppliers ?? (formSlug === 'new' || supplierSlug === null ? [] : [supplierSlug])
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft(
      slugs.map((s, i) =>
        makeLine(100 + i, { supplierSlug: s, supplierName: s ? `Tên ${s}` : null }),
      ),
      { formSlug, header: { ...makeDraft([]).header, supplierSlug } },
    ),
    saving: false,
  })
}
const added = () => store().draft!.lines.filter((l) => l.base === null)

afterEach(() => store().reset())

describe('addImportLines', () => {
  it('one line per material with base unit, quantity 0, price 0, units snapshot', () => {
    seed('pn-1', null)
    const a = mat('a')
    const b = mat('b', {
      baseUnitSlug: 'bao',
      units: [
        { ...BAO, isBaseUnit: true },
        { ...KG, isBaseUnit: false },
      ],
    })
    const keys = addImportLines([a, b], opts)
    expect(keys).toEqual(['a|kg', 'b|bao'])
    const lines = added()
    expect(lines.map((l) => l.key)).toEqual(keys)
    expect(lines[0]).toMatchObject({
      materialSlug: 'a',
      unitSlug: 'kg',
      unitName: 'kg',
      quantity: 0,
      unitPrice: 0,
      checked: false,
      units: [BAO, KG],
    })
    expect(lines[1].unitSlug).toBe('bao')
  })

  it('new form with header supplier stamps fixed supplier', () => {
    seed('new', 's2')
    addImportLines([mat('a', { suppliers: [S1] })], {
      supplierName: (slug) => (slug === 's2' ? S2.name : null),
      user: NO_READ,
    })
    expect(added()[0]).toMatchObject({ supplierSlug: 's2', supplierName: 'Hà Tiên' })
  })

  it('existing single-supplier form + SUPPLIER_READ stamps that supplier on every new line, tracking material suppliers', () => {
    seed('f1', 'sup-a')
    addImportLines([mat('a', { suppliers: [{ slug: 'sup-b', code: 'B', name: 'B' }] })], {
      supplierName: (slug) => (slug === 'sup-a' ? 'Minh Phát' : null),
      user: READER,
    })
    expect(added()[0]).toMatchObject({
      supplierSlug: 'sup-a',
      supplierName: 'Minh Phát',
      materialSupplierSlugs: ['sup-b'],
    })
  })

  it('supplier name falls back to material suppliers, then to an existing line with the same slug', () => {
    seed('new', 's1')
    addImportLines([mat('a', { suppliers: [S1, S2] })], opts)
    expect(added()[0]).toMatchObject({ supplierSlug: 's1', supplierName: 'Hoà Phát' })
    seed('f1', 's2', [])
    store().addLine({
      ...makeLine(9),
      key: 'z|kg',
      supplierSlug: 's2',
      supplierName: 'Tên có sẵn',
    })
    addImportLines([mat('b')], opts)
    expect(store().draft!.lines[1]).toMatchObject({
      supplierSlug: 's2',
      supplierName: 'Tên có sẵn',
    })
  })

  it('no header supplier keeps the material supplier rule', () => {
    seed('f1', null)
    addImportLines([mat('a', { suppliers: [S1] }), mat('b', { suppliers: [S1, S2] })], opts)
    const [a, b] = added()
    expect(a).toMatchObject({ supplierSlug: 's1', supplierName: 'Hoà Phát' })
    expect(b).toMatchObject({ supplierSlug: null, supplierName: null })
  })

  describe('phiếu đã có: chỉ coi là "bên bán của phiếu" khi CHẮC (fix 1)', () => {
    const S3 = { slug: 's3', code: 'NCC3', name: 'Minh Phát' }
    const name = (slug: string) => ({ s1: 'Hoà Phát', s2: 'Hà Tiên' })[slug] ?? null

    it('nhiều bên bán (đầu phiếu suy ra s1) → dòng mới theo luật lineSupplier, KHÔNG gán s1', () => {
      seed('f1', 's1', ['s1', 's1', 's2'])
      addImportLines(
        [
          mat('a', { suppliers: [S3] }),
          mat('b', { suppliers: [] }),
          mat('c', { suppliers: [S1, S3] }),
          mat('d', { suppliers: [S2, S3] }),
        ],
        { supplierName: name, user: READER },
      )
      expect(added().map((l) => [l.materialSlug, l.supplierSlug])).toEqual([
        ['a', 's3'],
        ['b', null],
        ['c', 's1'],
        ['d', null],
      ])
    })

    it('phiếu không bên bán: dòng đoán theo lineSupplier KHÔNG kéo các dòng sau theo bên bán đó', () => {
      seed('f1', null, [null])
      addImportLines([mat('a', { suppliers: [S3] })], { supplierName: name, user: READER })
      addImportLines([mat('b', { suppliers: [] })], { supplierName: name, user: READER })
      expect(added().map((l) => [l.materialSlug, l.supplierSlug])).toEqual([
        ['a', 's3'],
        ['b', null],
      ])
    })

    it('một bên bán nhưng KHÔNG có SUPPLIER_READ → luật lineSupplier cũ', () => {
      seed('f1', 's1', ['s1', 's1'])
      addImportLines([mat('a', { suppliers: [S3] }), mat('b', { suppliers: [] })], {
        supplierName: name,
        user: NO_READ,
      })
      expect(added().map((l) => [l.materialSlug, l.supplierSlug])).toEqual([
        ['a', 's3'],
        ['b', null],
      ])
    })

    it('không có người dùng → luật lineSupplier cũ', () => {
      seed('f1', 's1', ['s1'])
      addImportLines([mat('b', { suppliers: [] })], { supplierName: name, user: null })
      expect(added()[0].supplierSlug).toBeNull()
    })

    it('một bên bán + SUPPLIER_READ → mọi dòng mới mang bên bán đó', () => {
      seed('f1', 's1', ['s1', null])
      addImportLines([mat('a', { suppliers: [S3] }), mat('b', { suppliers: [] })], {
        supplierName: name,
        user: READER,
      })
      expect(added().map((l) => [l.supplierSlug, l.supplierName])).toEqual([
        ['s1', 'Hoà Phát'],
        ['s1', 'Hoà Phát'],
      ])
    })

    it('phiếu mới: bên bán bước 1 dù không có SUPPLIER_READ', () => {
      seed('new', 's2')
      addImportLines([mat('a', { suppliers: [S3] })], { supplierName: name, user: NO_READ })
      expect(added()[0]).toMatchObject({ supplierSlug: 's2', supplierName: 'Hà Tiên' })
    })

    it('tên bên bán tra một lần cho cả lô, không gọi với chuỗi rỗng', () => {
      seed('new', 's2')
      const supplierName = jest.fn(name)
      addImportLines([mat('a'), mat('b'), mat('c')], { supplierName, user: READER })
      expect(supplierName).toHaveBeenCalledTimes(1)
      expect(supplierName).toHaveBeenCalledWith('s2')
      seed('f1', null)
      supplierName.mockClear()
      addImportLines([mat('a'), mat('b')], { supplierName, user: READER })
      expect(supplierName).not.toHaveBeenCalled()
    })
  })

  it('material without units is skipped', () => {
    seed('pn-1', null)
    const keys = addImportLines([mat('x', { units: [] }), mat('a')], opts)
    expect(keys).toEqual(['a|kg'])
    expect(store().draft!.lines).toHaveLength(1)
  })

  it('a duplicate key is not added twice', () => {
    seed('pn-1', null)
    expect(addImportLines([mat('a')], opts)).toEqual(['a|kg'])
    expect(addImportLines([mat('a')], opts)).toEqual([])
  })
})
