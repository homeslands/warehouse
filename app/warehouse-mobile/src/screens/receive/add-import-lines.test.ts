import type { AvailableMaterial } from '@/entities/import-form'
import { useReceiveDraft } from '@/features/receive-checklist'
import { makeDraft } from '@/features/receive-checklist/model/fixtures'

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
const opts = { isNew: false, supplierName: () => null as string | null }

function seed(formSlug: string, supplierSlug: string | null) {
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft([], {
      formSlug,
      header: { ...makeDraft([]).header, supplierSlug },
    }),
    saving: false,
  })
}

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
    const lines = store().draft!.lines
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
      isNew: true,
      supplierName: (slug) => (slug === 's2' ? S2.name : null),
    })
    expect(store().draft!.lines[0]).toMatchObject({ supplierSlug: 's2', supplierName: 'Hà Tiên' })
  })

  it('existing form follows the material supplier rule instead of a fixed supplier', () => {
    seed('pn-1', 's1')
    addImportLines([mat('a', { suppliers: [S1, S2] })], opts)
    expect(store().draft!.lines[0]).toMatchObject({ supplierSlug: 's1', supplierName: 'Hoà Phát' })
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
