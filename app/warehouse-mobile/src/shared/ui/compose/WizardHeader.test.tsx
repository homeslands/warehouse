import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import type { ReactElement, ReactNode } from 'react'
import { Platform } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction } from '@/shared/lib/native-confirm'
import { stubAndroidBack } from '@/shared/ui/testing/native-back'
import { wizardMenu, wizardRightItems } from '@/shared/ui/testing/wizard-header'

import { WizardHeader, type WizardHeaderProps } from './WizardHeader'

const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  ...jest.requireActual('@/shared/lib/native-confirm'),
  chooseAction: jest.fn(),
}))

type ButtonItem = { label: string; disabled?: boolean; onPress: () => void }
const leftItems = (): ButtonItem[] =>
  (mockHeader.options.unstable_headerLeftItems?.({ tintColor: undefined, canGoBack: true }) ??
    []) as NativeStackHeaderItem[] as never

const onClose = jest.fn()
const scan = jest.fn()
const save = jest.fn()
const discard = jest.fn()
const remove = jest.fn()

const items: WizardHeaderProps['menu']['items'] = [
  { id: 'save', label: 'Lưu nháp', disabled: true, onPress: save },
  { id: 'discard', label: 'Bỏ phiếu mới', destructive: true, onPress: discard },
  { id: 'delete', label: 'Xoá nháp', destructive: true, onPress: remove },
]

function props(over: Partial<WizardHeaderProps> = {}): WizardHeaderProps {
  return {
    title: 'Phiếu xuất mới',
    subtitle: 'Bước 2/3 · Vật tư',
    left: 'close',
    onClose,
    scan: { label: 'Quét mã', onPress: scan },
    menu: { label: 'Tuỳ chọn', items },
    ...over,
  }
}
const show = (over: Partial<WizardHeaderProps> = {}) => render(<WizardHeader {...props(over)} />)
const element = (over: Partial<WizardHeaderProps> = {}): ReactElement => (
  <WizardHeader {...props(over)} />
)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.clearAllMocks()
  mockHeader.options = {}
})

describe('WizardHeader — iOS', () => {
  it('iOS: right items are [scan button, ellipsis menu] and menu items carry destructive/disabled', async () => {
    await show()
    const right = wizardRightItems(mockHeader.options)
    expect(right.map((i) => [i.type, (i as { label?: string }).label])).toEqual([
      ['button', 'Quét mã'],
      ['menu', 'Tuỳ chọn'],
    ])
    expect((right[0] as { icon?: unknown }).icon).toEqual({
      type: 'sfSymbol',
      name: 'barcode.viewfinder',
    })
    expect((right[1] as { icon?: unknown }).icon).toEqual({ type: 'sfSymbol', name: 'ellipsis' })
    expect(
      wizardMenu(mockHeader.options).map((i) => [i.label, !!i.destructive, !!i.disabled]),
    ).toEqual([
      ['Lưu nháp', false, true],
      ['Bỏ phiếu mới', true, false],
      ['Xoá nháp', true, false],
    ])
    ;(right[0] as ButtonItem).onPress()
    expect(scan).toHaveBeenCalledTimes(1)
    wizardMenu(mockHeader.options)[2]!.onPress()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it("menuStyle 'sheet' (bước 3): ⋯ is a plain button (ellipsis) opening chooseAction with the pressable items", async () => {
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await show({ scan: undefined, menuStyle: 'sheet' })
    const right = wizardRightItems(mockHeader.options)
    expect(right).toHaveLength(1)
    expect(right[0]).toMatchObject({
      type: 'button',
      label: 'Tuỳ chọn',
      accessibilityLabel: 'Tuỳ chọn',
      icon: { type: 'sfSymbol', name: 'ellipsis' },
    })
    expect(wizardMenu(mockHeader.options)).toEqual([])
    await act(async () => (right[0] as ButtonItem).onPress())
    // Mục khoá bỏ đi (action sheet không vẽ được mục khoá); mục nguy hiểm giữ cờ đỏ.
    expect(jest.mocked(chooseAction).mock.calls[0]![0]).toMatchObject({
      actions: [
        { label: 'Bỏ phiếu mới', destructive: true },
        { label: 'Xoá nháp', destructive: true },
      ],
      cancelLabel: 'Huỷ',
    })
    expect(discard).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    // Huỷ → không gì chạy.
    jest.mocked(chooseAction).mockResolvedValueOnce(null)
    await act(async () => (right[0] as ButtonItem).onPress())
    expect(discard).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it("menuStyle 'sheet': no pressable item → no ⋯; scan button kept", async () => {
    await show({ menuStyle: 'sheet', menu: { label: 'Tuỳ chọn', items: [items[0]!] } })
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['button'])
    expect(wizardRightItems(mockHeader.options)[0]).toMatchObject({ label: 'Quét mã' })
  })

  it("menuStyle 'menu' (default, bước 1–2) keeps the native menu", async () => {
    await show({ menuStyle: 'menu' })
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['button', 'menu'])
  })

  it('no scan on steps without scan', async () => {
    await show({ scan: undefined })
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['menu'])
    await show({ scan: { label: 'Quét mã', onPress: scan, hidden: true } })
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['menu'])
  })

  it('empty menu → no ⋯', async () => {
    await show({ menu: { label: 'Tuỳ chọn', items: [] } })
    expect(wizardRightItems(mockHeader.options).map((i) => i.type)).toEqual(['button'])
    await show({ scan: undefined, menu: { label: 'Tuỳ chọn', items: [] } })
    expect(wizardRightItems(mockHeader.options)).toEqual([])
  })

  it('title shows subtitle line', async () => {
    await show()
    // `title` vẫn đặt (nhãn back của màn sau, test trên Stack thật đọc `RNSScreenStackHeaderConfig.title`).
    expect(mockHeader.options.title).toBe('Phiếu xuất mới')
    const headerTitle = mockHeader.options.headerTitle as (p: { children: string }) => ReactNode
    expect(typeof headerTitle).toBe('function')
    await render(<>{headerTitle({ children: 'Phiếu xuất mới' })}</>)
    expect(screen.getByText('Phiếu xuất mới')).toBeOnTheScreen()
    expect(screen.getByText('Bước 2/3 · Vật tư')).toBeOnTheScreen()
    expect(
      screen.getByRole('header', { name: 'Phiếu xuất mới, Bước 2/3 · Vật tư' }),
    ).toBeOnTheScreen()
  })

  it("left 'close': ✕ item, native back hidden; ✕ calls onClose", async () => {
    await show()
    expect(mockHeader.options.headerBackVisible).toBe(false)
    expect(mockHeader.options.gestureEnabled).toBe(true)
    expect(leftItems().map((i) => i.label)).toEqual(['Đóng'])
    leftItems()[0]!.onPress()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("left 'back': native back left visible, no left items", async () => {
    await show({ left: 'back', onClose: undefined })
    expect(mockHeader.options.headerBackVisible).toBeUndefined()
    expect(leftItems()).toEqual([])
  })

  it('writing hides back/close (kept from before)', async () => {
    await show({ writing: true })
    expect(leftItems()).toEqual([])
    expect(mockHeader.options.headerBackVisible).toBe(false)
    expect(mockHeader.options.gestureEnabled).toBe(false)
    // Quét khoá trong lúc ghi (không mở sheet giữa chừng).
    expect(wizardRightItems(mockHeader.options)[0]).toMatchObject({ disabled: true })
    await show({ left: 'back', onClose: undefined, writing: true })
    expect(mockHeader.options.headerBackVisible).toBe(false)
    expect(mockHeader.options.gestureEnabled).toBe(false)
  })
})

describe('WizardHeader — Android', () => {
  let back: ReturnType<typeof stubAndroidBack> | null = null
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))
  afterEach(() => {
    back?.restore()
    back = null
  })

  const renderRight = () =>
    render(<>{(mockHeader.options.headerRight as (p: object) => ReactNode)({ canGoBack: true })}</>)

  it('Android: ⋯ opens chooseAction with the items', async () => {
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await show()
    expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
    await renderRight()
    expect(screen.getByRole('button', { name: 'Quét mã' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Tuỳ chọn' }))
    await act(async () => {})
    // Mục khoá không có trên Alert (không vẽ được mục khoá) — chỉ các mục bấm được.
    expect(jest.mocked(chooseAction).mock.calls[0]![0].actions).toEqual([
      { label: 'Bỏ phiếu mới', destructive: true },
      { label: 'Xoá nháp', destructive: true },
    ])
    expect(remove).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
  })

  it('Android: no ⋯ when no item is pressable; headerTitle is the two-line title', async () => {
    await show({ scan: undefined, menu: { label: 'Tuỳ chọn', items: [items[0]!] } })
    await renderRight()
    expect(screen.queryByRole('button', { name: 'Tuỳ chọn' })).toBeNull()
    expect(typeof mockHeader.options.headerTitle).toBe('function')
  })

  it('✕ is a flat headerLeft button; writing removes it and hides the native back', async () => {
    await show()
    expect(mockHeader.options.headerLeft).toBeDefined()
    expect(mockHeader.options.unstable_headerLeftItems).toBeUndefined()
    await show({ writing: true })
    expect(mockHeader.options.headerLeft).toBeUndefined()
    expect(mockHeader.options.headerBackVisible).toBe(false)
  })

  it('hardware back is swallowed (returns true) only while writing', async () => {
    back = stubAndroidBack()
    const view = await show()
    expect(back.count()).toBe(0)
    expect(await back.press()).toBe(false)
    await view.rerender(element({ writing: true }))
    expect(back.count()).toBe(1)
    expect(await back.press()).toBe(true)
    await view.rerender(element({ writing: false }))
    expect(back.count()).toBe(0)
    await view.rerender(element({ writing: true }))
    await act(async () => view.unmount())
    expect(back.count()).toBe(0)
  })
})
