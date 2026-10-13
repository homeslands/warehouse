import { useEffect, useRef } from 'react'
import { useWarehouses, type Warehouse } from '@/entities/warehouse'
import { recallWarehouse, rememberWarehouse, resolveWarehouse } from './last-warehouse'

/**
 * Tải danh sách kho (trang 1, `size: 100`), chọn kho theo `resolveWarehouse`. Khi kho chọn được khác `requested`
 * (URL thiếu / sai) thì gọi `onResolve` để bên gọi ghi lên URL; trùng thì nhớ vào localStorage.
 */
export function useWarehouseSelection(
  requested: string | undefined,
  onResolve: (slug: string) => void,
) {
  const { data, isPending, error } = useWarehouses({ page: 1, size: 100 })
  const warehouses = data?.items
  const resolved = warehouses ? resolveWarehouse(warehouses, requested, recallWarehouse()) : undefined

  // Ref để effect dưới không chạy lại chỉ vì bên gọi truyền callback mới mỗi lần render. Cập nhật trong effect
  // (không ghi ref lúc render); khai TRƯỚC effect dùng nó nên luôn chạy trước.
  const onResolveRef = useRef(onResolve)
  useEffect(() => {
    onResolveRef.current = onResolve
  })

  useEffect(() => {
    if (resolved === undefined) return
    if (resolved !== requested) onResolveRef.current(resolved)
    else rememberWarehouse(resolved)
  }, [resolved, requested])

  const warehouse: Warehouse | undefined =
    resolved === requested ? warehouses?.find((w) => w.slug === resolved) : undefined
  return { warehouses, warehouse, isPending, error }
}
