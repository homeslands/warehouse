import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ActionSheetIOS } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { setTokens } from '@/shared/api/token-storage'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { NoAccessScreen } from './NoAccessScreen'

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
  useWarehouseStore.setState({ resolution: 'none' })
})

afterEach(() => jest.restoreAllMocks())

describe('NoAccessScreen', () => {
  it('Đăng xuất → hỏi lại bằng hộp thoại gốc, xác nhận thì đăng xuất', async () => {
    route('post', '/auth/logout', () => ok())
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0))
    await render(<NoAccessScreen />)
    expect(screen.getByText('Tài khoản chưa được gán vào kho nào.')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Đăng xuất?',
      destructiveButtonIndex: 0,
    })
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
    expect(callsTo('post', '/auth/logout')).toHaveLength(1)
  })

  it('Thử lại: nạp lại /auth/me VÀ resolve lại kho (ADMIN: tải lại GET /warehouses, có kho → chọn)', async () => {
    const admin = {
      userSlug: 'ad',
      userName: 'admin',
      roleName: 'ADMIN',
      scope: [],
      warehouses: [],
    }
    useAuthStore.setState({ status: 'authenticated', user: admin, endReason: null })
    const empty = { total: 0, page: 1, pageSize: 100, totalPages: 1, hasNext: false }
    route('get', '/warehouses', () => ok({ ...empty, items: [] }))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState().resolution).toBe('none')

    route('get', '/auth/me', () => ok(admin))
    route('get', '/warehouses', () =>
      ok({ ...empty, items: [{ slug: 'wh-1', code: 'WH1', name: 'Kho 1', isActive: true }] }),
    )
    await render(<NoAccessScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(useWarehouseStore.getState().resolution).toBe('selected'))
    expect(callsTo('get', '/auth/me')).toHaveLength(1)
    expect(callsTo('get', '/warehouses')).toHaveLength(2)
  })
})
