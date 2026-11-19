import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { Package } from '../icons'
import { DetailCardHero } from './DetailCardHero'

describe('DetailCardHero', () => {
  async function show() {
    await render(
      <DetailCardHero
        icon={Package}
        iconBackground="#eee"
        iconColor="#111"
        kind="Phiếu nhập"
        pills={<Text>Chờ duyệt</Text>}
        title="Công ty A"
        totalLabel="Tổng cộng"
        total={1500000}
        locale="vi"
        code="PN-0001"
        date="08/11/2026"
        count="3 dòng vật tư"
        testID="hero"
      />,
    )
  }

  it('hiện tiêu đề (header), tổng tiền, số dòng', async () => {
    await show()
    expect(screen.getByRole('header', { name: 'Công ty A' })).toBeOnTheScreen()
    expect(screen.getByTestId('hero-total')).toHaveTextContent('1.500.000 đ')
    expect(screen.getByText('3 dòng vật tư')).toBeOnTheScreen()
  })

  it('mã phiếu là Text code (font đơn cách), ngày là số; dòng phụ không còn " ·" thừa ở cuối', async () => {
    await show()
    const code = screen.getByText('PN-0001')
    expect(code).toHaveStyle({
      fontFamily: expect.stringMatching(/mono/i),
    })
    expect(screen.getByTestId('hero-meta')).toHaveTextContent('PN-0001 · 08/11/2026')
    expect(screen.getByTestId('hero-meta')).not.toHaveTextContent(/·\s*$/)
  })
})
