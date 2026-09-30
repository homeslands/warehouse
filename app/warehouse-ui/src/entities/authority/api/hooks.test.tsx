import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useAuthorities } from './hooks'

const BASE = 'http://localhost:8085/api/v1'

const authority = {
  slug: 'import-form-create',
  code: 'IMPORT_FORM_CREATE',
  name: 'Tạo phiếu nhập',
  authorityGroup: { slug: 'import-form', name: 'Import Form' },
}

function Probe() {
  const query = useAuthorities()
  return (
    <div>
      <output data-testid="codes">{(query.data ?? []).map((a) => a.code).join(',')}</output>
      <output data-testid="groups">
        {(query.data ?? []).map((a) => a.authorityGroup.name).join(',')}
      </output>
    </div>
  )
}

describe('useAuthorities', () => {
  it('gọi GET /authorities và trả danh sách kèm nhóm lồng sẵn', async () => {
    let search = 'chưa gọi'
    server.use(
      mswHttp.get(`${BASE}/authorities`, ({ request }) => {
        search = new URL(request.url).search
        return ok([authority])
      }),
    )

    renderWithProviders(<Probe />, { route: '/' })

    // `<output>` luôn có mặt trong DOM ngay từ lần render đầu (không phụ thuộc query), nên
    // `findByTestId` khớp NGAY LẬP TỨC ở lần kiểm tra đồng bộ đầu tiên của `waitFor` — trước khi
    // fetch bất đồng bộ kịp chạy — và không chờ thêm nữa. Phải `waitFor` trên chính nội dung.
    await waitFor(() => expect(screen.getByTestId('codes')).toHaveTextContent('IMPORT_FORM_CREATE'))
    expect(screen.getByTestId('groups')).toHaveTextContent('Import Form')
    // Endpoint KHÔNG phân trang (service bỏ qua page/size) — gửi thừa tham số là nói sai hợp đồng.
    expect(search).toBe('')
  })
})
