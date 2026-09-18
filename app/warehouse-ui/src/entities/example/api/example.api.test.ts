import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { updateExample } from './example.api'

const BASE = 'http://localhost:8085/api/v1'

describe('updateExample', () => {
  it('gửi kèm version trong body PATCH — backend dùng nó để phát hiện xung đột', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/examples/example-a`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: {} })
      }),
    )

    await updateExample('example-a', { name: 'Example B', description: 'mô tả', version: 3 })

    expect(body).toEqual({ name: 'Example B', description: 'mô tả', version: 3 })
  })
})
