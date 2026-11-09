import type { ImportForm } from '@/entities/import-form'
import { kv } from '@/shared/storage/kv'

import { isDirty, type ReceiveDraft } from './draft'
import { draftStorageKey, isValidDraft, useReceiveDraft, type DraftContext } from './draft.store'
import { RECEIVE_CHECKLIST_ENABLED } from './flags'

const sameContext = (a: DraftContext | null, b: DraftContext) =>
  a?.userSlug === b.userSlug && a.warehouseSlug === b.warehouseSlug && a.formSlug === b.formSlug

/** Tiến độ kiểm trên máy của một phiếu: số dòng đã đánh dấu / tổng số dòng của bản nháp. */
export type LocalProgress = { checked: number; total: number }

/**
 * Xem (CHỈ ĐỌC) tiến độ kiểm trên máy của phiếu `ctx` — cho màn xem phiếu ("Kiểm hàng · đã kiểm 3/6").
 * Ưu tiên bản nháp trong bộ nhớ khi đúng (người dùng, kho, phiếu): có thể còn thay đổi chưa kịp ghi
 * (debounce). Không có thì đọc bản đã lưu trong `kv`. Không `load`, không gộp, không ghi/xoá gì (bản
 * hỏng để nguyên cho `load` của màn kiểm xử lý). Không có bản nháp → `null`.
 */
export async function peekLocalProgress(ctx: DraftContext): Promise<LocalProgress | null> {
  const draft = await readLocalDraft(ctx)
  if (!draft) return null
  // Tắt checklist: dấu kiểm cũ còn trên máy không được hiện.
  if (!RECEIVE_CHECKLIST_ENABLED) return null
  return { checked: draft.lines.filter((l) => l.checked).length, total: draft.lines.length }
}

/** Bản nháp trên máy của `ctx`: bộ nhớ (đúng ngữ cảnh) trước, rồi `kv`; hỏng / không có → `null`. */
async function readLocalDraft(ctx: DraftContext): Promise<ReceiveDraft | null> {
  const store = useReceiveDraft.getState()
  const inMemory =
    sameContext(store.ctx, ctx) && store.draft?.formSlug === ctx.formSlug ? store.draft : null
  const raw =
    inMemory ??
    (await kv.get<unknown>(draftStorageKey(ctx.userSlug, ctx.warehouseSlug, ctx.formSlug)))
  return isValidDraft(raw, ctx.formSlug) ? raw : null
}

/**
 * Trên máy có công việc thật của phiếu `form` chưa được lưu: có dòng đã kiểm HOẶC bản nháp khác phiếu
 * (`isDirty`). Bản dựng sạch từ phiếu (store không reset khi rời màn kiểm) → `false`. Chỉ đọc.
 */
export async function hasLocalWork(ctx: DraftContext, form: ImportForm): Promise<boolean> {
  const draft = await readLocalDraft(ctx)
  if (!draft) return false
  return (RECEIVE_CHECKLIST_ENABLED && draft.lines.some((l) => l.checked)) || isDirty(draft, form)
}

/**
 * Bỏ bản nháp trên máy của phiếu `ctx` khi phiếu đã không còn Nháp (xác nhận / huỷ ở nơi khác) hoặc
 * không còn trên server — màn xem gọi, vì phiếu như vậy không còn đường mở màn kiểm (nơi vẫn tự dọn
 * qua `load` → `discard`). Xoá bản lưu `kv`; bản trong bộ nhớ chỉ bỏ khi đúng ngữ cảnh và KHÔNG đang
 * Lưu / Xác nhận (kết quả gửi sẽ tự xử lý bản nháp). `discard()` cũng huỷ lần ghi đang hẹn, không thì
 * phần chưa kịp ghi sẽ ghi lại khoá vừa xoá.
 */
export async function dropLocalDraft(ctx: DraftContext): Promise<void> {
  const store = useReceiveDraft.getState()
  if (sameContext(store.ctx, ctx) && !store.saving) {
    await store.discard()
    return
  }
  await kv.remove(draftStorageKey(ctx.userSlug, ctx.warehouseSlug, ctx.formSlug))
}
