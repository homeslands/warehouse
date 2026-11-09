import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import i18n, { changeLanguage, initI18n } from '@/shared/i18n'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'

import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { LanguageSheet } from './LanguageSheet'

jest.mock('expo-router', () => ({
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

beforeAll(async () => {
  await initI18n()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await changeLanguage('vi')
})

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('LanguageSheet', () => {
  it('header native "Ngôn ngữ" (✕ Huỷ, ✓ Xong), tiêu đề nhóm, hai thẻ; ngôn ngữ đang dùng được đánh dấu sẵn', async () => {
    await render(<LanguageSheet onClose={jest.fn()} />)
    expect(sheetHeader().title).toBe('Ngôn ngữ')
    expect(sheetHeader().cancel?.label).toBe('Huỷ')
    expect(sheetHeader().done?.label).toBe('Xong')
    expect(screen.getByRole('header', { name: 'Ngôn ngữ ứng dụng' })).toBeOnTheScreen()
    expect(card(/^Tiếng Việt/)).toBeSelected()
    expect(card(/^English/)).not.toBeSelected()
    expect(screen.getByText('Vietnamese')).toBeOnTheScreen()
    expect(screen.getByText('Tiếng Anh')).toBeOnTheScreen()
  })

  it('chạm chỉ đánh dấu (rung chọn), chưa đổi; ✓ đổi ngôn ngữ, rung success, đóng sau ~350ms', async () => {
    const onClose = jest.fn()
    await render(<LanguageSheet onClose={onClose} />)
    await fireEvent.press(card(/^English/))
    expect(card(/^English/)).toBeSelected()
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    expect(i18n.language).toBe('vi')

    jest.useFakeTimers()
    try {
      await pressSheetDone()
      await act(async () => jest.advanceTimersByTime(0))
      expect(i18n.language).toBe('en')
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

  it('chạm lại thẻ đang đánh dấu → không rung', async () => {
    await render(<LanguageSheet onClose={jest.fn()} />)
    await fireEvent.press(card(/^Tiếng Việt/))
    expect(Haptics.selectionAsync).not.toHaveBeenCalled()
  })

  it('✓ khi đánh dấu đúng ngôn ngữ đang dùng → đóng ngay, không đổi gì', async () => {
    const onClose = jest.fn()
    await render(<LanguageSheet onClose={onClose} />)
    await pressSheetDone()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })

  it('✕ → đóng, ngôn ngữ giữ nguyên', async () => {
    const onClose = jest.fn()
    await render(<LanguageSheet onClose={onClose} />)
    await fireEvent.press(card(/^English/))
    await pressSheetCancel()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(i18n.language).toBe('vi')
  })
})
