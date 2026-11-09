import { fireEvent, render, screen } from '@testing-library/react-native'

import { Button } from './Button'

const mockScheme = jest.fn()
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}))

describe('Button destructive', () => {
  it('uses white text in light mode', async () => {
    mockScheme.mockReturnValue('light')
    await render(<Button variant="destructive">Xoá</Button>)
    expect(screen.getByText('Xoá')).toHaveStyle({ color: '#ffffff' })
  })

  it('uses dark text in dark mode (contrast on #ff6467)', async () => {
    mockScheme.mockReturnValue('dark')
    await render(<Button variant="destructive">Xoá</Button>)
    expect(screen.getByText('Xoá')).toHaveStyle({ color: '#0a0a0a' })
  })
})

describe('Button accent capsule (nút chính nổi trên danh sách)', () => {
  it('viên thuốc 48pt, nền xanh dương hệ thống, chữ trắng semibold 15.5', async () => {
    mockScheme.mockReturnValue('light')
    await render(
      <Button variant="accent" capsule>
        Xác nhận nhập kho
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveStyle({
      minHeight: 48,
      borderRadius: 24,
      backgroundColor: '#007aff',
      opacity: 1,
    })
    expect(screen.getByText('Xác nhận nhập kho')).toHaveStyle({
      color: '#ffffff',
      fontSize: 15.5,
      fontWeight: '600',
    })
  })

  it('khoá: nền xám đặc + chữ mờ, KHÔNG giảm opacity (nội dung bên dưới không lộ qua)', async () => {
    mockScheme.mockReturnValue('light')
    await render(
      <Button variant="accent" capsule disabled>
        Còn 3 dòng chưa kiểm
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: '#eeeeef', opacity: 1 })
    expect(screen.getByText('Còn 3 dòng chưa kiểm')).toHaveStyle({ color: '#737373' })
  })

  it('blocked: TRÔNG như khoá nhưng vẫn bấm được (màn chỉ tới chỗ còn thiếu), không báo disabled', async () => {
    mockScheme.mockReturnValue('light')
    const onPress = jest.fn()
    await render(
      <Button
        variant="accent"
        capsule
        blocked
        accessibilityHint="Còn thiếu: Người nhận"
        onPress={onPress}
      >
        Tiếp tục
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Tiếp tục' })
    expect(button).toHaveStyle({ backgroundColor: '#eeeeef', opacity: 1 })
    expect(screen.getByText('Tiếp tục')).toHaveStyle({ color: '#737373' })
    expect(button).toBeEnabled()
    expect(button.props.accessibilityHint).toBe('Còn thiếu: Người nhận')
    await fireEvent.press(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('Button secondaryDestructive capsule (nút phụ nguy hiểm cạnh nút chính)', () => {
  it('nền thẻ ĐẶC (không lộ nội dung cuộn bên dưới) + chữ đỏ destructiveText', async () => {
    mockScheme.mockReturnValue('light')
    await render(
      <Button variant="secondaryDestructive" capsule>
        Huỷ
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveStyle({
      minHeight: 48,
      borderRadius: 24,
      backgroundColor: '#ffffff',
      opacity: 1,
    })
    expect(screen.getByText('Huỷ')).toHaveStyle({ color: '#c50009' })
  })
})
