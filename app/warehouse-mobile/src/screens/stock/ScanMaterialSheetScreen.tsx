import { useRouter } from 'expo-router'
import { useRef } from 'react'

import { useInventory, type InventoryItem } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { ScanMatchScreen, type MatchResult } from '@/features/scan-material'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

import { useStockFilter } from './stock-filter.store'

/**
 * Route `/scan-material` — sheet quét mã mở từ nút "Quét mã" của tab Tồn kho. So với tồn của kho
 * đang chọn (cache danh sách). Khớp → đóng sheet rồi mở chi tiết vật tư (trong Stack của tab, quay
 * lại là danh sách); không khớp → ghi mã vào ô tìm kiếm của danh sách rồi đóng — danh sách hiện
 * "Không tìm thấy vật tư khớp “…”".
 */
export function ScanMaterialSheetScreen() {
  const closeSheet = useCloseSheet()
  // Đóng đúng MỘT lần: khớp → close + push chi tiết; ✕ lúc đang trượt đóng không được `back()` thêm khỏi trang chi tiết.
  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }
  const router = useRouter()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const { data, errorUpdateCount, isFetching, refetch } = useInventory(warehouseSlug)

  const onResult = (result: MatchResult<InventoryItem>) => {
    if (result.kind === 'found') {
      close()
      router.push({
        pathname: '/stock/[materialSlug]',
        params: { materialSlug: result.item.materialSlug },
      })
      return
    }
    useStockFilter.getState().setQuery(result.text)
    close()
  }

  return (
    <ScanMatchScreen
      items={data}
      failed={!data && errorUpdateCount > 0}
      retrying={isFetching}
      onRetry={() => void refetch({ cancelRefetch: false })}
      onResult={onResult}
      onClose={close}
    />
  )
}
