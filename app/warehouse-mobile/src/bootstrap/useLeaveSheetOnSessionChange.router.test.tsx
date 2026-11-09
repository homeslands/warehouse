/**
 * Rời sheet BẮT BUỘC khi đích đổi (hết phiên…) trên cây expo-router THẬT, với sheet đang có thay đổi
 * chưa ✓ (`useDiscardGuard` dirty): lần rời này không bao giờ bị chặn / hỏi, và câu trả lời của hộp hỏi
 * đang mở dở không chạy lại action cũ trên state mới. Layout gốc bắt chước `SessionGate`
 * (`Stack.Protected` + `useLeaveSheetOnSessionChange`): `/import-line` có guard LẬT theo đích (như sheet
 * dòng), `/language` mở được ở mọi đích (guard GIỮ NGUYÊN).
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
import { create } from 'zustand'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'

import type { Destination } from './destination'
import { useLeaveSheetOnSessionChange } from './useLeaveSheetOnSessionChange'

jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))
const confirm = jest.mocked(confirmAction)

/** Đích hiện tại (thay cho `destinationFor` của SessionGate). */
const useDestination = create<{ destination: Destination }>(() => ({ destination: 'tabs' }))
let lastLeave: boolean | undefined

function RootLayout() {
  const destination = useDestination((s) => s.destination)
  const home = destination === 'tabs' ? '/' : '/login'
  useLeaveSheetOnSessionChange(destination, home)
  return (
    <Stack>
      <Stack.Protected redirectTo={home} guard={destination === 'tabs'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="import-line" options={{ presentation: 'formSheet' }} />
      </Stack.Protected>
      <Stack.Protected redirectTo={home} guard={destination === 'login'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="language" options={{ presentation: 'formSheet' }} />
    </Stack>
  )
}

/** Màn trong sheet: "edit" làm dirty, "cancel" = ✕ (`confirmLeave` rồi đóng). */
function SheetScreen() {
  const [dirty, setDirty] = useState(false)
  const { confirmLeave } = useDiscardGuard({ dirty })
  const close = useCloseSheet()
  return (
    <>
      <Text>sheet</Text>
      <Pressable accessibilityRole="button" onPress={() => setDirty(true)}>
        <Text>edit</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        // Không trả promise: `fireEvent.press` của RNTL chờ promise của handler (hộp hỏi treo trong test).
        onPress={() => {
          void confirmLeave().then((ok) => {
            lastLeave = ok
            if (ok) close()
          })
        }}
      >
        <Text>cancel</Text>
      </Pressable>
    </>
  )
}

const ROUTES = {
  _layout: RootLayout,
  index: () => <Text>home</Text>,
  login: () => <Text>login</Text>,
  'import-line/_layout': () => <Stack />,
  'import-line/index': SheetScreen,
  'language/_layout': () => <Stack />,
  'language/index': SheetScreen,
}

type State = { index: number; routes: { name: string; state?: State }[] }

function rootStack(r: RenderRouterResult): string[] {
  const s = r.getRouterState() as unknown as State
  const root = s.routes[0]?.name === '__root' ? s.routes[0].state! : s
  return root.routes.slice(0, root.index + 1).map((x) => x.name)
}

const settle = () => act(() => jest.runAllTimersAsync())
const press = (label: string) => act(() => fireEvent.press(screen.getByText(label)))

async function openDirtySheet(path: '/import-line' | '/language') {
  const r = await renderRouter(ROUTES, { initialUrl: '/' })
  await act(() => router.push(path))
  await settle()
  expect(rootStack(r)).toEqual(['index', path.slice(1)])
  await press('edit')
  return r
}

const endSession = async () => {
  await act(async () => useDestination.setState({ destination: 'login' }))
  await settle()
}

/** Hộp hỏi treo tới khi test trả lời. */
function pendingConfirm() {
  let answer!: (ok: boolean) => void
  confirm.mockReturnValueOnce(new Promise<boolean>((res) => (answer = res)))
  return (ok: boolean) => act(async () => answer(ok))
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  useDestination.setState({ destination: 'tabs' })
  confirm.mockReset()
  lastLeave = undefined
})
afterEach(() => jest.useRealTimers())

describe('forced leave of a dirty sheet on destination change', () => {
  it('sheet whose guard flips (/import-line): goes to the new destination without asking', async () => {
    const r = await openDirtySheet('/import-line')
    await endSession()
    expect(rootStack(r)).toEqual(['login'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('sheet whose guard stays on (/language): replaced by the new destination without asking', async () => {
    const r = await openDirtySheet('/language')
    await endSession()
    expect(rootStack(r)).toEqual(['login'])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('prompt open (back) when the session ends: Bỏ thay đổi afterwards does not replay the old back', async () => {
    const r = await openDirtySheet('/language')
    const answer = pendingConfirm()
    await act(() => router.back())
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rootStack(r)).toEqual(['index', 'language'])

    await endSession()
    expect(rootStack(r)).toEqual(['login'])
    // Màn mới mở sau lần rời bắt buộc: một "back" cũ chạy lại sẽ đóng nhầm nó.
    await act(() => router.push('/language'))
    await settle()
    expect(rootStack(r)).toEqual(['login', 'language'])
    // Không chạy lại GO_BACK cũ (từ màn đã gỡ, expo-router sẽ báo "not handled").
    const errors = jest.spyOn(console, 'error')
    await answer(true)
    await settle()
    expect(rootStack(r)).toEqual(['login', 'language'])
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('prompt open (✕) when the sheet is removed by its guard: confirmLeave resolves false, no close', async () => {
    const r = await openDirtySheet('/import-line')
    const answer = pendingConfirm()
    await press('cancel')
    expect(confirm).toHaveBeenCalledTimes(1)

    await endSession()
    expect(rootStack(r)).toEqual(['login'])
    await answer(true)
    await settle()
    expect(lastLeave).toBe(false)
    expect(rootStack(r)).toEqual(['login'])
  })

  it('a normal back on a dirty sheet still asks (release happens only on destination change)', async () => {
    const r = await openDirtySheet('/import-line')
    confirm.mockResolvedValueOnce(false)
    await act(() => router.back())
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rootStack(r)).toEqual(['index', 'import-line'])
  })
})
