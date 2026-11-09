import { fireEvent, render, screen } from '@testing-library/react-native'

import { lightColors, radius } from '../../theme/tokens'
import { LineSummaryRow, noteExcerpt, SummaryText } from './LineSummaryRow'

const onPress = jest.fn()
beforeEach(() => jest.clearAllMocks())

function show(over: Partial<React.ComponentProps<typeof LineSummaryRow>> = {}) {
  return render(
    <LineSummaryRow
      title="Nước suối 500ml"
      amount="144.000 đ"
      line2="12 bình × 12.000 đ"
      line3="W1 · còn 100 bình · Lô tự động"
      first
      last={false}
      onPress={onPress}
      accessibilityLabel="Nước suối 500ml, 12 bình × 12.000 đ, 144.000 đ"
      testID="row"
      {...over}
    />,
  )
}

describe('LineSummaryRow', () => {
  it('renders three lines and amount — tên / thành tiền đậm 16, số × giá 14, mã 13 xám', async () => {
    await show()
    expect(screen.getByText('Nước suối 500ml').props.numberOfLines).toBe(1)
    expect(screen.getByText('Nước suối 500ml')).toHaveStyle({ fontSize: 16, fontWeight: '600' })
    expect(screen.getByText('144.000 đ')).toHaveStyle({ fontSize: 16, fontWeight: '600' })
    expect(screen.getByText('12 bình × 12.000 đ')).toHaveStyle({ fontSize: 14 })
    expect(screen.getByText('W1 · còn 100 bình · Lô tự động')).toHaveStyle({
      fontSize: 13,
      color: lightColors.mutedForeground,
    })
    expect(screen.queryByTestId('row-icon')).toBeNull()
  })

  it('is one a11y button with the given label; press calls onPress', async () => {
    await show()
    const row = screen.getByRole('button', {
      name: 'Nước suối 500ml, 12 bình × 12.000 đ, 144.000 đ',
    })
    expect(row).toBe(screen.getByTestId('row'))
    await fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('without onPress it is a plain a11y element, not a button', async () => {
    await show({ onPress: undefined })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('Nước suối 500ml, 12 bình × 12.000 đ, 144.000 đ')).toBe(
      screen.getByTestId('row'),
    )
  })

  it('không có mũi tên ›', async () => {
    await show()
    expect(screen.queryByText('›')).toBeNull()
  })

  it('rounds the top of the first row and the bottom of the last; hairline only between rows', async () => {
    await show({ first: true, last: false })
    expect(screen.getByTestId('row')).toHaveStyle({
      borderTopLeftRadius: radius.groupLarge,
      borderBottomLeftRadius: 0,
      minHeight: 44,
    })
    expect(screen.queryByTestId('row-hairline')).toBeNull()

    await show({ first: false, last: true })
    expect(screen.getByTestId('row')).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: radius.groupLarge,
    })
    expect(screen.getByTestId('row-hairline')).toHaveStyle({ left: 16 })
    // Có icon: kẻ mảnh lùi theo chữ (16 + ô 36 + 12).
    await show({ first: false, last: true, icon: 'import' })
    expect(screen.getByTestId('row-hairline')).toHaveStyle({ left: 64 })
  })

  it('icon đầu thẻ: nền accent nhạt; dòng thiếu (warning) → nền cam nhạt', async () => {
    await show({ icon: 'import' })
    expect(screen.getByTestId('row-icon')).toHaveStyle({ backgroundColor: lightColors.accentSoft })
    await show({ icon: 'export', warning: true })
    expect(screen.getByTestId('row-icon')).toHaveStyle({ backgroundColor: lightColors.warningSoft })
  })

  it('slots accept nodes (amount coloured by the caller)', async () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
    await show({ amount: <Text style={{ color: 'orange' }}>—</Text> })
    expect(screen.getByText('—')).toHaveStyle({ color: 'orange' })
  })

  it('disabled: not pressable, announced disabled', async () => {
    await show({ disabled: true })
    const row = screen.getByTestId('row')
    expect(row).toBeDisabled()
    await fireEvent.press(row)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('SummaryText: segments joined by " · ", each coloured by its tone', async () => {
    await show({
      line3: (
        <SummaryText
          segments={[
            { text: 'VT1', tone: 'muted' },
            { text: 'Thiếu 6 hộp', tone: 'destructive' },
            { text: 'Đã đổi ở nơi khác — xem lại', tone: 'warning' },
          ]}
        />
      ),
      line2: <SummaryText segments={[{ text: '12 bình × 12.000 đ', tone: 'normal' }]} />,
    })
    expect(screen.getByText('VT1 · Thiếu 6 hộp · Đã đổi ở nơi khác — xem lại')).toBeOnTheScreen()
    expect(screen.getByText('Thiếu 6 hộp')).toHaveStyle({ color: lightColors.destructiveText })
    expect(screen.getByText('Đã đổi ở nơi khác — xem lại')).toHaveStyle({
      color: lightColors.warningText,
    })
    expect(screen.getByText('VT1')).toHaveStyle({ color: lightColors.mutedForeground })
    // `normal` không tô: lấy màu của ô.
    expect(screen.getByText('12 bình × 12.000 đ').props.style).toBeUndefined()
  })
})

describe('noteExcerpt', () => {
  it('first line, whitespace collapsed, ≤ 40 chars + …; blank → null', () => {
    expect(noteExcerpt('  Giao   trước 9h \nGọi anh Tâm')).toBe('Giao trước 9h')
    expect(noteExcerpt('a'.repeat(41))).toBe(`${'a'.repeat(40)}…`)
    expect(noteExcerpt('a'.repeat(40))).toBe('a'.repeat(40))
    expect(noteExcerpt(' \n ')).toBeNull()
    expect(noteExcerpt(null)).toBeNull()
  })
})
