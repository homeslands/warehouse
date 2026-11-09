import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native'

import { useState } from 'react'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { QuantityStepper } from './QuantityStepper'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const onStep = jest.fn()
const onRequestRemove = jest.fn()
const onChangeText = jest.fn()
beforeEach(() => jest.clearAllMocks())

function show(over: Partial<React.ComponentProps<typeof QuantityStepper>> = {}) {
  return render(
    <QuantityStepper
      text="2,5"
      value={2.5}
      missing={false}
      disabled={false}
      unitLabel="hộp"
      accessibilityLabel="Số lượng Bột mì"
      onChangeText={onChangeText}
      onStep={onStep}
      onRequestRemove={onRequestRemove}
      testID="qty"
      {...over}
    />,
  )
}

/** Một lần chạm như RN gửi cho `Pressable` (responder), để đi qua Pressability thật. */
const touch = () => ({
  persist: () => {},
  currentTarget: { measure: () => {} },
  nativeEvent: {
    changedTouches: [],
    identifier: 0,
    locationX: 10,
    locationY: 10,
    pageX: 10,
    pageY: 10,
    target: 0,
    timestamp: Date.now(),
    touches: [],
  },
})

describe('QuantityStepper', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

  it('tap + calls onStep(1) exactly once', async () => {
    await show()
    await user().press(screen.getByLabelText('Tăng'))
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).toHaveBeenCalledTimes(1)
    expect(onStep).toHaveBeenCalledWith(1)
  })

  it('tap − at value 2.5 calls onStep(-1) once', async () => {
    await show()
    await user().press(screen.getByLabelText('Giảm'))
    expect(onStep).toHaveBeenCalledTimes(1)
    expect(onStep).toHaveBeenCalledWith(-1)
    expect(onRequestRemove).not.toHaveBeenCalled()
  })

  it('tap − at value 1 calls onRequestRemove not onStep', async () => {
    await show({ text: '1', value: 1 })
    await user().press(screen.getByLabelText('Giảm'))
    expect(onRequestRemove).toHaveBeenCalledTimes(1)
    expect(onStep).not.toHaveBeenCalled()
  })

  it('a touch that starts on + and is taken over by a scroll never steps', async () => {
    await show()
    const plus = screen.getByLabelText('Tăng')
    await fireEvent(plus, 'responderGrant', touch())
    await act(async () => void jest.advanceTimersByTime(100))
    await fireEvent(plus, 'responderTerminate', touch())
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).not.toHaveBeenCalled()
  })

  it('a scroll that starts on − at value 1 does not ask to remove', async () => {
    await show({ text: '1', value: 1 })
    const minus = screen.getByLabelText('Giảm')
    await fireEvent(minus, 'responderGrant', touch())
    await act(async () => void jest.advanceTimersByTime(100))
    await fireEvent(minus, 'responderTerminate', touch())
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onRequestRemove).not.toHaveBeenCalled()
  })

  it('accessibility activation (TalkBack onClick → onPress only) steps', async () => {
    await show()
    await fireEvent.press(screen.getByLabelText('Tăng'))
    expect(onStep).toHaveBeenCalledTimes(1)
    expect(onStep).toHaveBeenCalledWith(1)
  })

  it('holding + repeats after the long-press delay and stops on release', async () => {
    await show()
    await user().longPress(screen.getByLabelText('Tăng'), { duration: 1000 })
    const held = onStep.mock.calls.length
    // 400 (long press) → +150 → +128 → +109 → +92 … trong 1000ms: nhiều lần, toàn +1.
    expect(held).toBeGreaterThanOrEqual(4)
    expect(onStep.mock.calls.every(([d]) => d === 1)).toBe(true)
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).toHaveBeenCalledTimes(held)
  })

  it('missing shows empty input with "0" placeholder', async () => {
    await show({ text: '', value: 0, missing: true })
    const input = screen.getByTestId('qty')
    expect(input.props.value).toBe('')
    expect(input.props.placeholder).toBe('0')
  })

  it('typing in the number calls onChangeText', async () => {
    await show()
    await fireEvent.changeText(screen.getByTestId('qty'), '3')
    expect(onChangeText).toHaveBeenCalledWith('3')
  })

  it('increment/decrement accessibility actions', async () => {
    await show()
    const input = screen.getByTestId('qty')
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(onStep).toHaveBeenLastCalledWith(1)
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    expect(onStep).toHaveBeenLastCalledWith(-1)
  })

  it('disabled does not step (tap, long press, a11y activation)', async () => {
    await show({ disabled: true })
    const plus = screen.getByLabelText('Tăng')
    await user().press(plus)
    await user().longPress(plus, { duration: 1000 })
    await fireEvent.press(plus)
    expect(onStep).not.toHaveBeenCalled()
  })

  it('large size keeps tap/long-press behaviour', async () => {
    await show({ size: 'large' })
    const plus = screen.getByLabelText('Tăng')
    // Cỡ to của sheet sửa dòng: nút 48×44, số 22 đậm rộng tối thiểu 64.
    expect(plus).toHaveStyle({ width: 48, height: 44 })
    expect(screen.getByLabelText('Giảm')).toHaveStyle({ width: 48, height: 44 })
    expect(screen.getByTestId('qty')).toHaveStyle({ fontSize: 22, minWidth: 64, height: 44 })
    // Chạm = đúng một bước.
    await user().press(plus)
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).toHaveBeenCalledTimes(1)
    // Giữ = lặp sau 400ms, dừng khi nhả.
    await user().longPress(plus, { duration: 1000 })
    const held = onStep.mock.calls.length
    expect(held).toBeGreaterThanOrEqual(5)
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).toHaveBeenCalledTimes(held)
    // Cuộn bắt đầu trên nút không bước.
    await fireEvent(plus, 'responderGrant', touch())
    await act(async () => void jest.advanceTimersByTime(100))
    await fireEvent(plus, 'responderTerminate', touch())
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(onStep).toHaveBeenCalledTimes(held)
  })

  it('large size: − at value 1 asks to remove once even when held', async () => {
    await show({ size: 'large', text: '1', value: 1 })
    await user().longPress(screen.getByLabelText('Giảm'), { duration: 3000 })
    expect(onRequestRemove).toHaveBeenCalledTimes(1)
    expect(onStep).not.toHaveBeenCalled()
  })

  it('regular size keeps the compact pill', async () => {
    await show()
    expect(screen.getByLabelText('Tăng')).toHaveStyle({ width: 34, height: 32 })
    expect(screen.getByTestId('qty')).toHaveStyle({ fontSize: 14, minWidth: 40, height: 32 })
  })

  describe("variant 'ios' (UIStepper + ô số cạnh nhau)", () => {
    it('ô số nền fill bo 8 rộng tối thiểu 64, viên 94×32 chia hai nửa bằng kẻ mảnh, mỗi nửa chạm ≥ 44', async () => {
      await show({ variant: 'ios' })
      expect(screen.getByTestId('qty')).toHaveStyle({
        minWidth: 64,
        borderRadius: 8,
        textAlign: 'right',
        fontSize: 17,
      })
      expect(screen.getByTestId('qty').props.keyboardType).toBe('decimal-pad')
      const plus = screen.getByLabelText('Tăng')
      expect(plus).toHaveStyle({ width: 47, height: 32 })
      expect(plus.props.hitSlop).toEqual({ top: 6, bottom: 6 })
      expect(screen.getByLabelText('Giảm').props.hitSlop).toEqual({ top: 6, bottom: 6 })
      expect(screen.getByTestId('qty-divider')).toBeOnTheScreen()
      // Số KHÔNG nằm trong viên: ô số và viên là anh em.
      expect(screen.getByTestId('qty').parent).toBe(plus.parent?.parent)
    })

    it('chạm = một bước; giữ lặp; cuộn bắt đầu trên nút không bước', async () => {
      await show({ variant: 'ios' })
      const plus = screen.getByLabelText('Tăng')
      await user().press(plus)
      await act(async () => void jest.advanceTimersByTime(2000))
      expect(onStep).toHaveBeenCalledTimes(1)
      expect(onStep).toHaveBeenLastCalledWith(1)
      await user().longPress(plus, { duration: 1000 })
      const held = onStep.mock.calls.length
      expect(held).toBeGreaterThanOrEqual(5)
      await act(async () => void jest.advanceTimersByTime(2000))
      expect(onStep).toHaveBeenCalledTimes(held)
      await fireEvent(plus, 'responderGrant', touch())
      await act(async () => void jest.advanceTimersByTime(100))
      await fireEvent(plus, 'responderTerminate', touch())
      await act(async () => void jest.advanceTimersByTime(2000))
      expect(onStep).toHaveBeenCalledTimes(held)
    })

    it('− ở số ≤ 1 hỏi xoá đúng một lần kể cả khi giữ; − ở 2,5 bước −1', async () => {
      await show({ variant: 'ios', text: '1', value: 1 })
      await user().longPress(screen.getByLabelText('Giảm'), { duration: 3000 })
      expect(onRequestRemove).toHaveBeenCalledTimes(1)
      expect(onStep).not.toHaveBeenCalled()
    })

    it('− ở 2,5 bước −1; a11y increment / decrement trên ô số; nhãn ô số nguyên văn; khoá thì không bước', async () => {
      const r = await show({ variant: 'ios', accessibilityLabel: 'Số lượng Bột mì' })
      await user().press(screen.getByLabelText('Giảm'))
      expect(onStep).toHaveBeenLastCalledWith(-1)
      const input = screen.getByLabelText('Số lượng Bột mì')
      await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
      expect(onStep).toHaveBeenLastCalledWith(1)
      onStep.mockClear()
      await r.rerender(
        <QuantityStepper
          variant="ios"
          text="2,5"
          value={2.5}
          missing={false}
          disabled
          unitLabel="hộp"
          accessibilityLabel="Số lượng Bột mì"
          onChangeText={onChangeText}
          onStep={onStep}
          onRequestRemove={onRequestRemove}
          testID="qty"
        />,
      )
      await user().press(screen.getByLabelText('Tăng'))
      await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
      expect(onStep).not.toHaveBeenCalled()
      expect(screen.getByTestId('qty').props.editable).toBe(false)
    })

    it('thiếu số: ô trống "0" mờ nền xám; rời ô mà vẫn trống → nền cam; chạm lại → xám', async () => {
      await show({ variant: 'ios', text: '', value: 0, missing: true })
      const input = () => screen.getByTestId('qty')
      expect(input().props.placeholder).toBe('0')
      expect(input()).not.toHaveStyle({ backgroundColor: lightColors.warningSoft })
      await fireEvent(input(), 'blur')
      expect(input()).toHaveStyle({ backgroundColor: lightColors.warningSoft })
      await fireEvent(input(), 'focus')
      expect(input()).not.toHaveStyle({ backgroundColor: lightColors.warningSoft })
    })
  })

  describe('hold −', () => {
    it('at value 1 asks to remove once even when held', async () => {
      await show({ text: '1', value: 1 })
      await user().longPress(screen.getByLabelText('Giảm'), { duration: 3000 })
      expect(onRequestRemove).toHaveBeenCalledTimes(1)
      expect(onStep).not.toHaveBeenCalled()
    })

    it('holding from 3 steps 3→2→1 then asks once', async () => {
      function Host() {
        const [v, setV] = useState(3)
        return (
          <QuantityStepper
            text={String(v)}
            value={v}
            missing={false}
            disabled={false}
            unitLabel="hộp"
            accessibilityLabel="Số lượng"
            onChangeText={jest.fn()}
            onStep={(d) => {
              onStep(d)
              setV((x) => x + d)
            }}
            onRequestRemove={onRequestRemove}
          />
        )
      }
      await render(<Host />)
      // Giữ qua responder (Pressability thật), chạy hẹn giờ trong `act` từng nhịp để Host vẽ lại số mới
      // giữa các lần lặp như trên máy.
      const minus = screen.getByLabelText('Giảm')
      await fireEvent(minus, 'responderGrant', touch())
      for (let i = 0; i < 30; i++) await act(async () => void jest.advanceTimersByTime(100))
      await fireEvent(minus, 'responderRelease', touch())
      expect(onStep).toHaveBeenCalledTimes(2)
      expect(onRequestRemove).toHaveBeenCalledTimes(1)
    })
  })
})
