import { useAuthStore } from '@/entities/session'
import { setTestAuthApplier } from '@/shared/test/render'

// Chạy trước mỗi file test (vite.config.ts → test.setupFiles), SAU src/shared/test/setup.ts.
// `shared` không được import `entities`, nên tầng app tiêm cách đặt phiên cho renderWithProviders —
// cùng khuôn với setSessionEndHandler / setCacheCleaner trong bootstrap.tsx.
// KHÔNG import ở đây module nào mà test hay vi.mock (vd `sonner`): setup nạp trước, mock sẽ trượt.
setTestAuthApplier((user) => {
  if (user) {
    useAuthStore.setState({ hasSession: true, user, status: 'authenticated', endReason: null })
  } else {
    // Không đụng endReason: test màn login đặt lý do trước rồi mới render.
    useAuthStore.setState({ hasSession: false, user: null, status: 'unauthenticated' })
  }
})
