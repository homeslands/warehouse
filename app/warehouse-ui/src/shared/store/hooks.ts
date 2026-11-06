import type { Dispatch, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from './root-reducer'

/**
 * Kiểu `dispatch` của store dựng bằng `configureStore` với middleware mặc định (thunk).
 * `app/store/store.test.ts` khẳng định kiểu này trùng `typeof store.dispatch` — thêm middleware
 * mà quên cập nhật đây thì typecheck đỏ.
 */
export type AppDispatch = ThunkDispatch<RootState, undefined, UnknownAction> &
  Dispatch<UnknownAction>

/** Dùng thay `useDispatch` / `useSelector` trơn để có kiểu RootState / AppDispatch. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
