import { combineSlices, createAction, type UnknownAction } from '@reduxjs/toolkit'

/**
 * Slice nạp sau (lazy) khai báo kiểu tại đây bằng module augmentation, trong slice của nó:
 *
 * ```ts
 * declare module '@/shared/store' {
 *   interface LazyLoadedSlices extends WithSlice<typeof lockSlice> {}
 * }
 * rootReducer.inject(lockSlice)
 * ```
 *
 * Root reducer nằm ở `shared` để entities/features tự inject mà không import ngược lên `app`.
 * `app/store` chỉ dựng store từ reducer này.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- điểm mở rộng cho slice lazy
export interface LazyLoadedSlices {}

export const rootReducer = combineSlices().withLazyLoadedSlices<LazyLoadedSlices>()

export type RootState = ReturnType<typeof rootReducer>

/**
 * Logout / đổi người dùng: xoá toàn bộ client state về giá trị đầu của từng slice
 * (screen-contracts R2: "Logout/userchange purge query/Redux/draft").
 */
export const purgeClientState = createAction('app/purgeClientState')

/** Reducer gốc thật của store: như `rootReducer` nhưng `purgeClientState` đưa mọi slice về đầu. */
export function appReducer(state: RootState | undefined, action: UnknownAction): RootState {
  return rootReducer(purgeClientState.match(action) ? undefined : state, action)
}
