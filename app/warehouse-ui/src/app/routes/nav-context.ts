import { createContext, use } from 'react'
import type { NavGroup } from '@/shared/lib/nav'

/**
 * Menu đã lọc theo quyền, do `AppLayout` cung cấp. Chỉ tầng app đọc (route Tổng quan truyền nó
 * xuống `HomePage` qua prop) — page/widget không import app.
 */
export const NavContext = createContext<NavGroup[]>([])

export function useNavGroups(): NavGroup[] {
  return use(NavContext)
}
