import { act, fireEvent, render, screen } from '@testing-library/react-native'
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  type ScrollViewInstance,
} from 'react-native'

import type { Measurable } from '../lib/keyboard'
import { FormField } from './FormField'
import { FormScrollView } from './FormScrollView'

/** Bàn phím đang hiện, mép trên ở y = 500 (toạ độ cửa sổ). */
function keyboardAt(screenY: number) {
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true)
  jest
    .spyOn(Keyboard, 'metrics')
    .mockReturnValue({ screenX: 0, screenY, width: 390, height: 844 - screenY })
}
/** Ô nhập (mock jest) đo được ở (y, h) trên cửa sổ. */
function inputAt(y: number, h = 50) {
  jest
    .spyOn(TextInput.prototype as unknown as Measurable, 'measureInWindow')
    .mockImplementation((cb) => cb(16, y, 358, h))
}
/** `scrollTo` của ScrollView mock là MỘT jest.fn chung trên prototype → xoá lượt gọi của test trước. */
const scrollTo = () => {
  const spy = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
  spy.mockClear()
  return spy
}
const flushFrame = () => act(async () => new Promise((r) => setTimeout(r, 32)))

afterEach(() => {
  jest.restoreAllMocks()
})

function Form({ bottom }: { bottom?: React.ReactNode }) {
  return (
    <FormScrollView testID="form-scroll" bottom={bottom}>
      <FormField label="Mã" value="" onChangeText={() => {}} />
      <FormField label="Ghi chú" value="" onChangeText={() => {}} />
    </FormScrollView>
  )
}

describe('FormScrollView — props bàn phím theo nền tảng', () => {
  it('iOS: không KAV; ScrollView tự chừa đáy (automaticallyAdjustKeyboardInsets) + dismiss "interactive"', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await render(<Form />)
    expect(screen.queryByTestId('keyboard-avoider')).toBeNull()
    const scroll = screen.getByTestId('form-scroll')
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true)
    expect(scroll.props.keyboardDismissMode).toBe('interactive')
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled')
  })

  it('Android: bọc KAV "padding"; cuộn KHÔNG đóng bàn phím (dismiss "none")', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(<Form />)
    expect(screen.getByTestId('keyboard-avoider')).toBeOnTheScreen()
    const scroll = screen.getByTestId('form-scroll')
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBeUndefined()
    expect(scroll.props.keyboardDismissMode).toBe('none')
  })

  it('iOS có nút ghim đáy: khung chừa đáy theo bàn phím (nút nổi lên trên bàn phím), ScrollView tắt chừa đáy tự động (không chừa hai lần)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    let onFrame: ((e: unknown) => void) | undefined
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      if (event === 'keyboardWillChangeFrame') onFrame = fn as (e: unknown) => void
      return { remove: () => {} } as never
    })
    const screenHeight = Dimensions.get('screen').height
    await render(<Form bottom={<Text>Thêm</Text>} />)
    expect(screen.getByTestId('form-scroll').props.automaticallyAdjustKeyboardInsets).toBe(false)
    expect(screen.getByText('Thêm')).toBeOnTheScreen()
    await act(async () =>
      onFrame!({
        endCoordinates: { screenX: 0, screenY: screenHeight - 336, width: 390, height: 336 },
        duration: 0,
      }),
    )
    expect(screen.getByTestId('keyboard-avoider')).toHaveStyle({ paddingBottom: 336 })
    // Ẩn bàn phím (mép trên = đáy màn) → hết chừa.
    await act(async () =>
      onFrame!({
        endCoordinates: { screenX: 0, screenY: screenHeight, width: 390, height: 0 },
        duration: 0,
      }),
    )
    expect(screen.getByTestId('keyboard-avoider')).toHaveStyle({ paddingBottom: 0 })
  })
})

describe('FormScrollView — ô nhận focus được đưa lên trên bàn phím', () => {
  it('ô cuối bị bàn phím che → cuộn thêm đúng phần bị che (+16)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    keyboardAt(500)
    inputAt(480) // đáy ô 530 + 16 → che 46
    const spy = scrollTo()
    await render(<Form />)
    await fireEvent.scroll(screen.getByTestId('form-scroll'), {
      nativeEvent: { contentOffset: { x: 0, y: 100 } },
    })
    await fireEvent(screen.getByLabelText('Ghi chú'), 'focus')
    await flushFrame()
    expect(spy).toHaveBeenCalledWith({ y: 146, animated: true })
  })

  it('ô đang thấy (trên bàn phím) → không cuộn', async () => {
    keyboardAt(500)
    inputAt(200)
    const spy = scrollTo()
    await render(<Form />)
    await fireEvent(screen.getByLabelText('Mã'), 'focus')
    await flushFrame()
    expect(spy).not.toHaveBeenCalled()
  })

  it('bàn phím chưa hiện lúc focus → chờ keyboardDidShow rồi mới đo', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false)
    const listeners: (() => void)[] = []
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      if (event === 'keyboardDidShow') listeners.push(fn as () => void)
      return { remove: () => {} } as never
    })
    inputAt(700)
    const spy = scrollTo()
    await render(<Form />)
    await fireEvent(screen.getByLabelText('Ghi chú'), 'focus')
    await flushFrame()
    expect(spy).not.toHaveBeenCalled()
    jest
      .spyOn(Keyboard, 'metrics')
      .mockReturnValue({ screenX: 0, screenY: 500, width: 390, height: 344 })
    listeners.forEach((fn) => fn())
    await act(async () => new Promise((r) => setTimeout(r, 150)))
    expect(spy).toHaveBeenCalledWith({ y: 266, animated: true })
  })

  it('chờ bàn phím: focus lần hai thay lần một (không chồng listener); rời màn → gỡ listener', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false)
    const live = new Set<object>()
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event) => {
      const sub = { remove: () => live.delete(sub) }
      if (event === 'keyboardDidShow') live.add(sub)
      return sub as never
    })
    const view = await render(<Form />)
    await fireEvent(screen.getByLabelText('Mã'), 'focus')
    await fireEvent(screen.getByLabelText('Ghi chú'), 'focus')
    expect(live.size).toBe(1)
    await view.unmount()
    expect(live.size).toBe(0)
  })
})
