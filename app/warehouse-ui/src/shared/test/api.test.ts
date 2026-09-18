import { describe, expect, it } from 'vitest'
import { apiError, ok, paginated } from './api'

describe('ok', () => {
  it('bọc result trong envelope của backend, HTTP 200', async () => {
    const res = ok({ slug: 'a' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      message: 'ok',
      statusCode: 200,
      timestamp: '',
      result: { slug: 'a' },
    })
  })
})

describe('paginated', () => {
  it('mặc định trang 1, size 10, total = số item', async () => {
    const body = await paginated([{ id: 1 }, { id: 2 }]).json()
    expect(body.result).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevios: false,
    })
  })

  it('tính totalPages, hasNext, hasPrevios (đúng typo của backend)', async () => {
    const body = await paginated([{ id: 1 }], { page: 2, size: 20, total: 45 }).json()
    expect(body.result).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrevios: true,
    })
  })

  it('danh sách rỗng → totalPages 0', async () => {
    const body = await paginated([]).json()
    expect(body.result).toMatchObject({ total: 0, totalPages: 0, hasNext: false })
  })
})

describe('apiError', () => {
  it('đúng hình dạng lỗi backend, status HTTP khớp statusCode', async () => {
    const res = apiError(422, 999902, 'Example name does exist')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      statusCode: 422,
      code: 999902,
      timestamp: '',
      path: '',
      method: '',
      message: 'Example name does exist',
    })
  })

  it('không có code → body không có khoá code', async () => {
    const body = await apiError(500).json()
    expect(body).not.toHaveProperty('code')
    expect(body.statusCode).toBe(500)
  })
})
