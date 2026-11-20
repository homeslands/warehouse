import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import { LAUNCH_DURATION_MS, LAUNCH_REDUCED_MS, LaunchOverlay } from './LaunchOverlay'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true }
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

const hidden = { includeHiddenElements: true }

describe('LaunchOverlay — Reduce Motion', () => {
  it('chỉ mờ dần: không laser, không nảy / phóng, không rung; xong sớm hơn bản đầy đủ', async () => {
    expect(LAUNCH_REDUCED_MS).toBeLessThan(LAUNCH_DURATION_MS)
    const onDone = jest.fn()
    await render(<LaunchOverlay onShown={jest.fn()} onDone={onDone} />)
    for (const img of screen.getAllByTestId(/^launch-letter-img-/, hidden)) {
      await fireEvent(img, 'load')
    }
    expect(screen.queryByTestId('launch-laser', hidden)).toBeNull()
    await act(async () => jest.advanceTimersByTime(LAUNCH_REDUCED_MS / 2))
    expect(screen.getByTestId('launch-zoom', hidden)).toHaveAnimatedStyle({
      transform: [{ scale: 1 }],
    })
    await act(async () => jest.advanceTimersByTime(LAUNCH_REDUCED_MS / 2))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(Haptics.selectionAsync).not.toHaveBeenCalled()
  })
})
