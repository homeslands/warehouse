import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { DetailHero } from './DetailHero'

describe('DetailHero', () => {
  const base = {
    pills: <Text>Chờ duyệt</Text>,
    title: 'Công ty A',
    totalLabel: 'Tổng cộng',
    total: 1500000,
    locale: 'vi' as const,
    count: '3 dòng',
    testID: 'hero',
  }

  it('hiện viên, tiêu đề (header), nhãn tổng, tổng tiền, số dòng', async () => {
    await render(<DetailHero {...base} />)
    expect(screen.getByText('Chờ duyệt')).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Công ty A' })).toBeOnTheScreen()
    expect(screen.getByText('Tổng cộng')).toBeOnTheScreen()
    expect(screen.getByTestId('hero-total')).toHaveTextContent('1.500.000 đ')
    expect(screen.getByText('3 dòng')).toBeOnTheScreen()
    expect(screen.queryByTestId('hero-meta')).toBeNull()
  })

  it('có meta thì hiện; titleMuted làm mờ', async () => {
    await render(<DetailHero {...base} titleMuted meta={<Text>HĐ 1 · 08/11</Text>} />)
    expect(screen.getByText('HĐ 1 · 08/11')).toBeOnTheScreen()
  })
})
