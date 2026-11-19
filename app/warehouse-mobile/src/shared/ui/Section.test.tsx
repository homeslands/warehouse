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

  it('lề mặc định 16; `inset` đổi lề (thẻ variant card: 20 = thẳng cột vòng icon)', async () => {
    const view = await render(<SectionHeader variant="sentence">Làm việc</SectionHeader>)
    expect(screen.getByRole('header', { name: 'Làm việc' })).toHaveStyle({ paddingHorizontal: 16 })
    await view.rerender(
      <SectionHeader variant="sentence" inset={20}>
        Làm việc
      </SectionHeader>,
    )
    expect(screen.getByRole('header', { name: 'Làm việc' })).toHaveStyle({ paddingHorizontal: 20 })
    await view.rerender(<SectionFooter inset={20}>Ghi chú</SectionFooter>)
    expect(screen.getByText('Ghi chú')).toHaveStyle({ paddingHorizontal: 20 })
  })

  it('chú thích theo tone', async () => {
    const view = await render(<SectionFooter>Ghi chú</SectionFooter>)
    expect(screen.getByText('Ghi chú')).toHaveStyle({ color: lightColors.groupedLabel })
    await view.rerender(<SectionFooter tone="success">Xong</SectionFooter>)
    expect(screen.getByText('Xong')).toHaveStyle({ color: lightColors.success })
  })
})
