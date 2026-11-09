// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, profile, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { clearTokens } from '@/shared/api/token-storage'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { LoginForm } from './LoginForm'

const tokens = { accessToken: 'acc-new', refreshToken: 'ref-new' }
const loginOk = ok({ ...tokens, expireTime: '', expireTimeRefreshToken: '' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  resetFakeApi()
  clearTokens()
  useAuthStore.setState({ status: 'unauthenticated', user: null, endReason: null })
})

const phone = () => screen.getByLabelText('Số điện thoại')
const password = () => screen.getByLabelText('Mật khẩu')

async function fillAndSubmit() {
  await fireEvent.changeText(phone(), '0900000001')
  await fireEvent.changeText(password(), 'secret-1')
  await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }))
}

describe('LoginForm', () => {
  it('bỏ trống → hiện lỗi validate, không gọi API', async () => {
    await render(<LoginForm />)
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeOnTheScreen()
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeOnTheScreen()
    expect(callsTo('post', '/auth/login')).toHaveLength(0)
  })

  it('401 mã 100001 → câu sai thông tin ngay dưới form, mật khẩu vẫn giữ', async () => {
    route('post', '/auth/login', () => failure(401, 100001))
    await render(<LoginForm />)
    await fillAndSubmit()
    expect(await screen.findByText('Số điện thoại hoặc mật khẩu không đúng')).toBeOnTheScreen()
    expect(password()).toHaveDisplayValue('secret-1')
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('sửa ô sau khi lỗi → lỗi của lần gửi trước biến mất', async () => {
    route('post', '/auth/login', () => failure(401, 100001))
    await render(<LoginForm />)
    await fillAndSubmit()
    await screen.findByText('Số điện thoại hoặc mật khẩu không đúng')
    await fireEvent.changeText(password(), 'secret-2')
    expect(screen.queryByText('Số điện thoại hoặc mật khẩu không đúng')).toBeNull()
  })

  it('429 → câu "thử lại sau"', async () => {
    route('post', '/auth/login', () => failure(429))
    await render(<LoginForm />)
    await fillAndSubmit()
    expect(await screen.findByText(/thử lại sau/i)).toBeOnTheScreen()
  })

  it('thành công → startSession nhận đúng token trả về, rồi nạp hồ sơ', async () => {
    const startSession = jest.spyOn(useAuthStore.getState(), 'startSession')
    route('post', '/auth/login', (config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        phonenumber: '0900000001',
        password: 'secret-1',
      })
      return loginOk
    })
    route('get', '/auth/me', () => ok(profile()))
    await render(<LoginForm />)
    await fillAndSubmit()
    await screen.findByRole('button', { name: 'Đăng nhập' })
    expect(startSession).toHaveBeenCalledWith(tokens)
    expect(callsTo('get', '/auth/me')[0]?.auth).toBe('Bearer acc-new')
    expect(useAuthStore.getState().status).toBe('authenticated')
    startSession.mockRestore()
  })

  it('nút gửi bị khoá khi đang gửi, bấm lần hai không gửi thêm', async () => {
    let release!: () => void
    route(
      'post',
      '/auth/login',
      () => new Promise((resolve) => (release = () => resolve(failure(401, 100001)))),
    )
    await render(<LoginForm />)
    await fillAndSubmit()
    const busy = await screen.findByRole('button', { name: 'Đang đăng nhập...' })
    expect(busy).toBeDisabled()
    await fireEvent.press(busy)
    expect(callsTo('post', '/auth/login')).toHaveLength(1)
    release()
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeEnabled()
  })

  // Quyết định của người dùng (đảo lại quyết định cũ): ô này chỉ nhận SỐ — tài khoản chữ như `root`
  // không đăng nhập được trên app.
  it('ô số điện thoại dùng bàn phím số, gợi ý số điện thoại', async () => {
    await render(<LoginForm />)
    expect(phone().props).toMatchObject({
      keyboardType: 'phone-pad',
      textContentType: 'telephoneNumber',
      autoComplete: 'tel',
    })
  })

  it('hiện số đã nhóm khi gõ, nhưng gửi lên chỉ chữ số', async () => {
    let body: unknown
    route('post', '/auth/login', (config) => {
      body = JSON.parse(config.data as string)
      return failure(401, 100001)
    })
    await render(<LoginForm />)
    await fireEvent.changeText(phone(), '0340000')
    expect(phone()).toHaveDisplayValue('0340 000')
    await fireEvent.changeText(phone(), '0340 000 000')
    expect(phone()).toHaveDisplayValue('0340 000 000')
    await fireEvent.changeText(password(), 'secret-1')
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }))
    await screen.findByText('Số điện thoại hoặc mật khẩu không đúng')
    expect(body).toEqual({ phonenumber: '0340000000', password: 'secret-1' })
  })

  it('dán chuỗi có chữ/dấu → chỉ giữ chữ số', async () => {
    await render(<LoginForm />)
    await fireEvent.changeText(phone(), '+84-912.345')
    expect(phone()).toHaveDisplayValue('8491 234 5')
  })

  it('số tự điền dạng quốc tế "+84 …" → đổi về 0…, gửi chữ số nội địa', async () => {
    let body: unknown
    route('post', '/auth/login', (config) => {
      body = JSON.parse(config.data as string)
      return failure(401, 100001)
    })
    await render(<LoginForm />)
    await fireEvent.changeText(phone(), '+84 912 345 678')
    expect(phone()).toHaveDisplayValue('0912 345 678')
    await fireEvent.changeText(password(), 'secret-1')
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }))
    await screen.findByText('Số điện thoại hoặc mật khẩu không đúng')
    expect(body).toEqual({ phonenumber: '0912345678', password: 'secret-1' })
  })

  it('phím "Đi" ở ô mật khẩu gửi form', async () => {
    route('post', '/auth/login', () => failure(401, 100001))
    await render(<LoginForm />)
    await fireEvent.changeText(phone(), '0900000001')
    await fireEvent.changeText(password(), 'secret-1')
    expect(password().props.returnKeyType).toBe('go')
    await fireEvent(password(), 'submitEditing')
    expect(await screen.findByText('Số điện thoại hoặc mật khẩu không đúng')).toBeOnTheScreen()
    expect(callsTo('post', '/auth/login')).toHaveLength(1)
  })

  it('mật khẩu có nút hiện/ẩn', async () => {
    await render(<LoginForm />)
    expect(password().props.secureTextEntry).toBe(true)
    await fireEvent.press(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password().props.secureTextEntry).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password().props.secureTextEntry).toBe(true)
  })
})
