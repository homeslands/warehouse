import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AppDispatch, RootState } from '@/shared/store'
import { makeStore, store, type AppStore } from './index'

describe('app/store', () => {
  it('dispatch của store thật trùng kiểu AppDispatch mà shared/store khai cho useAppDispatch', () => {
    expectTypeOf<AppStore['dispatch']>().toEqualTypeOf<AppDispatch>()
    expectTypeOf<ReturnType<AppStore['getState']>>().toEqualTypeOf<RootState>()
  })

  it('M01 chưa có slice nào: state đầu rỗng, dispatch action lạ không lỗi', () => {
    const fresh = makeStore()
    expect(fresh.getState()).toEqual({})
    expect(() => fresh.dispatch({ type: 'unknown/action' })).not.toThrow()
    expect(store.getState()).toEqual({})
  })

  it('makeStore tạo store độc lập (test không dùng chung singleton)', () => {
    expect(makeStore()).not.toBe(makeStore())
  })
})
