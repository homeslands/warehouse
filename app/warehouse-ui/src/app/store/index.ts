import { configureStore } from '@reduxjs/toolkit'
import { appReducer, type RootState } from '@/shared/store'

/**
 * Redux Toolkit (D08) chỉ giữ client/workflow state. Dữ liệu server ở React Query — không chép
 * sang đây. State Zustand hiện có (`entities/session`, `widgets/app-shell`) chuyển dần theo
 * từng microtask W02, chưa chuyển ở M01.
 */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: appReducer, preloadedState })
}

export type AppStore = ReturnType<typeof makeStore>

export const store = makeStore()
