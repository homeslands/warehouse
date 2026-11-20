import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Appearance } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { useAppearance } from '@/shared/theme/appearance'

import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { AppearanceSheet } from './AppearanceSheet'

jest.mock('expo-router', () => ({
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

beforeAll(async () => {
  await initI18n()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await changeLanguage('vi')
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {})
  useAppearance.setState({ preference: 'system' })
})

afterEach(() => jest.restoreAllMocks())

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('AppearanceSheet', () => {
  it('header "Giao diện" (✕ Huỷ, ✓ Xong), ba thẻ; lựa chọn đang dùng được đánh dấu sẵn', async () => {
    await render(<AppearanceSheet onClose={jest.fn()} />)
    expect(sheetHeader().title).toBe('Giao diện')
    expect(sheetHeader().cancel?.label).toBe('Huỷ')
    expect(sheetHeader().done?.label).toBe('Xong')
    expect(screen.getByRole('header', { name: 'Giao diện ứng dụng' })).toBeOnTheScreen()
    expect(card(/^Theo hệ thống/)).toBeSelected()
    expect(card(/^Sáng/)).not.toBeSelected()
    expect(card(/^Tối/)).not.toBeSelected()
    expect(screen.getByText('Tự đổi theo cài đặt của máy')).toBeOnTheScreen()
  })

  it('chạm chỉ đánh dấu (rung chọn), chưa đổi; ✓ áp dụng, rung success, đóng sau ~350ms', async () => {
    const onClose = jest.fn()
    await render(<AppearanceSheet onClose={onClose} />)
    await fireEvent.press(card(/^Tối/))
    expect(card(/^Tối/)).toBeSelected()
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    expect(useAppearance.getState().preference).toBe('system')

    jest.useFakeTimers()
    try {
      await pressSheetDone()
      await act(async () => jest.advanceTimersByTime(0))
      expect(useAppearance.getState().preference).toBe('dark')
      expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark')
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      )
      expect(onClose).not.toHaveBeenCalled()
      await act(async () => jest.advanceTimersByTime(SHEET_CLOSE_DELAY_MS))
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('✓ khi đánh dấu đúng lựa chọn hiện tại → đóng ngay, không đổi gì', async () => {
    useAppearance.setState({ preference: 'light' })
    const onClose = jest.fn()
    await render(<AppearanceSheet onClose={onClose} />)
    expect(card(/^Sáng/)).toBeSelected()
    await pressSheetDone()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(Appearance.setColorScheme).not.toHaveBeenCalled()
  })

  it('✕ → đóng, giao diện giữ nguyên', async () => {
    const onClose = jest.fn()
    await render(<AppearanceSheet onClose={onClose} />)
    await fireEvent.press(card(/^Sáng/))
    await pressSheetCancel()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useAppearance.getState().preference).toBe('system')
  })
})
