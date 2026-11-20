import { act, fireEvent, render, screen } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { WELCOME_SEEN_KEY, useWelcome } from '@/features/onboarding'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { markLaunchDone, useLaunch } from '@/shared/lib/launch'
import { kv } from '@/shared/storage/kv'

import { WelcomeScreen } from './WelcomeScreen'

beforeAll(async () => {
  await initI18n()
})

beforeEach(async () => {
  await changeLanguage('vi')
  await AsyncStorage.clear()
  useWelcome.setState({ seen: false })
  useLaunch.setState({ done: false })
})

describe('WelcomeScreen', () => {
  it('tiêu đề "Chào mừng tới Soko" (header) và đủ 3 dòng giới thiệu', async () => {
    await render(<WelcomeScreen />)
    expect(screen.getByRole('header', { name: 'Chào mừng tới Soko' })).toBeOnTheScreen()
    for (const text of [
      'Quét mã nhập / xuất',
      'Lập phiếu nhanh bằng camera, không cần gõ mã.',
      'Tồn kho & hạn dùng',
      'Biết ngay vật tư sắp thiếu, sắp hết hạn hay đã quá hạn.',
      'Đề xuất đặt hàng',
      'Gom vật tư cần đặt theo nhà cung cấp, gửi đi trong vài chạm.',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen()
    }
  })

  it('logo chỉ để trang trí: ẩn khỏi trình đọc màn hình', async () => {
    await render(<WelcomeScreen />)
    expect(screen.getByTestId('welcome-logo', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('welcome-logo')).toBeNull()
  })

  it('bấm "Bắt đầu" → đánh dấu đã xem và lưu cờ', async () => {
    await render(<WelcomeScreen />)
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu' }))
    })
    expect(useWelcome.getState().seen).toBe(true)
    expect(await kv.get(WELCOME_SEEN_KEY)).toBe(true)
  })

  it('lớp phủ logo xong rồi vẫn hiện đủ nội dung và nút', async () => {
    markLaunchDone()
    await render(<WelcomeScreen />)
    expect(screen.getByText('Đề xuất đặt hàng')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeOnTheScreen()
  })

  it('xem lại (onPreviewClose): bấm "Bắt đầu" → gọi đóng, không ghi cờ', async () => {
    markLaunchDone()
    const close = jest.fn()
    await render(<WelcomeScreen onPreviewClose={close} />)
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu' }))
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(useWelcome.getState().seen).toBe(false)
    expect(await kv.get(WELCOME_SEEN_KEY)).toBeNull()
  })

  it('tiếng Anh', async () => {
    await changeLanguage('en')
    await render(<WelcomeScreen />)
    expect(screen.getByRole('header', { name: 'Welcome to Soko' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeOnTheScreen()
  })
})
