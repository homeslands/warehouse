import { fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItem } from 'expo-router'
import type { ReactElement } from 'react'
import { Platform } from 'react-native'

import { sheetHeaderOptions, type SheetHeaderConfig } from './sheetHeaderOptions'

const base = (over: Partial<SheetHeaderConfig> = {}): SheetHeaderConfig => ({
  title: 'Chọn kho',
  cancelLabel: 'Huỷ',
  doneLabel: 'Xong',
  onCancel: jest.fn(),
  onDone: jest.fn(),
  tint: '#171717',
  spinner: '#0a0a0a',
  ...over,
})

type Button = Extract<NativeStackHeaderItem, { type: 'button' }>
const items = (fn: unknown) =>
  (fn as (p: never) => NativeStackHeaderItem[])({ tintColor: undefined, canGoBack: false } as never)

afterEach(() => jest.restoreAllMocks())

describe('sheetHeaderOptions (iOS: mục thanh gốc)', () => {
  it('idle: tiêu đề; ✕ = nút gốc xmark; ✓ = nút gốc checkmark "prominent" tô màu nhấn', () => {
    const config = base()
    const o = sheetHeaderOptions(config)
    expect(o.title).toBe('Chọn kho')
    const [cancel] = items(o.unstable_headerLeftItems) as Button[]
    const [done] = items(o.unstable_headerRightItems) as Button[]
    expect(cancel).toMatchObject({
      type: 'button',
      label: 'Huỷ',
      accessibilityLabel: 'Huỷ',
      icon: { type: 'sfSymbol', name: 'xmark' },
      disabled: false,
    })
    expect(done).toMatchObject({
      type: 'button',
      label: 'Xong',
      icon: { type: 'sfSymbol', name: 'checkmark' },
      variant: 'prominent',
      tintColor: '#171717',
    })
    cancel!.onPress()
    done!.onPress()
    expect(config.onCancel).toHaveBeenCalledTimes(1)
    expect(config.onDone).toHaveBeenCalledTimes(1)
  })

  it('busy: ✓ thành vòng quay (mục custom), ✕ khoá', () => {
    const o = sheetHeaderOptions(base({ doneState: 'busy' }))
    const right = items(o.unstable_headerRightItems)
    expect(right).toHaveLength(1)
    expect(right[0]!.type).toBe('custom')
    expect((items(o.unstable_headerLeftItems)[0] as Button).disabled).toBe(true)
  })

  it('success: ✓ vẫn hiện nhưng bấm không gọi onDone; ✕ khoá (sheet sắp tự đóng)', () => {
    const config = base({ doneState: 'success' })
    const o = sheetHeaderOptions(config)
    const [done] = items(o.unstable_headerRightItems) as Button[]
    done!.onPress()
    expect(config.onDone).not.toHaveBeenCalled()
    expect((items(o.unstable_headerLeftItems)[0] as Button).disabled).toBe(true)
  })
})

describe('sheetHeaderOptions — sheet chỉ có ✕ (không truyền onDone)', () => {
  const closeOnly = () => {
    const { onDone: _onDone, doneLabel: _doneLabel, ...rest } = base()
    return rest
  }

  it('iOS: không có mục bên phải, ✕ vẫn là nút gốc xmark', () => {
    const o = sheetHeaderOptions(closeOnly())
    expect(items(o.unstable_headerRightItems)).toEqual([])
    expect(items(o.unstable_headerLeftItems)).toHaveLength(1)
  })

  it('Android: không có headerRight', () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    const o = sheetHeaderOptions(closeOnly())
    expect(o.headerRight).toBeUndefined()
    expect(o.headerLeft).toBeDefined()
  })
})

describe('sheetHeaderOptions (Android: nút tròn qua headerLeft/headerRight)', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))

  const renderSide = async (node: unknown) => {
    await render(node as ReactElement)
  }

  it('idle: ✕ và ✓ là nút có nhãn; bấm gọi đúng hàm', async () => {
    const config = base()
    const o = sheetHeaderOptions(config)
    expect(o.unstable_headerRightItems).toBeUndefined()
    expect(o.headerTitleAlign).toBe('center')
    await renderSide(o.headerLeft!({ canGoBack: false } as never))
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }))
    expect(config.onCancel).toHaveBeenCalledTimes(1)
    await renderSide(o.headerRight!({ canGoBack: false } as never))
    await fireEvent.press(screen.getByRole('button', { name: 'Xong' }))
    expect(config.onDone).toHaveBeenCalledTimes(1)
  })

  it('busy: ✓ báo bận + khoá; ✕ khoá', async () => {
    const config = base({ doneState: 'busy' })
    const o = sheetHeaderOptions(config)
    await renderSide(o.headerRight!({ canGoBack: false } as never))
    expect(screen.getByRole('button', { name: 'Xong', busy: true })).toBeDisabled()
    await renderSide(o.headerLeft!({ canGoBack: false } as never))
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled()
  })
})
