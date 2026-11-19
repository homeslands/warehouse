import { View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

/**
 * Biểu đồ cột mini của thẻ Tóm tắt: một cột (hoặc cặp cột) mỗi ô thời gian của kỳ, cao theo giá trị lớn
 * nhất. Ô đã qua mà bằng 0 → vạch 2pt màu `fill`; ô chưa tới (sau hôm nay / giờ hiện tại) → trống. Chỉ để
 * nhìn (`aria-hidden`): số đã có trên thẻ. Không animation.
 */
export function MiniBars({
  testID,
  series,
  elapsed,
  height = 34,
  dim,
}: {
  testID?: string
  /** Các chuỗi cùng độ dài (1 = cột đơn, 2 = cột đôi). */
  series: { values: number[]; color: string }[]
  /** Số ô đã qua (từ đầu kỳ). */
  elapsed: number
  height?: number
  dim?: boolean
}) {
  const { colors } = useTheme()
  const n = series[0]?.values.length ?? 0
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const gap = n > 16 ? 1.5 : 3
  return (
    <View
      testID={testID}
      aria-hidden
      style={{
        height,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap,
        opacity: dim ? 0.45 : 1,
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={{ flex: 1, height, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}
        >
          {series.map((s, k) => {
            const v = s.values[i] ?? 0
            const future = i >= elapsed
            const h = future
              ? 0
              : v > 0 && max > 0
                ? Math.max(3, Math.round((v / max) * height))
                : 2
            return (
              <View
                key={k}
                style={{
                  flex: 1,
                  height: h,
                  borderRadius: Math.min(2, h / 2),
                  backgroundColor: v > 0 ? s.color : colors.fill,
                }}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
}
