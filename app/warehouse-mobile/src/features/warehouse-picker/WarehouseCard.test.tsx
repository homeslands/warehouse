import { fireEvent, render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { WarehouseCard } from './WarehouseCard'

const WH = { slug: 'wh-1', code: 'MEKONG', name: 'Công ty MEKONG', isManager: true }

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('WarehouseCard', () => {
  it('là nút, nhãn "tên, mã, vai trò", báo trạng thái chọn; bấm gọi onPress', async () => {
    const onPress = jest.fn()
    await render(<WarehouseCard warehouse={WH} selected={false} onPress={onPress} />)
    const card = screen.getByRole('button', { name: 'Công ty MEKONG, MEKONG, Quản lý' })
    expect(card).not.toBeSelected()
    await fireEvent.press(card)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Quản lý')).toBeOnTheScreen()
  })

  it('đang chọn → thẻ báo đã chọn và khung thẻ mang testID theo slug', async () => {
    await render(<WarehouseCard warehouse={WH} selected onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: /Công ty MEKONG/ })).toBeSelected()
    expect(screen.getByTestId('warehouse-card-wh-1')).toHaveStyle({ borderWidth: 2 })
    expect(screen.getByText('MEKONG')).toBeOnTheScreen()
  })

  it('thành viên → chip "Thành viên" dạng viên thuốc', async () => {
    await render(
      <WarehouseCard
        warehouse={{ ...WH, isManager: false }}
        selected={false}
        onPress={jest.fn()}
      />,
    )
    expect(screen.getByText('Thành viên')).toBeOnTheScreen()
  })
})
