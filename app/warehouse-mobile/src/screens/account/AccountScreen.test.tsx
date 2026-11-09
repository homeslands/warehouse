import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { ActionSheetIOS } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { usePasswordNotice } from '@/features/change-password'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { AccountScreen } from './AccountScreen'

const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '2.3.4', ios: { buildNumber: '12' }, android: { versionCode: 12 } },
  },
}))

const user = {
  userName: 'root',
  phonenumber: '0900000001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  roleName: 'MANAGER',
  scope: [],
}

beforeAll(async () => {
  await initI18n()
})

afterEach(() => jest.restoreAllMocks())

beforeEach(async () => {
  resetFakeApi()
  mockNavigate.mockClear()
  usePasswordNotice.getState().clear()
  await changeLanguage('vi')
  useAuthStore.setState({ status: 'authenticated', user, endReason: null })
  useWarehouseStore.setState({
    current: { slug: 'wh-1', code: 'WH1', name: 'Kho Một', isManager: true },
    resolved: true,
    resolution: 'selected',
  })
})

describe('AccountScreen', () => {
  it('đầu trang căn giữa: tên lớn (header), chữ cái đầu, SĐT định dạng, chip vai trò; chân màn', async () => {
    await render(<AccountScreen />)
    // Tiêu đề "Tài khoản" là header native của Stack lồng, màn không tự vẽ.
    expect(screen.queryByRole('header', { name: 'Tài khoản' })).toBeNull()
    expect(screen.getByRole('header', { name: 'Nguyễn Văn A' })).toBeOnTheScreen()
    expect(screen.getByText('NA', { includeHiddenElements: true })).toBeOnTheScreen()
    expect(screen.getByText('0900 000 001')).toBeOnTheScreen()
    expect(screen.getByText('Quản lý')).toBeOnTheScreen()
    // jest: biến thể development → có nhãn Sandbox.
    expect(screen.getByText('Kho · 2.3.4 (12) · Sandbox')).toBeOnTheScreen()
  })

  it('nhóm viết thường "Làm việc" / "Cài đặt"; dòng "Kho" mang tên kho đang chọn', async () => {
    await render(<AccountScreen />)
    expect(screen.getByRole('header', { name: 'Làm việc' })).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Cài đặt' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho, Kho Một' })).toBeOnTheScreen()
    // Ô icon tối cho cả ba dòng (kho, ngôn ngữ, đổi mật khẩu); nhóm đăng xuất không có ô icon.
    expect(screen.getAllByTestId('icon-tile', { includeHiddenElements: true })).toHaveLength(3)
  })

  it('chưa có họ tên → tên lớn là SĐT định dạng + "Chưa đặt họ tên", không lặp SĐT', async () => {
    useAuthStore.setState({ user: { ...user, firstName: '', lastName: '' } })
    await render(<AccountScreen />)
    expect(screen.getByRole('header', { name: '0900 000 001' })).toBeOnTheScreen()
    expect(screen.getByText('Chưa đặt họ tên')).toBeOnTheScreen()
    expect(screen.getAllByText('0900 000 001')).toHaveLength(1)
    expect(screen.getByTestId('avatar-icon', { includeHiddenElements: true })).toBeOnTheScreen()
  })

  it('không có cả tên lẫn SĐT → lùi về userName', async () => {
    useAuthStore.setState({ user: { ...user, firstName: '', lastName: '', phonenumber: '' } })
    await render(<AccountScreen />)
    expect(screen.getByRole('header', { name: 'root' })).toBeOnTheScreen()
  })

  it('email hiện thành một dòng trong đầu trang khi có; rỗng thì không', async () => {
    useAuthStore.setState({ user: { ...user, email: 'a@b.vn' } })
    const view = await render(<AccountScreen />)
    expect(screen.getByText('a@b.vn')).toBeOnTheScreen()
    await view.unmount()
    useAuthStore.setState({ user: { ...user, email: '  ' } })
    await render(<AccountScreen />)
    expect(screen.queryByText('a@b.vn')).toBeNull()
    expect(screen.queryByText('Email')).toBeNull()
  })

  it('dòng "Kho" → mở bảng đổi kho', async () => {
    await render(<AccountScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Kho, Kho Một' }))
    expect(mockNavigate).toHaveBeenCalledWith('/switch-warehouse')
  })

  it('dòng Ngôn ngữ → mở sheet /language; đổi ngôn ngữ thì chữ trên màn đổi theo', async () => {
    await render(<AccountScreen />)
    expect(screen.getByText('Cài đặt')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    expect(mockNavigate).toHaveBeenCalledWith('/language')
    await act(async () => changeLanguage('en'))
    expect(await screen.findByText('Settings')).toBeOnTheScreen()
    expect(screen.getByText('Manager')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Language, English' })).toBeOnTheScreen()
  })

  it('Đổi mật khẩu → mở sheet /change-password; đổi xong thì hiện thông báo, mở lại thì ẩn', async () => {
    await render(<AccountScreen />)
    expect(screen.queryByText(/Đã đổi mật khẩu/)).toBeNull()
    await act(async () => usePasswordNotice.getState().show())
    expect(
      screen.getByText('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.'),
    ).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    expect(mockNavigate).toHaveBeenCalledWith('/change-password')
    expect(screen.queryByText(/Đã đổi mật khẩu/)).toBeNull()
  })

  it('nhóm đăng xuất: chữ đỏ căn giữa, không ô icon; bấm → hộp thoại gốc, Huỷ thì vẫn đăng nhập', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1))
    await render(<AccountScreen />)
    expect(screen.getByText('Đăng xuất')).toHaveStyle({ color: '#e7000b' })
    expect(screen.getByText('Đăng xuất mọi thiết bị')).toHaveStyle({ color: '#e7000b' })
    // Chỉ còn ô icon của các dòng phía trên (kho, ngôn ngữ, đổi mật khẩu).
    expect(screen.getAllByTestId('icon-tile', { includeHiddenElements: true })).toHaveLength(3)

    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Đăng xuất?',
      destructiveButtonIndex: 0,
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }))
    expect(sheet.mock.calls[1]![0]).toMatchObject({ title: 'Đăng xuất mọi thiết bị' })
    expect(useAuthStore.getState().status).toBe('authenticated')
    await act(async () => {})
  })

  it('đăng xuất mọi thiết bị đang chạy → dòng quay vòng và bị khoá', async () => {
    let release!: () => void
    route('post', '/auth/logout-all', () => new Promise((r) => (release = () => r(ok()))))
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0))
    await render(<AccountScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }))
    expect(
      await screen.findByRole('button', { name: 'Đăng xuất mọi thiết bị', busy: true }),
    ).toBeDisabled()
    await act(async () => release())
  })
})
