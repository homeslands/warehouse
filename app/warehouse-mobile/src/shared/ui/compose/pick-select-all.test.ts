import { planSelectAll } from './pick-select-all'
import type { PickItem } from './MaterialPickList'

const it_ = (id: string, state: PickItem['state'] = 'pickable'): PickItem => ({
  id,
  name: id,
  code: id,
  detail: null,
  state,
})

describe('planSelectAll', () => {
  it('adds every pickable shown item in list order', () => {
    expect(planSelectAll([it_('a'), it_('b'), it_('c')], new Set(), 10)).toEqual({
      mode: 'add',
      ids: ['a', 'b', 'c'],
    })
  })

  it('skips exists / locked items and items already checked', () => {
    const items = [it_('a', 'exists'), it_('b', 'locked'), it_('c'), it_('d')]
    expect(planSelectAll(items, new Set(['c']), 10)).toEqual({ mode: 'add', ids: ['d'] })
  })

  it('cuts the selection at the remaining capacity, in list order', () => {
    const items = [it_('a'), it_('b'), it_('c'), it_('d'), it_('e')]
    expect(planSelectAll(items, new Set(), 2)).toEqual({ mode: 'add', ids: ['a', 'b'] })
  })

  it('removes only the shown checked items when all pickable are already checked', () => {
    const items = [it_('a'), it_('b'), it_('x', 'exists')]
    expect(planSelectAll(items, new Set(['a', 'b', 'old']), 0)).toEqual({
      mode: 'remove',
      ids: ['a', 'b'],
    })
  })

  it('offers removal when capacity is full but some shown items are checked', () => {
    expect(planSelectAll([it_('a'), it_('b'), it_('c')], new Set(['a', 'b']), 0)).toEqual({
      mode: 'remove',
      ids: ['a', 'b'],
    })
  })

  it('returns null when nothing is pickable, or full with nothing checked', () => {
    expect(planSelectAll([it_('a', 'exists'), it_('b', 'locked')], new Set(), 5)).toBeNull()
    expect(planSelectAll([], new Set(), 5)).toBeNull()
    expect(planSelectAll([it_('a')], new Set(['zzz']), 0)).toBeNull()
  })
})
