import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

export type WizardStepperStep = {
  key: string
  label: string
  /** Đã đủ thông tin — số bước đổi thành ✓ và đường nối phía sau đổi màu. */
  done: boolean
  /** Chữ phụ cạnh nhãn (vd "· 3 dòng"); ẩn trên màn hẹp. */
  extra?: string
}

type Props = {
  steps: WizardStepperStep[]
  /** Khoá của bước đang xem — nút của nó được tô đậm (`aria-current="step"`). */
  current: string
  /** Mọi nút đều gọi nó — luật cho/không cho đi là việc của nơi dùng. */
  onSelect: (key: string) => void
  /** Khoá mọi nút (đang gửi). */
  disabled?: boolean
  /** Khoá các bước đứng sau `current`; lùi vẫn được. */
  lockForward?: boolean
  /** Tên của `<nav>` cho trình đọc màn hình. */
  ariaLabel: string
}

const GLYPHS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']

/**
 * Dải bước tổng quát: vòng số nối nhau bằng đường kẻ, mỗi vòng là một nút điều hướng. Bước xong đổi số thành ✓
 * (tên nút "Đã xong: …" cho trình đọc màn hình) và đường nối phía sau nó đổi màu. Màn hẹp (< sm) chỉ giữ nhãn
 * của bước đang xem, bỏ phần phụ. Nhãn và chữ phụ do nơi dùng truyền vào.
 */
export function WizardStepper({
  steps,
  current,
  onSelect,
  disabled,
  lockForward,
  ariaLabel,
}: Props) {
  const { t } = useTranslation('common')
  const currentIndex = steps.findIndex((s) => s.key === current)

  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex items-center">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              disabled={disabled || (lockForward && i > currentIndex)}
              aria-current={s.key === current ? 'step' : undefined}
              // Tên ghép tường minh: ghép từ các phần tử con thì mất khoảng trắng giữa chúng.
              aria-label={`${s.done ? `${t('stepDone')}:` : (GLYPHS[i] ?? String(i + 1))} ${s.label}${s.extra ? ` · ${s.extra}` : ''}`}
              className="group focus-visible:ring-ring/50 flex shrink-0 items-center gap-2 rounded-md p-1 text-sm outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors',
                  s.done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : s.key === current
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground group-hover:border-foreground/40 group-hover:text-foreground',
                )}
              >
                {s.done ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  'whitespace-nowrap',
                  s.key === current
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground group-hover:text-foreground max-sm:hidden',
                  s.done && s.key !== current && 'text-foreground',
                )}
              >
                {s.label}
                {s.extra && (
                  <span className="text-muted-foreground font-normal max-sm:hidden">{` · ${s.extra}`}</span>
                )}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                data-done={s.done || undefined}
                className="bg-border data-done:bg-primary mx-2 h-0.5 min-w-4 flex-1 rounded-full transition-colors sm:mx-3"
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
