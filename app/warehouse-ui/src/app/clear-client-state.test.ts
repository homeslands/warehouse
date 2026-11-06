import { createSlice } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import { clearClientState } from '@/app/clear-client-state'
import { queryClient } from '@/app/query-client'
import { store } from '@/app/store'
import { rootReducer } from '@/shared/store'

// Slice CHỈ dùng trong test (M01 chưa có slice thật) để chứng minh Redux được purge.
const probeSlice = createSlice({
  name: 'testProbe',
  initialState: { touched: false },
  reducers: { touch: (state) => void (state.touched = true) },
})
const selectTouched = rootReducer.inject(probeSlice).selector((s) => s.testProbe.touched)

describe('clearClientState', () => {
  it('xoá cache React Query và đưa client state Redux về giá trị đầu', () => {
    queryClient.setQueryData(['probe'], { id: 1 })
    store.dispatch(probeSlice.actions.touch())
    expect(selectTouched(store.getState())).toBe(true)

    clearClientState()

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(selectTouched(store.getState())).toBe(false)
  })
})
