import type { QueryClient } from '@tanstack/react-query'

import {
  can,
  seesAllWarehouses,
  setCacheCleaner,
  useAuthStore,
  type CurrentUser,
} from '@/entities/session'
import { useWarehouseStore, type WarehouseSource } from '@/entities/warehouse'
import { usePasswordNotice } from '@/features/change-password'
import { useExportDraft } from '@/features/export-draft'
import { useReceiveDraft } from '@/features/receive-checklist'
import { resetExportListOnWarehouseChange, useExportListFilter } from '@/screens/export-list'
import { resetImportListOnWarehouseChange, useImportListFilter } from '@/screens/import-list'
import { resetScanNoticeOnWarehouseChange, useScanNotice } from '@/screens/receive'
import { resetStockFilterOnWarehouseChange, useStockFilter } from '@/screens/stock'
import { setSessionEndHandler } from '@/shared/api/http'
import { useFormNotice } from '@/shared/lib/form-notice.store'

/**
 * ADMIN / SUPER_ADMIN chọn trong MỌI kho (`GET /warehouses`) — người dùng chốt 2026-11-05: "ADMIN trở
 * lên được toàn quyền nên không cần check thuộc kho nào". Endpoint đó cần `WAREHOUSE_READ` (SUPER_ADMIN
 * luôn qua): ADMIN bị thu quyền này thì giữ kho của `/auth/me` thay vì kẹt ở lỗi 403.
 */
function warehouseSourceFor(user: CurrentUser): WarehouseSource {
  return seesAllWarehouses(user.roleName) && can(user, 'WAREHOUSE_READ') ? 'all' : 'mine'
}

/**
 * Chỉ những trường quyết định kho hiện tại. Hồ sơ nạp lại (quay lại app) luôn là object MỚI dù không
 * đổi gì — so cả object thì mỗi lần như vậy lại resolve, chạy đua với `select()` đang bay. Nguồn `all`
 * không phụ thuộc `user.warehouses` nên nạp lại hồ sơ không tải lại danh sách.
 */
function warehouseKey(user: CurrentUser, source: WarehouseSource): string {
  const who = user.userSlug ?? user.userName
  if (source === 'all') return `${who}|all`
  const slugs = (user.warehouses ?? []).map((w) => `${w.slug}:${w.name}:${w.isManager}`)
  return `${who}|${slugs.join(',')}`
}

/**
 * Nối các slice lại với nhau. Gọi MỘT lần, TRƯỚC `bootstrapSession()`. Trả hàm gỡ các listener.
 *
 * - interceptor 401 → `endSession` (xoá token đồng bộ, đúng hợp đồng của `setSessionEndHandler`);
 * - phiên bắt đầu/kết thúc → `queryClient.clear()`;
 * - phiên kết thúc → reset store kho, xoá thông báo "đã đổi mật khẩu", xoá bộ lọc tab Tồn kho, bộ lọc tab Nhập và tab Xuất,
 *   xoá bản nháp Nhận hàng trong bộ nhớ (bản đã lưu trên máy được giữ), thông báo quét không khớp và
 *   thông báo mức phiếu của form 3 bước (`useFormNotice`);
 * - đổi kho → xoá ô tìm kiếm/bộ lọc tab Tồn kho và ô tìm kiếm tab Nhập / Xuất, thông báo quét không khớp
 *   và thông báo mức phiếu (từ khoá / phiếu của kho cũ không mang sang kho mới);
 * - vào `authenticated` (sau bootstrap, sau đăng nhập) hoặc hồ sơ nạp lại làm đổi danh sách kho /
 *   nguồn kho → `resolveFor(user, nguồn)` (ADMIN+ → `GET /warehouses`, còn lại → `/auth/me`); hồ sơ
 *   nạp lại mà khoá không đổi, nguồn `all` → `revalidate(user)` (tải lại im lặng).
 *   Route chỉ tới được màn chọn kho khi đã resolve (`destinationFor`), nên `select()` không bao giờ
 *   chạy trước `resolveFor`.
 */
export function wireSession(queryClient: QueryClient): () => void {
  setSessionEndHandler((reason) => useAuthStore.getState().endSession(reason))
  setCacheCleaner(() => queryClient.clear())

  const offEnd = useAuthStore.getState().onSessionEnd(() => {
    useWarehouseStore.getState().reset()
    usePasswordNotice.getState().clear()
    useStockFilter.getState().reset()
    useImportListFilter.getState().reset()
    useExportListFilter.getState().reset()
    // Chỉ xoá bộ nhớ: bản nháp đã lưu trên máy được giữ qua đăng xuất (spec §7).
    useReceiveDraft.getState().reset()
    useExportDraft.getState().reset()
    useScanNotice.getState().clear()
    useFormNotice.getState().reset()
  })
  const offFormNotice = useWarehouseStore.subscribe((state, prev) => {
    if (state.current?.slug !== prev.current?.slug) useFormNotice.getState().reset()
  })
  const offStockFilter = resetStockFilterOnWarehouseChange()
  const offImportList = resetImportListOnWarehouseChange()
  const offExportList = resetExportListOnWarehouseChange()
  const offScanNotice = resetScanNoticeOnWarehouseChange()

  let resolvedKey: string | null = null
  let seenUser: CurrentUser | null = null
  const sync = (status: string, user: CurrentUser | null) => {
    if (status !== 'authenticated' || !user) {
      resolvedKey = null
      seenUser = null
      return
    }
    const fresh = user !== seenUser
    seenUser = user
    const source = warehouseSourceFor(user)
    const key = warehouseKey(user, source)
    if (key === resolvedKey) {
      // Hồ sơ nạp lại (quay lại app) với nguồn `all`: khoá không đổi theo `user.warehouses` → kiểm lại
      // danh sách `GET /warehouses` im lặng (kho bị xoá / thêm / tắt trên web) — tương đương việc
      // khoá đổi làm MANAGER resolve lại.
      if (fresh && source === 'all') void useWarehouseStore.getState().revalidate(user)
      return
    }
    resolvedKey = key
    void useWarehouseStore.getState().resolveFor(user, source)
  }

  const offAuth = useAuthStore.subscribe((state) => sync(state.status, state.user))
  const { status, user } = useAuthStore.getState()
  sync(status, user)

  return () => {
    offEnd()
    offStockFilter()
    offImportList()
    offExportList()
    offScanNotice()
    offFormNotice()
    offAuth()
  }
}
