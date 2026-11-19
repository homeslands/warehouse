import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useMaterialDraft } from '@/features/material-form'
import { ScanScreen } from '@/features/scan-material'
import { haptics } from '@/shared/lib/haptics'

/**
 * Màn con `scan` của sheet `/material-form`: quét mã vạch / QR để điền ô Mã. Đọc được → ghi vào
 * `useMaterialDraft.scannedCode` (form gốc nhận và kiểm tra quy tắc) rồi quay lại. Toàn màn (`ScanScreen`), chỉ có ✕.
 */
export function ScanCodeSheetScreen() {
  const { t } = useTranslation(['catalog'])
  const router = useRouter()

  // ✕ hoặc đã đọc được mã: khoá camera để lần quét tới không ghi mã / `back()` thêm lần nữa.
  const leaving = useRef(false)
  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    router.back()
  }

  const onScanned = (data: string) => {
    if (leaving.current) return
    useMaterialDraft.getState().setScannedCode(data.trim())
    haptics.success()
    leave()
  }

  return (
    <ScanScreen
      testID="material-scan-sheet"
      active
      onScanned={onScanned}
      onClose={leave}
      hint={t('catalog:material.scanHint')}
    />
  )
}
