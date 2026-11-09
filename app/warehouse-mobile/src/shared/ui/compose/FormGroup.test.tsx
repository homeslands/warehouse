import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { ActionRow } from './ActionRow'
import { FormGroup } from './FormGroup'
import { FormInfoRow } from './FormInfoRow'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('FormGroup', () => {
  it('tiêu đề, thẻ chứa dòng, lỗi (alert) và chú thích dưới nhóm', async () => {
    await render(
      <FormGroup
        title="Chi tiết"
        footer="Nếu nhiều hạn, nhập hạn sớm nhất"
        errors={[null, 'Lỗi A']}
      >
        <Text>nội dung</Text>
      </FormGroup>,
    )
    expect(screen.getByRole('header')).toHaveTextContent('Chi tiết')
    expect(screen.getByText('nội dung')).toBeOnTheScreen()
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi A')
    expect(screen.getByText('Nếu nhiều hạn, nhập hạn sớm nhất')).toBeOnTheScreen()
  })

  it('không tiêu đề / chú thích / lỗi thì không vẽ gì thêm', async () => {
    await render(
      <FormGroup>
        <Text>x</Text>
      </FormGroup>,
    )
    expect(screen.queryByRole('header')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe("ActionRow variant 'centered'", () => {
  it('chữ giữa, không kẻ trên, vẫn bấm được và khoá được', async () => {
    const onPress = jest.fn()
    const { rerender } = await render(
      <ActionRow variant="centered" label="Xoá khỏi phiếu" color="red" onPress={onPress} />,
    )
    const button = screen.getByRole('button', { name: 'Xoá khỏi phiếu' })
    expect(button).toHaveStyle({ alignItems: 'center', minHeight: 44 })
    await fireEvent.press(button)
    expect(onPress).toHaveBeenCalledTimes(1)
    await rerender(
      <ActionRow
        variant="centered"
        label="Xoá khỏi phiếu"
        color="red"
        disabled
        onPress={onPress}
      />,
    )
    expect(screen.getByRole('button', { name: 'Xoá khỏi phiếu' })).toBeDisabled()
  })
})

describe("FormInfoRow kind 'custom'", () => {
  it('nhãn trái chỉ để nhìn (không phải phần tử a11y), nửa phải là children, lỗi dưới dòng', async () => {
    await render(
      <FormInfoRow kind="custom" label="Đơn giá" error="Sai giá">
        <Text>phải</Text>
      </FormInfoRow>,
    )
    const label = screen.getByText('Đơn giá')
    expect(label.props.accessible).toBe(false)
    expect(label.props.importantForAccessibility).toBe('no')
    expect(screen.getByText('phải')).toBeOnTheScreen()
    expect(screen.getByRole('alert')).toHaveTextContent('Sai giá')
  })
})
