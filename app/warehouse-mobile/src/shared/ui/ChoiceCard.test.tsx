import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { Warehouse } from './icons'

import { darkColors, lightColors } from '../theme/tokens'
import { ChoiceCard } from './ChoiceCard'

const mockScheme = jest.fn(() => 'light')
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}))

/** Màu reanimated trả về sau nội suy: "rgba(r, g, b, a)". */
function rgba(hex: string, alpha = 1) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const CARD = { title: 'Công ty MEKONG', leading: { icon: Warehouse }, testID: 'card' } as const
const hidden = { includeHiddenElements: true }

afterEach(() => mockScheme.mockReturnValue('light'))

describe('ChoiceCard', () => {
  it('là nút (nhãn mặc định = tiêu đề), báo trạng thái chọn; bấm gọi onPress', async () => {
    const onPress = jest.fn()
    await render(<ChoiceCard {...CARD} selected={false} onPress={onPress} />)
    const card = screen.getByRole('button', { name: 'Công ty MEKONG' })
    expect(card).not.toBeSelected()
    await fireEvent.press(card)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('ô đầu thẻ dạng chữ ngắn + dòng phụ chuỗi; nhãn trợ năng tuỳ chỉnh', async () => {
    await render(
      <ChoiceCard
        title="English"
        subtitle="Tiếng Anh"
        leading={{ text: 'EN' }}
        accessibilityLabel="English, Tiếng Anh"
        selected
        onPress={jest.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'English, Tiếng Anh' })).toBeSelected()
    expect(screen.getByText('Tiếng Anh')).toBeOnTheScreen()
    expect(screen.getAllByText('EN', hidden)).toHaveLength(2)
  })

  it('không có `leading` → không vẽ ô đầu thẻ', async () => {
    await render(<ChoiceCard title="Không icon" selected={false} onPress={jest.fn()} />)
    expect(screen.queryByTestId('choice-card-tile', hidden)).toBeNull()
  })

  it('chưa chọn: KHÔNG nền (trong suốt trên nền kính của sheet), viền trong suốt, ô icon màu sheet, radio chỉ là vòng', async () => {
    await render(<ChoiceCard {...CARD} selected={false} onPress={jest.fn()} />)
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderWidth: 2,
      borderColor: rgba(lightColors.primary, 0),
      borderRadius: 20,
      minHeight: 60,
    })
    expect(screen.getByTestId('choice-card-tile', hidden)).toHaveStyle({
      backgroundColor: rgba(lightColors.card),
    })
    expect(screen.getByTestId('choice-card-radio', hidden)).toHaveStyle({
      borderWidth: 2,
      borderColor: lightColors.radioRing,
    })
    expect(screen.getByTestId('choice-card-radio-fill', hidden)).toHaveStyle({ opacity: 0 })
  })

  it('đang chọn: nền sheet + viền 2pt primary, ô icon đặc, radio đặc (sáng và tối)', async () => {
    for (const [scheme, colors] of [
      ['light', lightColors],
      ['dark', darkColors],
    ] as const) {
      mockScheme.mockReturnValue(scheme)
      const view = await render(<ChoiceCard {...CARD} selected onPress={jest.fn()} />)
      expect(screen.getByRole('button', { name: /Công ty MEKONG/ })).toBeSelected()
      expect(screen.getByTestId('card')).toHaveStyle({
        backgroundColor: rgba(colors.card),
        borderWidth: 2,
        borderColor: rgba(colors.primary),
      })
      expect(screen.getByTestId('choice-card-tile', hidden)).toHaveStyle({
        backgroundColor: rgba(colors.primary),
      })
      expect(screen.getByTestId('choice-card-radio-fill', hidden)).toHaveStyle({
        opacity: 1,
        backgroundColor: colors.primary,
      })
      await view.unmount()
    }
  })

  it('đổi chọn → chuyển màu dần (~220ms) rồi tới trạng thái chọn; bỏ chọn thì ngược lại', async () => {
    jest.useFakeTimers()
    try {
      const view = await render(<ChoiceCard {...CARD} selected={false} onPress={jest.fn()} />)
      await view.rerender(<ChoiceCard {...CARD} selected onPress={jest.fn()} />)
      await act(async () => jest.advanceTimersByTime(400))
      expect(screen.getByTestId('card')).toHaveAnimatedStyle({
        backgroundColor: rgba(lightColors.card),
        borderColor: rgba(lightColors.primary),
      })
      await view.rerender(<ChoiceCard {...CARD} selected={false} onPress={jest.fn()} />)
      await act(async () => jest.advanceTimersByTime(400))
      expect(screen.getByTestId('choice-card-radio-fill', hidden)).toHaveAnimatedStyle({
        opacity: 0,
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it('dấu tích không nảy lúc mới hiện (đã chọn sẵn); chỉ nảy khi đổi chưa chọn → chọn', async () => {
    jest.useFakeTimers()
    try {
      const scaleOf = () => {
        const style = (
          screen.getByTestId('choice-card-check', hidden).props as {
            jestAnimatedStyle?: { value?: { transform?: { scale: number }[] } }
          }
        ).jestAnimatedStyle?.value
        return style?.transform?.[0]?.scale ?? 1
      }
      const view = await render(<ChoiceCard {...CARD} selected onPress={jest.fn()} />)
      await act(async () => jest.advanceTimersByTime(50))
      expect(scaleOf()).toBe(1)
      await view.unmount()

      const fresh = await render(<ChoiceCard {...CARD} selected={false} onPress={jest.fn()} />)
      await fresh.rerender(<ChoiceCard {...CARD} selected onPress={jest.fn()} />)
      await act(async () => jest.advanceTimersByTime(50))
      expect(scaleOf()).not.toBe(1)
      await act(async () => jest.advanceTimersByTime(400))
      expect(scaleOf()).toBe(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
