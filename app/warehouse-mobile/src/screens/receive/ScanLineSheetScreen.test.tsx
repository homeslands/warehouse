// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import type { AvailableMaterial } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  MAX_ITEMS,
  stopDraftPersistence,
  useReceiveDraft,
  useScanNotice,
} from '@/features/receive-checklist'
import { makeDraft, makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useLineFocus } from '@/shared/lib/line-focus'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

import { ScanLineSheetScreen } from './ScanLineSheetScreen'

const mockNavigate = jest.fn()
const mockBack = jest.fn()
const mockParams: { compose?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const AV = '/warehouses/wh-a/import-forms/available-materials'
const KG = { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true }
const mat = (slug: string, code: string, over: Partial<AvailableMaterial> = {}) =>
  ({
    slug,
    code,
    name: `Vật tư ${code}`,
    baseUnitSlug: 'kg',
    quantity: 5,
    suppliers: [],
    units: [KG],
    ...over,
  }) as AvailableMaterial
const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })

let client: QueryClient
const show = () =>
  render(
    <QueryClientProvider client={client}>
      <ScanLineSheetScreen />
    </QueryClientProvider>,
    { wrapper: SafeAreaWrapper },
  )
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

function seed(lines = [makeLine(1), makeLine(2)]) {
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
    draft: makeDraft(lines),
    saving: false,
  })
}
const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.requireMock('expo-camera').__permission.reset()
  mockNavigate.mockClear()
  mockBack.mockClear()
  delete mockParams.compose
  resetFakeApi()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useScanNotice.getState().clear()
  useLineFocus.getState().clear()
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      userSlug: 'u',
      userName: 'an',
      scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'],
      warehouses: [WH],
    } as never,
  })
})
afterEach(async () => {
  await act(async () => useReceiveDraft.getState().reset())
  stopDraftPersistence()
})

describe('ScanLineSheetScreen', () => {
  it('khớp → đóng sheet, mở bảng sửa đúng dòng', async () => {
    seed()
    await show()
    await scan(' vt2 ')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'm-2|u-2' },
    })
    expect(useScanNotice.getState().notice).toBeNull()
  })

  it('nhiều đơn vị cùng mã → dòng đầu chưa kiểm', async () => {
    seed([
      makeLine(1, { materialCode: 'VT-A', key: 'a|kg', checked: true }),
      makeLine(2, { materialCode: 'VT-A', key: 'a|bao' }),
      makeLine(3, { materialCode: 'VT-A', key: 'a|thung' }),
    ])
    await show()
    await scan('VT-A')
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'a|bao' },
    })
  })

  it('nhiều đơn vị cùng mã, đều đã kiểm → dòng đầu', async () => {
    seed([
      makeLine(1, { materialCode: 'VT-A', key: 'a|kg', checked: true }),
      makeLine(2, { materialCode: 'VT-A', key: 'a|bao', checked: true }),
    ])
    await show()
    await scan('VT-A')
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/import-line', params: { key: 'a|kg' } })
  })

  it('không khớp → đóng sheet, ghi mã để màn phiếu báo; không mở dòng nào', async () => {
    seed()
    await show()
    await scan('8934563')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useScanNotice.getState().notice).toEqual({
      formSlug: 'pn-1',
      code: '8934563',
      reason: 'notFound',
    })
  })

  it('đang Lưu / Xác nhận → chỉ đóng, không mở dòng, không báo', async () => {
    seed()
    await show()
    await act(async () => useReceiveDraft.getState().setSaving(true))
    await scan('VT1')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useScanNotice.getState().notice).toBeNull()
  })

  describe('màn soạn (?compose=1)', () => {
    beforeEach(() => {
      mockParams.compose = '1'
    })

    it('compose: match existing line asks step 2 to open its sheet', async () => {
      seed()
      await show()
      await scan(' vt2 ')
      expect(mockBack).toHaveBeenCalledTimes(1)
      // Sheet này chỉ đóng; bước 2 (được focus lại) mở sheet `/import-line?compose=1` của dòng đó.
      expect(mockNavigate).not.toHaveBeenCalled()
      expect(useLineFocus.getState().request).toEqual({
        kind: 'import',
        formSlug: 'pn-1',
        key: 'm-2|u-2',
      })
      expect(callsTo('get', AV)).toHaveLength(0)
    })

    it('compose: code found in available materials adds a line', async () => {
      seed()
      route('get', AV, () => page([mat('m-9', 'VT9-X'), mat('m-8', 'VT9')]))
      await show()
      await scan('vt9')
      await settle()
      const added = useReceiveDraft.getState().draft!.lines.at(-1)!
      expect(added).toMatchObject({
        materialSlug: 'm-8',
        unitSlug: 'kg',
        quantity: 0,
        unitPrice: 0,
        checked: false,
      })
      expect(useReceiveDraft.getState().draft!.lines).toHaveLength(3)
      expect(useLineFocus.getState().request).toEqual({
        kind: 'import',
        formSlug: 'pn-1',
        key: added.key,
      })
      expect(mockBack).toHaveBeenCalledTimes(1)
      expect(mockNavigate).not.toHaveBeenCalled()
      expect(useScanNotice.getState().notice).toBeNull()
    })

    describe('bên bán của dòng quét thêm (phiếu đã có)', () => {
      const S2 = { slug: 's2', code: 'N2', name: 'Hà Tiên' }
      const S3 = { slug: 's3', code: 'N3', name: 'Minh Phát' }
      const line = (n: number, slug: string) =>
        makeLine(n, { supplierSlug: slug, supplierName: `Tên ${slug}` })
      function signIn(scope: string[]) {
        useAuthStore.setState({
          status: 'authenticated',
          user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
        })
      }
      const EDIT = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']
      async function scanAdd(lines: ReturnType<typeof makeLine>[]) {
        useReceiveDraft.setState({
          ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
          draft: makeDraft(lines, { header: { ...makeDraft([]).header, supplierSlug: 's1' } }),
          saving: false,
        })
        route('get', AV, () => page([mat('m-9', 'VT9', { suppliers: [S3] })]))
        await show()
        await scan('VT9')
        await settle()
        return useReceiveDraft.getState().draft!.lines.at(-1)!
      }

      it('nhiều bên bán + SUPPLIER_READ → theo luật lineSupplier (NCC duy nhất của vật tư)', async () => {
        signIn([...EDIT, 'SUPPLIER_READ'])
        const added = await scanAdd([line(1, 's1'), line(2, 's1'), line(3, S2.slug)])
        expect(added).toMatchObject({ materialSlug: 'm-9', supplierSlug: 's3' })
      })

      it('một bên bán, không SUPPLIER_READ → luật lineSupplier', async () => {
        signIn(EDIT)
        const added = await scanAdd([line(1, 's1'), line(2, 's1')])
        expect(added).toMatchObject({ materialSlug: 'm-9', supplierSlug: 's3' })
      })

      it('một bên bán + SUPPLIER_READ → mang bên bán của phiếu', async () => {
        signIn([...EDIT, 'SUPPLIER_READ'])
        const added = await scanAdd([line(1, 's1'), line(2, 's1')])
        expect(added).toMatchObject({
          materialSlug: 'm-9',
          supplierSlug: 's1',
          supplierName: 'Tên s1',
          materialSupplierSlugs: ['s3'],
        })
      })
    })

    it('compose: không có trên phiếu lẫn trong vật tư của kho (chỉ khớp một phần) → báo notFound', async () => {
      seed()
      route('get', AV, () => page([mat('m-9', 'VT9-X')]))
      await show()
      await scan('VT9')
      await settle()
      expect(useReceiveDraft.getState().draft!.lines).toHaveLength(2)
      expect(useScanNotice.getState().notice).toEqual({
        formSlug: 'pn-1',
        code: 'VT9',
        reason: 'notFound',
        canCreate: false,
      })
      expect(mockBack).toHaveBeenCalledTimes(1)
    })

    it('✕ trong lúc đang tra mã (async) rồi request về → chỉ back() MỘT lần; thẻ đáy "Đang tra mã…" tới khi xong', async () => {
      seed()
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      route('get', AV, async () => {
        await gate
        return page([mat('m-9', 'VT9')])
      })
      await show()
      await scan('VT9')
      expect(screen.getByText('Đang tra mã…')).toBeOnTheScreen()
      await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
      expect(mockBack).toHaveBeenCalledTimes(1)
      release()
      await settle()
      expect(mockBack).toHaveBeenCalledTimes(1)
    })

    describe('không thấy trong kho → tra danh mục (cần MATERIAL_READ)', () => {
      const MATS = '/materials'
      const withRead = () =>
        useAuthStore.setState({
          status: 'authenticated',
          user: {
            userSlug: 'u',
            userName: 'an',
            scope: [
              'IMPORT_FORM_READ',
              'IMPORT_FORM_CREATE',
              'IMPORT_FORM_UPDATE_DRAFT',
              'MATERIAL_READ',
            ],
            warehouses: [WH],
          } as never,
        })
      const cat = (items: unknown[]) =>
        ok({ items, total: items.length, page: 1, pageSize: 5, totalPages: 1, hasNext: false })
      const run = async () => {
        seed()
        route('get', AV, () => page([]))
        await show()
        await scan('VT9')
        await settle()
      }

      it('có trong danh mục → notInWarehouse kèm vật tư, không thêm dòng', async () => {
        withRead()
        route('get', MATS, () =>
          cat([
            {
              slug: 'm9',
              code: 'VT9',
              name: 'Dây điện',
              warehouses: [],
              suppliers: [{ slug: 's2', code: 'S2', name: 'NCC 2', extra: 1 }],
            },
          ]),
        )
        await run()
        expect(useScanNotice.getState().notice).toEqual({
          formSlug: 'pn-1',
          code: 'VT9',
          reason: 'notInWarehouse',
          material: {
            slug: 'm9',
            code: 'VT9',
            name: 'Dây điện',
            suppliers: [{ slug: 's2', code: 'S2', name: 'NCC 2' }],
          },
        })
        expect(useReceiveDraft.getState().draft!.lines).toHaveLength(2)
        expect(mockBack).toHaveBeenCalledTimes(1)
      })
      it('danh mục không có → notFound, canCreate = true', async () => {
        withRead()
        route('get', MATS, () => cat([{ slug: 'x', code: 'VT90', name: 'Khác' }]))
        await run()
        expect(useScanNotice.getState().notice).toMatchObject({
          reason: 'notFound',
          canCreate: true,
        })
      })
      it('danh mục cho biết vật tư ĐÃ ở kho này (tra kho lỗi) → coi như lỗi: notFound, canCreate = false', async () => {
        withRead()
        route('get', MATS, () =>
          cat([
            {
              slug: 'm9',
              code: 'VT9',
              name: 'Dây điện',
              warehouses: [{ slug: 'wh-a' }],
              suppliers: [],
            },
          ]),
        )
        await run()
        expect(useScanNotice.getState().notice).toMatchObject({
          reason: 'notFound',
          canCreate: false,
        })
      })
      it('tra danh mục lỗi → notFound, canCreate = false', async () => {
        withRead()
        route('get', MATS, () => failure(500))
        await run()
        expect(useScanNotice.getState().notice).toMatchObject({
          reason: 'notFound',
          canCreate: false,
        })
      })
      it('thiếu MATERIAL_READ → không tra danh mục, notFound, canCreate = false', async () => {
        await run()
        expect(callsTo('get', MATS)).toHaveLength(0)
        expect(useScanNotice.getState().notice).toMatchObject({
          reason: 'notFound',
          canCreate: false,
        })
      })
    })

    it('compose without IMPORT_FORM_CREATE: matches lines on the form, never looks up / adds new materials', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        user: {
          userSlug: 'u',
          userName: 'an',
          scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'],
          warehouses: [WH],
        } as never,
      })
      seed()
      route('get', AV, () => page([mat('m-8', 'VT8')]))
      const view = await show()
      await scan('VT8')
      await settle()
      expect(callsTo('get', AV)).toHaveLength(0)
      expect(useReceiveDraft.getState().draft!.lines).toHaveLength(2)
      expect(useScanNotice.getState().notice).toEqual({
        formSlug: 'pn-1',
        code: 'VT8',
        reason: 'notOnForm',
      })
      expect(mockBack).toHaveBeenCalledTimes(1)
      await view.unmount()

      // Mã đã có trên phiếu vẫn khớp → focus dòng.
      mockBack.mockClear()
      useScanNotice.getState().clear()
      await show()
      await scan('VT2')
      expect(useLineFocus.getState().request).toEqual({
        kind: 'import',
        formSlug: 'pn-1',
        key: 'm-2|u-2',
      })
    })

    it('compose: vật tư chưa có đơn vị → báo noUnit; phiếu đủ 200 dòng → báo full, không tra', async () => {
      seed()
      route('get', AV, () => page([mat('m-8', 'VT8', { units: [] })]))
      const view = await show()
      await scan('VT8')
      await settle()
      expect(useScanNotice.getState().notice?.reason).toBe('noUnit')
      await view.unmount()

      useScanNotice.getState().clear()
      resetFakeApi()
      seed(Array.from({ length: MAX_ITEMS }, (_, i) => makeLine(i + 1)))
      await show()
      await scan('VT-MOI')
      await settle()
      expect(callsTo('get', AV)).toHaveLength(0)
      expect(useScanNotice.getState().notice).toEqual({
        formSlug: 'pn-1',
        code: 'VT-MOI',
        reason: 'full',
      })
    })
  })
})
