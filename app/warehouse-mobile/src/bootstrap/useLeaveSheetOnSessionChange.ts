import { usePathname, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'

import { releaseLeaveGuards } from '@/shared/lib/forced-leave'

import type { Destination } from './destination'

/** Route của mọi bottom sheet (trình bày `sheetOptions` trong SessionGate). */
export const SHEET_ROUTES: readonly string[] = [
  '/switch-warehouse',
  '/change-password',
  '/language',
  '/stock-filter',
  '/stock-threshold',
  '/scan-material',
  '/import-line',
  '/import-add-line',
  '/import-pick',
  '/import-supplier',
  '/scan-line',
  '/import-filter',
  '/export-filter',
  '/export-line',
  '/export-add-line',
  '/scan-export-line',
]

/**
 * Đích đổi (phiên hết hạn, đăng nhập xong…) trong lúc đang mở một sheet: rời sheet sang đích mới.
 * Cần vì guard của sheet có thể vẫn đúng ở cả hai phía (vd `/language` mở được cả ở login lẫn tab) —
 * khi đó Expo Router không chuyển hướng mà chỉ gỡ màn nằm dưới, để lại sheet trơ trọi làm màn đầu
 * stack (✕/✓ không còn chỗ để quay lại). Nhả mọi `useDiscardGuard` trước khi rời (`forced-leave.ts`).
 */
export function useLeaveSheetOnSessionChange(destination: Destination, home: string | null) {
  const router = useRouter()
  const pathname = usePathname()
  const shownDestination = useRef(destination)

  useEffect(() => {
    if (destination === shownDestination.current) return
    shownDestination.current = destination
    if (!home || !SHEET_ROUTES.includes(pathname)) return
    // Rời bắt buộc: sheet có thay đổi chưa ✓ (`useDiscardGuard`) không được chặn / hỏi lần này.
    releaseLeaveGuards()
    router.replace(home)
  }, [destination, home, pathname, router])
}
