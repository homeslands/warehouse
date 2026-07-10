import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import { setUnauthorizedHandler } from '@/shared/api/http'
import { useAuthStore } from '@/shared/auth/auth.store'
import './index.css'

// Tiêm handler 401 ở đây, không trong http.ts: tránh vòng import http → store → http.
setUnauthorizedHandler(() => {
  useAuthStore.getState().logout()
  window.location.assign('/login')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
