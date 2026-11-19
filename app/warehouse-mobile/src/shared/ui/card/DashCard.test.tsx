import { render, screen } from '@testing-library/react-native'

import { CardRow } from './DashCard'

describe('CardRow — giá trị bên phải không mũi tên (opt-in)', () => {
  it('value + valueCode + valueLines: hàng tĩnh, giá trị font mã, căn phải, tối đa n dòng', async () => {
    await render(<CardRow testID="r" label="Số HĐ" value="HD-1" valueCode valueLines={2} />)
    expect(screen.getByTestId('r')).toHaveTextContent('Số HĐHD-1')
    const value = screen.getByText('HD-1')
    expect(value.props.numberOfLines).toBe(2)
    expect(value).toHaveStyle({ textAlign: 'right', maxWidth: '65%' })
  })

  it('không valueLines: giữ kiểu cũ (một dòng, không ép co)', async () => {
    await render(<CardRow label="Tổng" value="10 đ" />)
    expect(screen.getByText('10 đ').props.numberOfLines).toBe(1)
    expect(screen.getByText('10 đ')).not.toHaveStyle({ maxWidth: '65%' })
  })
})
