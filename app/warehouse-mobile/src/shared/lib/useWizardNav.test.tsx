/**
 * Điều hướng luồng 3 bước trên cây route THẬT của expo-router (`renderRouter` với màn giả): Stack gốc
 * gồm `(tabs)` (tab Xuất là Stack: danh sách `index`, màn xem `[formSlug]/index`, màn kiểu Kiểm hàng
 * `[formSlug]/receive`), nhóm modal `export-form` (Stack lồng chứa ba bước `info` / `edit` / `review`)
 * và một sheet giả. Kiểm tra bằng các route còn lại trong Stack gốc / Stack tab / Stack modal.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { act, renderRouter, type RenderRouterResult } from 'expo-router/testing-library'
import { useEffect } from 'react'
import { Text } from 'react-native'

import { initI18n } from '@/shared/i18n'

import { confirmAction } from './native-confirm'
import { useDiscardGuard } from './useDiscardGuard'
import { useWizardNav, type WizardNav } from './useWizardNav'
import type { WizardStep } from './wizard-steps'

const OPTS = {
  tab: 'export',
  routes: { 1: '[formSlug]/info', 2: '[formSlug]/edit', 3: '[formSlug]/review' },
  paths: {
    1: '/export-form/[formSlug]/info',
    2: '/export-form/[formSlug]/edit',
    3: '/export-form/[formSlug]/review',
  },
  listPath: '/export',
  viewPath: '/export/[formSlug]',
} as const

jest.mock('./native-confirm', () => ({ confirmAction: jest.fn() }))

/** `nav` của màn bước vừa render gần nhất, theo `<bước>:<formSlug>`. */
const navs = new Map<string, WizardNav>()
/** `atRoot` của màn bước vừa render gần nhất, theo `<bước>:<formSlug>`. */
const roots = new Map<string, boolean>()
/** Việc chạy trong effect GẮN đầu tiên của màn bước (vd bước 3 tự về bước thiếu), theo `<bước>:<formSlug>`. */
const onMount = new Map<string, (nav: WizardNav) => void>()

function stepScreen(step: WizardStep) {
  return function StepScreen() {
    const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
    const nav = useWizardNav({ formSlug, ...OPTS })
    navs.set(`${step}:${formSlug}`, nav)
    roots.set(`${step}:${formSlug}`, nav.atRoot)
    useEffect(() => {
      onMount.get(`${step}:${formSlug}`)?.(nav)
      // Chỉ lần gắn đầu.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <Text>{`step ${step} ${formSlug}`}</Text>
  }
}

function ViewScreen() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  return <Text>{`view ${formSlug}`}</Text>
}

/** Sheet có thay đổi chưa lưu (discard guard) — chặn mọi lối rời qua `usePreventRemove`. */
function DirtySheet() {
  useDiscardGuard({ dirty: true })
  return <Text>dirty sheet</Text>
}

const ROUTES = {
  _layout: () => (
    <Stack>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="export-form"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="sheet" options={{ presentation: 'formSheet' }} />
      <Stack.Screen name="dirty-sheet" options={{ presentation: 'formSheet' }} />
    </Stack>
  ),
  '(tabs)/_layout': () => <Stack />,
  // `anchor` như layout tab thật: mở thẳng màn xem thì danh sách nằm dưới (`withAnchor`).
  '(tabs)/export/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/export/index': () => <Text>list</Text>,
  '(tabs)/export/[formSlug]/index': ViewScreen,
  '(tabs)/export/[formSlug]/receive': () => <Text>receive</Text>,
  'export-form/_layout': () => <Stack />,
  'export-form/[formSlug]/info': stepScreen(1),
  'export-form/[formSlug]/edit': stepScreen(2),
  'export-form/[formSlug]/review': stepScreen(3),
  sheet: () => <Text>sheet</Text>,
  'dirty-sheet': DirtySheet,
}

type StackRoute = { name: string; params?: { formSlug?: string }; state?: StackState }
type StackState = { index: number; routes: StackRoute[] }

const label = (x: StackRoute) => (x.params?.formSlug ? `${x.name}:${x.params.formSlug}` : x.name)
const active = (s: StackState | undefined) => s?.routes.slice(0, s.index + 1) ?? []

/** Stack gốc của app (bỏ lớp `__root` của expo-router nếu có). */
function rootState(r: RenderRouterResult): StackState {
  const top = r.getRouterState() as unknown as StackState
  return top.routes[0]?.name === '__root' ? (top.routes[0].state as StackState) : top
}

/** Tìm Stack lồng dưới route tên `name` (đang hoạt động, gần đỉnh nhất) trong cây. */
function findNested(s: StackState | undefined, name: string): StackState | undefined {
  for (const x of active(s).toReversed()) {
    if (x.name === name) return x.state
    const inner = findNested(x.state, name)
    if (inner) return inner
  }
  return undefined
}

/** Tên các route đang hoạt động của Stack gốc. */
const rootStack = (r: RenderRouterResult) => active(rootState(r)).map((x) => x.name)
/** Stack của tab Xuất, mỗi route là `<tên>` hoặc `<tên>:<formSlug>`. */
const exportStack = (r: RenderRouterResult) => active(findNested(rootState(r), 'export')).map(label)
/** Stack của modal `export-form`, mỗi route là `<tên>:<formSlug>`. */
const modalStack = (r: RenderRouterResult) =>
  active(findNested(rootState(r), 'export-form')).map(label)

async function open(...paths: string[]) {
  const r = await renderRouter(ROUTES, { initialUrl: '/export' })
  for (const p of paths) await act(() => router.push(p as never))
  return r
}

const nav = (step: WizardStep, formSlug: string) => {
  const n = navs.get(`${step}:${formSlug}`)
  if (!n) throw new Error(`no step ${step} screen for ${formSlug}`)
  return n
}

let warn: jest.SpyInstance
let error: jest.SpyInstance
/** Cảnh báo được phép trong ca đang chạy (chỉ ca mở thẳng modal). */
let allowedWarn: RegExp | undefined
/** Expo Router cảnh báo khi route modal là màn đầu Stack gốc (không có `anchor`) — đúng ca mở thẳng. */
const MODAL_FIRST = /uses presentation "fullScreenModal" but is the first screen/

beforeEach(async () => {
  await initI18n()
  jest
    .mocked(confirmAction)
    .mockReset()
    .mockReturnValue(new Promise(() => {}))
  navs.clear()
  roots.clear()
  onMount.clear()
  allowedWarn = undefined
  const print = console.warn.bind(console)
  warn = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!allowedWarn?.test(String(args[0]))) print(...args)
  })
  error = jest.spyOn(console, 'error')
})

afterEach(() => {
  // Không có cảnh báo "action ... was not handled" hay lỗi nào.
  const warned = warn.mock.calls.filter(([m]) => !allowedWarn?.test(String(m)))
  expect(warned).toEqual([])
  expect(error).not.toHaveBeenCalled()
  warn.mockRestore()
  error.mockRestore()
})

describe('useWizardNav', () => {
  /** Lùi một bước bằng back gốc (‹ / vuốt cạnh / back Android) rồi trả Stack modal. */
  async function back(r: RenderRouterResult) {
    await act(() => router.back())
    return modalStack(r)
  }

  describe('goToStep (Stack modal)', () => {
    it('goToStep from the mount effect of a step being pushed counts from that step', async () => {
      // Màn vừa được đẩy lên có thể chạy effect trước khi route của nó có trong state của Stack.
      onMount.set('3:f-1', (n) => n.goToStep(1))
      const r = await open('/export/f-1', '/export-form/f-1/edit', '/export-form/f-1/review')
      expect(modalStack(r)).toEqual(['[formSlug]/info:f-1'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:f-1'])
    })

    it('goToStep pops to an existing lower step', async () => {
      const r = await open(
        '/export-form/new/info',
        '/export-form/new/edit',
        '/export-form/new/review',
      )
      await act(() => nav(3, 'new').goToStep(1))
      expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
    })

    it('goToStep pops back one step at a time on a new form', async () => {
      const r = await open(
        '/export-form/new/info',
        '/export-form/new/edit',
        '/export-form/new/review',
      )
      await act(() => nav(3, 'new').goToStep(2))
      expect(modalStack(r)).toEqual(['[formSlug]/info:new', '[formSlug]/edit:new'])
      expect(await back(r)).toEqual(['[formSlug]/info:new'])
    })

    it('goToStep pushes a step that is not below', async () => {
      const r = await open('/export/f-1', '/export-form/f-1/edit')
      await act(() => nav(2, 'f-1').goToStep(3))
      expect(modalStack(r)).toEqual(['[formSlug]/edit:f-1', '[formSlug]/review:f-1'])
      expect(await back(r)).toEqual(['[formSlug]/edit:f-1'])
    })

    it('goToStep(1) from edit at modal root replaces it → modal [info], atRoot true', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit')
      expect(roots.get('2:px-1')).toBe(true)
      await act(() => nav(2, 'px-1').goToStep(1))
      expect(modalStack(r)).toEqual(['[formSlug]/info:px-1'])
      expect(roots.get('1:px-1')).toBe(true)
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    })

    it('atRoot is false for a pushed step', async () => {
      await open('/export/px-1', '/export-form/px-1/edit')
      await act(() => nav(2, 'px-1').goToStep(3))
      expect(roots.get('2:px-1')).toBe(true)
      expect(roots.get('3:px-1')).toBe(false)
    })

    it('existing form: step 2 from step 1 is pushed, back goes to step 1', async () => {
      const r = await open('/export/f-1', '/export-form/f-1/edit')
      await act(() => nav(2, 'f-1').goToStep(1))
      await act(() => nav(1, 'f-1').goToStep(2))
      expect(modalStack(r)).toEqual(['[formSlug]/info:f-1', '[formSlug]/edit:f-1'])
      expect(await back(r)).toEqual(['[formSlug]/info:f-1'])
    })

    it('existing form: step 3 from step 1 pushed over step 2 drops step 1, back goes to step 2', async () => {
      const r = await open('/export/f-1', '/export-form/f-1/edit', '/export-form/f-1/info')
      await act(() => nav(1, 'f-1').goToStep(3))
      expect(modalStack(r)).toEqual(['[formSlug]/edit:f-1', '[formSlug]/review:f-1'])
      expect(await back(r)).toEqual(['[formSlug]/edit:f-1'])
    })

    it('existing form: step 1 from step 3 replaces the flow with step 1', async () => {
      const r = await open('/export/f-1', '/export-form/f-1/edit', '/export-form/f-1/review')
      await act(() => nav(3, 'f-1').goToStep(1))
      expect(modalStack(r)).toEqual(['[formSlug]/info:f-1'])
    })

    it('goToStep to the current step does nothing', async () => {
      const r = await open('/export-form/new/info', '/export-form/new/edit')
      await act(() => nav(2, 'new').goToStep(2))
      expect(modalStack(r)).toEqual(['[formSlug]/info:new', '[formSlug]/edit:new'])
    })
  })

  describe('leaving the flow', () => {
    describe('from the mount effect of the first modal screen', () => {
      it('exit (opened from the list) closes the modal', async () => {
        onMount.set('1:new', (n) => n.exit())
        const r = await open('/export-form/new/info')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index'])
      })

      it('exit (opened over the view) closes the modal, view stays', async () => {
        onMount.set('2:px-1', (n) => n.exit())
        const r = await open('/export/px-1', '/export-form/px-1/edit')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
      })

      it('finishToList (opened from the list) closes the modal', async () => {
        onMount.set('1:new', (n) => n.finishToList())
        const r = await open('/export-form/new/info')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index'])
      })

      it('finishToList (opened over the view) → tab [index]', async () => {
        onMount.set('2:px-1', (n) => n.finishToList())
        const r = await open('/export/px-1', '/export-form/px-1/edit')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index'])
      })

      it('finish (opened over the view) → [index, view:px-1]', async () => {
        onMount.set('2:px-1', (n) => n.finish('px-1'))
        const r = await open('/export/px-1', '/export-form/px-1/edit')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
      })

      it('finish (opened from the list) pushes view:slug', async () => {
        onMount.set('2:px-1', (n) => n.finish('px-1'))
        const r = await open('/export-form/px-1/edit')
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
      })
    })

    it('exit from new-form step 1 closes the modal, tab stays [index]', async () => {
      const r = await open('/export-form/new/info')
      expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
      await act(() => nav(1, 'new').exit())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index'])
    })

    it('exit from edit opened over view keeps [index, [formSlug]/index:px-1]', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/info')
      await act(() => nav(1, 'px-1').exit())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    })

    it('finish after editing existing form opened from view → [index, view:px-1], no modal', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
      await act(() => nav(3, 'px-1').finish('px-1'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
      await act(() => router.back())
      expect(exportStack(r)).toEqual(['index'])
    })

    it('finish(slug) pops the tab back to the last view of that slug', async () => {
      const r = await open('/export/px-1', '/export/px-1/receive', '/export-form/px-1/edit')
      await act(() => nav(2, 'px-1').finish('px-1'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    })

    it('finish(slug) when tab is [index] pushes view:slug', async () => {
      const r = await open(
        '/export-form/new/info',
        '/export-form/new/edit',
        '/export-form/new/review',
      )
      await act(() => nav(3, 'new').finish('px-9'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
      await act(() => router.back())
      expect(exportStack(r)).toEqual(['index'])
    })

    it('finish(slug) when tab top is another screen (receive-like) pushes view on top', async () => {
      const r = await open('/export/px-1/receive', '/export-form/px-1/edit')
      expect(exportStack(r)).toEqual(['index', '[formSlug]/receive:px-1'])
      await act(() => nav(2, 'px-1').finish('px-1'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/receive:px-1', '[formSlug]/index:px-1'])
    })

    it('finish from a step that is no longer on top still closes the whole modal', async () => {
      // Lưu nháp bắt đầu ở bước 1, người dùng chạm sang bước 2 trong lúc chờ; ghi xong → finish của bước 1.
      const r = await open('/export-form/new/info', '/export-form/new/edit')
      await act(() => nav(1, 'new').finish('px-9'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
    })

    it('finishToList from a modal opened over view:px-1 → tab [index], no modal', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
      await act(() => nav(3, 'px-1').finishToList())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index'])
    })

    it('finishToList when the tab bottom is not the list resets the tab to [index]', async () => {
      const r = await renderRouter(ROUTES, { initialUrl: '/export' })
      await act(() => router.replace('/export/px-1' as never))
      expect(exportStack(r)).toEqual(['[formSlug]/index:px-1'])
      await act(() => router.push('/export-form/px-1/edit' as never))
      await act(() => nav(2, 'px-1').finishToList())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index'])
    })

    it('exit with a sheet open over the modal closes both', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit', '/sheet')
      expect(rootStack(r)).toEqual(['(tabs)', 'export-form', 'sheet'])
      await act(() => nav(2, 'px-1').exit())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    })

    it.each(['exit', 'finishToList'] as const)(
      '%s with a dirty sheet open over the modal closes both without asking',
      async (kind) => {
        const r = await open('/export/px-1', '/export-form/px-1/edit', '/dirty-sheet')
        expect(rootStack(r)).toEqual(['(tabs)', 'export-form', 'dirty-sheet'])
        await act(() => nav(2, 'px-1')[kind]())
        expect(rootStack(r)).toEqual(['(tabs)'])
        expect(confirmAction).not.toHaveBeenCalled()
      },
    )

    it('reopen(px-9) from new step 3 → tab [index, view:px-9], modal [edit:px-9]', async () => {
      const r = await open(
        '/export-form/new/info',
        '/export-form/new/edit',
        '/export-form/new/review',
      )
      await act(() => nav(3, 'new').reopen('px-9'))
      expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
      expect(modalStack(r)).toEqual(['[formSlug]/edit:px-9'])
      expect(roots.get('2:px-9')).toBe(true)
    })

    it('leaving twice from the same screen closes the modal once', async () => {
      const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
      const n = nav(3, 'px-1')
      await act(() => n.finish('px-1'))
      // Sheet mở trên tab sau khi modal đã đóng: lần rời thứ hai không được đụng tới nó.
      await act(() => router.push('/sheet'))
      expect(rootStack(r)).toEqual(['(tabs)', 'sheet'])
      await act(() => n.finish('px-1'))
      await act(() => n.finishToList())
      await act(() => n.exit())
      expect(rootStack(r)).toEqual(['(tabs)', 'sheet'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    })

    it('modal opened straight (no tabs below): finishToList → /export', async () => {
      allowedWarn = MODAL_FIRST
      const r = await renderRouter(ROUTES, { initialUrl: '/export-form/new/info' })
      expect(rootStack(r)).toEqual(['export-form'])
      await act(() => nav(1, 'new').finishToList())
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index'])
    })

    it('modal opened straight (no tabs below): finish(slug) → /export then the view', async () => {
      allowedWarn = MODAL_FIRST
      const r = await renderRouter(ROUTES, { initialUrl: '/export-form/new/info' })
      await act(() => nav(1, 'new').finish('px-9'))
      expect(rootStack(r)).toEqual(['(tabs)'])
      expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
    })
  })
})
