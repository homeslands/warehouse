import type { ReactNode } from 'react'

type Props = {
  title: string
  description: string
  children?: ReactNode
}

/**
 * Khung dùng chung cho ErrorPage / NotFoundPage / ForbiddenPage.
 * Đứng riêng, KHÔNG có sidebar: ErrorPage phải render được cả khi AppShell chính là thứ vừa ném lỗi.
 */
export function CenteredMessage({ title, description, children }: Props) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        {children}
      </div>
    </div>
  )
}
