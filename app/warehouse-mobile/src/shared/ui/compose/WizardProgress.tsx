import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import type { StepState } from '../../lib/wizard-steps'
import { useTheme } from '../../theme/useTheme'

export type WizardProgressProps = {
  steps: readonly { label: string; state: StepState; pressable: boolean }[]
  onPress: (index: number) => void
  /** Đang ghi lên server: không đoạn nào chạm được (như khoá lối lùi của `WizardHeader`). */
  writing?: boolean
  testID?: string
}

/**
 * Vạch tiến độ 3 đoạn của form 3 bước (spec wizard-apple §3): mỗi đoạn cao 4 bo 2, khe 5; đoạn ≤ bước
 * hiện tại tô `accent`, còn lại `fill`. Đặt là PHẦN TỬ ĐẦU của vùng cuộn (vùng cuộn có
 * `contentInsetAdjustmentBehavior="automatic"` nên không bao giờ nằm dưới header / thanh trạng thái);
 * lề ngang 4 + lề 16 của nội dung = 20. Mỗi đoạn là vùng chạm cao 44 (vạch ở giữa); chạm đoạn chạm được →
 * `onPress(index)`. a11y như thanh bước cũ: "Bước 1 trên 3, Thông tin, đã xong", đoạn hiện tại `selected`.
 */
export function WizardProgress({ steps, onPress, writing = false, testID }: WizardProgressProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const current = steps.findIndex((s) => s.state === 'current')
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 5, paddingHorizontal: 4 }}>
      {steps.map((step, i) => {
        const pressable = step.pressable && !writing
        return (
          <Pressable
            key={i}
            accessibilityRole={pressable ? 'button' : undefined}
            accessibilityLabel={t('common:compose.step.a11y', {
              n: i + 1,
              total: steps.length,
              label: step.label,
              state: t(`common:compose.step.state.${step.state}`),
            })}
            accessibilityState={{ disabled: !pressable, selected: step.state === 'current' }}
            disabled={!pressable}
            onPress={() => onPress(i)}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
          >
            <View
              testID={testID ? `${testID}-segment-${i}` : undefined}
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= current ? colors.accent : colors.fill,
              }}
            />
          </Pressable>
        )
      })}
    </View>
  )
}
