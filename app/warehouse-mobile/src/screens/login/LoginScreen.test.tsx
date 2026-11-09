import '@/shared/api/testing/fake-api'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { LoginScreen } from './LoginScreen'

const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '1' } } },
}))

beforeAll(async () => {
  await initI18n()
})

beforeEach(async () => {
  await changeLanguage('vi')
  useAuthStore.setState({ status: 'unauthenticated', user: null, endReason: null })
})

afterEach(() => jest.restoreAllMocks())

describe('LoginScreen', () => {
  it('biểu tượng + tên app + câu mô tả; hai ô có nhãn; chân màn có SANDBOX và phiên bản', async () => {
    await render(<LoginScreen />)
    expect(screen.getByRole('header', { name: 'Kho' })).toBeOnTheScreen()
    expect(screen.getByText('Nhập · xuất · tồn kho tại chỗ')).toBeOnTheScreen()
    expect(screen.getByLabelText('Số điện thoại')).toBeOnTheScreen()
    expect(screen.getByLabelText('Mật khẩu')).toBeOnTheScreen()
    expect(screen.getByText('Quên mật khẩu? Liên hệ quản trị viên')).toBeOnTheScreen()
    // jest: APP_VARIANT không đặt → development → luôn hiện nhãn môi trường.
    expect(screen.getByTestId('env-badge')).toBeOnTheScreen()
    expect(screen.getByText('Phiên bản 1.0.0 (1)')).toBeOnTheScreen()
  })

  it('viên ngôn ngữ mở sheet /language; đổi ngôn ngữ thì màn đăng nhập đổi theo', async () => {
    await render(<LoginScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    expect(mockNavigate).toHaveBeenCalledWith('/language')
    await act(async () => changeLanguage('en'))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
    expect(screen.getByText('Version 1.0.0 (1)')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Language, English' })).toBeOnTheScreen()
  })

  it('phiên kết thúc vì hết hạn → báo lý do', async () => {
    useAuthStore.setState({ endReason: 'expired' })
    await render(<LoginScreen />)
    expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeOnTheScreen()
  })
})
