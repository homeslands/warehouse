// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, profile, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'

import { refreshCurrentUser, useAuthStore, type CurrentUser } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { draftStorageKey, useReceiveDraft } from '@/features/receive-checklist'
import { useScanNotice } from '@/screens/receive'
import { useStockFilter } from '@/screens/stock'
import { http } from '@/shared/api/http'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { clearTokens, getTokens, setTokens } from '@/shared/api/token-storage'

import { makeForm, makeItem } from '@/features/receive-checklist/model/fixtures'
import { wireSession } from './session-wiring'

const WH1 = { slug: 'wh-1', code: 'WH1', name: 'Kho 1', isManager: true }
const WH2 = { slug: 'wh-2', code: 'WH2', name: 'Kho 2', isManager: false }
const user = (over: Partial<CurrentUser> = {}) =>
  profile({ warehouses: [WH1, WH2], ...over }) as unknown as CurrentUser

const flush = () => new Promise((r) => setTimeout(r, 0))

let queryClient: QueryClient
let unwire: () => void

beforeEach(async () => {
  resetFakeApi()
  clearTokens()
  await AsyncStorage.clear()
  useAuthStore.setState({ status: 'loading', user: null, endReason: null })
  useWarehouseStore.getState().reset()
  queryClient = new QueryClient()
  unwire = wireSession(queryClient)
})

afterEach(() => unwire())

describe('wireSession', () => {
  it('interceptor kết thúc phiên qua endSession: token bị xoá, lý do được ghi', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ status: 'authenticated', user: user() })
    route('get', '/x', () => failure(401, 100003))
    route('post', '/auth/refresh', () => failure(401, 100004))
    await expect(http.get('/x')).rejects.toBeDefined()
    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      endReason: 'expired',
    })
  })

  it('kết thúc phiên → xoá cache react-query và reset store kho', async () => {
    queryClient.setQueryData(['k'], 1)
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ status: 'authenticated', user: user({ warehouses: [WH1] }) })
    await flush()
    expect(useWarehouseStore.getState().resolution).toBe('selected')

    useAuthStore.getState().endSession('revoked')
    expect(queryClient.getQueryData(['k'])).toBeUndefined()
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: null, current: null })
  })

  it('kết thúc phiên → xoá ô tìm kiếm/bộ lọc của tab Tồn kho', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user({ warehouses: [WH1] }) })
    await flush()
    useStockFilter.setState({ query: 'xi', level: 'low', typeSlug: 'son' })
    useAuthStore.getState().endSession('revoked')
    expect(useStockFilter.getState()).toMatchObject({
      query: '',
      level: undefined,
      typeSlug: undefined,
    })
  })

  it('kết thúc phiên → xoá bản nháp Nhận hàng trong bộ nhớ nhưng giữ bản đã lưu', async () => {
    const ctx = { userSlug: 'u1', warehouseSlug: 'wh-1', formSlug: 'pn-1' }
    await useReceiveDraft.getState().load(ctx, makeForm([makeItem(1)]))
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useAuthStore.getState().endSession('revoked')
    expect(useReceiveDraft.getState()).toMatchObject({ draft: null, ctx: null })
    await flush()
    expect(await AsyncStorage.getItem(draftStorageKey('u1', 'wh-1', 'pn-1'))).not.toBeNull()
  })

  it('đổi kho → xoá ô tìm kiếm/bộ lọc của tab Tồn kho; kho giữ nguyên thì không', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH1)
    useStockFilter.setState({ query: 'xi', level: 'low', typeSlug: 'son' })
    await useWarehouseStore.getState().select(WH1)
    expect(useStockFilter.getState().query).toBe('xi')
    await useWarehouseStore.getState().select(WH2)
    expect(useStockFilter.getState()).toMatchObject({
      query: '',
      level: undefined,
      typeSlug: undefined,
    })
  })

  it('kết thúc phiên → xoá thông báo quét không khớp của màn phiếu', () => {
    useScanNotice.getState().show('pn-1', '8934563')
    useAuthStore.getState().endSession('revoked')
    expect(useScanNotice.getState().notice).toBeNull()
  })

  it('đổi kho → xoá thông báo quét không khớp; kho giữ nguyên thì không', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH1)
    useScanNotice.getState().show('pn-1', '8934563')
    await useWarehouseStore.getState().select(WH1)
    expect(useScanNotice.getState().notice).not.toBeNull()
    await useWarehouseStore.getState().select(WH2)
    expect(useScanNotice.getState().notice).toBeNull()
  })

  it('kết thúc phiên → xoá thông báo mức phiếu của form 3 bước (useFormNotice)', () => {
    useFormNotice.getState().show({ kind: 'export', formSlug: 'new', message: 'Đã gộp' })
    useAuthStore.getState().endSession('revoked')
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('đổi kho → xoá thông báo mức phiếu; kho giữ nguyên thì không', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH1)
    useFormNotice.getState().show({ kind: 'import', formSlug: 'pn-1', message: 'Lỗi' })
    await useWarehouseStore.getState().select(WH1)
    expect(useFormNotice.getState().notice).not.toBeNull()
    await useWarehouseStore.getState().select(WH2)
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('gỡ dây → đổi kho không còn xoá bộ lọc', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH1)
    unwire()
    useStockFilter.setState({ query: 'xi' })
    await useWarehouseStore.getState().select(WH2)
    expect(useStockFilter.getState().query).toBe('xi')
    unwire = () => undefined
  })

  it('vào authenticated → resolveFor(user) chạy, select() dùng được', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    expect(useWarehouseStore.getState().resolution).toBe('choose')
    await expect(useWarehouseStore.getState().select(WH2)).resolves.toBeUndefined()
  })

  it('đã authenticated sẵn lúc nối dây → vẫn resolve', async () => {
    unwire()
    useAuthStore.setState({ status: 'authenticated', user: user({ warehouses: [WH1] }) })
    unwire = wireSession(queryClient)
    await flush()
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
  })

  it('nạp lại hồ sơ mà kho không đổi → không resolve lại (giữ lựa chọn đang có)', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH2)
    const spy = jest.spyOn(useWarehouseStore.getState(), 'resolveFor')
    useAuthStore.getState().setUser(user({ scope: ['NEW'] }))
    await flush()
    expect(spy).not.toHaveBeenCalled()
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
    spy.mockRestore()
  })

  it('nạp lại hồ sơ mà kho đang chọn bị gỡ → resolve lại', async () => {
    useAuthStore.setState({ status: 'authenticated', user: user() })
    await flush()
    await useWarehouseStore.getState().select(WH2)
    useAuthStore.getState().setUser(user({ warehouses: [WH1] }))
    await flush()
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
  })

  it('/auth/me sau đăng nhập → authenticated → resolve', async () => {
    route('get', '/auth/me', () => ok(profile({ warehouses: [WH1] })))
    useAuthStore.getState().startSession({ accessToken: 'a', refreshToken: 'r' })
    await refreshCurrentUser()
    await flush()
    expect(useWarehouseStore.getState().resolution).toBe('selected')
  })

  describe('nguồn danh sách kho theo vai trò', () => {
    const allWarehouses = () =>
      route('get', '/warehouses', () =>
        ok({
          items: [
            { slug: 'wh-9', code: 'WH9', name: 'Kho 9', isActive: false },
            { slug: 'wh-8', code: 'WH8', name: 'Kho 8', isActive: true },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
          totalPages: 1,
          hasNext: false,
        }),
      )

    it('ADMIN (có WAREHOUSE_READ) không gắn kho nào → GET /warehouses, choose (không phải none)', async () => {
      allWarehouses()
      useAuthStore.setState({
        status: 'authenticated',
        user: user({ roleName: 'ADMIN', scope: ['WAREHOUSE_READ'], warehouses: [] }),
      })
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(1)
      expect(useWarehouseStore.getState().resolution).toBe('choose')
      expect(useWarehouseStore.getState().warehouses?.map((w) => w.slug)).toEqual(['wh-8', 'wh-9'])
    })

    it('SUPER_ADMIN (scope rỗng, backend cho qua) → GET /warehouses', async () => {
      allWarehouses()
      useAuthStore.setState({
        status: 'authenticated',
        user: user({ roleName: 'SUPER_ADMIN', scope: [], warehouses: [WH1] }),
      })
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(1)
      expect(useWarehouseStore.getState().resolution).toBe('choose')
    })

    it('ADMIN bị thu WAREHOUSE_READ → giữ kho của /auth/me (GET /warehouses sẽ 403)', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        user: user({ roleName: 'ADMIN', scope: [], warehouses: [WH1] }),
      })
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(0)
      expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
    })

    it('MANAGER / vai trò tự tạo → kho của /auth/me, không gọi GET /warehouses', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        user: user({ roleName: 'MANAGER', scope: ['WAREHOUSE_READ'] }),
      })
      await flush()
      useAuthStore.getState().setUser(user({ roleName: 'KE_TOAN', scope: ['WAREHOUSE_READ'] }))
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(0)
      expect(useWarehouseStore.getState().resolution).toBe('choose')
    })

    it('ADMIN nạp lại hồ sơ (quay lại app) → kiểm lại danh sách kho (GET /warehouses), giữ kho đang chọn', async () => {
      allWarehouses()
      const admin = { roleName: 'ADMIN', scope: ['WAREHOUSE_READ'], warehouses: [] }
      useAuthStore.setState({ status: 'authenticated', user: user(admin) })
      await flush()
      await useWarehouseStore.getState().select(useWarehouseStore.getState().warehouses![0]!)
      useAuthStore.getState().setUser(user({ ...admin, warehouses: [WH1] }))
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(2)
      expect(useWarehouseStore.getState()).toMatchObject({
        resolution: 'selected',
        current: { slug: 'wh-8' },
      })
    })

    it('ADMIN quay lại app, kho đang chọn đã bị xoá trên web → resolve lại theo danh sách mới', async () => {
      allWarehouses()
      const admin = { roleName: 'ADMIN', scope: ['WAREHOUSE_READ'], warehouses: [] }
      useAuthStore.setState({ status: 'authenticated', user: user(admin) })
      await flush()
      await useWarehouseStore.getState().select(useWarehouseStore.getState().warehouses![0]!)
      route('get', '/warehouses', () =>
        ok({
          items: [{ slug: 'wh-9', code: 'WH9', name: 'Kho 9', isActive: true }],
          total: 1,
          page: 1,
          pageSize: 100,
          totalPages: 1,
          hasNext: false,
        }),
      )
      useAuthStore.getState().setUser(user(admin))
      await flush()
      await flush()
      expect(useWarehouseStore.getState()).toMatchObject({
        resolution: 'selected',
        current: { slug: 'wh-9' },
      })
    })

    it('MANAGER nạp lại hồ sơ không đổi kho → không gọi GET /warehouses', async () => {
      useAuthStore.setState({ status: 'authenticated', user: user() })
      await flush()
      useAuthStore.getState().setUser(user())
      await flush()
      expect(callsTo('get', '/warehouses')).toHaveLength(0)
    })
  })
})
