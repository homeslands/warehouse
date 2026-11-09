import { fireEvent, render, screen } from '@testing-library/react-native'

import { WarehouseBarButton } from './WarehouseBarButton'

describe('WarehouseBarButton', () => {
  it('nút mang nhãn trợ năng riêng, hiện tên ngắn; bấm gọi onPress', async () => {
    const onPress = jest.fn()
    await render(
      <WarehouseBarButton
        label="WH1"
        accessibilityLabel="Kho: Kho Tổng, đổi kho"
        onPress={onPress}
      />,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Kho: Kho Tổng, đổi kho' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('WH1')).toBeOnTheScreen()
  })

  it('đổi kho → hiện tên mới (chữ cũ trượt ra), nhãn trợ năng theo kho mới', async () => {
    const view = await render(
      <WarehouseBarButton
        label="WH1"
        accessibilityLabel="Kho: Kho Tổng, đổi kho"
        onPress={jest.fn()}
      />,
    )
    await view.rerender(
      <WarehouseBarButton
        label="WH2"
        accessibilityLabel="Kho: Kho Hai, đổi kho"
        onPress={jest.fn()}
      />,
    )
    expect(screen.getByText('WH2')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho: Kho Hai, đổi kho' })).toBeOnTheScreen()
  })
})
