import * as React from 'react'

// Tách khỏi sidebar.tsx (shadcn để chung một file): file .tsx export hook/hằng cạnh component làm
// thêm warning react-refresh/only-export-components. Context và useSidebar giữ nguyên bản shadcn.

/** Cookie `SidebarProvider` ghi mỗi lần thu gọn/mở (`sidebar_state=true|false`), hạn 7 ngày. */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state'

export type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  /** id của phần tử sidebar (desktop hoặc ngăn trượt mobile) — `aria-controls` của SidebarTrigger. */
  sidebarId: string
}

export const SidebarContext = React.createContext<SidebarContextProps | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}
