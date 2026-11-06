import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  appReducer,
  purgeClientState,
  rootReducer,
  useAppDispatch,
  useAppSelector,
  type AppDispatch,
  type RootState,
} from '@/shared/store'

// Slice CHỈ dùng trong test để chứng minh cơ chế inject/purge — không phải state thật của app.
const draftSlice = createSlice({
  name: 'testDraft',
  initialState: { note: '' },
  reducers: {
    setNote: (state, action: PayloadAction<string>) => {
      state.note = action.payload
    },
  },
})

const withDraft = rootReducer.inject(draftSlice)
const selectNote = withDraft.selector((state) => state.testDraft.note)

function setup() {
  const store = configureStore({ reducer: appReducer })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return { store, wrapper }
}

describe('shared/store', () => {
  it('slice inject vào rootReducer có mặt trong state đầu của store', () => {
    expect(setup().store.getState()).toEqual({ testDraft: { note: '' } })
  })

  it('useAppSelector / useAppDispatch đọc & ghi slice đã inject', () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        note: useAppSelector(selectNote),
        dispatch: useAppDispatch(),
      }),
      { wrapper },
    )

    expect(result.current.note).toBe('')
    act(() => {
      result.current.dispatch(draftSlice.actions.setNote('ghi chú'))
    })
    expect(result.current.note).toBe('ghi chú')
  })

  it('purgeClientState đưa mọi slice về giá trị đầu', () => {
    const { store } = setup()
    store.dispatch(draftSlice.actions.setNote('nháp'))
    expect(selectNote(store.getState())).toBe('nháp')

    store.dispatch(purgeClientState())

    expect(selectNote(store.getState())).toBe('')
  })

  it('hook có kiểu RootState / AppDispatch', () => {
    const { wrapper } = setup()
    renderHook(
      () => {
        expectTypeOf(useAppDispatch()).toEqualTypeOf<AppDispatch>()
        return useAppSelector((state) => {
          expectTypeOf(state).toEqualTypeOf<RootState>()
          return null
        })
      },
      { wrapper },
    )
  })
})
