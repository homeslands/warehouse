'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

/**
 * Huy hiệu icon: hình tròn nền đặc theo loại thông báo, icon trắng. Nền của cả toast luôn là
 * `--popover` (trắng ở sáng, tối ở tối) — màu phân loại chỉ nằm trong huy hiệu này, nên không
 * dùng `richColors` của sonner (nó tô màu cả nền toast).
 */
function ToastIcon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="top-center"
      className="toaster group"
      icons={{
        success: (
          <ToastIcon className="bg-success">
            <CheckIcon className="size-4" />
          </ToastIcon>
        ),
        info: (
          <ToastIcon className="bg-info">
            <InfoIcon className="size-4" />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon className="bg-warning">
            <TriangleAlertIcon className="size-4" />
          </ToastIcon>
        ),
        error: (
          <ToastIcon className="bg-destructive">
            <OctagonXIcon className="size-4" />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon className="bg-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
          </ToastIcon>
        ),
      }}
      style={
        {
          // `--width` đặt chiều rộng cho CẢ <ol> lẫn <li>. KHÔNG để `fit-content`: <li> là
          // `position: absolute` nên <ol> không tính nó vào chiều rộng và co về 0, kéo theo toast
          // bị bẻ từng ký tự một. Ở đây nó đóng vai TRẦN — <li> tự co bằng `w-fit` bên dưới.
          '--width': 'min(90vw, 28rem)',
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'transparent',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Không viền, bóng mềm; icon và nội dung nằm cùng một hàng, canh giữa theo chiều dọc.
          toast:
            'cn-toast !left-0 !right-0 !mx-auto !w-fit !max-w-full !rounded-full !border-0 !shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:!shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center gap-5 !px-3 !py-2.5',
          icon: '!m-0 !size-7 shrink-0',
          content: 'flex-1',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
