// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Platform, ScrollView, StyleSheet, Text } from 'react-native'

import { create } from 'zustand'

import { useAuthStore } from '@/entities/session'
import { lightColors } from '@/shared/theme/tokens'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import {
  createChipFilterSlice,
  initialChipFilters,
  type ChipFilterActions,
  type ChipFilters,
} from '../store'
import { ListFilterSheet } from './ListFilterSheet'

// Store ghép như store của từng tab: lát chip + field riêng (tìm kiếm, trạng thái).
const useChips = create<ChipFilters & ChipFilterActions & { status: string; query: string }>(
  (set) => ({ ...createChipFilterSlice(set), status: 'DRAFT', query: '' }),
)

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: object) => <View {...props} />,
    DateTimePickerAndroid: { open: jest.fn() },
  }
})

type Params = Record<string, unknown>
const seen: Params[] = []
const users = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })
const BINH = { slug: 'u-2', phonenumber: '0912000111', firstName: 'Thị Bình', lastName: 'Trần' }
const CUONG = { slug: 'u-3', phonenumber: '0933000222', firstName: '', lastName: '' }
const ME = { slug: 'u-1', phonenumber: '0901000000', firstName: 'Văn An', lastName: 'Nguyễn' }

function usersRoute(
  handler: (p: Params) => ReturnType<typeof ok> = () => users([BINH, CUONG, ME]),
) {
  route('get', '/users', (c) => {
    const p = (c.params ?? {}) as Params
    seen.push(p)
    return handler(p)
  })
}

/** `userSlug: null` = hồ sơ không có slug (trường này optional, như web). */
function signIn(scope: string[], userSlug: string | null = 'u-1') {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      userSlug: userSlug ?? undefined,
      userName: 'an',
      scope,
      firstName: 'Văn An',
      lastName: 'Nguyễn',
    } as never,
  })
}

let client: QueryClient
async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ListFilterSheet store={useChips} title="Lọc" testID="import-filter-sheet" />
    </QueryClientProvider>,
  )
  await settled()
}
const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

const toggle = (name: string) => screen.getByRole('switch', { name })
const flip = async (name: string, on: boolean) => {
  await act(async () => fireEvent(toggle(name), 'valueChange', on))
  await settled()
}
const radio = (name: string) => screen.getByRole('radio', { name })
const section = (key: string) => screen.getByTestId(`filter-section-${key}`)
const state = () => useChips.getState()

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  seen.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useChips.setState({ ...initialChipFilters, status: 'DRAFT', query: '' })
  signIn(['IMPORT_FORM_READ'])
})

afterEach(() => {
  client.clear()
  jest.restoreAllMocks()
})

describe('ListFilterSheet — một trang, công tắc từng bộ lọc', () => {
  it('tiêu đề "Lọc", ✕ và ✓ "Xong" (đều đóng sheet, bộ lọc đã áp dụng khi chọn); chưa lọc: các công tắc TẮT', async () => {
    await show()
    expect(sheetHeader().title).toBe('Lọc')
    expect(sheetHeader().cancel).toBeDefined()
    expect(sheetHeader().done).toBeDefined()
    await pressSheetDone()
    expect(mockBack).toHaveBeenCalledTimes(1)
    mockBack.mockClear()
    expect(toggle('Thời gian')).not.toBeChecked()
    expect(toggle('Người lập')).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Hôm nay' })).toBeNull()
    expect(screen.queryByText('Chỉ phiếu do bạn lập')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('thẻ không nền (nằm trên nền sheet); dòng đầu cao 50; công tắc màu success (cả hai nền tảng)', async () => {
    await show()
    const card = StyleSheet.flatten(section('time').props.style)
    expect(card.backgroundColor).toBeUndefined()
    expect(
      StyleSheet.flatten(screen.getByTestId('filter-section-time-header').props.style),
    ).toMatchObject({ minHeight: 50 })
    // iOS: RN chuyển `trackColor.true` thành `onTintColor` của UISwitch.
    expect(toggle('Thời gian').props.onTintColor).toBe(lightColors.success)
  })

  it('không có USER_READ: không có thẻ Người xác nhận', async () => {
    await show()
    expect(screen.queryByRole('switch', { name: 'Người xác nhận' })).toBeNull()
  })

  it('không có USER_READ lẫn userSlug: ẩn cả thẻ Người lập', async () => {
    signIn(['IMPORT_FORM_READ'], null)
    await show()
    expect(screen.queryByRole('switch', { name: 'Người lập' })).toBeNull()
  })
})

describe('ListFilterSheet — Thời gian', () => {
  it('BẬT → 7 ngày qua (ID mốc), hiện các lựa chọn dạng viên; TẮT → bỏ lọc, ẩn lựa chọn', async () => {
    await show()
    await flip('Thời gian', true)
    expect(state().time).toBe('last7')
    expect(toggle('Thời gian')).toBeChecked()
    for (const name of ['Hôm nay', '7 ngày qua', '30 ngày qua', 'Tháng này', 'Khoảng ngày'])
      expect(radio(name)).toBeOnTheScreen()
    expect(radio('7 ngày qua')).toBeSelected()
    await flip('Thời gian', false)
    expect(state().time).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Hôm nay' })).toBeNull()
  })

  it('chạm từng mốc → ghi ngay (không đóng sheet), rung chọn; viên chọn nền primary (đen), chưa chọn nền thẻ + viền; vùng chạm ≥ 44', async () => {
    useChips.setState({ time: 'last7' })
    await show()
    for (const [name, id] of [
      ['Hôm nay', 'today'],
      ['30 ngày qua', 'last30'],
      ['Tháng này', 'thisMonth'],
      ['7 ngày qua', 'last7'],
    ] as const) {
      await fireEvent.press(radio(name))
      expect(state().time).toBe(id)
      expect(radio(name)).toBeSelected()
    }
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(4)
    expect(mockBack).not.toHaveBeenCalled()
    const pill = StyleSheet.flatten(radio('7 ngày qua').props.style) as Record<
      string,
      number | string
    >
    expect(pill.backgroundColor).toBe(lightColors.primary)
    const label = within(radio('7 ngày qua')).getByText('7 ngày qua')
    expect(StyleSheet.flatten(label.props.style).color).toBe(lightColors.primaryForeground)
    const idle = StyleSheet.flatten(radio('Hôm nay').props.style) as Record<string, number | string>
    expect(idle.backgroundColor).toBe(lightColors.card)
    expect(idle.borderWidth).toBe(1)
    expect(idle.borderColor).toBe(lightColors.border)
    const slop = radio('7 ngày qua').props.hitSlop as { top: number; bottom: number }
    expect((pill.minHeight as number) + slop.top + slop.bottom).toBeGreaterThanOrEqual(44)
  })

  it('iOS: "Khoảng ngày" lấy ngày của mốc đang chọn làm khoảng, hiện ô ngày compact; đổi ngày áp dụng ngay; đến < từ → đảo', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    useChips.setState({ time: 'today' })
    await show()
    await fireEvent.press(radio('Khoảng ngày'))
    const today = state().time as { from: string; to: string }
    expect(today.from).toBe(today.to)
    expect(radio('Khoảng ngày')).toBeSelected()
    expect(screen.getByTestId('time-from-picker').props.display).toBe('compact')
    await act(async () =>
      screen
        .getByTestId('time-from-picker')
        .props.onValueChange({ type: 'set' }, new Date(2026, 9, 3)),
    )
    expect(state().time).toEqual({ from: '2026-10-03', to: today.to })
    await act(async () =>
      screen
        .getByTestId('time-to-picker')
        .props.onValueChange({ type: 'set' }, new Date(2026, 8, 20)),
    )
    expect(state().time).toEqual({ from: '2026-09-20', to: '2026-10-03' })
    expect(screen.queryByRole('button', { name: 'Áp dụng' })).toBeNull()
  })

  it('"Khoảng ngày" từ 7 ngày qua → khoảng hôm nay−6 … hôm nay', async () => {
    useChips.setState({ time: 'last7' })
    await show()
    await fireEvent.press(radio('Khoảng ngày'))
    const range = state().time as { from: string; to: string }
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000
    expect(days).toBe(6)
  })

  it('Android: ô ngày là nút mở hộp chọn ngày gốc; chọn xong ghi ngay', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    useChips.setState({ time: { from: '2026-10-01', to: '2026-10-15' } })
    await show()
    expect(screen.queryByTestId('time-from-picker')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Từ: 01/10/2026' }))
    const open = DateTimePickerAndroid.open as jest.Mock
    expect(open).toHaveBeenCalledTimes(1)
    await act(async () =>
      open.mock.calls[0][0].onValueChange({ type: 'set' }, new Date(2026, 8, 5)),
    )
    expect(state().time).toEqual({ from: '2026-09-05', to: '2026-10-15' })
    expect(screen.getByRole('button', { name: 'Từ: 05/09/2026' })).toBeOnTheScreen()
  })
})

describe('ListFilterSheet — Người lập (không có USER_READ)', () => {
  it('BẬT → người lập = mình; nội dung chỉ là "Chỉ phiếu do bạn lập", không có segmented / ô tìm / /users', async () => {
    usersRoute()
    await show()
    await flip('Người lập', true)
    expect(state().requester).toEqual({ slug: 'u-1', name: 'Nguyễn Văn An' })
    expect(screen.getByText('Chỉ phiếu do bạn lập')).toBeOnTheScreen()
    expect(screen.queryByRole('tab', { name: 'Người khác' })).toBeNull()
    expect(screen.queryByLabelText('Tìm theo tên hoặc số điện thoại')).toBeNull()
    expect(callsTo('get', '/users')).toHaveLength(0)
    await flip('Người lập', false)
    expect(state().requester).toBeNull()
    expect(screen.queryByText('Chỉ phiếu do bạn lập')).toBeNull()
  })

  it('người khác đã chọn trước khi mất USER_READ (không còn được gửi) → công tắc TẮT', async () => {
    useChips.setState({ requester: { slug: 'u-9', name: 'Bình' } })
    await show()
    expect(toggle('Người lập')).not.toBeChecked()
  })
})

describe('ListFilterSheet — Người lập / Người xác nhận (có USER_READ)', () => {
  beforeEach(() => signIn(['IMPORT_FORM_READ', 'USER_READ']))

  it('BẬT → mình, segmented [Phiếu của tôi | Người khác] chọn "Phiếu của tôi"; chưa gọi /users', async () => {
    usersRoute()
    await show()
    await flip('Người lập', true)
    expect(state().requester).toMatchObject({ slug: 'u-1' })
    const card = within(section('requester'))
    expect(card.getByRole('tab', { name: 'Phiếu của tôi' })).toBeSelected()
    expect(card.getByRole('tab', { name: 'Người khác' })).not.toBeSelected()
    expect(callsTo('get', '/users')).toHaveLength(0)
  })

  it('Người khác: bỏ lọc tới khi chọn ("Chọn một người"), tìm (debounce, chữ số → phonenumber) → chọn → ghi store, dấu tích', async () => {
    usersRoute()
    await show()
    await flip('Người lập', true)
    const card = within(section('requester'))
    await act(async () => fireEvent.press(card.getByRole('tab', { name: 'Người khác' })))
    await settled()
    expect(state().requester).toBeNull()
    expect(toggle('Người lập')).toBeChecked()
    expect(card.getByText('Chọn một người')).toBeOnTheScreen()
    expect(seen).toEqual([{ page: 1, size: 20 }])
    // Bỏ chính mình khỏi danh sách (đã có "Phiếu của tôi").
    expect(card.queryByRole('button', { name: /^Nguyễn Văn An/ })).toBeNull()

    const field = card.getByLabelText('Tìm theo tên hoặc số điện thoại')
    await act(async () => fireEvent.changeText(field, '0912 000'))
    await wait(150)
    expect(seen).toHaveLength(1)
    await wait(200)
    await settled()
    expect(seen.at(-1)).toEqual({ page: 1, size: 20, phonenumber: '0912000' })
    await act(async () => fireEvent.changeText(field, 'bình'))
    await wait(320)
    await settled()
    expect(seen.at(-1)).toEqual({ page: 1, size: 20, name: 'bình' })

    const row = card.getByRole('button', { name: /^Trần Thị Bình/ })
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44)
    await fireEvent.press(row)
    expect(state().requester).toEqual({ slug: 'u-2', name: 'Trần Thị Bình' })
    expect(card.getByRole('button', { name: /^Trần Thị Bình/ })).toBeSelected()
    expect(card.queryByText('Chọn một người')).toBeNull()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('đóng sheet khi đang "Người khác" mà chưa chọn ai → mở lại: công tắc TẮT', async () => {
    usersRoute()
    await show()
    await flip('Người lập', true)
    await act(async () =>
      fireEvent.press(within(section('requester')).getByRole('tab', { name: 'Người khác' })),
    )
    await settled()
    await screen.unmount()
    await show()
    expect(toggle('Người lập')).not.toBeChecked()
  })

  it('mở sheet khi đang lọc người khác → BẬT, "Người khác" đang chọn, người đó hiện (tên lúc chọn) có dấu tích', async () => {
    useChips.setState({ requester: { slug: 'u-77', name: 'Lê Văn Xa' } })
    usersRoute()
    await show()
    expect(toggle('Người lập')).toBeChecked()
    const card = within(section('requester'))
    expect(card.getByRole('tab', { name: 'Người khác' })).toBeSelected()
    expect(card.getByRole('button', { name: /^Lê Văn Xa/ })).toBeSelected()
  })

  it('người xác nhận: thẻ có khi có USER_READ; BẬT → mình, segmented "Tôi xác nhận"; ghi vào approver', async () => {
    usersRoute()
    await show()
    await flip('Người xác nhận', true)
    expect(state().approver).toMatchObject({ slug: 'u-1' })
    expect(state().requester).toBeNull()
    expect(within(section('approver')).getByRole('tab', { name: 'Tôi xác nhận' })).toBeSelected()
  })

  it('hồ sơ không có userSlug: BẬT → vào thẳng "Người khác" (không segmented), chưa lọc tới khi chọn', async () => {
    signIn(['IMPORT_FORM_READ', 'USER_READ'], null)
    usersRoute()
    await show()
    await flip('Người lập', true)
    expect(state().requester).toBeNull()
    const card = within(section('requester'))
    expect(card.queryByRole('tab', { name: 'Phiếu của tôi' })).toBeNull()
    expect(card.getByText('Chọn một người')).toBeOnTheScreen()
    expect(card.getByLabelText('Tìm theo tên hoặc số điện thoại')).toBeOnTheScreen()
  })

  it('không ai khớp → "Không tìm thấy người dùng"; lỗi tải → câu lỗi + Thử lại', async () => {
    let fail = false
    usersRoute(() => (fail ? failure(500, 100001) : users([])))
    useChips.setState({ requester: { slug: 'u-77', name: 'Lê Văn Xa' } })
    await show()
    const card = within(section('requester'))
    expect(card.getByText('Không tìm thấy người dùng')).toBeOnTheScreen()
    fail = true
    await act(async () =>
      fireEvent.changeText(card.getByLabelText('Tìm theo tên hoặc số điện thoại'), 'zz'),
    )
    await wait(320)
    await settled()
    expect(card.getByText('Không tải được danh sách người dùng')).toBeOnTheScreen()
    fail = false
    await act(async () => fireEvent.press(card.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(card.getByText('Không tìm thấy người dùng')).toBeOnTheScreen()
  })

  it('chạm ô tìm → cuộn để ô tìm (và kết quả đầu) lên đầu vùng nhìn của sheet', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    useChips.setState({ requester: { slug: 'u-77', name: 'Lê Văn Xa' } })
    usersRoute()
    await show()
    const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 360, height: 40 } } })
    await act(async () => fireEvent(section('requester'), 'layout', layout(300)))
    await act(async () =>
      fireEvent(screen.getByTestId('filter-requester-search'), 'layout', layout(70)),
    )
    await act(async () =>
      fireEvent(
        within(section('requester')).getByLabelText('Tìm theo tên hoặc số điện thoại'),
        'focus',
      ),
    )
    expect(scrollTo).toHaveBeenCalledWith({ y: 300 + 50 + 70 - 8, animated: true })
  })
})

describe('ListFilterSheet — Xoá lọc', () => {
  it('chỉ khi đang lọc; tắt mọi công tắc, GIỮ tìm kiếm + trạng thái, ở lại sheet; vùng chạm ≥ 44', async () => {
    signIn(['IMPORT_FORM_READ', 'USER_READ'])
    usersRoute()
    useChips.setState({
      status: 'CANCELLED',
      query: 'hd',
      time: 'today',
      requester: { slug: 'u-9', name: 'Bình' },
      approver: { slug: 'u-1', name: 'An' },
    })
    await show()
    const clear = screen.getByRole('button', { name: 'Xoá lọc' })
    expect(StyleSheet.flatten(clear.props.style).minHeight).toBeGreaterThanOrEqual(44)
    await act(async () => fireEvent.press(clear))
    await settled()
    expect(state()).toMatchObject({
      status: 'CANCELLED',
      query: 'hd',
      time: null,
      requester: null,
      approver: null,
    })
    for (const name of ['Thời gian', 'Người lập', 'Người xác nhận'])
      expect(toggle(name)).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('ListFilterSheet — section riêng của tab (`extra`)', () => {
  it('hiện `extra` sau các section chip', async () => {
    signIn(['IMPORT_FORM_READ'])
    usersRoute()
    await render(
      <QueryClientProvider client={client}>
        <ListFilterSheet
          store={useChips}
          title="Lọc"
          testID="export-filter-sheet"
          extra={<Text>section riêng</Text>}
        />
      </QueryClientProvider>,
    )
    await settled()
    expect(screen.getByTestId('export-filter-sheet')).toBeOnTheScreen()
    expect(screen.getByText('section riêng')).toBeOnTheScreen()
  })

  async function showExtra(extraActive: boolean, onClearExtra: () => void) {
    await render(
      <QueryClientProvider client={client}>
        <ListFilterSheet
          store={useChips}
          title="Lọc"
          testID="export-filter-sheet"
          extra={<Text>section riêng</Text>}
          extraActive={extraActive}
          onClearExtra={onClearExtra}
        />
      </QueryClientProvider>,
    )
    await settled()
  }

  it('chỉ `extraActive` → vẫn có "Xoá lọc"; bấm gọi onClearExtra', async () => {
    signIn(['IMPORT_FORM_READ'])
    usersRoute()
    const onClearExtra = jest.fn()
    await showExtra(true, onClearExtra)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    expect(onClearExtra).toHaveBeenCalledTimes(1)
  })

  it('không chip, không `extraActive` → không có "Xoá lọc"', async () => {
    signIn(['IMPORT_FORM_READ'])
    usersRoute()
    await showExtra(false, jest.fn())
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
  })

  it('chip + extra → "Xoá lọc" xoá cả hai', async () => {
    signIn(['IMPORT_FORM_READ'])
    usersRoute()
    useChips.setState({ time: 'today' })
    const onClearExtra = jest.fn()
    await showExtra(true, onClearExtra)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    expect(state().time).toBeNull()
    expect(onClearExtra).toHaveBeenCalledTimes(1)
  })
})
