import { Platform, View, type ViewProps } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'

import { useTheme } from '../theme/useTheme'

export type ScreenProps = ViewProps & {
  /**
   * Cạnh nào cần chừa vùng an toàn. Mặc định cả 4. Màn trong tab: bỏ `bottom` (thanh tab đã chừa),
   * và bỏ `top` nếu đã có header chừa sẵn — không thì bị đệm hai lần.
   */
  edges?: readonly Edge[]
  /** `grouped` = nền xám kiểu "Cài đặt" iOS cho màn gồm các nhóm thẻ. */
  tone?: 'plain' | 'grouped' | 'sheet'
}

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left']

export function Screen({
  edges = ALL_EDGES,
  tone = 'plain',
  style,
  children,
  ...rest
}: ScreenProps) {
  const { colors } = useTheme()
  const backgroundColor =
    tone === 'grouped'
      ? colors.grouped
      : tone === 'sheet'
        ? // iOS 26/27: nền kính của sheet do hệ thống vẽ — không phủ màu lên.
          Platform.OS === 'ios'
          ? 'transparent'
          : colors.card
        : colors.background
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor }}>
      <View style={[{ flex: 1 }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  )
}
