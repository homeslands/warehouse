import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera'
import { ScanBarcode } from '@/shared/ui/icons'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'

import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, SheetScaffold, Text } from '@/shared/ui'

import { matchCode, type MatchResult } from './match-code'

/** Các loại mã đã chốt (spec §8): mã vạch 1D thường gặp + QR. */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'code128', 'code39', 'qr']

export type ScanSheetProps<T extends { materialCode: string }> = {
  /** Danh sách để so mã (tồn của kho / dòng của phiếu); `undefined` = đang tải → chưa quét. */
  items: T[] | undefined
  /** Tải danh sách lỗi (chưa có dữ liệu) → báo lỗi + Thử lại thay vì "đang tải" mãi. */
  failed?: boolean
  retrying?: boolean
  onRetry?: () => void
  /** Gọi đúng MỘT lần với mã đầu tiên đọc được. */
  onResult: (result: MatchResult<T>) => void
  onClose: () => void
}

/** Khung ngắm: 4 góc trắng ở giữa khung camera (chỉ trang trí). */
function Viewfinder() {
  const corner = (pos: object, edges: object) => (
    <View
      style={[{ position: 'absolute', width: 28, height: 28, borderColor: '#ffffff' }, pos, edges]}
    />
  )
  return (
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { padding: '18%' }]}>
      <View style={{ flex: 1 }}>
        {corner(
          { top: 0, left: 0 },
          { borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
        )}
        {corner(
          { top: 0, right: 0 },
          { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
        )}
        {corner(
          { bottom: 0, left: 0 },
          { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
        )}
        {corner(
          { bottom: 0, right: 0 },
          { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
        )}
      </View>
    </View>
  )
}

/**
 * Thân sheet "Quét mã vật tư" (spec §8): xin quyền camera (bị từ chối hẳn → mở Cài đặt), khung camera
 * bo góc có khung ngắm, đọc mã vạch/QR rồi so với mã nội bộ của kho (`matchCode`). Chỉ xử lý mã ĐẦU
 * TIÊN (khoá đồng bộ — camera bắn nhiều sự kiện liền nhau): khớp rung success, không khớp rung lỗi,
 * rồi báo `onResult` để màn bọc ngoài đóng sheet và điều hướng. Header chỉ có ✕.
 */
export function ScanSheet<T extends { materialCode: string }>({
  items,
  failed,
  retrying,
  onRetry,
  onResult,
  onClose,
}: ScanSheetProps<T>) {
  const { t } = useTranslation(['inventory', 'common'])
  const { colors, radius } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const handled = useRef(false)
  const [done, setDone] = useState(false)

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current || !items) return
    handled.current = true
    setDone(true)
    const result = matchCode(data, items)
    if (result.kind === 'found') haptics.success()
    else haptics.error()
    onResult(result)
  }

  let body = null
  if (!items && failed) {
    body = (
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24, paddingHorizontal: 12 }}>
        <Text weight="semibold" size={17} style={{ textAlign: 'center' }}>
          {t('inventory:loadError')}
        </Text>
        <Button variant="outline" loading={retrying} onPress={() => onRetry?.()}>
          {t('common:retry')}
        </Button>
      </View>
    )
  } else if (permission?.granted) {
    body = (
      <View style={{ gap: 14 }}>
        <View
          style={{
            aspectRatio: 1,
            borderRadius: radius.groupLarge,
            overflow: 'hidden',
            backgroundColor: '#000000',
          }}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={items && !done ? onScanned : undefined}
          />
          <Viewfinder />
        </View>
        <Text muted size={14} style={{ textAlign: 'center' }}>
          {items ? t('inventory:scanHint') : t('inventory:scanLoading')}
        </Text>
      </View>
    )
  } else if (permission) {
    const canAsk = permission.canAskAgain
    body = (
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24, paddingHorizontal: 12 }}>
        <View
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}
        >
          <ScanBarcode size={30} strokeWidth={1.8} color={colors.foreground} />
        </View>
        <Text weight="semibold" size={17} style={{ textAlign: 'center' }}>
          {t('inventory:cameraTitle')}
        </Text>
        <Text muted size={14} style={{ textAlign: 'center' }}>
          {canAsk ? t('inventory:cameraBody') : t('inventory:cameraDeniedBody')}
        </Text>
        <Button
          style={{ alignSelf: 'stretch', marginTop: 8 }}
          onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())}
        >
          {canAsk ? t('inventory:cameraAllow') : t('inventory:cameraOpenSettings')}
        </Button>
      </View>
    )
  }

  return (
    <SheetScaffold
      testID="scan-sheet"
      title={t('inventory:scanTitle')}
      cancelLabel={t('common:close')}
      onCancel={onClose}
    >
      {body}
    </SheetScaffold>
  )
}
