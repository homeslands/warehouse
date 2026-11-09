import { render, screen } from '@testing-library/react-native'

import { lightColors } from '../theme/tokens'
import { SectionFooter } from './SectionFooter'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader / SectionFooter', () => {
  it('tiêu đề nhóm là header, chữ hoa, màu nhãn nhóm', async () => {
    await render(<SectionHeader>Cài đặt</SectionHeader>)
    const header = screen.getByRole('header', { name: 'Cài đặt' })
    expect(header).toHaveStyle({ textTransform: 'uppercase', color: lightColors.groupedLabel })
  })

  it('chú thích theo tone', async () => {
    const view = await render(<SectionFooter>Ghi chú</SectionFooter>)
    expect(screen.getByText('Ghi chú')).toHaveStyle({ color: lightColors.groupedLabel })
    await view.rerender(<SectionFooter tone="success">Xong</SectionFooter>)
    expect(screen.getByText('Xong')).toHaveStyle({ color: lightColors.success })
  })
})
