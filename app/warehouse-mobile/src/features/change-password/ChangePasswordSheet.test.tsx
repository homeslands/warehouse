// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { ActionSheetIOS } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { getTokens, setTokens } from '@/shared/api/token-storage'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'

import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ChangePasswordSheet } from './ChangePasswordSheet'
import { usePasswordNotice } from './password-notice.store'

jest.mock('expo-router', () => ({
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const newTokens = {
  accessToken: 'acc-new',
  refreshToken: 'ref-new',
  expireTime: '',
  expireTimeRefreshToken: '',
}

/** Hộp xác nhận gốc (action sheet iOS): trả lời ngay bằng nút thứ `index` (0 = Đổi mật khẩu). */
let sheet: jest.SpyInstance
const answerConfirm = (index: number) =>
  sheet.mockImplementation((_options, callback) => callback(index))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {})
  resetFakeApi()
  setTokens({ accessToken: 'acc-old', refreshToken: 'ref-old' })
  usePasswordNotice.getState().clear()
})

afterEach(() => jest.restoreAllMocks())

async function setup() {
  const onClose = jest.fn()
  await render(<ChangePasswordSheet onClose={onClose} />)
  return { onClose }
}

const fill = async (current: string, next: string, confirm: string) => {
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu hiện tại'), current)
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), next)
  await fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu mới'), confirm)
}
const submit = () => pressSheetDone()

describe('ChangePasswordSheet', () => {
  it('header native: tiêu đề "Đổi mật khẩu", ✕ Huỷ, ✓ Xong; không còn nút gửi/huỷ ở cuối', async () => {
    const { onClose } = await setup()
    expect(sheetHeader().title).toBe('Đổi mật khẩu')
    expect(sheetHeader().cancel?.label).toBe('Huỷ')
    expect(sheetHeader().done?.label).toBe('Xong')
    expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Đổi mật khẩu' })).toBeNull()
    await pressSheetCancel()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bỏ trống → lỗi từng ô, không hỏi lại, không gọi API', async () => {
    await setup()
    await submit()
    expect(await screen.findByText('Vui lòng nhập mật khẩu hiện tại')).toBeOnTheScreen()
    expect(screen.getByText('Vui lòng nhập mật khẩu mới')).toBeOnTheScreen()
    expect(sheet).not.toHaveBeenCalled()
    expect(callsTo('post', '/auth/change-password')).toHaveLength(0)
  })

  it('mật khẩu mới dưới 8 ký tự → lỗi tại ô', async () => {
    await setup()
    await fill('old', '1234567', '1234567')
    await submit()
    expect(await screen.findByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeOnTheScreen()
    expect(callsTo('post', '/auth/change-password')).toHaveLength(0)
  })

  it('mật khẩu mới trùng mật khẩu cũ → lỗi, không gọi API', async () => {
    await setup()
    await fill('matkhau-cu', 'matkhau-cu', 'matkhau-cu')
    await submit()
    expect(await screen.findByText('Mật khẩu mới phải khác mật khẩu hiện tại')).toBeOnTheScreen()
    expect(callsTo('post', '/auth/change-password')).toHaveLength(0)
  })

  it('nhập lại không khớp → lỗi, không gọi API', async () => {
    await setup()
    await fill('old', 'matkhau-1', 'matkhau-2')
    await submit()
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeOnTheScreen()
    expect(callsTo('post', '/auth/change-password')).toHaveLength(0)
  })

  it('✓ → hỏi lại bằng hộp thoại gốc; Huỷ thì không gọi API', async () => {
    answerConfirm(1)
    const { onClose } = await setup()
    await fill('old', 'matkhau-moi', 'matkhau-moi')
    await submit()
    await waitFor(() => expect(sheet).toHaveBeenCalledTimes(1))
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Đổi mật khẩu?',
      message: 'Các thiết bị khác sẽ bị đăng xuất sau khi đổi mật khẩu.',
      options: ['Đổi mật khẩu', 'Huỷ'],
    })
    expect(callsTo('post', '/auth/change-password')).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('phím "Đi" ở ô cuối = bấm ✓ (hỏi lại); hiện tại → mới → nhập lại bằng phím "Tiếp"', async () => {
    answerConfirm(1)
    await setup()
    await fill('old', 'matkhau-moi', 'matkhau-moi')
    expect(screen.getByLabelText('Mật khẩu hiện tại').props.returnKeyType).toBe('next')
    expect(screen.getByLabelText('Mật khẩu mới').props.returnKeyType).toBe('next')
    const last = screen.getByLabelText('Nhập lại mật khẩu mới')
    expect(last.props.returnKeyType).toBe('go')
    await fireEvent(last, 'submitEditing')
    await waitFor(() => expect(sheet).toHaveBeenCalledTimes(1))
  })

  it('xác nhận → gọi API; thành công thay token, bật thông báo, rung, đóng sau ~350ms', async () => {
    let body: unknown
    route('post', '/auth/change-password', (config) => {
      body = JSON.parse(config.data as string)
      return ok({ tokens: newTokens })
    })
    answerConfirm(0)
    const { onClose } = await setup()
    await fill('old', 'matkhau-moi', 'matkhau-moi')
    jest.useFakeTimers()
    try {
      await submit()
      await act(async () => jest.advanceTimersByTime(0))
      await waitFor(() =>
        expect(getTokens()).toEqual({ accessToken: 'acc-new', refreshToken: 'ref-new' }),
      )
      expect(body).toEqual({ currentPassword: 'old', newPassword: 'matkhau-moi' })
      expect(usePasswordNotice.getState().changed).toBe(true)
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      )
      expect(onClose).not.toHaveBeenCalled()
      await act(async () => jest.advanceTimersByTime(SHEET_CLOSE_DELAY_MS))
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('sai mật khẩu hiện tại (100013) → lỗi ở ô đó, rung lỗi, token giữ nguyên, sheet mở', async () => {
    route('post', '/auth/change-password', () => failure(422, 100013))
    answerConfirm(0)
    const { onClose } = await setup()
    await fill('wrong', 'matkhau-moi', 'matkhau-moi')
    await submit()

    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeOnTheScreen()
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    expect(getTokens()).toEqual({ accessToken: 'acc-old', refreshToken: 'ref-old' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveDisplayValue('wrong')
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveDisplayValue('matkhau-moi')
    expect(sheetHeader().done?.disabled).toBeFalsy()
  })

  it('lỗi khác → thông báo dưới form, ✓ dùng lại được', async () => {
    route('post', '/auth/change-password', () => failure(500))
    // 500 không mã lỗi → `errorMessage` cảnh báo dev (mã chưa có trong bảng): đúng ý, không in ra.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    answerConfirm(0)
    const { onClose } = await setup()
    await fill('old', 'matkhau-moi', 'matkhau-moi')
    await submit()

    expect(await screen.findByText(/Đã có lỗi xảy ra/)).toBeOnTheScreen()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
    expect(onClose).not.toHaveBeenCalled()
    expect(sheetHeader().done?.disabled).toBeFalsy()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[api-error]'))
    warn.mockRestore()
  })

  it('phiên kết thúc trong lúc đang đổi → không ghi token mới, không bật thông báo', async () => {
    let release!: () => void
    route(
      'post',
      '/auth/change-password',
      () => new Promise((resolve) => (release = () => resolve(ok({ tokens: newTokens })))),
    )
    answerConfirm(0)
    useAuthStore.setState({
      status: 'authenticated',
      user: { userName: 'root', roleName: 'MANAGER', scope: [] },
      endReason: null,
    })
    await setup()
    await fill('old', 'matkhau-moi', 'matkhau-moi')
    await submit()
    await waitFor(() => expect(callsTo('post', '/auth/change-password')).toHaveLength(1))

    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(async () => release())
    expect(getTokens()).toBeNull()
    expect(usePasswordNotice.getState().changed).toBe(false)
  })
})
