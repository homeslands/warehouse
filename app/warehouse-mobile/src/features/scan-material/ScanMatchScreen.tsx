import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { haptics } from '@/shared/lib/haptics'
import { Button, Text } from '@/shared/ui'

import { matchCode, type MatchResult } from './match-code'
import { ScanScreen, SCAN_TEXT } from './ScanScreen'

export type ScanMatchScreenProps<T extends { materialCode: string }> = {
  /** Danh sách để so mã (tồn của kho / dòng của phiếu); `undefined` = đang tải → chưa quét. */
  items: T[] | undefined
  /** Tải danh sách lỗi (chưa có dữ liệu) → báo lỗi + Thử lại thay vì "đang tải" mãi. */
  failed?: boolean
  retrying?: boolean
  onRetry?: () => void
  /** Màn bọc đang xử lý bất đồng bộ mã vừa đọc → thẻ đáy "Đang tra mã…". */
  busy?: boolean
  /** Gọi đúng MỘT lần với mã đầu tiên đọc được. */
  onResult: (result: MatchResult<T>) => void
  onClose: () => void
}

/**
 * Màn quét MỘT LẦN (spec §8) trên `ScanScreen`: đọc mã vạch/QR rồi so với mã nội bộ của danh sách
 * (`matchCode`). Chỉ xử lý mã ĐẦU TIÊN (khoá đồng bộ — camera bắn nhiều sự kiện liền nhau): khớp rung
 * success, không khớp rung lỗi, rồi báo `onResult` để màn bọc ngoài đóng và điều hướng. Danh sách chưa
 * có → thẻ đáy "đang tải" (chưa đọc) hoặc lỗi + Thử lại; sẵn sàng → không thẻ.
 */
export function ScanMatchScreen<T extends { materialCode: string }>({
  items,
  failed,
  retrying,
  onRetry,
  busy,
  onResult,
  onClose,
}: ScanMatchScreenProps<T>) {
  const { t } = useTranslation(['inventory', 'common'])
  const [done, setDone] = useState(false)

  const onScanned = (data: string) => {
    if (!items) return
    setDone(true)
    const result = matchCode(data, items)
    if (result.kind === 'found') haptics.success()
    else haptics.error()
    onResult(result)
  }

  let bottom = null
  if (!items && failed) {
    bottom = (
      <>
        <Text weight="semibold" size={16} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
          {t('inventory:loadError')}
        </Text>
        <Button variant="accent" capsule loading={retrying} onPress={() => onRetry?.()}>
          {t('common:retry')}
        </Button>
      </>
    )
  } else if (busy) {
    bottom = (
      <Text size={14} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
        {t('inventory:scanLookup')}
      </Text>
    )
  } else if (!items) {
    bottom = (
      <Text size={14} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
        {t('inventory:scanLoading')}
      </Text>
    )
  }

  return (
    <ScanScreen
      testID="scan-sheet"
      active={!!items && !done}
      onScanned={onScanned}
      onClose={onClose}
      hint={t('inventory:scanHint')}
      bottom={bottom}
    />
  )
}
