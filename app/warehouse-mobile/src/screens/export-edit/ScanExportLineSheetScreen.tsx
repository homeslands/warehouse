import { useMemo } from 'react'

import { useInventory, type InventoryItem } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { MAX_ITEMS, useExportDraft, type ExportLine } from '@/features/export-draft'
import { ScanSheet, type MatchResult } from '@/features/scan-material'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

import { addMaterialLines } from './add-material-lines'
import { useLineFocus } from '@/shared/lib/line-focus'
import { useExportScanNotice } from './scan-notice.store'

/** Ứng viên khi so mã: dòng của phiếu (ưu tiên) rồi vật tư trong tồn kho. */
type Candidate =
  | { materialCode: string; kind: 'line'; key: string }
  | { materialCode: string; kind: 'stock'; item: InventoryItem }

/**
 * Route `/scan-export-line` — sheet quét mã mở từ nút Quét mã trên header bước 2 của phiếu xuất. So mã
 * nội bộ với các dòng của bản nháp rồi với tồn của kho. Khớp một dòng → yêu cầu `useLineFocus` + đóng —
 * bước 2 tự mở sheet sửa `/export-line` của dòng đó, ô số focus sẵn (vật tư nhiều dòng: dòng đầu trên
 * phiếu); khớp vật tư trong kho chưa có dòng → thêm thẳng một dòng như bộ chọn vật tư
 * (`addMaterialLines`: đơn vị gốc, lô tự động, số lượng chưa nhập) rồi đóng — bước 2 mở sheet của dòng đó
 * (đủ 200 dòng / vật tư chưa có đơn vị → không thêm, báo mức phiếu); không khớp → đóng và báo mức phiếu
 * (`useExportScanNotice`). Đang Lưu /
 * Gửi duyệt thì chỉ đóng (bản nháp bị khoá).
 */
export function ScanExportLineSheetScreen() {
  const close = useCloseSheet()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const lines = useExportDraft((s) => s.draft?.lines)
  const inventory = useInventory(warehouseSlug)

  const candidates = useMemo<Candidate[] | undefined>(() => {
    if (!inventory.data) return undefined
    const fromLines = (lines ?? []).map((l: ExportLine): Candidate => ({
      materialCode: l.materialCode,
      kind: 'line',
      key: l.key,
    }))
    const fromStock = inventory.data.map((i): Candidate => ({
      materialCode: i.materialCode,
      kind: 'stock',
      item: i,
    }))
    return [...fromLines, ...fromStock]
  }, [lines, inventory.data])

  const onResult = (result: MatchResult<Candidate>) => {
    const { draft, ctx, saving } = useExportDraft.getState()
    if (saving || !draft || !ctx) {
      close()
      return
    }
    if (result.kind === 'none') {
      useExportScanNotice.getState().show(ctx.formSlug, result.text)
      close()
      return
    }
    const found = result.item
    if (found.kind === 'line') {
      useExportScanNotice.getState().clear()
      useLineFocus.getState().ask('export', ctx.formSlug, found.key)
      close()
      return
    }
    if (draft.lines.length >= MAX_ITEMS) {
      useExportScanNotice.getState().show(ctx.formSlug, found.materialCode, 'full')
    } else if (addMaterialLines([found.item]).length === 0) {
      useExportScanNotice.getState().show(ctx.formSlug, found.materialCode, 'noUnit')
    } else {
      useExportScanNotice.getState().clear()
    }
    close()
  }

  return (
    <ScanSheet
      items={candidates}
      failed={!inventory.data && inventory.errorUpdateCount > 0}
      retrying={inventory.isFetching}
      onRetry={() => void inventory.refetch({ cancelRefetch: false })}
      onResult={onResult}
      onClose={close}
    />
  )
}
