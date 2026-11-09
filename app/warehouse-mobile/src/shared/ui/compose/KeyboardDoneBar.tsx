import { useTranslation } from 'react-i18next'
import { InputAccessoryView, Keyboard, Platform, Pressable, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

export type KeyboardDoneBarProps = {
  /** Trùng `inputAccessoryViewID` của các TextInput cần thanh này. */
  nativeID: string
  /** Nhãn mờ bên trái, vd "Số lượng · Bột mì". */
  label: string
  onDone?: () => void
}

/** Thanh "Xong" gắn trên bàn phím số iOS (bàn phím số không có Return). Android: không vẽ gì. */
export function KeyboardDoneBar({ nativeID, label, onDone }: KeyboardDoneBarProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 44,
          paddingLeft: 16,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
        }}
      >
        <Text size={13} numberOfLines={1} style={{ flex: 1, color: colors.mutedForeground }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:done')}
          onPress={() => {
            Keyboard.dismiss()
            onDone?.()
          }}
          style={{
            minHeight: 44,
            minWidth: 44,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}
        >
          <Text weight="bold" size={16} style={{ color: colors.accentText }}>
            {t('common:done')}
          </Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
