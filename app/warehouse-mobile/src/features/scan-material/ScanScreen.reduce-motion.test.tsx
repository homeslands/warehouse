/** Reduce Motion bật: 4 góc đứng yên (opacity 1, scale 1). */
import { act, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { ScanScreen } from './ScanScreen'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true }
})

describe('ScanScreen khi bật Reduce Motion', () => {
  it('góc tĩnh: opacity 1, scale 1 sau nhiều khung hình', async () => {
    jest.useFakeTimers()
    try {
      await render(<ScanScreen active hint="h" onScanned={jest.fn()} onClose={jest.fn()} />, {
        wrapper: SafeAreaWrapper,
      })
      await act(async () => jest.advanceTimersByTime(1500))
      const flat = StyleSheet.flatten(
        screen.getByTestId('scan-corners', { includeHiddenElements: true }).props.style,
      )
      expect(flat.opacity).toBe(1)
      expect(flat.transform).toEqual([{ scale: 1 }])
    } finally {
      jest.useRealTimers()
    }
  })
})
