import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { WizardProgress } from './WizardProgress'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const steps = [
  { label: 'Thông tin', state: 'done', pressable: true },
  { label: 'Vật tư', state: 'current', pressable: true },
  { label: 'Xác nhận', state: 'todo', pressable: false },
] as const

const fillOf = (i: number) =>
  StyleSheet.flatten(screen.getByTestId(`wp-segment-${i}`).props.style).backgroundColor

describe('WizardProgress', () => {
  it('3 segments, ≤ current are accent', async () => {
    await render(<WizardProgress testID="wp" steps={steps} onPress={jest.fn()} />)
    expect([0, 1, 2].map(fillOf)).toEqual([
      lightColors.accent,
      lightColors.accent,
      lightColors.fill,
    ])
    expect(StyleSheet.flatten(screen.getByTestId('wp-segment-0').props.style)).toMatchObject({
      height: 4,
      borderRadius: 2,
    })
    // Mỗi đoạn có vùng chạm cao ≥ 44.
    const target = screen.getByLabelText(/^Bước 1 trên 3/)
    expect(StyleSheet.flatten(target.props.style).minHeight).toBeGreaterThanOrEqual(44)
  })

  it('first step current: only the first segment is accent (done steps after it stay grey)', async () => {
    await render(
      <WizardProgress
        testID="wp"
        steps={[
          { label: 'Thông tin', state: 'current', pressable: true },
          { label: 'Vật tư', state: 'done', pressable: true },
          { label: 'Xác nhận', state: 'todo', pressable: false },
        ]}
        onPress={jest.fn()}
      />,
    )
    expect([0, 1, 2].map(fillOf)).toEqual([lightColors.accent, lightColors.fill, lightColors.fill])
  })

  it('press on pressable segment calls onPress', async () => {
    const onPress = jest.fn()
    await render(<WizardProgress steps={steps} onPress={onPress} />)
    await fireEvent.press(screen.getByLabelText(/^Bước 1 trên 3/))
    expect(onPress).toHaveBeenCalledWith(0)
    const todo = screen.getByLabelText(/^Bước 3 trên 3/)
    await fireEvent.press(todo)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(todo).toBeDisabled()
  })

  it('writing → not pressable', async () => {
    const onPress = jest.fn()
    await render(<WizardProgress steps={steps} onPress={onPress} writing />)
    const step1 = screen.getByLabelText(/^Bước 1 trên 3/)
    expect(step1).toBeDisabled()
    await fireEvent.press(step1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('a11y: "Bước 1 trên 3, Thông tin, đã xong"; current is selected', async () => {
    await render(<WizardProgress steps={steps} onPress={jest.fn()} />)
    expect(screen.getByLabelText('Bước 1 trên 3, Thông tin, đã xong')).toBeOnTheScreen()
    expect(screen.getByLabelText('Bước 3 trên 3, Xác nhận, chưa tới')).toBeOnTheScreen()
    expect(screen.getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    expect(screen.getByLabelText(/^Bước 1 trên 3/)).not.toBeSelected()
  })
})
