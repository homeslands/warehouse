import { usePathname, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'

import { releaseLeaveGuards } from '@/shared/lib/forced-leave'

import type { Destination } from './destination'

/**
 * Route của mọi bottom sheet (trình bày `sheetOptions` trong SessionGate) và màn quét mã toàn màn
 * (`/scan-material`, `/scan-catalog-material`, `/scan-line`, `/scan-export-line` — `scanModalOptions`): đều là màn tạm nằm trên
 * màn khác, đổi phiên / kho thì phải rời như nhau.
 */
export const SHEET_ROUTES: readonly string[] = [
  '/switch-warehouse',
  '/change-password',
  '/language',
  '/stock-filter',
  '/stock-threshold',
  '/expiry-batches',
  '/scan-material',
  '/scan-catalog-material',
  '/unit-form',
  '/material-type-form',
  '/material-form',
  '/material-filter',
  '/conversion-unit-form',
  '/warehouse-assign',
  '/import-line',
  '/import-add-line',
  '/import-pick',
  '/import-supplier',
  '/scan-line',
  '/import-filter',
  '/export-filter',
  '/export-line',
  '/export-type',
  '/export-receiver',
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
    if (!home || !SHEET_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return
    // Rời bắt buộc: sheet có thay đổi chưa ✓ (`useDiscardGuard`) không được chặn / hỏi lần này.
    releaseLeaveGuards()
    router.replace(home)
  }, [destination, home, pathname, router])
}
