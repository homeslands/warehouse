import { fireEvent, render, screen } from '@testing-library/react-native'
import { Lock } from './icons'

import { lightColors } from '../theme/tokens'
import { FormField } from './FormField'

describe('FormField', () => {
  it('nhãn phía trên, ô nhập mang nhãn đó cho trình đọc màn hình', async () => {
    await render(<FormField label="Mật khẩu" icon={Lock} placeholder="Nhập mật khẩu" />)
    expect(screen.getByText('Mật khẩu')).toBeOnTheScreen()
    expect(screen.getByLabelText('Mật khẩu')).toHaveProp('placeholder', 'Nhập mật khẩu')
  })

  it('đang nhập → viền đậm + vòng sáng; rời ô → về viền thường; vẫn gọi onFocus/onBlur', async () => {
    const onFocus = jest.fn()
    const onBlur = jest.fn()
    await render(<FormField label="SĐT" onFocus={onFocus} onBlur={onBlur} />)
    const box = () => screen.getByTestId('form-field-box')
    expect(box()).toHaveStyle({ borderColor: lightColors.input })

    await fireEvent(screen.getByLabelText('SĐT'), 'focus')
    expect(box()).toHaveStyle({
      borderColor: lightColors.primary,
      boxShadow: `0 0 0 3px ${lightColors.ringSoft}`,
    })
    expect(onFocus).toHaveBeenCalled()

    await fireEvent(screen.getByLabelText('SĐT'), 'blur')
    expect(box()).toHaveStyle({ borderColor: lightColors.input })
    expect(onBlur).toHaveBeenCalled()
  })

  it('lỗi → viền đỏ và câu lỗi', async () => {
    await render(<FormField label="SĐT" error="Vui lòng nhập" />)
    expect(screen.getByTestId('form-field-box')).toHaveStyle({
      borderColor: lightColors.destructive,
    })
    expect(screen.getByRole('alert', { name: 'Vui lòng nhập' })).toBeOnTheScreen()
  })
})
