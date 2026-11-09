import { SymbolView } from 'expo-symbols'
import { Plus } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Button, GlassCircleButton } from '@/shared/ui'

/** Cỡ nút "+" và nút chính (viên thuốc). */
const CONTROL_SIZE = 48

export type ReceiveBottomBarProps = {
  showAdd: boolean
  canConfirm: boolean
  uncheckedCount: number
  /** `false` (cờ checklist tắt): không theo tiến độ kiểm — Xác nhận bật ngay. */
  checklist?: boolean
  /** Đang ghi lên server: khoá MỌI nút, vòng quay ở nút đang gửi. */
  busy: 'save' | 'confirm' | 'delete' | null
  onAdd: () => void
  onConfirm: () => void
}

/**
 * Đáy của checklist Kiểm hàng: [+] tròn kính · nút chính viên thuốc theo tiến độ kiểm — "Còn N dòng
 * chưa kiểm" (khoá) / Xác nhận nhập kho. Lưu nằm ở header.
 */
export function ReceiveBottomBar({
  showAdd,
  canConfirm,
  uncheckedCount,
  checklist = true,
  busy,
  onAdd,
  onConfirm,
}: ReceiveBottomBarProps) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const locked = busy !== null
  const plusColor = locked ? colors.mutedForeground : colors.accent
  const plus =
    Platform.OS === 'ios' ? (
      <SymbolView name="plus" size={22} weight="medium" tintColor={plusColor} />
    ) : (
      <Plus size={24} color={plusColor} aria-hidden />
    )

  const primary =
    checklist && uncheckedCount > 0 ? (
      <Button variant="accent" capsule disabled>
        {t('receive.bar.remaining', { n: uncheckedCount })}
      </Button>
    ) : canConfirm ? (
      <Button
        variant="accent"
        capsule
        disabled={locked}
        loading={busy === 'confirm'}
        onPress={onConfirm}
      >
        {t('receive.bar.confirm')}
      </Button>
    ) : null

  if (!showAdd && !primary) return null
  return (
    // Vùng trống của hàng (vd chỉ có "+") không được nuốt chạm / cuộn của danh sách bên dưới.
    <View
      testID="receive-controls"
      pointerEvents="box-none"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      {showAdd ? (
        <GlassCircleButton
          label={t('receive.bar.add')}
          onPress={onAdd}
          size={CONTROL_SIZE}
          icon={plus}
          fallbackColor={colors.card}
          disabled={locked}
        />
      ) : null}
      {primary ? <View style={{ flex: 1 }}>{primary}</View> : null}
    </View>
  )
}
