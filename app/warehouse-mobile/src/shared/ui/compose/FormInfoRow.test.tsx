import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { KeyboardRevealContext } from '@/shared/lib/keyboard'
import { lightColors } from '@/shared/theme/tokens'

import { FormInfoRow } from './FormInfoRow'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true }
})

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('FormInfoRow', () => {
  it('required empty input shows Bắt buộc placeholder in warning color and a dot', async () => {
    await render(
      <FormInfoRow
        kind="input"
        label="Người nhận"
        required
        value=""
        onChangeText={jest.fn()}
        testID="r"
      />,
    )
    expect(screen.getByPlaceholderText('Bắt buộc')).toHaveProp(
      'placeholderTextColor',
      lightColors.warningText,
    )
    expect(screen.getByTestId('r-dot')).toBeOnTheScreen()
  })

  it('required row with a value has no dot', async () => {
    await render(
      <FormInfoRow
        kind="input"
        label="Người nhận"
        required
        value="An"
        onChangeText={jest.fn()}
        testID="r"
      />,
    )
    expect(screen.queryByTestId('r-dot')).toBeNull()
  })

  it('optional empty shows Tuỳ chọn', async () => {
    await render(<FormInfoRow kind="input" label="Ghi chú" value="" onChangeText={jest.fn()} />)
    expect(screen.getByPlaceholderText('Tuỳ chọn')).toBeOnTheScreen()
  })

  it('typing calls onChangeText', async () => {
    const onChangeText = jest.fn()
    await render(<FormInfoRow kind="input" label="Ghi chú" value="" onChangeText={onChangeText} />)
    await fireEvent.changeText(screen.getByLabelText('Ghi chú'), 'abc')
    expect(onChangeText).toHaveBeenCalledWith('abc')
  })

  it('editable false makes the input read-only (vd đang ghi phiếu)', async () => {
    await render(
      <FormInfoRow
        kind="input"
        label="Ghi chú"
        value="a"
        onChangeText={jest.fn()}
        editable={false}
      />,
    )
    expect(screen.getByLabelText('Ghi chú')).toHaveProp('editable', false)
  })

  it('focus calls the reveal function from KeyboardRevealContext', async () => {
    const reveal = jest.fn()
    const onFocus = jest.fn()
    await render(
      <KeyboardRevealContext value={reveal}>
        <FormInfoRow
          kind="input"
          label="Ghi chú"
          value=""
          onChangeText={jest.fn()}
          onFocus={onFocus}
        />
      </KeyboardRevealContext>,
    )
    await fireEvent(screen.getByLabelText('Ghi chú'), 'focus')
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('picker row calls onPress and shows value', async () => {
    const onPress = jest.fn()
    await render(<FormInfoRow kind="picker" label="Kho" value="Kho Một" onPress={onPress} />)
    expect(screen.getByText('Kho Một')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Kho, Kho Một' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('picker without disabled keeps accessibilityState as before (no disabled key)', async () => {
    await render(
      <FormInfoRow kind="picker" label="Lô" value="Tự động" expanded={false} onPress={jest.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Lô, Tự động' })).toHaveProp('accessibilityState', {
      expanded: false,
    })
  })

  it('disabled picker: a11y disabled, no press, plain value color, no chevron', async () => {
    const onPress = jest.fn()
    await render(
      <FormInfoRow
        kind="picker"
        label="Hạn dùng"
        value="12/03/2027"
        accentValue
        disabled
        onPress={onPress}
      />,
    )
    const row = screen.getByRole('button', { name: 'Hạn dùng, 12/03/2027' })
    expect(row).toBeDisabled()
    await fireEvent.press(row)
    expect(onPress).not.toHaveBeenCalled()
    expect(StyleSheet.flatten(screen.getByText('12/03/2027').props.style).color).toBe(
      lightColors.foreground,
    )
    // [nhãn][giá trị] — không mũi tên (dòng thường có 3 phần tử con, xem dưới).
    expect(row.children).toHaveLength(2)
    await render(<FormInfoRow kind="picker" label="Kho" value="A" onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Kho, A' }).children).toHaveLength(3)
  })

  it('empty required picker shows Bắt buộc in warning color', async () => {
    await render(
      <FormInfoRow kind="picker" label="Kho" required value={null} onPress={jest.fn()} />,
    )
    expect(StyleSheet.flatten(screen.getByText('Bắt buộc').props.style).color).toBe(
      lightColors.warningText,
    )
  })

  it('readonly row is not pressable', async () => {
    await render(<FormInfoRow kind="readonly" label="Bên bán" value="ABC" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('ABC')).toBeOnTheScreen()
  })

  it('error renders as alert below the row', async () => {
    await render(<FormInfoRow kind="readonly" label="Bên bán" value="ABC" error="Sai rồi" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sai rồi')
  })

  it('highlighted with reduced motion renders without animation', async () => {
    await render(<FormInfoRow kind="readonly" label="Bên bán" value="ABC" highlighted testID="h" />)
    expect(screen.getByText('ABC')).toBeOnTheScreen()
    expect(screen.queryByTestId('h-highlight')).toBeNull()
  })
})
