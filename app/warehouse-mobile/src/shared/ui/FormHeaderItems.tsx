import { ScanBarcode } from './icons'
import type { NativeStackHeaderItem } from 'expo-router'
import type { ColorValue } from 'react-native'
import { Pressable, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { AndroidMoreButton } from './AndroidMoreButton'
import { Text } from './Text'

export type HeaderAction = { label: string; onPress: () => void }
/** Nút chữ "Lưu": vẫn hiện nhưng khoá khi đang gửi (không bấm đôi), nhãn có thể là "Đang lưu…". */
export type HeaderSaveAction = HeaderAction & { disabled: boolean }

/**
 * iOS: các nút GỐC bên phải màn phiếu (kiểm hàng phiếu nhập, sửa phiếu xuất) — [Lưu?, Quét mã?, `…`?]
 * (expo-router đảo mảng cho UIKit nên `…` ở ngoài cùng bên phải, Lưu ở trong cùng). Đều là `type: 'button'` (KHÔNG phải UIMenu — lỗi chạm
 * lọt xuống dòng bấm được, xem CLAUDE.md); `…` mở action sheet gốc. Lưu là nút CHỮ (không icon), màu
 * xanh dương, viên kính riêng (`sharesBackground: false`, iOS 26+; máy cũ bỏ qua).
 */
export function formHeaderRightItems({
  save,
  scan,
  more,
  accent,
}: {
  save?: HeaderSaveAction
  scan?: HeaderAction
  more?: HeaderAction
  accent?: ColorValue
}): NativeStackHeaderItem[] {
  const items: NativeStackHeaderItem[] = []
  if (save) {
    items.push({
      type: 'button',
      label: save.label,
      labelStyle: { fontWeight: '600' },
      tintColor: accent,
      disabled: save.disabled,
      sharesBackground: false,
      onPress: save.onPress,
    })
  }
  if (scan) {
    items.push({
      type: 'button',
      label: scan.label,
      icon: { type: 'sfSymbol', name: 'barcode.viewfinder' },
      onPress: scan.onPress,
    })
  }
  if (more) {
    items.push({
      type: 'button',
      label: more.label,
      icon: { type: 'sfSymbol', name: 'ellipsis' },
      onPress: more.onPress,
    })
  }
  return items
}

/** Android: nút "Quét mã" phẳng, vùng chạm 44. */
export function AndroidScanButton({ label, onPress }: HeaderAction) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <ScanBarcode size={22} color={colors.foreground} aria-hidden />
    </Pressable>
  )
}

/** Android: nút chữ "Lưu" phẳng (xanh dương, vùng chạm 44; khoá → chữ mờ). */
export function AndroidSaveButton({ label, onPress, disabled }: HeaderSaveAction) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        height: 44,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        weight="semibold"
        size={16}
        numberOfLines={1}
        style={{ color: disabled ? colors.mutedForeground : colors.accent }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Android: [Lưu?, Quét mã?, `…`?] thành một hàng trên header. */
export function AndroidFormHeaderRight({
  save,
  scan,
  more,
}: {
  save?: HeaderSaveAction
  scan?: HeaderAction
  more?: HeaderAction
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {save ? <AndroidSaveButton {...save} /> : null}
      {scan ? <AndroidScanButton {...scan} /> : null}
      {more ? <AndroidMoreButton {...more} /> : null}
    </View>
  )
}
