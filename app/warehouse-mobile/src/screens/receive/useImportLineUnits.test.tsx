// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import type { AvailableMaterial, AvailableUnit } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { makeLine } from '@/features/receive-checklist/model/fixtures'

import { useImportLineUnits } from './useImportLineUnits'

const AV = '/warehouses/wh-a/import-forms/available-materials'
const au = (unitSlug: string, unitName: string, conversionRate: number): AvailableUnit => ({
  unitSlug,
  unitCode: unitName.toUpperCase(),
  unitName,
  conversionRate,
  isBaseUnit: conversionRate === 1,
})
const UNITS = [au('u-1', 'bao', 1), au('u-x', 'thùng', 24)]
const mat = (n: number, units: AvailableUnit[]): AvailableMaterial => ({
  slug: `m-${n}`,
  code: `VT${n}`,
  name: `Vật tư ${n}`,
  baseUnitSlug: 'u-1',
  quantity: 0,
  suppliers: [],
  units,
})
const page = (items: AvailableMaterial[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 50, totalPages: 1, hasNext: false })

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [] } as never,
  })
}
beforeEach(() => {
  resetFakeApi()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE'])
})
afterEach(() => client.clear())

describe('useImportLineUnits', () => {
  it('uses line.units without fetching', async () => {
    route('get', AV, () => page([]))
    const { result } = await renderHook(
      () => useImportLineUnits(makeLine(1, { units: UNITS }), 'wh-a'),
      { wrapper },
    )
    expect(result.current.units).toEqual(UNITS)
    let loaded: AvailableUnit[] | null = null
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toEqual(UNITS)
    expect(callsTo('get', AV)).toHaveLength(0)
  })

  it('fetches by material code and picks the matching slug', async () => {
    route('get', AV, () => page([mat(11, [au('z', 'z', 1)]), mat(1, UNITS)]))
    const { result } = await renderHook(() => useImportLineUnits(makeLine(1), 'wh-a'), {
      wrapper,
    })
    expect(result.current.units).toBeNull()
    let loaded: AvailableUnit[] | null = null
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toEqual(UNITS)
    expect(result.current.units).toEqual(UNITS)
    const sent = callsTo('get', AV)
    expect(sent.length).toBeGreaterThan(0)
  })

  it('returns null when the material is not found or the request fails', async () => {
    route('get', AV, () => page([mat(11, UNITS)]))
    const { result } = await renderHook(() => useImportLineUnits(makeLine(1), 'wh-a'), {
      wrapper,
    })
    let loaded: AvailableUnit[] | null = UNITS
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toBeNull()
    expect(result.current.units).toBeNull()

    client.clear()
    route('get', AV, () => failure(500))
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toBeNull()
  })

  it('returns null without a warehouse', async () => {
    const { result } = await renderHook(() => useImportLineUnits(makeLine(1), undefined), {
      wrapper,
    })
    let loaded: AvailableUnit[] | null = UNITS
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toBeNull()
  })

  it('without IMPORT_FORM_CREATE (available-materials is gated by it) → canLoad false, load never calls the API', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    route('get', AV, () => page([mat(1, UNITS)]))
    const { result } = await renderHook(() => useImportLineUnits(makeLine(1), 'wh-a'), {
      wrapper,
    })
    expect(result.current.canLoad).toBe(false)
    let loaded: AvailableUnit[] | null = UNITS
    await act(async () => {
      loaded = await result.current.load()
    })
    expect(loaded).toBeNull()
    expect(callsTo('get', AV)).toHaveLength(0)
  })

  it('line.units snapshot still works without IMPORT_FORM_CREATE', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    const { result } = await renderHook(
      () => useImportLineUnits(makeLine(1, { units: UNITS }), 'wh-a'),
      { wrapper },
    )
    expect(result.current.canLoad).toBe(true)
    expect(result.current.units).toEqual(UNITS)
  })
})
