import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ActionSheetIOS, Alert, Pressable, Text } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { setTokens } from '@/shared/api/token-storage'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { LogoutButton } from './LogoutButton'
import { useLogoutAction } from './useLogoutAction'

/** Vỏ tối thiểu để lái hook "mọi thiết bị" (màn Tài khoản vẽ nó thành dòng danh sách). */
function LogoutAllHarness() {
  const { request, pending } = useLogoutAction('all-devices')
  return (
    <Pressable accessibilityRole="button" onPress={() => void request()}>
      <Text>{pending ? 'busy' : 'all'}</Text>
    </Pressable>
  )
}

/** Giả lập người dùng bấm nút thứ `index` trong action sheet gốc. */
const answerSheet = (index: number) =>
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_options, callback) => callback(index))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  resetFakeApi()
  setTokens({ accessToken: 'a', refreshToken: 'r' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userName: 'root', roleName: 'MANAGER', scope: [] },
    endReason: null,
  })
})

afterEach(() => jest.restoreAllMocks())

describe('LogoutButton (thiết bị này)', () => {
  it('bấm → hỏi lại bằng action sheet gốc (nút đỏ); xác nhận mới đăng xuất', async () => {
    route('post', '/auth/logout', () => ok())
    const sheet = answerSheet(0)
    await render(<LogoutButton />)
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }))

    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Đăng xuất?',
      options: ['Đăng xuất', 'Huỷ'],
      destructiveButtonIndex: 0,
    })
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
    expect(callsTo('post', '/auth/logout')).toHaveLength(1)
  })

  it('Huỷ → không gọi API, vẫn đăng nhập', async () => {
    answerSheet(1)
    await render(<LogoutButton />)
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(callsTo('post', '/auth/logout')).toHaveLength(0)
    expect(useAuthStore.getState().status).toBe('authenticated')
  })
})

describe('useLogoutAction (mọi thiết bị)', () => {
  it('xác nhận → gọi logout-all rồi kết thúc phiên', async () => {
    route('post', '/auth/logout-all', () => ok())
    const sheet = answerSheet(0)
    await render(<LogoutAllHarness />)
    await fireEvent.press(screen.getByRole('button'))
    expect(sheet.mock.calls[0]![0]).toMatchObject({ title: 'Đăng xuất mọi thiết bị' })
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
    expect(callsTo('post', '/auth/logout-all')).toHaveLength(1)
  })

  it('server lỗi → hộp thoại báo lỗi, phiên còn nguyên, bấm lại được', async () => {
    route('post', '/auth/logout-all', () => ({
      status: 500,
      data: { statusCode: 500, message: 'x' },
    }))
    answerSheet(0)
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    // 500 không mã lỗi → `errorMessage` cảnh báo dev (mã chưa có trong bảng): đúng ý, không in ra.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(<LogoutAllHarness />)
    await fireEvent.press(screen.getByRole('button'))
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1))
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(screen.getByText('all')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button'))
    await waitFor(() => expect(callsTo('post', '/auth/logout-all')).toHaveLength(2))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[api-error]'))
  })

  it('đang gửi → dòng báo bận, bấm thêm không hỏi lại', async () => {
    let release!: () => void
    route('post', '/auth/logout-all', () => new Promise((r) => (release = () => r(ok()))))
    const sheet = answerSheet(0)
    await render(<LogoutAllHarness />)
    await fireEvent.press(screen.getByRole('button'))
    expect(await screen.findByText('busy')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button'))
    expect(sheet).toHaveBeenCalledTimes(1)
    expect(callsTo('post', '/auth/logout-all')).toHaveLength(1)
    release()
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
  })
})
