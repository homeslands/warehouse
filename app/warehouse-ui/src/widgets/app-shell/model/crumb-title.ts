import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { create } from 'zustand'

/**
 * Tên bản ghi cho mục cuối breadcrumb và tiêu đề tab. Crumb tĩnh (`handle.crumb`) không biết tên kho
 * — tên chỉ có sau khi trang tải dữ liệu, nên trang tự đẩy lên đây. Gắn với `pathname` để tên của
 * trang cũ không bao giờ dính sang trang mới.
 */
const useCrumbTitleStore = create<{ pathname: string | null; title: string | null }>(() => ({
  pathname: null,
  title: null,
}))

/**
 * Trang chi tiết gọi `useCrumbTitle(record?.name)`. `undefined` (đang tải) = giữ nhãn tĩnh của route.
 * Không dùng route `loader` để lấy tên: loader chạy TRƯỚC `RoleGate` (xem CLAUDE.md).
 */
export function useCrumbTitle(title: string | undefined): void {
  const { pathname } = useLocation()

  useEffect(() => {
    if (!title) return
    useCrumbTitleStore.setState({ pathname, title })
    return () => {
      // Chỉ xoá khi override vẫn là của chính trang này.
      if (useCrumbTitleStore.getState().pathname === pathname) {
        useCrumbTitleStore.setState({ pathname: null, title: null })
      }
    }
  }, [pathname, title])
}

/** Override cho `pathname` hiện tại, hoặc `null`. */
export function useCrumbTitleFor(pathname: string): string | null {
  return useCrumbTitleStore((s) => (s.pathname === pathname ? s.title : null))
}
