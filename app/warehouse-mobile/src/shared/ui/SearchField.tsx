import { SymbolView } from 'expo-symbols'
import { Search, XCircle } from './icons'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { fontStyle } from '../theme/fonts'
import { useTheme } from '../theme/useTheme'

export type SearchFieldProps = {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  /** `pill` = bo tròn hai đầu, cao 40 (kiểu iOS 26 trong sheet). */
  shape?: 'rounded' | 'pill'
  /**
   * Có → tự vẽ nút xoá (khi có chữ) thay cho nút của hệ thống: Android không có `clearButtonMode`.
   * Giá trị là nhãn truy cập của nút.
   */
  clearLabel?: string
  onFocus?: () => void
  /** Nền thẻ + viền mảnh: tách khỏi nền sheet (vd ô tìm ghim trên đầu danh sách chọn). */
  raised?: boolean
  /** Ô vừa tìm vừa nhập giá trị (vd tên người nhận): giới hạn ký tự, viết hoa, phím Enter. */
  maxLength?: number
  autoCapitalize?: 'none' | 'sentences' | 'words'
  returnKeyType?: 'search' | 'done'
  onSubmitEditing?: () => void
}

const CLEAR_SIZE = 28
const CLEAR_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

/** Ô tìm kiếm kiểu iOS: nền xám, icon kính lúp, nút xoá (của hệ thống, hoặc tự vẽ khi có `clearLabel`). */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  shape = 'rounded',
  clearLabel,
  onFocus,
  raised = false,
  maxLength,
  autoCapitalize = 'none',
  returnKeyType = 'search',
  onSubmitEditing,
}: SearchFieldProps) {
  const { colors, radius } = useTheme()
  const pill = shape === 'pill'
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        minHeight: pill ? 40 : 38,
        paddingHorizontal: pill ? 14 : 10,
        borderRadius: pill ? 999 : radius.lg,
        backgroundColor: raised ? colors.card : pill ? colors.cell : colors.fill,
        ...(raised ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null),
      }}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView name="magnifyingglass" size={15} tintColor={colors.mutedForeground} />
      ) : (
        <Search size={15} color={colors.mutedForeground} aria-hidden />
      )}
      <TextInput
        accessibilityLabel={placeholder}
        accessibilityRole="search"
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        clearButtonMode={clearLabel ? 'never' : 'while-editing'}
        returnKeyType={returnKeyType}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
        style={{
          flex: 1,
          minHeight: pill ? 40 : 38,
          color: colors.foreground,
          ...fontStyle('regular'),
          fontSize: 15,
        }}
      />
      {clearLabel && value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          onPress={() => onChangeText('')}
          // Khung 28 + hitSlop 8 mỗi phía = vùng chạm 44×44 mà ô vẫn cao 38.
          hitSlop={CLEAR_SLOP}
          style={({ pressed }) => ({
            width: CLEAR_SIZE,
            height: CLEAR_SIZE,
            marginRight: -6,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <XCircle size={17} color={colors.mutedForeground} aria-hidden />
        </Pressable>
      ) : null}
    </View>
  )
}
