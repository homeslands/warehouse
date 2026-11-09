import { render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { MoneyField } from './MoneyField'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

function show(over: Partial<React.ComponentProps<typeof MoneyField>> = {}) {
  return render(
    <MoneyField
      value="1.250"
      onChangeText={jest.fn()}
      unitLabel="cái"
      state="normal"
      placeholder="Nhập đơn giá"
      accessibilityLabel="Đơn giá"
      testID="price"
      {...over}
    />,
  )
}

describe('MoneyField', () => {
  it('selection is pinned to end of text', async () => {
    await show()
    expect(screen.getByTestId('price').props.selection).toEqual({ start: 5, end: 5 })
  })

  it('suffix shows đ / cái', async () => {
    await show()
    expect(screen.getByText('đ / cái')).toBeOnTheScreen()
  })

  it('missing state shows Nhập đơn giá placeholder with warning style', async () => {
    await show({ value: '', state: 'missing' })
    const input = screen.getByTestId('price')
    expect(input.props.placeholder).toBe('Nhập đơn giá')
    expect(screen.getByTestId('price-frame')).toHaveStyle({ borderColor: '#d08700' })
  })

  it('uses decimal-pad keyboard', async () => {
    await show()
    expect(screen.getByTestId('price').props.keyboardType).toBe('decimal-pad')
  })
})

describe("MoneyField variant 'plain'", () => {
  it('không viền, nền trong suốt; thiếu → nền warningSoft; vẫn có hậu tố và ghim con trỏ cuối', async () => {
    await show({ variant: 'plain' })
    const frame = screen.getByTestId('price-frame')
    expect(frame).toHaveStyle({ backgroundColor: 'transparent', justifyContent: 'flex-end' })
    expect(frame.props.style.borderWidth).toBeUndefined()
    expect(screen.getByText('đ / cái')).toBeOnTheScreen()
    expect(screen.getByTestId('price')).toHaveStyle({ textAlign: 'right', fontSize: 17 })
    expect(screen.getByTestId('price').props.selection).toEqual({ start: 5, end: 5 })
  })
})
