import { ChevronDown, Globe } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

import { useCurrentLanguage } from './useCurrentLanguage'

/** Viên ngôn ngữ (🌐 VI ⌄) ở góc màn đăng nhập; bấm mở sheet ngôn ngữ (nơi gọi lo điều hướng). */
export function LanguagePill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation(['common'])
  const { colors } = useTheme()
  const { current, label } = useCurrentLanguage()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('common:language')}, ${label}`}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-end',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.muted,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Globe size={13} color={colors.mutedForeground} aria-hidden />
      <Text weight="semibold" size={12.5} muted>
        {current.toUpperCase()}
      </Text>
      <ChevronDown size={13} color={colors.mutedForeground} aria-hidden />
    </Pressable>
  )
}
