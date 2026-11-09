import { fireEvent, render, screen } from '@testing-library/react-native'
import { Keyboard, Platform } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { KeyboardDoneBar } from './KeyboardDoneBar'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

afterEach(() => jest.restoreAllMocks())

describe('KeyboardDoneBar', () => {
  it('iOS renders label and Xong; pressing Xong dismisses keyboard and calls onDone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    // RN 0.8x cảnh báo "InputAccessoryView is deprecated" (một lần) ngay khi truy cập — ồn, không phải lỗi.
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})
    const onDone = jest.fn()
    await render(<KeyboardDoneBar nativeID="k" label="Số lượng · Bột mì" onDone={onDone} />)
    expect(screen.getByText('Số lượng · Bột mì')).toBeOnTheScreen()
    await fireEvent.press(screen.getByText('Xong'))
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Android renders nothing', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(<KeyboardDoneBar nativeID="k" label="Số lượng" />)
    expect(screen.queryByText('Xong')).toBeNull()
    expect(screen.queryByText('Số lượng')).toBeNull()
  })
})
