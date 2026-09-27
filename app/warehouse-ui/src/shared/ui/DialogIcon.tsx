import { cn } from '@/shared/lib/cn'

type DialogIconProps = React.ComponentProps<'div'> & {
  /** Glyph trần (vd `<TrashIcon />`) — ba lớp quầng do component này vẽ. */
  children: React.ReactNode
  /** `destructive` cho hành động phá huỷ, `success` cho hành động tích cực, `default` cho còn lại. */
  tone?: 'destructive' | 'success' | 'default'
  className?: string
}

/**
 * Huy hiệu icon đặt đầu hộp thoại: quầng ba lớp (vòng ngoài nhạt nhất → vòng giữa → lõi đặc),
 * icon trắng ở giữa. Dùng chung cho `ConfirmDialog` và các hộp thoại khác để cả họ trông giống nhau.
 */
export function DialogIcon({ children, tone = 'default', className, ...props }: DialogIconProps) {
  const RINGS = {
    destructive: ['bg-destructive/5', 'bg-destructive/10', 'bg-destructive'],
    success: ['bg-success/5', 'bg-success/10', 'bg-success'],
    default: ['bg-primary/5', 'bg-primary/10', 'bg-primary'],
  } as const
  const [ring, middle, core] = RINGS[tone]

  return (
    <div
      className={cn('mb-2 flex size-20 items-center justify-center rounded-full', ring, className)}
      {...props}
    >
      <span className={cn('flex size-14 items-center justify-center rounded-full', middle)}>
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-white *:size-5',
            core,
          )}
        >
          {children}
        </span>
      </span>
    </div>
  )
}
