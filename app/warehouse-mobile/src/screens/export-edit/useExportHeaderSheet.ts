import { useEffect } from 'react'

import { useWarehouseStore } from '@/entities/warehouse'
import { useExportDraft } from '@/features/export-draft'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

/**
 * Chung cho sheet chọn một ô đầu phiếu xuất (`/export-type`, `/export-receiver`): đầu phiếu của bản nháp
 * đang mở + `saving` + `close`. Không còn bản nháp hoặc bản nháp thuộc kho khác kho đang chọn → tự đóng
 * (`header` = `null`).
 */
export function useExportHeaderSheet() {
  const close = useCloseSheet()
  const draft = useExportDraft((s) => s.draft)
  const draftWarehouse = useExportDraft((s) => s.ctx?.warehouseSlug)
  const saving = useExportDraft((s) => s.saving)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const header = draft && draftWarehouse === warehouseSlug ? draft.header : null

  const gone = !header
  useEffect(() => {
    if (gone) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi bản nháp biến mất.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  return { header, saving, close, warehouseSlug }
}
