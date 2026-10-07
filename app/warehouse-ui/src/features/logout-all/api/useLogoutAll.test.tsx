import { screen, waitFor } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useLogoutAll } from './useLogoutAll'

const BASE = 'http://localhost:8085/api/v1'

function Probe() {
  const logoutAll = useLogoutAll()
  return <button onClick={() => logoutAll.mutate()}>go</button>
}

afterEach(() => vi.restoreAllMocks())

describe('useLogoutAll', () => {
  it('thành công → toast "Đã đăng xuất khỏi mọi thiết bị"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => '')
    server.use(
      mswHttp.post(`${BASE}/auth/logout-all`, () =>
        HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { revokedSessions: 3 },
        }),
      ),
    )
    const { user } = renderWithProviders(<Probe />, {
      auth: { userName: 'a', roleName: 'ADMIN', scope: [] },
    })

    await user.click(screen.getByRole('button', { name: 'go' }))

    await waitFor(() =>
      expect(spy).toHaveBeenCalledExactlyOnceWith('Đã đăng xuất khỏi mọi thiết bị'),
    )
  })
})
