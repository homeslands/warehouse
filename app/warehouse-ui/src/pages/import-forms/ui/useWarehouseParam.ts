import { useSearchParams } from 'react-router-dom'

/** `?warehouse` của các trang phiếu; `''` = thiếu → trang tự về danh sách. */
export function useWarehouseParam(): string {
  const [params] = useSearchParams()
  return params.get('warehouse') ?? ''
}
