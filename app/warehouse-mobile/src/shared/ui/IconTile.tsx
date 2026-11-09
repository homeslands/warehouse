import type { LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'

import { useTheme } from '../theme/useTheme'

export type IconTileTone = 'solid' | 'light' | 'destructive'

export type IconTileProps = {
  icon: LucideIcon
  /** `solid` = ô đen (mặc định), `light` = ô xám nhạt, `destructive` = ô đỏ nhạt. */
  tone?: IconTileTone
  size?: number
}

/** Ô vuông bo góc chứa icon ở đầu một dòng danh sách (kiểu "Cài đặt" iOS). Chỉ để trang trí. */
export function IconTile({ icon: Icon, tone = 'solid', size = 28 }: IconTileProps) {
  const { colors } = useTheme()
  const { bg, fg } = {
    solid: { bg: colors.primary, fg: colors.primaryForeground },
    light: { bg: colors.fill, fg: colors.foreground },
    destructive: { bg: colors.destructiveSoft, fg: colors.destructive },
  }[tone]
  return (
    <View
      testID="icon-tile"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.57)} color={fg} strokeWidth={1.9} />
    </View>
  )
}
