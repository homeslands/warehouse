import { create } from 'zustand'

import type { Period } from './period'

type PeriodState = {
  period: Period
  /** 0 = kỳ hiện tại, n = lùi n kỳ; không bao giờ âm. */
  offset: number
  setPeriod: (period: Period) => void
  back: () => void
  forward: () => void
  reset: () => void
}

const initial = { period: 'month' as Period, offset: 0 }

/** Kỳ đang xem của tab Tổng quan. Chỉ sống trong phiên: xoá khi phiên kết thúc (`session-wiring`). */
export const usePeriodStore = create<PeriodState>((set) => ({
  ...initial,
  setPeriod: (period) => set({ period, offset: 0 }),
  back: () => set((s) => ({ offset: s.offset + 1 })),
  forward: () => set((s) => ({ offset: Math.max(0, s.offset - 1) })),
  reset: () => set({ ...initial }),
}))
