import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { http } from '@/shared/api/http'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  cancelExportForm,
  confirmExportForm,
  createExportForm,
  fetchExportForm,
  fetchExportForms,
  removeExportForm,
  submitExportForm,
  updateExportForm,
  uploadExportFormFile,
} from './export-form.api'
import { exportFormFixture } from '../model/fixtures'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/export-forms`

describe('export-form.api', () => {
  it('GET danh sách: page/size/sort/status/type, bỏ giá trị rỗng', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        seen.push(new URL(request.url).search)
        return paginated([exportFormFixture()])
      }),
    )
    await fetchExportForms('w-a', {
      page: 2,
      size: 10,
      sort: 'DESC',
      sortBy: 'createdAt',
      status: 'PENDING',
      type: 'SALE',
    })
    await fetchExportForms('w-a', { page: 1, size: 10, status: undefined, code: '' })
    expect(seen[0]).toContain('page=2')
    expect(seen[0]).toContain('status=PENDING')
    expect(seen[0]).toContain('type=SALE')
    expect(seen[0]).toContain('sortBy=createdAt')
    expect(seen[1]).not.toContain('status')
    expect(seen[1]).not.toContain('code')
  })

  it('GET chi tiết', async () => {
    server.use(mswHttp.get(`${URL_W}/xf-1`, () => ok(exportFormFixture())))
    expect((await fetchExportForm('w-a', 'xf-1')).code).toBe('PX-0001')
  })

  it('POST / PATCH / DELETE / submit / confirm / cancel đúng URL và body', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        bodies.create = await request.json()
        return ok(exportFormFixture())
      }),
      mswHttp.patch(`${URL_W}/xf-1`, async ({ request }) => {
        bodies.update = await request.json()
        return ok(exportFormFixture())
      }),
      mswHttp.delete(`${URL_W}/xf-1`, () => ok('1 export form have been deleted successfully')),
      mswHttp.post(`${URL_W}/xf-1/submit`, async ({ request }) => {
        bodies.submit = await request.json()
        return ok(exportFormFixture({ status: 'PENDING' }))
      }),
      mswHttp.post(`${URL_W}/xf-1/confirm`, async ({ request }) => {
        bodies.confirm = await request.json()
        return ok(exportFormFixture({ status: 'CONFIRMED' }))
      }),
      mswHttp.post(`${URL_W}/xf-1/cancel`, async ({ request }) => {
        bodies.cancel = await request.json()
        return ok(exportFormFixture({ status: 'CANCELLED' }))
      }),
    )
    const input = {
      code: 'PX-0002',
      type: 'SALE' as const,
      purchaseOrder: 'PO-1',
      receiver: 'Cửa hàng B',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 1, unitPrice: 0 }],
    }
    await createExportForm('w-a', input)
    await updateExportForm('w-a', 'xf-1', { version: 3, note: '' })
    expect(await removeExportForm('w-a', 'xf-1')).toContain('deleted')
    expect((await submitExportForm('w-a', 'xf-1', 3)).status).toBe('PENDING')
    expect((await confirmExportForm('w-a', 'xf-1', 4)).status).toBe('CONFIRMED')
    expect((await cancelExportForm('w-a', 'xf-1', 4)).status).toBe('CANCELLED')
    expect(bodies.create).toEqual(input)
    expect(bodies.update).toEqual({ version: 3, note: '' })
    expect(bodies.submit).toEqual({ version: 3 })
    expect(bodies.confirm).toEqual({ version: 4 })
    expect(bodies.cancel).toEqual({ version: 4 })
  })

  it('upload-file gửi multipart field "file" (FormData) và trả link S3 trong result', async () => {
    // Spy thay vì MSW: FormData chứa File của jsdom không serialize được qua undici trong môi trường test.
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      data: { message: 'ok', statusCode: 201, result: 'https://s3.example/xf.pdf' },
    })
    const file = new File(['abc'], 'hd.pdf', { type: 'application/pdf' })
    expect(await uploadExportFormFile('w-a', file)).toBe('https://s3.example/xf.pdf')
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/warehouses/w-a/export-forms/upload-file')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
    post.mockRestore()
  })
})
