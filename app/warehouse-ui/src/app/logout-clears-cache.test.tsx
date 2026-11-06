import { createSlice } from '@reduxjs/toolkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { useAuthStore } from '@/entities/session'
import { ExamplesPage } from '@/pages/examples'
import { wireClientStateLifecycle } from '@/app/client-state-lifecycle'
import { queryClient } from '@/app/query-client'
import { store } from '@/app/store'
import { rootReducer } from '@/shared/store'

// Test binding spec 2.2: "render danh sách, logout, kiểm tra cache rỗng". Sống ở tầng `app`
// (không phải entities/session hay pages/examples) vì nó cần cả queryClient thật của app VÀ
// một page thật để lấp cache — app là tầng duy nhất được import cả hai.
//
// Mô phỏng đúng luồng thật: trang danh sách vẫn còn mounted lúc logout() chạy (người dùng bấm
// "Đăng xuất" ngay trên AppShell trong khi đang đứng ở trang đó) — không unmount trước khi
// logout, việc đó che giấu đúng cái bug thật: logout() xoá cache, nhưng ExamplesPage tự nó
// subscribe `user` qua useAuthStore (useSession không nằm trong cây render của test này) nên
// logout() (set user về null) khiến chính ExamplesPage re-render — và trong lần re-render đó,
// useQuery thấy cache đã bị xoá nên tự dựng lại NGAY một query rỗng và bắt đầu refetch nền. Đó
// là lý do startSession() (bắt đầu phiên mới) phải xoá cache lần nữa: assert ngay sau startSession(),
// tức đúng thời điểm sản phẩm cam kết — không đợi bất kỳ refetch nào chạy xong.
//
// Trong app thật, ProtectedRoute (app/routes/index.tsx) unmount trang ngay khi status chuyển
// sang unauthenticated, nên refetch-sau-logout mà test này khơi ra chủ yếu là kịch bản của bộ
// test (harness), không phải luồng người dùng thấy được — nhát xoá cache trong startSession() được
// giữ lại như một đảm bảo phòng thủ, để phiên mới luôn bắt đầu rỗng dù trang cũ có lỡ còn sống.
const BASE = 'http://localhost:8085/api/v1'

// Slice CHỈ dùng trong test (mock draft, M01 chưa có slice thật) để chứng minh logout purge Redux.
const draftSlice = createSlice({
  name: 'testDraft',
  initialState: { dirty: false },
  reducers: { touch: (state) => void (state.dirty = true) },
})
const selectDirty = rootReducer.inject(draftSlice).selector((s) => s.testDraft.dirty)
let unwire: () => void = () => {}

const example = {
  id: '1',
  slug: 'example-a',
  name: 'Example A',
  description: 'mô tả',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
}

beforeEach(() => {
  // Wiring giống hệt bootstrap.tsx (cùng hàm, cùng queryClient/store singleton của app) — không
  // mock, để test chứng minh cả React Query lẫn Redux thật sự rỗng sau logout + đăng nhập lại.

  server.use(
    mswHttp.get(`${BASE}/examples`, () =>
      HttpResponse.json({
        message: 'ok',
        statusCode: 200,
        timestamp: '',
        result: {
          items: [example],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNext: false,
          hasPrevios: false,
        },
      }),
    ),
  )

  useAuthStore.setState({
    hasSession: true,
    user: { userName: 'root', roleName: 'SUPER_ADMIN', scope: [] },
    status: 'authenticated',
  })
  unwire = wireClientStateLifecycle({ queryClient, store })
})

afterEach(() => {
  // queryClient/store và wiring là singleton của tầng app — dọn lại để không rò sang file test khác.
  unwire()
  queryClient.clear()
})

describe('logout xoá cache react-query và client state Redux (integration)', () => {
  it('trang cũ vẫn mounted lúc logout — phiên mới vẫn không thấy dữ liệu của phiên trước', async () => {
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExamplesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Example A')
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)
    store.dispatch(draftSlice.actions.touch())
    expect(selectDirty(store.getState())).toBe(true)

    // KHÔNG unmount ở đây — đúng luồng thật là trang vẫn còn mounted lúc người dùng bấm logout.
    // ExamplesPage chỉ đọc `user` từ useAuthStore (để hiện/ẩn nút Tạo) — logout() set user về
    // null nên chính ExamplesPage re-render — và trong lần re-render đó, useQuery thấy cache đã
    // bị logout() xoá nên tự dựng ngay một query rỗng ('pending', chưa có data) rồi bắt đầu
    // refetch nền.
    // Không có token trong storage nên logout() không gọi API và kết thúc phiên đồng bộ.
    act(() => {
      void useAuthStore.getState().logout()
    })
    // Logout thật → Redux purge ngay (screen-contracts R2: logout purge query/Redux/draft).
    expect(selectDirty(store.getState())).toBe(false)

    // Bắt đầu phiên của người dùng kế tiếp trên cùng tab — đúng lúc sản phẩm cam kết cache rỗng.
    act(() => {
      useAuthStore
        .getState()
        .startSession({ accessToken: 'acc-nguoi-moi', refreshToken: 'ref-nguoi-moi' })
    })

    // Assert NGAY, không chờ refetch nào chạy xong: startSession() có đặt `user = null`, nhưng
    // `user` đã là null sau logout() nên ExamplesPage (chỉ subscribe `user`) không re-render —
    // nghĩa là không gì kịp dựng lại query trước khi ta đo. Nếu startSession() không gọi lại clearCache(), query rỗng mà logout() để
    // lại vẫn còn nguyên trong cache (length > 0) — đây là chỗ discriminate được: .every(data ===
    // undefined) ĐÚNG ở cả hai trường hợp (query đó luôn chưa có data ở đúng thời điểm này) nên
    // không phải test thật; .length === 0 mới là thứ thật sự đổi giữa có/không có clearCache()
    // trong startSession().
    expect(queryClient.getQueryCache().getAll().length).toBe(0)

    view.unmount()
  })
})
