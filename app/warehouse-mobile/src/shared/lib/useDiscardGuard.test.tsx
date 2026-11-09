/**
 * `useDiscardGuard` trên cây expo-router THẬT (`renderRouter`): sheet là route của Stack GỐC (formSheet,
 * như `SessionGate`) có Stack lồng riêng (như `SheetStackLayout`), màn trong Stack lồng dùng hook. Lối
 * rời: `router.back()` (= ✕ gọi thẳng đóng), vuốt xuống iOS (RN Screens gửi `nativeDismissCancelled` khi
 * `preventNativeDismiss`), back phần cứng Android (`stubAndroidBack`), ✕ qua `confirmLeave()`.
 */
import { router, Stack } from 'expo-router'
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  type RenderRouterResult,
} from 'expo-router/testing-library'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { stubAndroidBack } from '@/shared/ui/testing/native-back'

import { confirmAction } from './native-confirm'
import { useCloseSheet } from './useCloseSheet'
import { useDiscardGuard } from './useDiscardGuard'

jest.mock('./native-confirm', () => ({ confirmAction: jest.fn() }))
const confirm = jest.mocked(confirmAction)

/** Màn trong sheet: `dirty` / `enabled` đổi bằng nút; ✕ gọi `confirmLeave()` rồi đóng nếu được. */
let lastLeave: boolean | undefined
function SheetScreen() {
  const [dirty, setDirty] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const { confirmLeave } = useDiscardGuard({ dirty, enabled })
  const close = useCloseSheet()
  return (
    <>
      <Text>sheet</Text>
      <Pressable accessibilityRole="button" onPress={() => setDirty(true)}>
        <Text>edit</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setDirty(false)}>
        <Text>saved</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          // ✓ của sheet dòng: ghi xong → dirty = false rồi đóng NGAY trong cùng handler.
          setDirty(false)
          close()
        }}
      >
        <Text>done</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setEnabled(false)}>
        <Text>lock</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          lastLeave = await confirmLeave()
          if (lastLeave) close()
        }}
      >
        <Text>cancel</Text>
      </Pressable>
    </>
  )
}

const ROUTES = {
  _layout: () => (
    <Stack>
      <Stack.Screen name="line" options={{ presentation: 'formSheet' }} />
    </Stack>
  ),
  index: () => <Text>home</Text>,
  'line/_layout': () => <Stack />,
  'line/index': SheetScreen,
}

type State = { index: number; routes: { name: string; state?: State }[] }

/** Tên các route đang hoạt động của Stack GỐC. */
function rootStack(r: RenderRouterResult): string[] {
  const s = r.getRouterState() as unknown as State
  // `__root` bọc Stack gốc của app.
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

async function openSheet() {
  const r = await renderRouter(ROUTES, { initialUrl: '/' })
  await act(() => router.push('/line'))
  expect(rootStack(r)).toEqual(['index', 'line'])
  return r
}

const press = (label: string) => act(() => fireEvent.press(screen.getByText(label)))
const settle = () => act(() => jest.runAllTimersAsync())

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  confirm.mockReset()
  lastLeave = undefined
})
afterEach(() => jest.useRealTimers())

describe('useDiscardGuard', () => {
  it('not dirty → back leaves without asking', async () => {
    const r = await openSheet()
    expect(sheetScreen().props.preventNativeDismiss).toBe(false)
    await act(() => router.back())
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('dirty → back asks; Bỏ thay đổi leaves, Tiếp tục sửa stays', async () => {
    const r = await openSheet()
    await press('edit')
    confirm.mockResolvedValueOnce(false)
    await act(() => router.back())
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith({
      title: 'Bỏ thay đổi?',
      message: 'Những gì vừa nhập cho dòng này sẽ không được lưu.',
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Tiếp tục sửa',
      destructive: true,
    })
    expect(rootStack(r)).toEqual(['index', 'line'])

    confirm.mockResolvedValueOnce(true)
    await act(() => router.back())
    await settle()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(rootStack(r)).toEqual(['index'])
  })

  it('dirty → iOS swipe-down is blocked natively, asks, and Bỏ thay đổi dismisses', async () => {
    const r = await openSheet()
    await press('edit')
    // Sheet không tự đóng khi vuốt: RN Screens giữ sheet và báo `nativeDismissCancelled`.
    expect(sheetScreen().props.preventNativeDismiss).toBe(true)

    confirm.mockResolvedValueOnce(false)
    await act(() =>
      fireEvent(sheetScreen(), 'nativeDismissCancelled', { nativeEvent: { dismissCount: 1 } }),
    )
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rootStack(r)).toEqual(['index', 'line'])

    confirm.mockResolvedValueOnce(true)
    await act(() =>
      fireEvent(sheetScreen(), 'nativeDismissCancelled', { nativeEvent: { dismissCount: 1 } }),
    )
    await settle()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(rootStack(r)).toEqual(['index'])
  })

  it('✓ (dirty=false and close in the same handler) → leaves without asking', async () => {
    const r = await openSheet()
    await press('edit')
    await press('done')
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a rejected prompt counts as Tiếp tục sửa (stays, no unhandled rejection)', async () => {
    const r = await openSheet()
    await press('edit')
    confirm.mockRejectedValueOnce(new Error('no window'))
    await act(() => router.back())
    await settle()
    expect(rootStack(r)).toEqual(['index', 'line'])
    confirm.mockRejectedValueOnce(new Error('no window'))
    await press('cancel')
    await settle()
    expect(lastLeave).toBe(false)
    expect(rootStack(r)).toEqual(['index', 'line'])
  })

  it('saved (dirty back to false) → leaves without asking', async () => {
    const r = await openSheet()
    await press('edit')
    await press('saved')
    expect(sheetScreen().props.preventNativeDismiss).toBe(false)
    await act(() => router.back())
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('enabled=false (đang ghi phiếu) → never asks', async () => {
    const r = await openSheet()
    await press('edit')
    await press('lock')
    await act(() => router.back())
    await settle()
    expect(rootStack(r)).toEqual(['index'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a second leave while the prompt is open is ignored — leaves only once', async () => {
    const r = await openSheet()
    await press('edit')
    let answer!: (ok: boolean) => void
    confirm.mockReturnValueOnce(new Promise<boolean>((res) => (answer = res)))
    await act(() => router.back())
    await press('cancel')
    expect(lastLeave).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    await act(async () => answer(true))
    await settle()
    expect(rootStack(r)).toEqual(['index'])
  })

  describe('Android hardware back', () => {
    let back: ReturnType<typeof stubAndroidBack>
    beforeEach(() => {
      back = stubAndroidBack()
    })
    afterEach(() => back.restore())

    it('Android hardware back while dirty asks', async () => {
      const r = await openSheet()
      await press('edit')
      confirm.mockResolvedValueOnce(false)
      expect(await back.press()).toBe(true)
      await settle()
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(rootStack(r)).toEqual(['index', 'line'])

      confirm.mockResolvedValueOnce(true)
      await back.press()
      await settle()
      expect(rootStack(r)).toEqual(['index'])
    })
  })

  describe('confirmLeave (✕)', () => {
    it('confirmLeave resolves true/false', async () => {
      const r = await openSheet()
      // Chưa sửa: true ngay, không hỏi.
      await press('cancel')
      await settle()
      expect(lastLeave).toBe(true)
      expect(confirm).not.toHaveBeenCalled()
      expect(rootStack(r)).toEqual(['index'])

      await act(() => router.push('/line'))
      await press('edit')
      confirm.mockResolvedValueOnce(false)
      await press('cancel')
      await settle()
      expect(lastLeave).toBe(false)
      expect(rootStack(r)).toEqual(['index', 'line'])

      // Đồng ý bỏ: đóng luôn, KHÔNG hỏi lần hai khi đóng.
      confirm.mockResolvedValueOnce(true)
      await press('cancel')
      await settle()
      expect(lastLeave).toBe(true)
      expect(confirm).toHaveBeenCalledTimes(2)
      expect(rootStack(r)).toEqual(['index'])
    })
  })
})
