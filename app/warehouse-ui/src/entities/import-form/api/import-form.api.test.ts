import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  cancelImportForm,
  confirmImportForm,
  createImportForm,
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportForms,
  removeImportForm,
  updateImportForm,
} from './import-form.api'
import { draftForm, flour } from '../model/fixtures'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/import-forms`

describe('import-form.api', () => {
  it('GET danh sách: page/size/sort/status, bỏ status rỗng', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        seen.push(new URL(request.url).search)
        return paginated([draftForm])
      }),
    )
    await fetchImportForms('w-a', {
      page: 2,
      size: 10,
      sort: 'DESC',
      sortBy: 'createdAt',
      status: 'DRAFT',
    })
    await fetchImportForms('w-a', { page: 1, size: 10, status: undefined })
    expect(seen[0]).toContain('page=2')
    expect(seen[0]).toContain('status=DRAFT')
    expect(seen[0]).toContain('sort=DESC')
    expect(seen[0]).toContain('sortBy=createdAt')
    expect(seen[1]).not.toContain('status')
  })

  it('GET chi tiết + available-materials', async () => {
    server.use(
      mswHttp.get(`${URL_W}/if-1`, () => ok(draftForm)),
      mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])),
    )
    expect((await fetchImportForm('w-a', 'if-1')).code).toBe('PN-0001')
    expect(
      (await fetchAvailableMaterials('w-a', { page: 1, size: 100 })).items[0].units,
    ).toHaveLength(2)
  })

  it('available-materials gửi code / name khi có, bỏ khi rỗng', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return paginated([flour])
      }),
    )
    await fetchAvailableMaterials('w-a', { page: 1, size: 50, code: 'VT', name: 'xi' })
    await fetchAvailableMaterials('w-a', { page: 1, size: 50, code: '', name: undefined })
    expect(seen[0]).toContain('code=VT')
    expect(seen[0]).toContain('name=xi')
    expect(seen[1]).not.toContain('code')
    expect(seen[1]).not.toContain('name')
  })

  it('POST / PATCH / DELETE / confirm / cancel đúng URL và body', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        bodies.create = await request.json()
        return ok(draftForm)
      }),
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        bodies.update = await request.json()
        return ok(draftForm)
      }),
      mswHttp.delete(`${URL_W}/if-1`, () => ok('1 import form have been deleted successfully')),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        bodies.confirm = await request.json()
        return ok({ ...draftForm, status: 'CONFIRMED' })
      }),
      mswHttp.post(`${URL_W}/if-1/cancel`, async ({ request }) => {
        bodies.cancel = await request.json()
        return ok({ ...draftForm, status: 'CANCELLED' })
      }),
    )
    const input = {
      code: 'PN-0002',
      invoiceCode: 'HD-1',
      date: '2026-10-13',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 1, unitPrice: 0 }],
    }
    await createImportForm('w-a', input)
    await updateImportForm('w-a', 'if-1', { version: 3, note: '' })
    await removeImportForm('w-a', 'if-1')
    expect((await confirmImportForm('w-a', 'if-1', 3)).status).toBe('CONFIRMED')
    expect((await cancelImportForm('w-a', 'if-1', 3)).status).toBe('CANCELLED')
    expect(bodies.create).toEqual(input)
    expect(bodies.update).toEqual({ version: 3, note: '' })
    expect(bodies.confirm).toEqual({ version: 3 })
    expect(bodies.cancel).toEqual({ version: 3 })
  })
})
