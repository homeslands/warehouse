import { fireEvent, render, screen } from '@testing-library/react-native'

import { SegmentedControl } from './SegmentedControl'

const ITEMS = [
  { value: 'a', label: 'Theo lô · 3' },
  { value: 'b', label: 'Lịch sử' },
] as const

describe('SegmentedControl', () => {
  it('chạm mục khác → onChange(value); chạm mục đang chọn → không gọi', async () => {
    const onChange = jest.fn()
    await render(<SegmentedControl items={[...ITEMS]} value="a" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Theo lô · 3' })).toBeSelected()
    await fireEvent.press(screen.getByRole('tab', { name: 'Theo lô · 3' }))
    expect(onChange).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('tab', { name: 'Lịch sử' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('hiện đúng nhãn đã dịch sẵn và role tablist', async () => {
    await render(<SegmentedControl items={[...ITEMS]} value="b" onChange={() => {}} testID="seg" />)
    expect(screen.getByTestId('seg').props.accessibilityRole).toBe('tablist')
    expect(screen.getByRole('tab', { name: 'Lịch sử' })).toBeSelected()
  })
})
