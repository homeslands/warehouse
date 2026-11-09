import { lineGaps, missingForStep, missingSummary, type MissingItem } from './missing'

const label = (group: string, n: number) => (n > 1 ? `${n} ${group}` : group)
const header = (group: string): MissingItem => ({
  id: `header:${group}`,
  group,
  target: { kind: 'header', field: group },
})
const line = (key: string, group: string): MissingItem => ({
  id: `line:${key}:${group}`,
  group,
  target: { kind: 'line', key, field: 'price' },
})

describe('missingSummary', () => {
  it('summary groups by group in order and counts', () => {
    const items = [header('receiver'), line('a', 'price'), line('b', 'price')]
    expect(missingSummary(items, label)).toBe('receiver, 2 price')
  })

  it('summary truncates after max groups', () => {
    const items = ['a', 'b', 'c', 'd'].map(header)
    expect(missingSummary(items, label)).toBe('a, b, c…')
    expect(missingSummary(items, label, 4)).toBe('a, b, c, d')
  })

  it('empty → empty string', () => {
    expect(missingSummary([], label)).toBe('')
  })
})

describe('missingForStep', () => {
  it('missingForStep splits header items to step 1 and the rest to step 2', () => {
    const noLines: MissingItem = { id: 'lines', group: 'lines', target: { kind: 'lines' } }
    const items = [header('receiver'), line('a', 'price'), header('po'), noLines]
    expect(missingForStep(items, 1).map((i) => i.id)).toEqual(['header:receiver', 'header:po'])
    expect(missingForStep(items, 2).map((i) => i.id)).toEqual(['line:a:price', 'lines'])
    expect(missingForStep([], 1)).toEqual([])
  })
})

describe('lineGaps', () => {
  it('incomplete lines once each, in LIST order; non-line items (and tooMany) kept apart', () => {
    const tooMany: MissingItem = {
      id: 'tooMany',
      group: 'tooMany',
      target: { kind: 'line', key: 'c', field: 'line' },
    }
    const dup: MissingItem = {
      id: 'line:b:line',
      group: 'duplicate',
      target: { kind: 'line', key: 'b', field: 'line' },
    }
    const items = [line('c', 'price'), line('a', 'price'), line('c', 'quantity'), tooMany, dup]
    const { incomplete, other } = lineGaps(items, ['a', 'b', 'c', 'd'])
    expect(incomplete).toEqual(['a', 'b', 'c'])
    expect(other.map((i) => i.id)).toEqual(['tooMany'])
  })

  it('no lines → only the "lines" item', () => {
    const noLines: MissingItem = { id: 'lines', group: 'lines', target: { kind: 'lines' } }
    expect(lineGaps([noLines], [])).toEqual({ incomplete: [], other: [noLines] })
  })
})
