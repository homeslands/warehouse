import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { assignMaterialToWarehouse, inventoryKeys } from '@/entities/inventory'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { invalidateAfterMaterialWrite } from '@/features/material-form'
import {
  addImportLines,
  MAX_ITEMS,
  toAvailableMaterial,
  useReceiveDraft,
  useScanNotice,
  type ScanNotice,
} from '@/features/receive-checklist'
import { canAssignWarehouse, classifyAssignError } from '@/features/warehouse-assign'
import { errorMessage } from '@/shared/api/error-message'
import { useLineFocus } from '@/shared/lib/line-focus'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'

type Failure = { notice: ScanNotice; kind: 'reassign' | 'other'; text: string }

/**
 * Thông báo `notInWarehouse` của bước 2 (mã quét có trong danh mục, chưa gắn vào kho): câu "chưa có trong
 * kho", nút "Gắn vào kho và thêm vào phiếu" (cần `canAssignWarehouse`) hoặc câu nhờ quản trị. Bấm nút →
 * xác nhận → `PUT /warehouses/:w/materials` `{ materialSlug }` → thêm dòng (bên bán của phiếu) → sheet dòng
 * tự mở. Lỗi 100802 (từng gỡ khỏi kho) thay câu báo, không nút; lỗi khác nối vào câu báo, giữ nút thử lại.
 */
export function useScanAssign(
  formSlug: string,
  scan: ScanNotice | null,
  suppliers: { slug: string; name: string }[] | undefined,
): { message: string | null; action?: { label: string; onPress: () => void } } {
  const { t } = useTranslation(['importForms', 'common', 'catalog'])
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const warehouse = useWarehouseStore((s) => s.current)
  const confirming = useRef(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const material = scan?.reason === 'notInWarehouse' ? (scan.material ?? null) : null

  const guarded = useGuardedAction(
    async (notice: ScanNotice, slug: string) => {
      const epoch = getSessionEpoch()
      const draftOk = () => {
        const { ctx, draft, saving } = useReceiveDraft.getState()
        return !!draft && !saving && ctx?.formSlug === formSlug && ctx.warehouseSlug === slug
      }
      if (!draftOk()) {
        setFailure({ notice, kind: 'other', text: t('catalog:material.importUnavailable') })
        return
      }
      if ((useReceiveDraft.getState().draft?.lines.length ?? 0) >= MAX_ITEMS) {
        useScanNotice.getState().show(formSlug, notice.code, 'full')
        return
      }
      const item = await assignMaterialToWarehouse(slug, { materialSlug: notice.material!.slug })
      if (getSessionEpoch() !== epoch) return
      if (draftOk()) {
        const draft = useReceiveDraft.getState().draft!
        const name = (s: string) => suppliers?.find((x) => x.slug === s)?.name ?? null
        // Bên bán của vật tư = của danh mục (PUT gắn kho KHÔNG gắn bên bán); `addImportLines` ghim bên bán phiếu.
        const keys =
          draft.lines.length >= MAX_ITEMS
            ? []
            : addImportLines(
                [{ ...toAvailableMaterial(item), suppliers: notice.material!.suppliers }],
                {
                  supplierName: name,
                  user,
                },
              )
        if (keys[0]) {
          useLineFocus.getState().ask('import', formSlug, keys[0])
          useScanNotice.getState().clear()
        } else if (draft.lines.length >= MAX_ITEMS) {
          useScanNotice.getState().show(formSlug, notice.code, 'full')
        } else if (item.units.length === 0) {
          useScanNotice.getState().show(formSlug, notice.code, 'noUnit')
        } else useScanNotice.getState().clear()
      } else {
        // Bản nháp đã đổi (phiếu / kho / đang lưu) thì không thêm dòng: vật tư đã ở trong kho, quét lại là thêm được.
        useScanNotice.getState().clear()
      }
      await Promise.all([
        invalidateAfterMaterialWrite(queryClient, item.materialSlug),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(slug) }),
      ])
    },
    {
      onError: (e) => {
        if (!scan) return
        setFailure(
          classifyAssignError(e) === 'reassign'
            ? { notice: scan, kind: 'reassign', text: t('importForms:compose.scanAssignReassign') }
            : { notice: scan, kind: 'other', text: errorMessage(e, t) },
        )
      },
    },
  )

  if (!scan || !material) return { message: null }
  const whName = warehouse?.name ?? ''
  const base = t('importForms:compose.scanNotInWarehouse', {
    code: material.code,
    name: material.name,
    warehouse: whName,
  })
  const mine = failure?.notice === scan ? failure : null
  if (mine?.kind === 'reassign') return { message: mine.text }
  if (!canAssignWarehouse(user)) {
    return { message: `${base} ${t('importForms:compose.scanAssignNoPermission')}` }
  }
  const onPress = async () => {
    if (confirming.current || guarded.pending) return
    const slug = useReceiveDraft.getState().ctx?.warehouseSlug
    if (!slug) return
    confirming.current = true
    let ok = false
    try {
      ok = await confirmAction({
        title: t('importForms:compose.scanAssignConfirm', {
          code: material.code,
          warehouse: whName,
        }),
        confirmLabel: t('importForms:compose.scanAssign'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (!ok) return
    setFailure(null)
    // Lỗi: hook tự mở khoá để thử lại; thành công: mở khoá cho thông báo kế tiếp.
    if (await guarded.run(scan, slug)) guarded.reset()
  }
  return {
    message: mine ? `${base} ${mine.text}` : base,
    action: {
      label: t('importForms:compose.scanAssign'),
      onPress: () => void onPress(),
    },
  }
}
