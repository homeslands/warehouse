import DateTimePicker from '@react-native-community/datetimepicker'
import { X } from '@/shared/ui/icons'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'

import { formatFullDate } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'
import { FormInfoRow } from '@/shared/ui/compose'

import type { useExpiryField } from './receive-line-shared'

/**
 * Dòng "Hạn dùng" của sheet soạn dòng nhập (kiểu Cài đặt iOS, ngày CHỌN BẰNG LỊCH GỐC): chưa có hạn → chữ accent
 * "Thêm hạn" (iOS: chạm đặt hạn = hôm nay — hoặc ngày phiếu nếu phiếu lùi ngày — rồi hiện viên chọn ngày; Android:
 * mở hộp chọn ngày của hệ thống); có hạn → iOS viên `DateTimePicker display="compact"` ở bên phải, Android chữ ngày
 * (chạm để đổi); cả hai có nút ✕ xoá hạn. Luật "HSD ≥ ngày nhập" nằm ở `useExpiryField` (`minimumDate` + lỗi).
 * Không sửa được → chỉ chữ ngày.
 */
export function ExpiryRow({
  exp,
  editable,
  error,
  testID,
}: {
  exp: ReturnType<typeof useExpiryField>
  editable: boolean
  error: string | null
  testID?: string
}) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const label = t('receive.line.expiry')
  const date = exp.expiry ? formatFullDate(exp.expiry) : null
  const android = Platform.OS === 'android'

  const valueText = (text: string, accent: boolean) => (
    <Text size={17} style={{ color: accent ? colors.accent : colors.foreground }} numberOfLines={1}>
      {text}
    </Text>
  )
  const textButton = (text: string, accent: boolean, a11y: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {valueText(text, accent)}
    </Pressable>
  )

  let right: ReactNode
  if (!editable) {
    right = valueText(date ?? '—', false)
  } else if (!exp.expiry) {
    right = textButton(
      t('compose.line.expiryAdd'),
      true,
      t('compose.line.expiryAdd'),
      android ? exp.openAndroidPicker : () => exp.applyExpiry(exp.pickerValue),
    )
  } else {
    right = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {android ? (
          textButton(
            date ?? '',
            false,
            t('receive.line.expiryA11y', { value: date }),
            exp.openAndroidPicker,
          )
        ) : (
          <DateTimePicker
            testID="date-picker"
            mode="date"
            display="compact"
            accessibilityLabel={label}
            value={exp.pickerValue}
            minimumDate={exp.minimumDate}
            onValueChange={(_e, d) => exp.applyExpiry(d)}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('receive.line.expiryClear')}
          onPress={exp.clear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}
        >
          <X size={14} color={colors.mutedForeground} aria-hidden />
        </Pressable>
      </View>
    )
  }

  return (
    <FormInfoRow kind="custom" first testID={testID} label={label} error={error}>
      {right}
    </FormInfoRow>
  )
}
