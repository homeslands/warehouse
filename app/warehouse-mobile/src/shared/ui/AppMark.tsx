import { Warehouse } from './icons'
import { View } from 'react-native'

import { useTheme } from '../theme/useTheme'

/** Biểu tượng app: ô vuông bo góc đen với icon nhà kho. Chỉ để trang trí. */
export function AppMark({ size = 54 }: { size?: number }) {
  const { colors } = useTheme()
  return (
    <View
      testID="app-mark"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 24px -10px rgba(0,0,0,0.5)',
      }}
    >
      <Warehouse
        size={Math.round(size * 0.55)}
        color={colors.primaryForeground}
        strokeWidth={1.7}
      />
    </View>
  )
}
