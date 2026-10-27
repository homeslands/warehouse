import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  exportFormKeys,
  isShortageError,
  isStaleExportFormError,
  useConfirmExportForm,
  useCreateExportForm,
  useSubmitExportForm,
  useUpdateExportForm,
  type ExportForm,
} from '@/entities/export-form'
import { inventoryKeys } from '@/entities/inventory'
import { materialBatchKeys } from '@/entities/material-batch'
import {
  toExportFormInput,
  toExportFormUpdate,
  type ExportFormValues,
} from '../model/export-form-editor.schema'

/**
 * Kết quả lưu gửi cho trang cha (trang tự toast): phiếu đã tới `stage` nào; `error` = lỗi của bước sau cùng thất bại
 * (vd đã lưu nháp nhưng gửi duyệt lỗi → `stage: 'draft'` kèm `error`).
 */
export type ExportFormSaveOutcome = {
  form: ExportForm
  stage: 'draft' | 'submitted' | 'confirmed'
  error?: unknown
}

/** Nút đang lưu — chỉ nút đó đổi chữ thành "Đang lưu...". */
export type ExportFormSaveAction = 'draft' | 'submit' | 'confirm' | 'save'

export type SubmitFailure = {
  /** Phiếu Nháp mới nhất trong tay (vừa tạo / vừa sửa / phiếu gốc). */
  form: ExportForm
  error: unknown
  /** Lần bấm này đã lưu được gì đó (tạo hoặc PATCH) trước khi gửi duyệt lỗi. */
  saved: boolean
}

type Options = {
  warehouseSlug: string
  /** Xong (kể cả khi bước sau cùng lỗi mà phiếu đã đổi trạng thái / đã lưu): sheet đóng rồi báo trang cha. */
  onFinish: (outcome: ExportFormSaveOutcome) => void
  /** Phiếu trong tay đã cũ (409 version, không còn Nháp…) mà lần bấm này chưa lưu được gì. */
  onStale: () => void
  /** Tạo / sửa lỗi — chưa lưu gì (lỗi theo ô, lỗi dòng…). */
  onSaveError: (error: unknown) => void
  /**
   * Gửi duyệt lỗi, phiếu vẫn là Nháp — sheet ở lại sửa phiếu đó. Gọi SAU khi tồn / lô đã tải lại nếu là lỗi thiếu hàng
   * (để chạy lại luật vượt khả dụng với số mới).
   */
  onSubmitFailed: (failure: SubmitFailure) => void
}

/**
 * Các luồng lưu của sheet phiếu xuất: Lưu nháp (tạo), Lưu (sửa), Lưu & gửi duyệt và Gửi & xác nhận (tạo hoặc sửa rồi
 * gửi duyệt, rồi xác nhận). Không tự toast thành công (trang cha toast qua `onFinish`); lỗi do bên gọi xử lý qua các
 * callback. Sau mọi lần gửi duyệt / xác nhận (được hay lỗi) làm mới phiếu, tồn và lô của kho.
 */
export function useExportFormSave({
  warehouseSlug,
  onFinish,
  onStale,
  onSaveError,
  onSubmitFailed,
}: Options) {
  const qc = useQueryClient()
  const create = useCreateExportForm({ successToast: false })
  const update = useUpdateExportForm({ successToast: false })
  const submit = useSubmitExportForm({ successToast: false })
  const confirm = useConfirmExportForm({ successToast: false })
  // `saving` phủ cả khoảng giữa các request của một lần bấm, nơi không mutation nào pending.
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<ExportFormSaveAction | null>(null)
  const isPending =
    saving || create.isPending || update.isPending || submit.isPending || confirm.isPending

  /** Gửi duyệt / xác nhận đổi giữ chỗ / tồn: làm mới phiếu, tồn và lô (đợi các query đang hiện tải xong). */
  const refreshStock = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) }),
      qc.invalidateQueries({ queryKey: inventoryKeys.all }),
      qc.invalidateQueries({ queryKey: materialBatchKeys.warehouse(warehouseSlug) }),
    ])

  const run = async (action: ExportFormSaveAction, fn: () => Promise<void>) => {
    setSaving(true)
    setPendingAction(action)
    try {
      await fn()
    } finally {
      setSaving(false)
      setPendingAction(null)
    }
  }

  /** Tạo → Nháp. */
  const saveDraft = (values: ExportFormValues) =>
    run('draft', async () => {
      try {
        const saved = await create.mutateAsync({ warehouseSlug, input: toExportFormInput(values) })
        onFinish({ form: saved, stage: 'draft' })
      } catch (error) {
        onSaveError(error)
      }
    })

  /** Sửa → PATCH (vẫn Nháp). */
  const saveEdit = (original: ExportForm, values: ExportFormValues) =>
    run('save', async () => {
      try {
        const saved = await update.mutateAsync({
          warehouseSlug,
          slug: original.slug,
          input: toExportFormUpdate(values, original),
        })
        onFinish({ form: saved, stage: 'draft' })
      } catch (error) {
        if (isStaleExportFormError(error)) onStale()
        else onSaveError(error)
      }
    })

  /**
   * Lưu & gửi duyệt (và `andConfirm` = Gửi & xác nhận). Chưa có phiếu → tạo; có mà đã đổi → PATCH; không đổi → gửi
   * thẳng với `version` hiện có. Gửi duyệt lỗi thì phiếu vẫn Nháp và sheet ở lại (`onSubmitFailed`); xác nhận lỗi thì
   * phiếu đã Chờ duyệt — `onFinish` kèm lỗi.
   */
  const saveAndSubmit = (
    values: ExportFormValues,
    { original, dirty, andConfirm }: { original?: ExportForm; dirty: boolean; andConfirm: boolean },
  ) =>
    run(andConfirm ? 'confirm' : 'submit', async () => {
      let draft: ExportForm
      let saved = false
      try {
        if (!original) {
          draft = await create.mutateAsync({ warehouseSlug, input: toExportFormInput(values) })
          saved = true
        } else if (dirty) {
          draft = await update.mutateAsync({
            warehouseSlug,
            slug: original.slug,
            input: toExportFormUpdate(values, original),
          })
          saved = true
        } else draft = original
      } catch (error) {
        if (original && isStaleExportFormError(error)) onStale()
        else onSaveError(error)
        return
      }

      let pending: ExportForm
      try {
        pending = await submit.mutateAsync({
          warehouseSlug,
          slug: draft.slug,
          version: draft.version,
        })
      } catch (error) {
        const refreshed = refreshStock()
        if (isStaleExportFormError(error)) {
          // Đã lưu trong lần bấm này thì vẫn báo "đã lưu nháp nhưng chưa gửi duyệt"; chưa lưu gì → như phiếu cũ.
          if (saved) onFinish({ form: draft, stage: 'draft', error })
          else onStale()
          return
        }
        // Thiếu hàng không nói dòng nào: đợi tồn / lô tải lại để bên gọi đánh dấu được dòng thiếu.
        if (isShortageError(error)) await refreshed
        onSubmitFailed({ form: draft, error, saved })
        return
      }

      void refreshStock()
      if (!andConfirm) {
        onFinish({ form: pending, stage: 'submitted' })
        return
      }
      try {
        const done = await confirm.mutateAsync({
          warehouseSlug,
          slug: pending.slug,
          version: pending.version,
        })
        void refreshStock()
        onFinish({ form: done, stage: 'confirmed' })
      } catch (error) {
        void refreshStock()
        onFinish({ form: pending, stage: 'submitted', error })
      }
    })

  return { isPending, pendingAction, saveDraft, saveEdit, saveAndSubmit }
}
