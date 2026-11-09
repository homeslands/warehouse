import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { CalendarDays } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'

import { formatFullDate, parseLocalDate, todayLocalIso } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

import type { ChipFilterStore } from '../store'
import { orderedRange, timeRange, type TimePreset } from '../time-filter'
import { FilterSection } from './FilterSection'
import { OptionPill } from './OptionPill'

type TimeOption = TimePreset | 'custom'
const OPTIONS: TimeOption[] = ['today', 'last7', 'last30', 'thisMonth', 'custom']
/** Mốc mặc định khi bật công tắc Thời gian. */
const DEFAULT_PRESET: TimePreset = 'last7'

/** Một ô ngày: iOS `compact` (nút ngày gốc, chạm mở lịch nổi); Android nút mở hộp chọn ngày gốc. */
function DateField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  testID: string
}) {
  const { colors } = useTheme()
  const date = parseLocalDate(value)
  const apply = (picked: Date | undefined) => {
    if (picked) onChange(todayLocalIso(picked))
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text muted size={14}>
        {label}
      </Text>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatFullDate(value)}`}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: date,
              mode: 'date',
              onValueChange: (_e, picked) => apply(picked),
            })
          }
          unstable_pressDelay={ROW_PRESS_DELAY_MS}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: pressed ? colors.cellPressed : colors.fill,
          })}
        >
          <Text numeric size={14}>
            {formatFullDate(value)}
          </Text>
        </Pressable>
      ) : (
        <DateTimePicker
          testID={`${testID}-picker`}
          accessibilityLabel={label}
          mode="date"
          display="compact"
          value={date}
          onValueChange={(_e, picked) => apply(picked)}
        />
      )}
    </View>
  )
}

/**
 * Thẻ "Thời gian" của sheet Lọc. BẬT → 7 ngày qua; TẮT → mọi thời gian. Lựa chọn dạng viên (chạm là
 * áp dụng ngay): mốc nhanh lưu ID (`TimePreset`, ngày tính lúc dựng query); "Khoảng ngày" lấy ngày của
 * mốc đang chọn làm khoảng ban đầu rồi hiện hàng "Từ … Đến …" — đổi ngày là áp dụng ngay, đến < từ → đảo.
 */
export function TimeFilterSection({ store }: { store: ChipFilterStore }) {
  const { t } = useTranslation('importForms')
  const time = store((s) => s.time)
  const setTime = store((s) => s.setTime)
  const selected: TimeOption | null =
    time === null ? null : typeof time === 'object' ? 'custom' : time
  const range = time !== null && typeof time === 'object' ? orderedRange(time.from, time.to) : null

  const pick = (option: TimeOption) => {
    if (option === selected) return
    haptics.selection()
    if (option !== 'custom') {
      setTime(option)
      return
    }
    // Khoảng ban đầu = ngày của mốc đang chọn (đang tắt thì của mốc mặc định).
    const { startDate, endDate } = timeRange(time ?? DEFAULT_PRESET, new Date())
    const today = todayLocalIso()
    setTime({ from: startDate ?? today, to: endDate ?? today })
  }

  return (
    <FilterSection
      testID="filter-section-time"
      icon={CalendarDays}
      label={t('list.filters.time')}
      on={time !== null}
      onToggle={(on) => setTime(on ? DEFAULT_PRESET : null)}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {OPTIONS.map((option) => (
          <OptionPill
            key={option}
            label={t(`list.time.${option}`)}
            selected={selected === option}
            onPress={() => pick(option)}
          />
        ))}
      </View>
      {range ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <DateField
            testID="time-from"
            label={t('list.time.from')}
            value={range.from}
            onChange={(from) => setTime(orderedRange(from, range.to))}
          />
          <DateField
            testID="time-to"
            label={t('list.time.to')}
            value={range.to}
            onChange={(to) => setTime(orderedRange(range.from, to))}
          />
        </View>
      ) : null}
    </FilterSection>
  )
}
