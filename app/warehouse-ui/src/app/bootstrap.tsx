import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { App } from '@/app/App'
import { router } from '@/app/routes'
import { wireClientStateLifecycle } from '@/app/client-state-lifecycle'
import { queryClient } from '@/app/query-client'
import { store } from '@/app/store'
import { useAuthStore } from '@/entities/session'
import { setSessionEndHandler } from '@/shared/api/http'
import '@/app/styles/index.css'
import '@/shared/i18n'

export function bootstrap(container: HTMLElement): void {
  // Tiêm hàm dọn cache ở đây, không trong entities/session: entity không được import app.
  // React Query xoá ở mọi start/endSession như trước; Redux chỉ purge khi logout thật / đổi user
  // (screen-contracts R2) — xem client-state-lifecycle.ts.
  wireClientStateLifecycle({ queryClient, store })

  // Tiêm cách kết thúc phiên: interceptor (shared) chỉ báo lý do, không được import entities.
  // Không tải lại trang: ProtectedRoute tự điều hướng và giữ được địa chỉ để quay lại.
  setSessionEndHandler((reason) => useAuthStore.getState().endSession(reason))

  createRoot(container).render(
    <StrictMode>
      <App>
        <RouterProvider router={router} />
      </App>
    </StrictMode>,
  )
}
