import { screen, waitFor } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { LogoutAllDialog } from './LogoutAllDialog'

const BASE = 'http://localhost:8085/api/v1'
const me = { userName: '0310000000', roleName: 'ADMIN', scope: [] }

describe('LogoutAllDialog', () => {
  it('phải gõ đúng tên đăng nhập của chính mình mới bấm được', async () => {
    let calls = 0
    server.use(
      mswHttp.post(`${BASE}/auth/logout-all`, () => {
        calls += 1
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: null })
      }),
    )
    const { user } = renderWithProviders(<LogoutAllDialog open onOpenChange={() => {}} />, {
      auth: me,
    })
    const submit = screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' })
    const input = screen.getByLabelText('Nhập 0310000000 để xác nhận')

    expect(submit).toBeDisabled()
    await user.type(input, '0310000001')
    expect(submit).toBeDisabled()

    await user.clear(input)
    await user.type(input, '0310000000')
    expect(submit).toBeEnabled()
    await user.click(submit)

    await waitFor(() => expect(calls).toBe(1))
  })
})
