// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { Platform, TextInput } from 'react-native'

import type { ExportForm } from '@/entities/export-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  exportDraftStorageKey,
  newExportDraft,
  stopExportDraftPersistence,
  useExportDraft,
  type ExportDraft,
} from '@/features/export-draft'
import { makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { resetAttachmentUploads } from '@/features/form-attachment'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { lightColors } from '@/shared/theme/tokens'
import {
  wizardMenuItem,
  wizardMenuLabels,
  wizardRightItems,
} from '@/shared/ui/testing/wizard-header'

import { ExportInfoStepScreen } from './ExportInfoStepScreen'

type MockRoute = { key: string; name: string; params?: { formSlug: string } }
const mockStack: { routes: MockRoute[] } = { routes: [] }
const mockState = () => ({ index: mockStack.routes.length - 1, routes: mockStack.routes })
const mockRouteKey = { current: 'info' }
const mockParams: { formSlug: string } = { formSlug: 'new' }
const mockDispatch = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockBack = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: mockBack,
  }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    canGoBack: () => mockStack.routes.length > 1,
    getState: mockState,
  }),
  useRoute: () => ({ key: mockRouteKey.current }),
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))
jest.mock('expo-router/react-navigation', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').reactNavigationWith(() => mockState()),
)
jest.mock('@/shared/lib/useWizardNav', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').wizardNavWithLeaveSpies(),
)
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const LIST_URL = '/warehouses/wh-a/export-forms'
const FORM_URL = `${LIST_URL}/px-1`
const NEW_KEY = exportDraftStorageKey('u', 'wh-a', 'new')

const form2 = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2)], { warehouseSlug: 'wh-a', ...over })

const ALL = [
  'EXPORT_FORM_READ',
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT',
]

/** Stack modal = [bước 1] (màn đầu modal: "+" của danh sách, hay bước thấp nhất thay vào đáy). */
function open(formSlug: string) {
  mockParams.formSlug = formSlug
  mockStack.routes = [{ key: 'info', name: '[formSlug]/info', params: { formSlug } }]
  mockRouteKey.current = 'info'
}

let client: QueryClient
async function settled() {
  await act(async () => {
    const t = () => new Promise((r) => setTimeout(r, 0))
    await t()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await t()
    await t()
    await t()
  })
}
async function show() {
  const view = await render(
    <QueryClientProvider client={client}>
      <ExportInfoStepScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}

const store = () => useExportDraft.getState()
const field = (label: string) => screen.getByLabelText(label)
const nextButton = () => screen.getByRole('button', { name: 'Tiếp tục' })
type ButtonItem = { label: string; disabled?: boolean; onPress: () => void }
const items = (side: 'left' | 'right'): ButtonItem[] =>
  ((side === 'left'
    ? mockHeader.options.unstable_headerLeftItems
    : mockHeader.options.unstable_headerRightItems)?.({ tintColor: undefined, canGoBack: true }) ??
    []) as NativeStackHeaderItem[] as never
const headerItem = (side: 'left' | 'right', label: string) =>
  items(side).find((i) => i.label === label)
/** Mục `label` của menu `⋯` (menu gốc iOS). */
const menuItem = (label: string) => wizardMenuItem(mockHeader.options, label)
const menuLabels = () => wizardMenuLabels(mockHeader.options)

async function storedNew(d: ExportDraft) {
  await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
  notifyManager.setScheduler((callback) => callback())
})

afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)))

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  useFormNotice.getState().reset()
  mockHeader.options = {}
  open('new')
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: ALL, warehouses: [WH] } as never,
  })
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
})

afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('ExportInfoStepScreen — phiếu mới', () => {
  it('new form: step bar shows step 1 current, type pills open with Sản xuất selected', async () => {
    await show()
    expect(mockHeader.options.title).toBe('Phiếu xuất mới')
    const step1 = screen.getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')
    expect(step1).toBeSelected()
    // Phiếu mới chỉ tiến bằng "Tiếp tục": bước 2 / 3 khoá.
    expect(screen.getByLabelText('Bước 2 trên 3, Vật tư, chưa tới')).toBeDisabled()
    expect(screen.getByLabelText('Bước 3 trên 3, Xác nhận, chưa tới')).toBeDisabled()
    // Loại = dòng chọn "Sản xuất" (không còn hàng viên luôn mở).
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('button', { name: 'Loại, Sản xuất' })).toBeOnTheScreen()
    expect(field('Mã phiếu').props.value).toMatch(/^PX-\d{8}-\d{4}$/)
  })

  it('required and optional fields are in two groups', async () => {
    await show()
    const required = screen.getByTestId('export-group-required')
    const optional = screen.getByTestId('export-group-optional')
    for (const id of ['type', 'code', 'purchaseOrder', 'receiver']) {
      expect(within(required).getByTestId(`export-field-${id}`)).toBeOnTheScreen()
      expect(within(optional).queryByTestId(`export-field-${id}`)).toBeNull()
    }
    for (const id of ['invoiceCode', 'note']) {
      expect(within(optional).getByTestId(`export-field-${id}`)).toBeOnTheScreen()
      expect(within(required).queryByTestId(`export-field-${id}`)).toBeNull()
    }
  })

  it('type row shows Sản xuất and choosing Bán sets header.type', async () => {
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Loại, Sản xuất' }))
    const arg = jest.mocked(chooseAction).mock.calls.at(-1)![0]
    expect(arg.actions.map((a) => a.label)).toEqual([
      'Sản xuất',
      'Bán',
      'Chuyển kho',
      'Huỷ',
      'Khác',
    ])
    await settled()
    expect(store().draft!.header.type).toBe('SALE')
    expect(screen.getByRole('button', { name: 'Loại, Bán' })).toBeOnTheScreen()
  })

  it('Android: type row opens inline options (no action sheet); choosing one sets the type and closes', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android')
    try {
      await show()
      expect(screen.queryByTestId('export-type-options')).toBeNull()
      await fireEvent.press(screen.getByRole('button', { name: 'Loại, Sản xuất' }))
      expect(chooseAction).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Loại, Sản xuất' })).toBeExpanded()
      expect(screen.getAllByRole('radio')).toHaveLength(5)
      await fireEvent.press(screen.getByRole('radio', { name: 'Huỷ' }))
      expect(store().draft!.header.type).toBe('DISPOSAL')
      expect(screen.queryByTestId('export-type-options')).toBeNull()
      expect(screen.getByRole('button', { name: 'Loại, Huỷ' })).toBeCollapsed()
    } finally {
      os.restore()
    }
  })

  it('type row: cancelling the action sheet keeps the type', async () => {
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Loại, Sản xuất' }))
    await settled()
    expect(store().draft!.header.type).toBe('PRODUCTION')
  })

  it('Tiếp tục disabled with Còn thiếu: Người nhận', async () => {
    await storedNew(newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9' }))
    await show()
    expect(screen.getByText('Còn thiếu: Người nhận')).toBeOnTheScreen()
    // Trông như khoá nhưng vẫn bấm được; trình đọc màn hình nghe còn thiếu gì.
    expect(nextButton()).toHaveStyle({ backgroundColor: lightColors.fill })
    expect(nextButton().props.accessibilityHint).toBe('Còn thiếu: Người nhận')
  })

  it('Tiếp tục khi người nhận trống → không chuyển bước; rung lỗi, lỗi ô hiện, focus ô Người nhận', async () => {
    await storedNew(newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9' }))
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    await show()
    focus.mockClear()
    expect(screen.queryByText('Cần nhập người nhận.')).toBeNull()
    await fireEvent.press(nextButton())
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByText('Cần nhập người nhận.')).toBeOnTheScreen()
    expect(
      jest
        .mocked(jest.requireMock('expo-haptics').notificationAsync as jest.Mock)
        .mock.calls.filter(([type]) => type === 'error'),
    ).toHaveLength(1)
    expect(
      focus.mock.contexts.map(
        (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
      ),
    ).toEqual(['Người nhận'])
    focus.mockRestore()
  })

  it('bản trắng: gợi ý liệt kê mọi ô bắt buộc còn trống theo thứ tự màn hình', async () => {
    await show()
    expect(screen.getByText('Còn thiếu: Số PO, Người nhận')).toBeOnTheScreen()
  })

  it('filling receiver enables Tiếp tục which pushes /export-form/new/edit', async () => {
    await storedNew(newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9' }))
    await show()
    await fireEvent.changeText(field('Người nhận'), 'Tổ hàn A')
    expect(screen.queryByText(/^Còn thiếu/)).toBeNull()
    expect(nextButton()).toBeEnabled()
    expect(nextButton()).not.toHaveStyle({ backgroundColor: lightColors.fill })
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/edit',
      params: { formSlug: 'new' },
    })
  })

  it('✕ exits to the list', async () => {
    await show()
    expect(mockHeader.options.headerBackVisible).toBe(false)
    await act(async () => headerItem('left', 'Đóng')!.onPress())
    // Đóng modal (danh sách nằm dưới, trong tab).
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
    expect(leaveCount()).toBe(1)
    // Bản nháp trên máy được giữ (không hỏi, không xoá).
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store().draft).not.toBeNull()
  })

  it('Lưu nháp is a disabled menu item until savable; pressing it saves after confirm', async () => {
    await storedNew(newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Bếp' }))
    await show()
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    const d = store().draft!
    await act(async () =>
      store().replace({ ...d, lines: [makeLine(1, { base: null, quantity: 2 })] }),
    )
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: false })
    route('post', LIST_URL, () => ok(form2({ slug: 'px-9' })))
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(callsTo('post', LIST_URL)).toHaveLength(1)
  })

  it('no Save draft text button in header', async () => {
    await show()
    // Bên phải chỉ còn `⋯` (menu gốc) — không còn nút chữ "Lưu nháp" (tiêu đề không bị cắt).
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['menu'])
    expect(headerItem('right', 'Lưu nháp')).toBeUndefined()
    // Tiêu đề hai dòng: phụ đề "Bước 1/3 · Thông tin".
    expect(typeof mockHeader.options.headerTitle).toBe('function')
  })

  it('progress is inside the scroll content', async () => {
    await show()
    const scroll = screen.getByTestId('export-info-scroll')
    expect(within(scroll).getByTestId('export-wizard-steps-1')).toBeOnTheScreen()
    expect(within(scroll).getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')).toBeSelected()
  })

  it('external replace(draft) resyncs header fields', async () => {
    await show()
    // Ô đang focus mà trường của nó KHÔNG bị đổi từ ngoài: giữ chữ đang gõ (kể cả khoảng trắng cuối).
    await fireEvent(field('Số PO'), 'focus')
    await fireEvent.changeText(field('Số PO'), 'PO-7 ')
    const d = store().draft!
    await act(async () =>
      store().replace({ ...d, header: { ...d.header, receiver: 'Bếp Z', note: 'Giao 9h' } }),
    )
    expect(field('Người nhận').props.value).toBe('Bếp Z')
    expect(field('Ghi chú').props.value).toBe('Giao 9h')
    expect(field('Số PO').props.value).toBe('PO-7 ')
    await fireEvent(field('Số PO'), 'blur')
    const e = store().draft!
    await act(async () => store().replace({ ...e, header: { ...e.header, purchaseOrder: 'PO-2' } }))
    expect(field('Số PO').props.value).toBe('PO-2')
    // Loại đổi từ ngoài → viên chọn theo.
    await act(async () => store().replace({ ...e, header: { ...e.header, type: 'TRANSFER' } }))
    expect(screen.getByRole('button', { name: 'Loại, Chuyển kho' })).toBeOnTheScreen()
  })

  it('focused field + external replace of its value → field shows the merged value, also after blur', async () => {
    await show()
    await fireEvent(field('Số PO'), 'focus')
    await fireEvent.changeText(field('Số PO'), 'PO-đang-gõ')
    const d = store().draft!
    await act(async () =>
      store().replace({ ...d, header: { ...d.header, purchaseOrder: 'PO-SERVER' } }),
    )
    expect(field('Số PO').props.value).toBe('PO-SERVER')
    await fireEvent(field('Số PO'), 'blur')
    expect(field('Số PO').props.value).toBe('PO-SERVER')
    expect(store().draft!.header.purchaseOrder).toBe('PO-SERVER')
  })

  it('focused field + external replace → field resynced BEFORE the next keystroke; typing never writes the pre-replace text back', async () => {
    await show()
    await fireEvent(field('Người nhận'), 'focus')
    await fireEvent.changeText(field('Người nhận'), 'Bếp cũ')
    const d = store().draft!
    await act(async () => store().replace({ ...d, header: { ...d.header, receiver: 'Bếp mới' } }))
    expect(field('Người nhận').props.value).toBe('Bếp mới')
    const writes: string[] = []
    const unsubscribe = useExportDraft.subscribe((st) => {
      if (st.draft) writes.push(st.draft.header.receiver)
    })
    await fireEvent.changeText(field('Người nhận'), `${field('Người nhận').props.value}A`)
    unsubscribe()
    expect(store().draft!.header.receiver).toBe('Bếp mớiA')
    expect(writes.some((w) => w.startsWith('Bếp cũ'))).toBe(false)
  })

  it('thông báo mức phiếu (useFormNotice) của đúng phiếu hiện ở đáy; của phiếu khác thì không', async () => {
    await show()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'export', formSlug: 'px-2', message: 'Phiếu khác' }),
    )
    expect(screen.queryByText('Phiếu khác')).toBeNull()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'export', formSlug: 'new', message: 'Đã gộp' }),
    )
    expect(screen.getByText('Đã gộp')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(useFormNotice.getState().notice).toBeNull()
  })
})

describe('ExportInfoStepScreen — phiếu đã có', () => {
  beforeEach(() => {
    open('px-1')
    route('get', FORM_URL, () => ok(form2()))
  })

  it('tiêu đề "Sửa phiếu"; Lưu nháp khoá khi chưa đổi gì; bước 2 chạm được → về bước 2', async () => {
    await show()
    expect(mockHeader.options.title).toBe('Sửa phiếu')
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByLabelText('Bước 2 trên 3, Vật tư, đã xong'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/edit',
      params: { formSlug: 'px-1' },
    })
    await fireEvent.changeText(field('Người nhận'), 'Bếp Z')
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: false })
  })

  it('⋯ → Xoá nháp (có quyền xoá) như màn soạn', async () => {
    await show()
    expect(menuLabels()).toEqual(['Lưu nháp', 'Xoá nháp'])
    expect(menuItem('Xoá nháp')).toMatchObject({ destructive: true })
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await act(async () => menuItem('Xoá nháp')!.onPress())
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0]).toMatchObject({ destructive: true })
  })
})

// Chuyển từ màn soạn một trang (ExportEditScreen, đã thay bằng các bước): các ô đầu phiếu nay ở bước 1.
describe('ExportInfoStepScreen — ô đầu phiếu (phiếu mới)', () => {
  const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/
  const wait = (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

  it('phiếu mới mở với bản trắng: mã gợi ý, loại Sản xuất, ô bắt buộc / tuỳ chọn; chưa ghi trên máy', async () => {
    await show()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(callsTo('get', `${LIST_URL}/new`)).toHaveLength(0)
    const code = field('Mã phiếu').props.value as string
    expect(code).toMatch(BUSINESS_CODE_REGEX)
    expect(store().draft!.header).toMatchObject({ code, type: 'PRODUCTION', receiver: '' })
    expect(field('Người nhận').props.placeholder).toBe('Bắt buộc')
    expect(field('Số PO').props.placeholder).toBe('Bắt buộc')
    expect(field('Số HĐ').props.placeholder).toBe('Tuỳ chọn')
    // Chưa đổi gì: ⋯ chỉ có "Lưu nháp" khoá (bản trắng chưa có gì để bỏ).
    expect(menuLabels()).toEqual(['Lưu nháp'])
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    await wait(350)
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('gõ người nhận → ghi ngay vào bản nháp (đã chuẩn hoá), giữ chữ đang gõ; lần sửa đầu → lưu trên máy, có ⋯', async () => {
    await show()
    await fireEvent.changeText(field('Người nhận'), ' Tổ hàn A ')
    expect(store().draft!.header.receiver).toBe('Tổ hàn A')
    expect(field('Người nhận').props.value).toBe(' Tổ hàn A ')
    await wait(350)
    expect(JSON.parse((await AsyncStorage.getItem(NEW_KEY))!)).toMatchObject({
      header: { receiver: 'Tổ hàn A' },
    })
    expect(menuLabels()).toEqual(['Lưu nháp', 'Bỏ phiếu mới'])
  })

  it('mã phiếu viết hoa khi gõ; HĐ / ghi chú bỏ trống → null', async () => {
    await show()
    await fireEvent.changeText(field('Mã phiếu'), 'px-abc')
    expect(field('Mã phiếu').props.value).toBe('PX-ABC')
    await fireEvent.changeText(field('Số HĐ'), ' HD-7 ')
    expect(store().draft!.header).toMatchObject({ code: 'PX-ABC', invoiceCode: 'HD-7' })
    await fireEvent.changeText(field('Số HĐ'), '  ')
    await fireEvent.changeText(field('Ghi chú'), '')
    expect(store().draft!.header).toMatchObject({ invoiceCode: null, note: null })
  })

  it('lỗi ô đầu phiếu hiện sau khi rời ô lần đầu (không hiện khi đang gõ)', async () => {
    await show()
    await fireEvent(field('Số PO'), 'focus')
    await fireEvent.changeText(field('Số PO'), '')
    expect(screen.queryByText('Cần nhập số PO.')).toBeNull()
    await fireEvent(field('Số PO'), 'blur')
    expect(screen.getByText('Cần nhập số PO.')).toBeOnTheScreen()
    await fireEvent.changeText(field('Mã phiếu'), '-AB')
    await fireEvent(field('Mã phiếu'), 'blur')
    expect(screen.getByText('Mã phiếu gồm 2–32 chữ, số hoặc dấu gạch ngang.')).toBeOnTheScreen()
    await fireEvent.changeText(field('Người nhận'), 'x'.repeat(256))
    await fireEvent(field('Người nhận'), 'blur')
    expect(screen.getByText('Người nhận tối đa 255 ký tự.')).toBeOnTheScreen()
    await fireEvent.changeText(field('Số PO'), 'PO-3')
    expect(screen.queryByText('Cần nhập số PO.')).toBeNull()
  })

  it('Lưu nháp phiếu mới trùng mã (101404) → ở lại, báo dưới ô Mã phiếu; sửa mã thì hết báo', async () => {
    const d = newExportDraft({ code: 'PX-TRUNG', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = [makeLine(1, { base: null })]
    await storedNew(d)
    route('post', LIST_URL, () => failure(409, 101404))
    route('get', LIST_URL, () =>
      ok({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 0, hasNext: false }),
    )
    await show()
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByText('Mã phiếu đã tồn tại.')).toBeOnTheScreen()
    await fireEvent.changeText(field('Mã phiếu'), 'PX-MOI')
    expect(screen.queryByText('Mã phiếu đã tồn tại.')).toBeNull()
  })
})

describe('ExportInfoStepScreen — ô đầu phiếu (phiếu đã có)', () => {
  beforeEach(() => {
    open('px-1')
    route('get', FORM_URL, () => ok(form2()))
  })

  it('nhóm Thông tin điền sẵn từ bản nháp', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Loại, Sản xuất' })).toBeOnTheScreen()
    expect(field('Mã phiếu').props.value).toBe('PX-1')
    expect(field('Số PO').props.value).toBe('PO-1')
    expect(field('Người nhận').props.value).toBe('Bếp A')
    expect(field('Số HĐ').props.value).toBe('HD-1')
    expect(field('Ghi chú').props.value).toBe('')
  })

  it('đang Lưu nháp (request chưa về) → thanh bước khoá, vuốt cạnh tắt; chạm bước 2 không làm gì; xong → về màn xem', async () => {
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('patch', FORM_URL, () => new Promise((resolve) => (reply = resolve)))
    await show()
    await fireEvent.changeText(field('Số PO'), 'PO-7')
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    const step2 = screen.getByLabelText(/^Bước 2 trên 3, Vật tư/)
    expect(step2).toBeDisabled()
    await fireEvent.press(step2)
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockHeader.options.gestureEnabled).toBe(false)
    await act(async () => reply(ok(form2({ version: 4, purchaseOrder: 'PO-7' }))))
    await settled()
    // Đóng modal, màn xem phiếu ở đỉnh Stack tab.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('gõ đầu phiếu rồi bấm "Lưu nháp" ngay → PATCH mang đầu phiếu vừa gõ (đã chuẩn hoá); xong về màn xem', async () => {
    let sent: { receiver?: string; purchaseOrder?: string; code?: string } = {}
    route('patch', FORM_URL, (config) => {
      sent = JSON.parse(String(config.data))
      return ok(form2({ version: 4, receiver: 'Bếp Z', purchaseOrder: 'PO-7' }))
    })
    await show()
    await fireEvent(field('Người nhận'), 'focus')
    await fireEvent.changeText(field('Người nhận'), ' Bếp Z ')
    await fireEvent.changeText(field('Số PO'), 'PO-7')
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    expect(sent).toMatchObject({ code: 'PX-1', receiver: 'Bếp Z', purchaseOrder: 'PO-7' })
    // Về màn xem (`nav.finish`: đóng modal — một lần).
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('đầu phiếu còn lỗi → "Lưu nháp" khoá (không gửi được), "Tiếp tục" khoá', async () => {
    await show()
    await fireEvent.changeText(field('Người nhận'), '')
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    expect(nextButton()).toHaveStyle({ backgroundColor: lightColors.fill })
    await fireEvent.press(nextButton())
    expect(mockPush).not.toHaveBeenCalled()
    expect(callsTo('patch', FORM_URL)).toHaveLength(0)
  })

  it('Bỏ thay đổi trên máy → hỏi lại → các ô đầu phiếu về bản trên máy chủ', async () => {
    await show()
    await fireEvent.changeText(field('Người nhận'), 'Bếp Z')
    await fireEvent(field('Người nhận'), 'blur')
    await act(async () => menuItem('Bỏ thay đổi trên máy')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ thay đổi trên máy')
    expect(store().draft!.header.receiver).toBe('Bếp A')
    expect(field('Người nhận').props.value).toBe('Bếp A')
  })
})

describe('ExportInfoStepScreen — gợi ý người nhận', () => {
  const WH_HN = { slug: 'wh-hn', code: 'HN', name: 'Kho Hà Nội', isManager: false }
  const list = () => screen.getByTestId('receiver-suggestions')
  const signInWith = (warehouses: (typeof WH)[]) =>
    useAuthStore.setState({
      status: 'authenticated',
      user: { userSlug: 'u', userName: 'an', scope: ALL, warehouses } as never,
    })
  beforeEach(() => {
    useWarehouseStore.setState({ warehouses: null })
    route('get', LIST_URL, () =>
      ok({
        items: [
          { receiver: 'Tổ hàn A', createdAt: '2026-11-05T08:00:00Z' },
          { receiver: 'Bếp B', createdAt: '2026-11-04T08:00:00Z' },
          { receiver: 'tổ hàn a', createdAt: '2026-11-03T08:00:00Z' },
        ],
        total: 3,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasNext: false,
      }),
    )
  })

  it('chưa focus ô Người nhận → không tải, không hiện gợi ý', async () => {
    await show()
    expect(screen.queryByTestId('receiver-suggestions')).toBeNull()
    expect(callsTo('get', LIST_URL)).toHaveLength(0)
  })

  it('focus → người nhận gần đây (bỏ trùng, mới nhất trước); gõ để lọc; chạm → điền ô + bản nháp, đóng danh sách', async () => {
    await show()
    await fireEvent(field('Người nhận'), 'focus')
    await settled()
    expect(
      within(list())
        .getAllByRole('button')
        .map((b) => b.props.accessibilityLabel),
    ).toEqual(['Tổ hàn A', 'Bếp B'])
    await fireEvent.changeText(field('Người nhận'), 'bep')
    expect(within(list()).getAllByRole('button')).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Bếp B' }))
    expect(field('Người nhận').props.value).toBe('Bếp B')
    expect(store().draft!.header.receiver).toBe('Bếp B')
    expect(screen.queryByTestId('receiver-suggestions')).toBeNull()
  })

  it('Chuyển kho: thêm các kho của người dùng TRỪ kho hiện tại, ghi rõ là kho', async () => {
    signInWith([WH, WH_HN])
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(2)
    await fireEvent.press(screen.getByRole('button', { name: 'Loại, Sản xuất' }))
    await settled()
    await fireEvent(field('Người nhận'), 'focus')
    await settled()
    expect(within(list()).getByText('Kho')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho Hà Nội, kho HN' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /Kho Tổng/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Kho Hà Nội, kho HN' }))
    expect(field('Người nhận').props.value).toBe('Kho Hà Nội')
  })

  it('ADMIN+ (danh sách mọi kho đã tải trong store kho): gợi ý theo danh sách đó', async () => {
    useWarehouseStore.setState({
      warehouses: [WH, WH_HN, { slug: 'wh-dn', code: 'DN', name: 'Kho Đà Nẵng', isManager: false }],
    })
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(2)
    await fireEvent.press(screen.getByRole('button', { name: 'Loại, Sản xuất' }))
    await settled()
    await fireEvent(field('Người nhận'), 'focus')
    await settled()
    expect(screen.getByRole('button', { name: 'Kho Đà Nẵng, kho DN' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho Hà Nội, kho HN' })).toBeOnTheScreen()
  })
})

describe('ExportInfoStepScreen — Chứng từ', () => {
  const UPLOAD_URL = '/warehouses/wh-a/export-forms/upload-file'
  const S3 = 'https://b.s3.amazonaws.com/export-forms/phieu-giao-1762000000000.pdf'
  let restoreFormData: () => void
  beforeEach(() => {
    resetAttachmentUploads()
    restoreFormData = installRnFormData()
  })
  afterEach(() => restoreFormData())

  it('chọn PDF → tải lên endpoint phiếu xuất của kho; "Đang tải lên…" rồi hiện tên; header.file = URL', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    jest.mocked(chooseAction).mockResolvedValueOnce(2)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'phieu-giao.pdf',
          size: 4096,
          uri: 'file:///cache/phieu-giao.pdf',
          mimeType: 'application/pdf',
          lastModified: 0,
        },
      ],
    })
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(callsTo('post', UPLOAD_URL)).toHaveLength(1)
    expect(
      within(screen.getByTestId('export-field-file')).getByText('Đang tải lên…'),
    ).toBeOnTheScreen()
    // Gõ ô chữ trong lúc tải không đụng `file` (ô chữ chỉ ghi trường của nó).
    await fireEvent.changeText(field('Số PO'), 'PO-77')
    await act(async () => release())
    await settled()
    expect(store().draft!.header.file).toBe(S3)
    expect(store().draft!.header.purchaseOrder).toBe('PO-77')
    expect(screen.getByRole('button', { name: 'Chứng từ, phieu-giao.pdf' })).toBeOnTheScreen()
    expect(menuLabels()).toContain('Bỏ phiếu mới')
  })
})
