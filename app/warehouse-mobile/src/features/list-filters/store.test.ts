import { create } from 'zustand'

import { createChipFilterSlice, type ChipFilterActions, type ChipFilters } from './store'

type TabState = ChipFilters &
  ChipFilterActions & { query: string; type: string; setQuery: (q: string) => void }

const makeStore = () =>
  create<TabState>((set) => ({
    ...createChipFilterSlice(set),
    query: '',
    type: 'ALL',
    setQuery: (query) => set({ query }),
  }))

describe('createChipFilterSlice', () => {
  it('khởi tạo: không lọc thời gian / người', () => {
    expect(makeStore().getState()).toMatchObject({ time: null, requester: null, approver: null })
  })

  it('setTime / setRequester / setApprover ghi đúng field', () => {
    const store = makeStore()
    store.getState().setTime('last7')
    store.getState().setRequester({ slug: 'u-1', name: 'An' })
    store.getState().setApprover({ slug: 'u-2', name: 'Bình' })
    expect(store.getState()).toMatchObject({
      time: 'last7',
      requester: { slug: 'u-1', name: 'An' },
      approver: { slug: 'u-2', name: 'Bình' },
    })
  })

  it('clearChips xoá time/requester/approver, không đụng field khác của store ghép', () => {
    const store = makeStore()
    store.setState({ query: 'pn', type: 'SALE' })
    store.getState().setTime({ from: '2026-11-01', to: '2026-11-03' })
    store.getState().setRequester({ slug: 'u-1', name: 'An' })
    store.getState().setApprover({ slug: 'u-2', name: 'Bình' })
    store.getState().clearChips()
    expect(store.getState()).toMatchObject({
      time: null,
      requester: null,
      approver: null,
      query: 'pn',
      type: 'SALE',
    })
  })
})
