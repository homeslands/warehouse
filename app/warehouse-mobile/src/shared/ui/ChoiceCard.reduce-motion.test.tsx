/**
 * Reduce Motion bật (mock `useReducedMotion` → true): thẻ chọn đổi trạng thái tức thì (ngay khung
 * hình đầu), không chuyển dần.
 */
import { act, render, screen } from '@testing-library/react-native'

import { lightColors } from '../theme/tokens'
import { ChoiceCard } from './ChoiceCard'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  // Giữ `__esModule` + `default` để `import Animated from …` vẫn đúng; chỉ ép Reduce Motion bật.
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true }
})

const CARD = { title: 'Kho Một', leading: { text: 'K1' }, testID: 'card' } as const
const hidden = { includeHiddenElements: true }
const rgba = (hex: string, alpha = 1) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

describe('ChoiceCard khi bật Reduce Motion', () => {
  it('chọn → tới trạng thái chọn ngay khung hình đầu (không chuyển dần), dấu tích không nảy', async () => {
    jest.useFakeTimers()
    try {
      const view = await render(<ChoiceCard {...CARD} selected={false} onPress={jest.fn()} />)
      await view.rerender(<ChoiceCard {...CARD} selected onPress={jest.fn()} />)
      // Một khung hình (16ms) để reanimated áp giá trị — bình thường lúc này mới đi được ~7% của 220ms.
      await act(async () => jest.advanceTimersByTime(16))
      expect(screen.getByTestId('card')).toHaveAnimatedStyle({
        backgroundColor: rgba(lightColors.card),
        borderColor: rgba(lightColors.primary),
      })
      expect(screen.getByTestId('choice-card-radio-fill', hidden)).toHaveAnimatedStyle({
        opacity: 1,
      })
      expect(screen.getByTestId('choice-card-check', hidden)).toHaveAnimatedStyle({
        transform: [{ scale: 1 }],
      })
    } finally {
      jest.useRealTimers()
    }
  })
})
