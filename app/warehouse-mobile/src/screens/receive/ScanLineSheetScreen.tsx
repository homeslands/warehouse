import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

import {
  fetchAvailableMaterials,
  importFormKeys,
  useSuppliers,
  type AvailableMaterial,
} from '@/entities/import-form'
import { fetchMaterialByCode } from '@/entities/material'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { matchCode, ScanMatchScreen, type MatchResult } from '@/features/scan-material'
import {
  MAX_ITEMS,
  useReceiveDraft,
  type LocalLine,
  useScanNotice,
  addImportLines,
} from '@/features/receive-checklist'
import { useLineFocus } from '@/shared/lib/line-focus'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

const norm = (code: string) => code.trim().toUpperCase()

/** Cùng vật tư có nhiều đơn vị (nhiều dòng): dòng ĐẦU chưa kiểm, không có thì dòng đầu. */
function pickLine(lines: LocalLine[], found: LocalLine): LocalLine {
  const same = lines.filter((l) => norm(l.materialCode) === norm(found.materialCode))
  return same.find((l) => !l.checked) ?? same[0] ?? found
}

/** Vật tư của kho có ĐÚNG mã quét (tra `available-materials` theo mã; lỗi mạng → không thấy). */
async function lookupMaterial(
  queryClient: QueryClient,
  warehouseSlug: string,
  code: string,
): Promise<AvailableMaterial | null> {
  try {
    const result = await queryClient.fetchQuery({
      queryKey: importFormKeys.available(warehouseSlug, code),
      queryFn: () => fetchAvailableMaterials(warehouseSlug, { query: code, page: 1 }),
    })
    const hit = matchCode(
      code,
      result.items.map((m) => ({ materialCode: m.code, material: m })),
    )
    return hit.kind === 'found' ? hit.item.material : null
  } catch {
    return null
  }
}

/**
 * Route `/scan-line` — sheet quét mã trong phiếu nhập. So với các dòng của phiếu đang mở (bản nháp trên
 * máy); đang Lưu / Xác nhận thì chỉ đóng (bản nháp bị khoá).
 * - Checklist Kiểm hàng: khớp → đóng sheet rồi mở bảng sửa dòng `/import-line?key=`; không khớp → đóng
 *   và báo mức phiếu (`useScanNotice`).
 * - Màn soạn (`?compose=1`): khớp dòng → yêu cầu `useLineFocus` + đóng — bước 2 tự mở sheet sửa dòng
 *   `/import-line?compose=1` của dòng đó, ô số focus sẵn; không có trên phiếu mà thiếu `IMPORT_FORM_CREATE` (backend
 *   gác `available-materials` bằng quyền này) → không tra, báo `notOnForm`; có quyền → tra vật tư của kho theo mã
 *   (`available-materials`, khớp CHÍNH XÁC mã) → thêm một dòng như bộ chọn (`addImportLines`) + mở sheet
 *   của dòng đó như trên; phiếu đủ 200 dòng / vật tư chưa có đơn vị / không thấy → báo mức phiếu (`full` / `noUnit` /
 *   `notFound`). Không thấy trong kho → tra danh mục (`GET /materials?code=`, cần `MATERIAL_READ`): có →
 *   `notInWarehouse` (màn phiếu cho gắn kho rồi thêm dòng); không có → `notFound` + `canCreate`; lỗi / thiếu
 *   quyền → `notFound` không `canCreate`.
 */
export function ScanLineSheetScreen() {
  const closeSheet = useCloseSheet()
  // Đóng đúng MỘT lần: ✕ trong lúc `addScanned` còn chờ request rồi `close()` lần nữa sẽ `back()` khỏi cả modal phiếu.
  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { compose } = useLocalSearchParams<{ compose?: string }>()
  const composing = compose === '1'
  const lines = useReceiveDraft((s) => s.draft?.lines)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const user = useAuthStore((s) => s.user)
  const isNew = useReceiveDraft((s) => s.ctx?.formSlug === 'new')
  const canAdd = !!user && can(user, 'IMPORT_FORM_CREATE')
  // Phiếu mới: tên bên bán đầu phiếu (bản nháp chỉ giữ slug) lấy từ danh sách bên bán (cache).
  const suppliers = useSuppliers(composing && isNew && !!user && can(user, 'SUPPLIER_READ'))
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Màn soạn, mã không có trên phiếu: tra vật tư của kho rồi thêm dòng. */
  const addScanned = async (formSlug: string, code: string) => {
    const notice = useScanNotice.getState()
    if ((useReceiveDraft.getState().draft?.lines.length ?? 0) >= MAX_ITEMS) {
      notice.show(formSlug, code, 'full')
      close()
      return
    }
    const material = warehouseSlug ? await lookupMaterial(queryClient, warehouseSlug, code) : null
    // Sheet đã bị đóng / bản nháp đã đổi phiếu / đang lưu trong lúc tra → bỏ.
    const store = useReceiveDraft.getState()
    if (!mounted.current || store.saving || store.ctx?.formSlug !== formSlug) return
    if (!material) {
      // Không thấy trong kho: tra danh mục (cần MATERIAL_READ). Có → "chưa có trong kho" (gắn kho được);
      // không có → cho tạo; lỗi / thiếu quyền → không biết mã có tồn tại không nên KHÔNG gợi ý tạo.
      let catalog: Awaited<ReturnType<typeof fetchMaterialByCode>> = null
      let canCreate = false
      const u = useAuthStore.getState().user
      if (u && can(u, 'MATERIAL_READ')) {
        try {
          catalog = await fetchMaterialByCode(code)
          canCreate = true
        } catch {
          // lỗi mạng: giữ canCreate = false
        }
        const after = useReceiveDraft.getState()
        if (!mounted.current || after.saving || after.ctx?.formSlug !== formSlug) return
      }
      // Danh mục nói vật tư ĐÃ ở kho này mà tra kho không thấy → tra kho đã lỗi: không biết gì chắc chắn.
      if (catalog?.warehouses.some((w) => w.slug === warehouseSlug)) {
        catalog = null
        canCreate = false
      }
      if (catalog) {
        notice.show(formSlug, code, 'notInWarehouse', {
          material: {
            slug: catalog.slug,
            code: catalog.code,
            name: catalog.name,
            suppliers: catalog.suppliers.map((s) => ({ slug: s.slug, code: s.code, name: s.name })),
          },
        })
      } else notice.show(formSlug, code, 'notFound', { canCreate })
      close()
      return
    }
    const keys = addImportLines([material], {
      supplierName: (slug) => suppliers.data?.find((s) => s.slug === slug)?.name ?? null,
      user: useAuthStore.getState().user,
    })
    if (keys[0]) {
      notice.clear()
      useLineFocus.getState().ask('import', formSlug, keys[0])
    } else notice.show(formSlug, code, material.units.length === 0 ? 'noUnit' : 'notFound')
    close()
  }

  const onResult = (result: MatchResult<LocalLine>) => {
    const { draft, saving } = useReceiveDraft.getState()
    if (saving || !draft) {
      close()
      return
    }
    if (result.kind === 'found') {
      const line = pickLine(draft.lines, result.item)
      useScanNotice.getState().clear()
      close()
      if (composing) useLineFocus.getState().ask('import', draft.formSlug, line.key)
      else router.navigate({ pathname: '/import-line', params: { key: line.key } })
      return
    }
    if (composing && canAdd) {
      setBusy(true)
      void addScanned(draft.formSlug, result.text).finally(() => {
        if (mounted.current) setBusy(false)
      })
      return
    }
    if (composing) {
      useScanNotice.getState().show(draft.formSlug, result.text, 'notOnForm')
      close()
      return
    }
    useScanNotice.getState().show(draft.formSlug, result.text)
    close()
  }

  return <ScanMatchScreen items={lines} busy={busy} onResult={onResult} onClose={close} />
}
