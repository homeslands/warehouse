// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking, TextInput } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftStorageKey,
  newDraft,
  stopDraftPersistence,
  useReceiveDraft,
  type ReceiveDraft,
} from '@/features/receive-checklist'
import { resetAttachmentUploads } from '@/features/form-attachment'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import { makeForm, makeItem, makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { parseLocalDate, todayLocalIso } from '@/shared/lib/format'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { wizardMenuItem, wizardMenuLabels } from '@/shared/ui/testing/wizard-header'
import { lightColors } from '@/shared/theme/tokens'

import { ImportInfoStepScreen } from './ImportInfoStepScreen'

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
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: 'automatic',
    Compatible: 'compatible',
    Current: 'current',
  },
}))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: object) => <View testID="date-picker" {...props} />,
    DateTimePickerAndroid: { open: jest.fn() },
  }
})

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const NEW_KEY = draftStorageKey('u', 'wh-a', 'new')

/** Phiếu Nháp 2 dòng, bên bán của dòng là "Hoà Phát", có PO. */
const form2 = (over: Partial<ImportForm> = {}) =>
  makeForm(
    [
      makeItem(1, { supplierSlug: 's1', supplierName: 'Hoà Phát' }),
      makeItem(2, { supplierSlug: 's1', supplierName: 'Hoà Phát' }),
    ],
    { warehouseSlug: 'wh-a', purchaseOrder: 'PO-1', requesterSlug: 'u', ...over },
  )

const EDITOR = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']
function signIn(scope: string[] = EDITOR) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}
function suppliers() {
  route('get', '/suppliers', () =>
    ok({
      items: [
        { slug: 's1', code: 'NCC1', name: 'Hoà Phát' },
        { slug: 's2', code: 'NCC2', name: 'Hà Tiên' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNext: false,
    }),
  )
}

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
      <ImportInfoStepScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}

const store = () => useReceiveDraft.getState()
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
const labels = () => items('right').map((i) => i.label)
/** Mục `label` / nhãn các mục của menu `⋯` (menu gốc iOS). */
const menuItem = (label: string) => wizardMenuItem(mockHeader.options, label)
const menuLabels = () => wizardMenuLabels(mockHeader.options)

const newHeader = (over: Partial<ReceiveDraft['header']> = {}) => ({
  code: 'PN-MOI',
  invoiceCode: 'HD-9',
  date: '2026-11-04',
  purchaseOrder: null,
  note: null,
  supplierSlug: null,
  ...over,
})
async function storedNew(d: ReceiveDraft) {
  await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
}
const hapticErrors = () =>
  jest
    .mocked(jest.requireMock('expo-haptics').notificationAsync as jest.Mock)
    .mock.calls.filter(([type]) => type === 'error')

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
  signIn()
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
})

afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('ImportInfoStepScreen — phiếu mới', () => {
  it('new form: suggested code, today, supplier row opens /import-supplier', async () => {
    signIn([...EDITOR, 'SUPPLIER_READ'])
    suppliers()
    await show()
    expect(mockHeader.options.title).toBe('Phiếu nhập mới')
    expect(screen.getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')).toBeSelected()
    expect(screen.getByLabelText('Bước 2 trên 3, Vật tư, chưa tới')).toBeDisabled()
    expect(screen.getByLabelText('Bước 3 trên 3, Xác nhận, chưa tới')).toBeDisabled()
    expect(field('Mã phiếu').props.value).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(field('Số HĐ').props.value).toBe('')
    const today = todayLocalIso()
    // iOS: viên lịch gốc compact mang ngày hôm nay.
    expect(screen.getByTestId('import-date-picker').props.value).toEqual(parseLocalDate(today))
    // Kho có danh sách bên bán: Bên bán bắt buộc, chạm → sheet chọn bên bán.
    await fireEvent.press(screen.getByRole('button', { name: /^Bên bán/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/import-supplier')
    expect(screen.getByText('Còn thiếu: Bên bán, Số HĐ')).toBeOnTheScreen()
  })

  it('required and optional fields are in two groups', async () => {
    signIn([...EDITOR, 'SUPPLIER_READ'])
    suppliers()
    await show()
    const required = screen.getByTestId('import-group-required')
    const optional = screen.getByTestId('import-group-optional')
    for (const id of ['supplier', 'invoiceCode', 'date', 'code']) {
      expect(within(required).getByTestId(`import-field-${id}`)).toBeOnTheScreen()
      expect(within(optional).queryByTestId(`import-field-${id}`)).toBeNull()
    }
    for (const id of ['purchaseOrder', 'note']) {
      expect(within(optional).getByTestId(`import-field-${id}`)).toBeOnTheScreen()
      expect(within(required).queryByTestId(`import-field-${id}`)).toBeNull()
    }
  })

  it('bên bán đã chọn hiện tên (tra từ danh sách bên bán)', async () => {
    signIn([...EDITOR, 'SUPPLIER_READ'])
    suppliers()
    await storedNew(newDraft(newHeader({ supplierSlug: 's2' })))
    await show()
    expect(screen.getByRole('button', { name: 'Bên bán, Hà Tiên' })).toBeOnTheScreen()
  })

  it('Tiếp tục disabled with Còn thiếu: Số HĐ', async () => {
    await show()
    expect(screen.getByText('Còn thiếu: Số HĐ')).toBeOnTheScreen()
    // Trông như khoá nhưng vẫn bấm được; trình đọc màn hình nghe còn thiếu gì.
    expect(nextButton()).toHaveStyle({ backgroundColor: lightColors.fill })
    expect(nextButton().props.accessibilityHint).toBe('Còn thiếu: Số HĐ')
  })

  it('Tiếp tục khi Số HĐ trống → không chuyển bước; rung lỗi, lỗi ô hiện, focus ô Số HĐ', async () => {
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    await show()
    focus.mockClear()
    expect(screen.queryByText('Nhập số hoá đơn')).toBeNull()
    await fireEvent.press(nextButton())
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByText('Nhập số hoá đơn')).toBeOnTheScreen()
    expect(hapticErrors()).toHaveLength(1)
    expect(
      focus.mock.contexts.map(
        (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
      ),
    ).toEqual(['Số HĐ'])
    focus.mockRestore()
  })

  it('điền Số HĐ → hết "Còn thiếu", Tiếp tục đẩy bước 2 /import-form/new/edit', async () => {
    await show()
    await fireEvent.changeText(field('Số HĐ'), 'HD-1')
    expect(screen.queryByText(/^Còn thiếu/)).toBeNull()
    expect(nextButton()).not.toHaveStyle({ backgroundColor: lightColors.fill })
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'new' },
    })
  })

  it('header has no Lưu nháp', async () => {
    await show()
    // Bản trắng: không có gì để bỏ → bên phải trống hẳn.
    expect(labels()).toEqual([])
    await fireEvent.changeText(field('Số HĐ'), 'HD-1')
    // Đã nhập gì → chỉ ⋯ (phiếu nhập không có "Lưu nháp" — chỉ lưu ở bước 3).
    expect(labels()).toEqual(['Tuỳ chọn'])
    expect(menuLabels()).toEqual(['Bỏ phiếu mới'])
    expect(menuItem('Bỏ phiếu mới')).toMatchObject({ destructive: true })
    expect(headerItem('right', 'Lưu nháp')).toBeUndefined()
  })

  it('progress is inside the scroll content', async () => {
    await show()
    const scroll = screen.getByTestId('import-info-scroll')
    expect(within(scroll).getByTestId('import-wizard-steps-1')).toBeOnTheScreen()
    expect(within(scroll).getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')).toBeSelected()
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

  it('⋯ → "Bỏ phiếu mới": hỏi, bỏ bản nháp, về danh sách', async () => {
    await storedNew({ ...newDraft(newHeader()), lines: [makeLine(1, { base: null })] })
    await show()
    expect(menuLabels()).toEqual(['Bỏ phiếu mới'])
    await act(async () => menuItem('Bỏ phiếu mới')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ phiếu mới')
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finishToList).toHaveBeenCalledTimes(1)
  })

  it('iOS: Ngày nhập là viên lịch gốc compact trên dòng; chọn ngày ghi vào bản nháp', async () => {
    await show()
    const picker = screen.getByTestId('import-date-picker')
    expect(picker.props.display).toBe('compact')
    await act(async () => picker.props.onValueChange({}, new Date(2026, 10, 2)))
    expect(store().draft!.header.date).toBe('2026-11-02')
  })

  it('thông báo mức phiếu (useFormNotice) của đúng phiếu hiện ở đáy; của phiếu khác / phiếu xuất thì không', async () => {
    await show()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'export', formSlug: 'new', message: 'Phiếu xuất' }),
    )
    expect(screen.queryByText('Phiếu xuất')).toBeNull()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'import', formSlug: 'pn-2', message: 'Phiếu khác' }),
    )
    expect(screen.queryByText('Phiếu khác')).toBeNull()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'import', formSlug: 'new', message: 'Đã gộp' }),
    )
    expect(screen.getByTestId('import-form-notice')).toBeOnTheScreen()
    expect(screen.getByText('Đã gộp')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('external replace(draft) resyncs header fields', async () => {
    await show()
    await fireEvent(field('Số PO'), 'focus')
    await fireEvent.changeText(field('Số PO'), 'PO-đang-gõ')
    const d = store().draft!
    await act(async () =>
      store().replace({
        ...d,
        header: { ...d.header, purchaseOrder: 'PO-SERVER', invoiceCode: 'HD-Z' },
      }),
    )
    expect(field('Số PO').props.value).toBe('PO-SERVER')
    expect(field('Số HĐ').props.value).toBe('HD-Z')
  })
})

describe('ImportInfoStepScreen — phiếu đã có', () => {
  beforeEach(() => {
    open('pn-1')
    route('get', FORM_URL, () => ok(form2()))
  })

  it('existing form: supplier read-only', async () => {
    signIn([...EDITOR, 'SUPPLIER_READ'])
    suppliers()
    await show()
    expect(mockHeader.options.title).toBe('Sửa phiếu')
    expect(screen.queryByRole('button', { name: /^Bên bán/ })).toBeNull()
    expect(screen.getByLabelText('Bên bán, Hoà Phát')).toBeOnTheScreen()
    expect(field('Số HĐ').props.value).toBe('HD-1')
    expect(field('Mã phiếu').props.value).toBe('PN-1')
    expect(field('Số PO').props.value).toBe('PO-1')
    // Bên bán của phiếu đã có không bao giờ thiếu.
    expect(screen.queryByText(/^Còn thiếu/)).toBeNull()
  })

  it('bước 2 chạm được → về bước 2; chưa đổi gì → không có ⋯', async () => {
    await show()
    expect(labels()).toEqual([])
    await fireEvent.press(screen.getByLabelText('Bước 2 trên 3, Vật tư, đã xong'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'pn-1' },
    })
    await fireEvent.changeText(field('Ghi chú'), 'giao 2 đợt')
    expect(labels()).toEqual(['Tuỳ chọn'])
  })

  it('⋯ → Bỏ thay đổi trên máy → hỏi lại → các ô về bản trên máy chủ', async () => {
    await show()
    await fireEvent.changeText(field('Số HĐ'), 'HD-Z')
    await act(async () => menuItem('Bỏ thay đổi trên máy')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ thay đổi trên máy')
    expect(store().draft!.header.invoiceCode).toBe('HD-1')
    expect(field('Số HĐ').props.value).toBe('HD-1')
  })
})

describe('ImportInfoStepScreen — Chứng từ', () => {
  const UPLOAD_URL = '/warehouses/wh-a/import-forms/upload-file'
  const S3 = 'https://b.s3.amazonaws.com/import-forms/hoa-don-1762000000000.pdf'
  const pdf = (over: object = {}) => ({
    canceled: false as const,
    assets: [
      {
        name: 'hoa-don.pdf',
        size: 2048,
        uri: 'file:///cache/hoa-don.pdf',
        mimeType: 'application/pdf',
        lastModified: 0,
        ...over,
      },
    ],
  })
  /** Thứ tự mục của bảng chọn (iOS): nguồn, rồi Xem / Gỡ khi đã có file. */
  const PICK = { camera: 0, library: 1, document: 2, view: 3, remove: 4 }
  const row = () => screen.getByTestId('import-field-file')
  let restoreFormData: () => void

  beforeEach(() => {
    resetAttachmentUploads()
    restoreFormData = installRnFormData()
  })
  afterEach(() => restoreFormData())

  it('dòng "Chứng từ" trống hiện "Thêm"; bấm mở bảng chọn đủ 3 nguồn', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Chứng từ, Thêm' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    const arg = jest.mocked(chooseAction).mock.calls.at(-1)![0]
    expect(arg.title).toBe('Chứng từ đính kèm')
    expect(arg.actions.map((a) => a.label)).toEqual([
      'Chụp ảnh',
      'Chọn từ thư viện ảnh',
      'Chọn tệp (PDF, Excel, Word)',
    ])
  })

  it('chọn PDF hợp lệ → tải lên đúng kho; dòng "Đang tải lên…"; xong hiện tên file, header.file = URL', async () => {
    let release!: () => void
    let parts: unknown
    route('post', UPLOAD_URL, (config) => {
      parts = (config.data as { _parts: unknown })._parts
      return new Promise((r) => (release = () => r(ok(S3))))
    })
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce(pdf())
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(jest.mocked(DocumentPicker.getDocumentAsync)).toHaveBeenCalledWith({
      type: expect.arrayContaining(['application/pdf', 'application/msword']),
      copyToCacheDirectory: true,
    })
    expect(callsTo('post', UPLOAD_URL)).toHaveLength(1)
    expect(parts).toEqual([
      ['file', { uri: 'file:///cache/hoa-don.pdf', name: 'hoa-don.pdf', type: 'application/pdf' }],
    ])
    expect(within(row()).getByText('Đang tải lên…')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /^Chứng từ/ })).toBeNull()

    await act(async () => release())
    await settled()
    expect(store().draft!.header.file).toBe(S3)
    expect(screen.getByRole('button', { name: 'Chứng từ, hoa-don.pdf' })).toBeOnTheScreen()
    // Phiếu mới chỉ có chứng từ cũng là "đã sửa": có mục bỏ phiếu mới.
    expect(menuLabels()).toEqual(['Bỏ phiếu mới'])
  })

  it('tệp > 10 MB → không tải lên, báo "Tệp lớn hơn 10 MB."', async () => {
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValueOnce(pdf({ size: 10 * 1024 * 1024 + 1 }))
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(callsTo('post', UPLOAD_URL)).toHaveLength(0)
    expect(screen.getByText('Tệp lớn hơn 10 MB.')).toBeOnTheScreen()
    expect(store().draft!.header.file).toBeNull()
  })

  it('ảnh thư viện: JPEG, quality 0.7, không cắt, bản tương thích (không HEIC); tên chung-tu-<ts>.jpg', async () => {
    let parts: [string, { name: string; type: string }][] = []
    route('post', UPLOAD_URL, (config) => {
      parts = (config.data as { _parts: typeof parts })._parts
      return ok('https://b.s3.amazonaws.com/import-forms/chung-tu-1-1762000000000.jpg')
    })
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.library)
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/ImagePicker/x.jpg',
          width: 1,
          height: 1,
          fileSize: 900_000,
          mimeType: 'image/jpeg',
        },
      ],
    })
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(jest.mocked(ImagePicker.launchImageLibraryAsync)).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
      preferredAssetRepresentationMode: 'compatible',
    })
    expect(parts[0]![1].name).toMatch(/^chung-tu-\d+\.jpg$/)
    expect(parts[0]![1].type).toBe('image/jpeg')
    expect(store().draft!.header.file).toMatch(/\.jpg$/)
  })

  it('camera bị từ chối (không hỏi lại được) → báo, nút mở Cài đặt; không mở camera', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.camera)
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, canAskAgain: false } as never)
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(jest.mocked(ImagePicker.launchCameraAsync)).not.toHaveBeenCalled()
    const [title, , buttons] = alert.mock.calls.at(-1)!
    expect(title).toBe('Chưa cho phép dùng camera.')
    const settings = buttons!.find((b) => b.text === 'Mở Cài đặt')!
    settings.onPress!()
    expect(openSettings).toHaveBeenCalledTimes(1)
    alert.mockRestore()
  })

  it('đã có file: bảng chọn thêm Xem / Gỡ; Xem mở URL; Gỡ hỏi lại (nguy hiểm) → header.file null', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue()
    await storedNew(newDraft(newHeader({ file: S3 })))
    await show()
    const button = () => screen.getByRole('button', { name: 'Chứng từ, hoa-don.pdf' })
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.view)
    await fireEvent.press(button())
    await settled()
    const arg = jest.mocked(chooseAction).mock.calls.at(-1)![0]
    expect(arg.actions.map((a) => a.label).slice(3)).toEqual(['Xem chứng từ', 'Gỡ chứng từ'])
    expect(arg.actions[4]!.destructive).toBe(true)
    expect(openURL).toHaveBeenCalledWith(S3)

    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.remove)
    await fireEvent.press(button())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0]).toMatchObject({
      title: 'Gỡ chứng từ khỏi phiếu?',
      confirmLabel: 'Gỡ',
      cancelLabel: 'Không gỡ',
      destructive: true,
    })
    expect(store().draft!.header.file).toBeNull()
    expect(screen.getByRole('button', { name: 'Chứng từ, Thêm' })).toBeOnTheScreen()
  })

  it('giá trị cũ là khoá (không phải URL) → không có "Xem chứng từ"', async () => {
    await storedNew(newDraft(newHeader({ file: 'import-forms/hd-1762000000000.pdf' })))
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, hd.pdf' }))
    const labels = jest
      .mocked(chooseAction)
      .mock.calls.at(-1)![0]
      .actions.map((a) => a.label)
    expect(labels).not.toContain('Xem chứng từ')
    expect(labels).toContain('Gỡ chứng từ')
  })

  it('bỏ bản nháp trong lúc tải → kết quả về muộn bị bỏ (không gắn vào bản nháp mới)', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce(pdf())
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    await act(async () => store().discard())
    // Mở lại đúng phiếu đó (bản trắng mới, cùng ctx) trước khi kết quả về.
    await act(async () => {
      await store().load({ userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'new' }, null)
      store().seed(newDraft(newHeader()))
    })
    await settled()
    expect(store().draft).not.toBeNull()
    await act(async () => release())
    await settled()
    expect(store().draft!.header.file).toBeNull()
    expect(screen.getByRole('button', { name: 'Chứng từ, Thêm' })).toBeOnTheScreen()
  })

  it('rời luồng (màn bước cuối tháo ra, bản nháp vẫn giữ) trong lúc tải → kết quả về muộn bị bỏ', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce(pdf())
    const view = await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    await view.unmount()
    await settled()
    // ✕ giữ bản nháp trên máy: kết quả không được gắn vào nó sau khi đã rời.
    expect(store().draft).not.toBeNull()
    await act(async () => release())
    await settled()
    expect(store().draft!.header.file).toBeNull()
  })

  it('đổi bước trong lúc tải (bước 1 vẫn gắn) → kết quả vẫn gắn vào bản nháp', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce(pdf())
    await storedNew(newDraft(newHeader()))
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'new' },
    })
    await act(async () => release())
    await settled()
    expect(store().draft!.header.file).toBe(S3)
  })

  it('lỗi tải lên → báo "Tải chứng từ lên không được. Thử lại.", header.file giữ nguyên', async () => {
    route('post', UPLOAD_URL, () => 'network')
    jest.mocked(chooseAction).mockResolvedValueOnce(PICK.document)
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce(pdf())
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, Thêm' }))
    await settled()
    expect(screen.getByText('Tải chứng từ lên không được. Thử lại.')).toBeOnTheScreen()
    expect(store().draft!.header.file).toBeNull()
    expect(hapticErrors().length).toBeGreaterThan(0)
  })
})
