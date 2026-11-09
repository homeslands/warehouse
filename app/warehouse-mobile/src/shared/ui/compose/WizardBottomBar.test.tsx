import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Keyboard, Platform, StyleSheet, View } from 'react-native'

import { lightColors } from '@/shared/theme/tokens'
import { Button, Text } from '@/shared/ui'

import { WizardBottomBar, WizardMainButton, WizardSideButton } from './WizardBottomBar'

const bar = (onHeight = jest.fn()) => (
  <WizardBottomBar
    testID="bar"
    onHeight={onHeight}
    notice={<Text>Lỗi mức phiếu</Text>}
    summary={<Text>3 vật tư</Text>}
  >
    <Button variant="accent" capsule onPress={jest.fn()}>
      Tiếp tục
    </Button>
  </WizardBottomBar>
)

describe('WizardBottomBar', () => {
  it('không có summary vẫn vẽ nút', async () => {
    await render(
      <WizardBottomBar testID="bar">
        <WizardMainButton onPress={jest.fn()}>Lưu</WizardMainButton>
      </WizardBottomBar>,
    )
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeOnTheScreen()
  })

  it('WizardSideButton: nút capsule cao 52', async () => {
    const onPress = jest.fn()
    await render(
      <WizardSideButton variant="outline" onPress={onPress}>
        Huỷ
      </WizardSideButton>,
    )
    const btn = screen.getByRole('button', { name: 'Huỷ' })
    expect(StyleSheet.flatten(btn.props.style)).toMatchObject({ minHeight: 52, borderRadius: 26 })
    await fireEvent.press(btn)
    expect(onPress).toHaveBeenCalled()
  })

  it('renders summary + button and reports height', async () => {
    const onHeight = jest.fn()
    await render(bar(onHeight))
    expect(screen.getByText('Lỗi mức phiếu')).toBeOnTheScreen()
    expect(screen.getByText('3 vật tư')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeOnTheScreen()
    await fireEvent(screen.getByTestId('bar-content'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } },
    })
    expect(onHeight).toHaveBeenCalledWith(120)
  })

  it('has a real background: iOS blur material + hairline on top', async () => {
    await render(bar())
    const root = StyleSheet.flatten(screen.getByTestId('bar').props.style)
    expect(root).toMatchObject({ position: 'absolute', bottom: 0, borderTopWidth: 0.5 })
    expect(root.borderTopColor).toBe(lightColors.separator)
    expect(screen.getByTestId('bar-material')).toBeOnTheScreen()
  })

  it('Android: solid grouped background instead of blur', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(bar())
    const root = StyleSheet.flatten(screen.getByTestId('bar').props.style)
    expect(root.backgroundColor).toBe(lightColors.grouped)
    expect(screen.queryByTestId('bar-material')).toBeNull()
  })
})

describe('WizardMainButton', () => {
  it('is a 52pt accent capsule; other capsule buttons stay 48pt', async () => {
    const onPress = jest.fn()
    await render(
      <>
        <WizardMainButton onPress={onPress}>Tiếp tục</WizardMainButton>
        <Button variant="accent" capsule onPress={jest.fn()}>
          Thêm
        </Button>
      </>,
    )
    const main = screen.getByRole('button', { name: 'Tiếp tục' })
    expect(main).toHaveStyle({
      minHeight: 52,
      borderRadius: 26,
      backgroundColor: lightColors.accent,
    })
    expect(screen.getByRole('button', { name: 'Thêm' })).toHaveStyle({ minHeight: 48 })
    await fireEvent.press(main)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('keeps Button rules: blocked looks disabled but still presses; disabled does not', async () => {
    const onPress = jest.fn()
    const { rerender } = await render(
      <WizardMainButton blocked onPress={onPress}>
        Tiếp tục
      </WizardMainButton>,
    )
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toHaveStyle({
      backgroundColor: lightColors.fill,
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    await rerender(
      <WizardMainButton disabled onPress={onPress}>
        Tiếp tục
      </WizardMainButton>,
    )
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })

  it('avoidKeyboard (iOS): đo đáy nội dung LÚC bàn phím hiện → nâng đúng phần bị che (không gồm phần chừa thanh tab); ẩn → 0', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    let onFrame: ((e: unknown) => void) | undefined
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      if (event === 'keyboardWillChangeFrame') onFrame = fn as (e: unknown) => void
      return { remove: () => {} } as never
    })
    // Đáy nội dung thanh ở y = 753 (trên thanh tab); bàn phím mép trên ở 543.
    type Measurable = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void
    }
    jest
      .spyOn(View.prototype as unknown as Measurable, 'measureInWindow')
      .mockImplementation((cb) => cb(0, 633, 390, 120))
    const onLift = jest.fn()
    await render(
      <WizardBottomBar testID="bar" summary={null} avoidKeyboard onLift={onLift}>
        <Button variant="accent" capsule onPress={jest.fn()}>
          Tiếp tục
        </Button>
      </WizardBottomBar>,
    )
    await act(async () =>
      onFrame!({
        endCoordinates: { screenX: 0, screenY: 543, width: 390, height: 301 },
        duration: 0,
      }),
    )
    expect(onLift).toHaveBeenLastCalledWith(210)
    expect(screen.getByTestId('bar')).toHaveStyle({ bottom: 210 })
    await act(async () =>
      onFrame!({
        endCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 },
        duration: 0,
      }),
    )
    expect(onLift).toHaveBeenLastCalledWith(0)
  })
})
