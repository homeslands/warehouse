/**
 * `/export-line` trên cây expo-router THẬT (`renderRouter`) — Review Focus 2 của plan wizard-apple: sheet là
 * route `formSheet` của Stack GỐC có Stack lồng riêng (như `SessionGate` + `SheetStackLayout`). Lối rời thật:
 * vuốt xuống iOS (`nativeDismissCancelled` khi `preventNativeDismiss`), ✓ / ✕ trên header gốc
 * (`pressHeaderBarButtonItem`). Hành vi chi tiết của thân sheet: `ExportLineSheetScreen.test.tsx`.
 */
// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  type RenderRouterResult,
} from 'expo-router/testing-library'
import type { ReactNode } from 'react'
import { Text } from 'react-native'

import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'

import { ExportLineSheetScreen } from './ExportLineSheetScreen'

jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const confirm = jest.mocked(confirmAction)

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

const ROUTES = {
  _layout: () => (
    <Stack>
      <Stack.Screen name="export-line" options={{ presentation: 'formSheet' }} />
    </Stack>
  ),
  index: () => <Text>bước 2</Text>,
  'export-line/_layout': () => <Stack />,
  'export-line/index': ExportLineSheetScreen,
}

type State = { index: number; routes: { name: string; state?: State }[] }
/** Tên các route đang hoạt động của Stack GỐC. */
function rootStack(r: RenderRouterResult): string[] {
  const s = r.getRouterState() as unknown as State
  const root = s.routes[0]?.name === '__root' ? s.routes[0].state! : s
  return root.routes.slice(0, root.index + 1).map((x) => x.name)
}
/** Màn GỐC của route sheet trên Stack gốc (iOS vẽ formSheet là `RNSModalScreen`). */
function sheetScreen() {
  const [sheet] = screen.container.queryAll(
    (n) => n.type === 'RNSModalScreen' && n.props.stackPresentation === 'formSheet',
  )
  if (!sheet) throw new Error('no formSheet screen')
  return sheet
}
/** Bấm mục gốc ✕ / ✓ của header sheet (RN Screens gửi `pressHeaderBarButtonItem` với `buttonId`). */
async function pressHeaderItem(side: 'left' | 'right') {
  const prop = side === 'left' ? 'headerLeftBarButtonItems' : 'headerRightBarButtonItems'
  const config = screen.container
    .queryAll((n) => n.type === 'RNSScreenStackHeaderConfig')
    .findLast((n) => (n.props[prop] as unknown[] | undefined)?.length)
  const item = (config?.props[prop] as { buttonId?: string }[] | undefined)?.find((i) => i.buttonId)
  if (!config || !item) throw new Error(`no ${side} header item`)
  await act(async () =>
    fireEvent(config, 'pressHeaderBarButtonItem', { nativeEvent: { buttonId: item.buttonId } }),
  )
}
const swipeDown = () =>
  act(async () =>
    fireEvent(sheetScreen(), 'nativeDismissCancelled', { nativeEvent: { dismissCount: 1 } }),
  )

let client: QueryClient
const settle = async () => {
  await act(() => jest.runAllTimersAsync())
  for (let n = 0; n < 20 && client.isFetching() > 0; n++) await act(() => jest.runAllTimersAsync())
}
const lines = () => useExportDraft.getState().draft!.lines

async function openSheet() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const r = await renderRouter(ROUTES, { initialUrl: '/', wrapper })
  await act(() => router.push({ pathname: '/export-line', params: { key: 'm-1|u-1|' } }))
  await settle()
  expect(rootStack(r)).toEqual(['index', 'export-line'])
  return r
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  confirm.mockReset()
  jest.mocked(chooseAction).mockReset()
  resetFakeApi()
  await AsyncStorage.clear()
  useExportDraft.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: ['EXPORT_FORM_READ'], warehouses: [WH] } as never,
  })
  route('get', '/warehouses/wh-a/materials', () =>
    page([
      stockItem({
        materialSlug: 'm-1',
        materialCode: 'VT1',
        materialName: 'Vật tư 1',
        baseUnit: { slug: 'u-1', code: 'H', name: 'hộp' },
        units: [
          { unitSlug: 'u-1', unitCode: 'H', unitName: 'hộp', conversionRate: 1, isBaseUnit: true },
          {
            unitSlug: 'u-thung',
            unitCode: 'T',
            unitName: 'thùng',
            conversionRate: 12,
            isBaseUnit: false,
          },
        ],
      }),
    ]),
  )
  route('get', '/warehouses/wh-a/material-batches', () => page([]))
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'px-1' },
    draft: makeDraft([makeLine(1, { unitSlug: 'u-1' })]),
  })
})
afterEach(() => {
  stopExportDraftPersistence()
  useExportDraft.getState().reset()
  client.clear()
  jest.useRealTimers()
})

describe('/export-line trên Stack thật', () => {
  it('no edits → swipe-down leaves at once, nothing asked', async () => {
    const r = await openSheet()
    expect(sheetScreen().props.preventNativeDismiss).toBe(false)
    await act(() => router.back())
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('edits → swipe-down is blocked and asks; Tiếp tục sửa stays with the text; Bỏ thay đổi leaves without writing', async () => {
    const r = await openSheet()
    await act(async () => fireEvent.changeText(screen.getByTestId('export-line-sheet-qty'), '99'))
    expect(sheetScreen().props.preventNativeDismiss).toBe(true)

    confirm.mockResolvedValueOnce(false)
    await swipeDown()
    await settle()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bỏ thay đổi?' }))
    expect(rootStack(r)).toEqual(['index', 'export-line'])
    expect(screen.getByTestId('export-line-sheet-qty').props.value).toBe('99')

    confirm.mockResolvedValueOnce(true)
    await swipeDown()
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(lines()[0]!.quantity).toBe(10)
  })

  it('edits → ✕ asks; Bỏ thay đổi leaves once without asking again', async () => {
    const r = await openSheet()
    await act(async () => fireEvent.changeText(screen.getByLabelText('Ghi chú'), 'gấp'))
    confirm.mockResolvedValueOnce(true)
    await pressHeaderItem('left')
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rootStack(r)).toEqual(['index'])
    expect(lines()[0]!.note).toBeNull()
  })

  it('quantity only (same key) + ✓ → writes, leaves, never asks', async () => {
    const r = await openSheet()
    await act(async () => fireEvent.changeText(screen.getByTestId('export-line-sheet-qty'), '12'))
    expect(sheetScreen().props.preventNativeDismiss).toBe(true)
    await pressHeaderItem('right')
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
    expect(lines()[0]!.quantity).toBe(12)
  })

  it('unit change (key changes) + ✓ → writes once, leaves exactly one screen, never asks', async () => {
    const r = await openSheet()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Đơn vị hộp, chạm để đổi' })),
    )
    await act(async () => fireEvent.changeText(screen.getByTestId('export-line-sheet-qty'), '2'))
    expect(sheetScreen().props.preventNativeDismiss).toBe(true)
    await pressHeaderItem('right')
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
    expect(lines().map((l) => [l.key, l.quantity])).toEqual([['m-1|u-thung|', 2]])
  })
})
