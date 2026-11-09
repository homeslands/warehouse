import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { WarehouseList } from './WarehouseList'

const wh = (n: number, over: Partial<UserWarehouse> = {}): UserWarehouse => ({
  slug: `wh-${n}`,
  code: `WH${n}`,
  name: `Kho số ${n}`,
  isManager: false,
  ...over,
})

function signedIn(warehouses: UserWarehouse[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userName: 'root', roleName: 'MANAGER', scope: [], warehouses },
    endReason: null,
  })
}

/** ADMIN không là thành viên kho nào; store kho giữ danh sách đã tải từ `GET /warehouses`. */
function adminWith(all: UserWarehouse[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userName: 'admin', roleName: 'ADMIN', scope: [], warehouses: [] },
    endReason: null,
  })
  useWarehouseStore.setState({ warehouses: all, resolved: true, resolution: 'choose' })
}

beforeEach(() => useWarehouseStore.getState().reset())

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('WarehouseList', () => {
  it('tiêu đề đếm số kho, chip vai trò, dấu chọn theo `selectedSlug`, chú thích ghi nhớ', async () => {
    signedIn([wh(1, { name: 'Kho Tổng', isManager: true }), wh(2, { name: 'Kho Thủ Đức' })])
    await render(<WarehouseList selectedSlug="wh-1" onPressWarehouse={jest.fn()} />)

    expect(screen.getByRole('header', { name: '2 kho của bạn' })).toBeOnTheScreen()
    expect(screen.getByText('Quản lý')).toBeOnTheScreen()
    expect(screen.getByText('Thành viên')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: /^Kho Tổng/ })).toBeSelected()
    expect(screen.getByRole('button', { name: /^Kho Thủ Đức/ })).not.toBeSelected()
    expect(screen.getByText(/được ghi nhớ trên máy này/)).toBeOnTheScreen()
    expect(screen.queryByLabelText('Tìm theo tên hoặc mã kho')).toBeNull()
  })

  it('bấm dòng → báo kho được bấm cho nơi gọi', async () => {
    const list = [wh(1), wh(2)]
    signedIn(list)
    const onPressWarehouse = jest.fn()
    await render(<WarehouseList selectedSlug={undefined} onPressWarehouse={onPressWarehouse} />)
    await fireEvent.press(screen.getByRole('button', { name: /^Kho số 2/ }))
    expect(onPressWarehouse).toHaveBeenCalledWith(list[1])
  })

  it('từ 6 kho có ô tìm kiếm, lọc theo tên không dấu hoặc mã', async () => {
    signedIn([1, 2, 3, 4, 5].map((n) => wh(n)).concat(wh(6, { name: 'Kho Thủ Đức', code: 'TD' })))
    await render(<WarehouseList selectedSlug={undefined} onPressWarehouse={jest.fn()} />)
    const search = screen.getByLabelText('Tìm theo tên hoặc mã kho')

    await fireEvent.changeText(search, 'thu duc')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('Kho Thủ Đức')).toBeOnTheScreen()

    await fireEvent.changeText(search, 'wh3')
    expect(screen.getByText('Kho số 3')).toBeOnTheScreen()
    expect(screen.getAllByRole('button')).toHaveLength(1)

    await fireEvent.changeText(search, 'không có')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Không có kho nào khớp “không có”.')).toBeOnTheScreen()
  })

  it('variant="cards": tiêu đề viết thường "Kho của bạn · N", mỗi kho một thẻ, ô tìm viên thuốc', async () => {
    signedIn([1, 2, 3, 4, 5, 6].map((n) => wh(n)))
    await render(<WarehouseList variant="cards" selectedSlug="wh-2" onPressWarehouse={jest.fn()} />)
    expect(screen.getByRole('header', { name: 'Kho của bạn · 6' })).toBeOnTheScreen()
    expect(screen.queryByRole('header', { name: '6 kho của bạn' })).toBeNull()
    expect(screen.getAllByTestId(/^warehouse-card-wh-/)).toHaveLength(6)
    expect(screen.getByRole('button', { name: /^Kho số 2/ })).toBeSelected()
    expect(screen.getByLabelText('Tìm theo tên hoặc mã kho').parent).toHaveStyle({
      borderRadius: 999,
      minHeight: 40,
    })
  })

  it('ADMIN: hiện MỌI kho đã tải (không phải user.warehouses), kho đã tắt có viên "Đã tắt"', async () => {
    adminWith([
      wh(1, { name: 'Kho Tổng', isActive: true }),
      wh(2, { name: 'Kho Cũ', isActive: false }),
      wh(3, { name: 'Kho Mới', isActive: true, isManager: true }),
    ])
    await render(<WarehouseList selectedSlug={undefined} onPressWarehouse={jest.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('header', { name: '3 kho của bạn' })).toBeOnTheScreen()
    expect(screen.getAllByText('Đã tắt')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Kho Cũ, WH2, Đã tắt' })).toBeOnTheScreen()
    // ADMIN không là thành viên: không gắn chip "Thành viên"; kho mình quản lý vẫn có "Quản lý".
    expect(screen.queryByText('Thành viên')).toBeNull()
    expect(screen.getByRole('button', { name: 'Kho Mới, WH3, Quản lý' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho Tổng, WH1' })).toBeOnTheScreen()
  })

  it('ADMIN, bảng đổi kho (cards): cũng có viên "Đã tắt"', async () => {
    adminWith([wh(1), wh(2, { name: 'Kho Cũ', isActive: false })])
    await render(<WarehouseList variant="cards" selectedSlug="wh-1" onPressWarehouse={jest.fn()} />)
    expect(screen.getAllByTestId(/^warehouse-card-wh-/)).toHaveLength(2)
    expect(screen.getAllByText('Đã tắt')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Kho Cũ, WH2, Đã tắt' })).toBeOnTheScreen()
  })

  it('ADMIN nhiều kho: có ô tìm kiếm, lọc theo tên không dấu / mã trên danh sách đã tải', async () => {
    adminWith(
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => wh(n))
        .concat(wh(10, { name: 'Kho Thủ Đức', code: 'TD' })),
    )
    await render(<WarehouseList selectedSlug={undefined} onPressWarehouse={jest.fn()} />)
    const search = screen.getByLabelText('Tìm theo tên hoặc mã kho')
    await fireEvent.changeText(search, 'thu duc')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await fireEvent.changeText(search, 'wh9')
    expect(screen.getByText('Kho số 9')).toBeOnTheScreen()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('MANAGER: danh sách vẫn là user.warehouses (store kho không có danh sách tải về)', async () => {
    signedIn([wh(1), wh(2)])
    await render(<WarehouseList selectedSlug={undefined} onPressWarehouse={jest.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getAllByText('Thành viên')).toHaveLength(2)
    expect(screen.queryByText('Đã tắt')).toBeNull()
  })

  it('ADMIN: danh sách trong store đổi (tải lại khi quay lại app) → dòng mới + viên "Đã tắt" hiện ngay', async () => {
    adminWith([wh(1), wh(2)])
    await render(<WarehouseList selectedSlug="wh-1" onPressWarehouse={jest.fn()} />)
    expect(screen.queryByText('Đã tắt')).toBeNull()
    await act(async () =>
      useWarehouseStore.setState({ warehouses: [wh(1, { isActive: false }), wh(2), wh(3)] }),
    )
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Kho số 1, WH1, Đã tắt' })).toBeSelected()
  })
})
