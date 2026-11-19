import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { SegmentedControl, Text } from '@/shared/ui'
import { ChevronLeft, ChevronRight } from '@/shared/ui/icons'

import type { Period } from '../model/period'

const PERIODS: Period[] = ['day', 'week', 'month', 'year']
const ARROW = 44

/**
 * Bộ lọc kỳ toàn trang: thanh đoạn Ngày / Tuần / Tháng / Năm + dòng `‹ nhãn kỳ ›`. "‹" lùi một kỳ, "›"
 * tiến (mờ + vô hiệu ở kỳ hiện tại). Nhãn: phần trước " · " đậm, phần sau muted.
 */
export function PeriodBar({
  period,
  label,
  canForward,
  onPeriod,
  onBack,
  onForward,
}: {
  period: Period
  label: string
  canForward: boolean
  onPeriod: (period: Period) => void
  onBack: () => void
  onForward: () => void
}) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  const [head, ...rest] = label.split(' · ')
  const arrow = (
    id: 'period-back' | 'period-forward',
    enabled: boolean,
    onPress: () => void,
    a11y: string,
  ) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={!enabled}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      style={({ pressed }) => ({
        width: ARROW,
        height: ARROW,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !enabled ? 0.3 : pressed ? 0.5 : 1,
      })}
    >
      {id === 'period-back' ? (
        <ChevronLeft size={22} color={colors.accent} aria-hidden />
      ) : (
        <ChevronRight size={22} color={colors.accent} aria-hidden />
      )}
    </Pressable>
  )
  return (
    <View style={{ gap: 4 }}>
      <SegmentedControl
        testID="period-seg"
        items={PERIODS.map((value) => ({ value, label: t(`periodSeg.${value}`) }))}
        value={period}
        onChange={onPeriod}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {arrow('period-back', true, onBack, t('periodBack'))}
        <Text
          testID="period-label"
          numeric
          muted
          size={15}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, textAlign: 'center' }}
        >
          <Text weight="semibold" size={15}>
            {head}
          </Text>
          {rest.length > 0 ? ` · ${rest.join(' · ')}` : ''}
        </Text>
        {arrow('period-forward', canForward, onForward, t('periodForward'))}
      </View>
    </View>
  )
}
