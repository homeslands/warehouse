import { create } from 'zustand'

import type { FormNotice } from './form-notice.store'

type Kind = FormNotice['kind']

/** (người dùng, kho, phiếu) của bản nháp — `formSlug` `'new'` = phiếu mới. */
export type CodeTakenContext = { userSlug: string; warehouseSlug: string; formSlug: string }

type Taken = { ctx: CodeTakenContext; code: string; message: string }

type State = {
  /** Lần ghi bị từ chối vì trùng mã gần nhất, mỗi loại phiếu một mục (hai tab có thể cùng mở `'new'`). */
  taken: Partial<Record<Kind, Taken>>
  /** Server báo trùng mã `code` (câu đã dịch `message`) cho bản nháp `ctx`. */
  set: (kind: Kind, ctx: CodeTakenContext, code: string, message: string) => void
  /** Thao tác ghi mới thật sự bắt đầu: bỏ lỗi của đúng loại + bản nháp `ctx`. */
  clear: (kind: Kind, ctx: CodeTakenContext) => void
}

const sameCtx = (a: CodeTakenContext, b: CodeTakenContext) =>
  a.userSlug === b.userSlug && a.warehouseSlug === b.warehouseSlug && a.formSlug === b.formSlug

/**
 * Lỗi trùng mã phiếu (server 101304 / 101305 phiếu nhập, 101404 / 101405 phiếu xuất) của form 3 bước —
 * store CẤP MODULE vì lần ghi bắt đầu ở bước 2 / 3 còn lỗi phải hiện dưới ô Mã phiếu ở bước 1 (route
 * khác). Chỉ trong bộ nhớ; lỗi tự mất khi mã trong bản nháp đổi (`useCodeTakenMessage`).
 */
export const useCodeTaken = create<State>((set, get) => ({
  taken: {},
  set: (kind, ctx, code, message) =>
    set({ taken: { ...get().taken, [kind]: { ctx, code, message } } }),
  clear: (kind, ctx) => {
    const t = get().taken[kind]
    if (t && sameCtx(t.ctx, ctx)) set({ taken: { ...get().taken, [kind]: undefined } })
  },
}))

/**
 * Câu lỗi trùng mã cho bản nháp `ctx` đang có mã `code`: chỉ khi lỗi là của đúng loại + bản nháp và mã
 * chưa đổi từ lần gửi bị từ chối; không thì `null`.
 */
export function useCodeTakenMessage(
  kind: Kind,
  ctx: CodeTakenContext | null | undefined,
  code: string | undefined,
): string | null {
  const t = useCodeTaken((s) => s.taken[kind])
  return t && ctx && sameCtx(t.ctx, ctx) && t.code === code ? t.message : null
}
