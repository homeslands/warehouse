import { fireEvent, render, screen } from '@testing-library/react-native'
import { Globe, LogOut } from './icons'

import { darkColors, lightColors } from '../theme/tokens'
import { ListRow } from './ListRow'

const mockScheme = jest.fn(() => 'light')
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}))

describe('ListRow', () => {
  it('bấm được: role button, nhãn kèm giá trị, gọi onPress', async () => {
    const onPress = jest.fn()
    await render(
      <ListRow icon={Globe} label="Ngôn ngữ" value="Tiếng Việt" chevron onPress={onPress} />,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Ngôn ngữ').props.numberOfLines).toBe(1)
  })

  it('không có onPress → không phải nút, nhưng đọc liền "nhãn, giá trị"', async () => {
    await render(<ListRow label="Email" value="a@b.vn" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('Email, a@b.vn')).toBeOnTheScreen()
  })

  it('centered + busy: nhãn căn giữa, quay vòng, khoá bấm', async () => {
    const onPress = jest.fn()
    await render(<ListRow label="Đăng xuất" destructive centered busy onPress={onPress} />)
    const row = screen.getByRole('button', { name: 'Đăng xuất', busy: true })
    expect(row).toHaveStyle({ justifyContent: 'center' })
    expect(row).toBeDisabled()
    expect(screen.queryByTestId('icon-tile', { includeHiddenElements: true })).toBeNull()
    await fireEvent.press(row)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('destructive: nhãn đỏ, ô icon đỏ nhạt — cả sáng lẫn tối', async () => {
    for (const [scheme, colors] of [
      ['light', lightColors],
      ['dark', darkColors],
    ] as const) {
      mockScheme.mockReturnValue(scheme)
      const view = await render(
        <ListRow icon={LogOut} label="Đăng xuất" destructive onPress={jest.fn()} />,
      )
      expect(screen.getByText('Đăng xuất')).toHaveStyle({ color: colors.destructive })
      expect(screen.getByTestId('icon-tile', { includeHiddenElements: true })).toHaveStyle({
        backgroundColor: colors.destructiveSoft,
      })
      await view.unmount()
    }
    mockScheme.mockReturnValue('light')
  })

  it('báo trạng thái chọn khi có `selected`', async () => {
    await render(<ListRow label="Kho Một" selected onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Kho Một' })).toBeSelected()
  })
})
