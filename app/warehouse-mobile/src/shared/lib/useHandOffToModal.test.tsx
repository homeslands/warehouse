/**
 * Chuyển giao từ Stack tab sang modal gốc trên cây route THẬT (`renderRouter` với màn giả): Stack gốc
 * gồm `(tabs)` (tab Xuất là Stack: danh sách `index`, màn xem `[formSlug]/index`, link cũ `create` /
 * `[formSlug]/edit` / `twice`) và nhóm modal `export-form` (Stack lồng `info` / `edit`).
 */
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { act, renderRouter, type RenderRouterResult } from 'expo-router/testing-library'
import { useEffect } from 'react'
import { Text } from 'react-native'

import { useHandOffToModal } from './useHandOffToModal'

/** Route chỉ chuyển giao sang `href` khi gắn (gọi `times` lần trong cùng effect). */
function handOff(href: (slug: string) => Href, times = 1) {
  return function HandOffRoute() {
    const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
    const hand = useHandOffToModal()
    useEffect(() => {
      for (let i = 0; i < times; i++) hand(href(formSlug))
      // Chỉ lần gắn đầu.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
}

/** Màn xem giả: `new` (link cũ `/export/new`) chuyển giao sang bước 1 của phiếu mới. */
function ViewScreen() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const hand = useHandOffToModal()
  useEffect(() => {
    if (formSlug === 'new') hand('/export-form/new/info')
  }, [formSlug, hand])
  return <Text>{`view ${formSlug}`}</Text>
}

const step = (name: string) =>
  function StepScreen() {
    const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
    return <Text>{`${name} ${formSlug}`}</Text>
  }

const ROUTES = {
  _layout: () => (
    <Stack>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="export-form"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  ),
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/export/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/export/index': () => <Text>list</Text>,
  '(tabs)/export/create': handOff(() => '/export-form/new/info'),
  '(tabs)/export/twice': handOff(() => '/export-form/new/info', 2),
  '(tabs)/export/[formSlug]/index': ViewScreen,
  '(tabs)/export/[formSlug]/edit': handOff((formSlug) => ({
    pathname: '/export-form/[formSlug]/edit',
    params: { formSlug },
  })),
  'export-form/_layout': () => <Stack />,
  'export-form/[formSlug]/info': step('info'),
  'export-form/[formSlug]/edit': step('edit'),
}

type StackRoute = { name: string; params?: { formSlug?: string }; state?: StackState }
type StackState = { index: number; routes: StackRoute[] }

const label = (x: StackRoute) => (x.params?.formSlug ? `${x.name}:${x.params.formSlug}` : x.name)
const active = (s: StackState | undefined) => s?.routes.slice(0, s.index + 1) ?? []

function rootState(r: RenderRouterResult): StackState {
  const top = r.getRouterState() as unknown as StackState
  return top.routes[0]?.name === '__root' ? (top.routes[0].state as StackState) : top
}

function findNested(s: StackState | undefined, name: string): StackState | undefined {
  for (const x of active(s).toReversed()) {
    if (x.name === name) return x.state
    const inner = findNested(x.state, name)
    if (inner) return inner
  }
  return undefined
}

const rootStack = (r: RenderRouterResult) => active(rootState(r)).map((x) => x.name)
const exportStack = (r: RenderRouterResult) => active(findNested(rootState(r), 'export')).map(label)
const modalStack = (r: RenderRouterResult) =>
  active(findNested(rootState(r), 'export-form')).map(label)

async function open(...paths: string[]) {
  const r = await renderRouter(ROUTES, { initialUrl: '/export' })
  for (const p of paths) await act(() => router.push(p as never))
  await act(() => jest.runAllTimersAsync())
  return r
}

let warn: jest.SpyInstance
let error: jest.SpyInstance

beforeEach(() => {
  warn = jest.spyOn(console, 'warn')
  error = jest.spyOn(console, 'error')
})

afterEach(() => {
  // Không có cảnh báo "action ... was not handled" hay lỗi nào.
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  warn.mockRestore()
  error.mockRestore()
})

describe('useHandOffToModal', () => {
  it('hand-off from [index, view:new] → tab [index], modal [info:new]', async () => {
    const r = await open('/export/new')
    expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
  })

  it('hand-off from a legacy step route keeps the view below → tab [index, view:px-1], modal [edit:px-1]', async () => {
    const r = await open('/export/px-1', '/export/px-1/edit')
    expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-1'])
  })

  it('hand-off from a screen at the bottom of the tab → tab [index], modal on top', async () => {
    const r = await renderRouter(ROUTES, { initialUrl: '/export' })
    // `replace` thay danh sách → route chuyển giao là đáy Stack tab.
    await act(() => router.replace('/export/create'))
    await act(() => jest.runAllTimersAsync())
    expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
  })

  it('deep link to a legacy route (tab not mounted yet) → tab [index], modal on top', async () => {
    const r = await renderRouter(ROUTES, { initialUrl: '/export/create' })
    await act(() => jest.runAllTimersAsync())
    expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
  })

  it('called twice → one modal', async () => {
    const r = await open('/export/twice')
    expect(rootStack(r)).toEqual(['(tabs)', 'export-form'])
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
  })
})
