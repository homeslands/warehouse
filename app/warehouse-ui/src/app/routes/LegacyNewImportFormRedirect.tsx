import { Navigate, useLocation } from 'react-router-dom'

/** Link cũ `/import-forms/new` (trang tạo phiếu nay là sheet): về danh sách, giữ `?warehouse=`. */
export function LegacyNewImportFormRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/import-forms', search }} replace />
}
