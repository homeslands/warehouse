import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { WizardStep } from '../model/wizard'

type Props = {
  /** Bước đang xem — nút của nó được tô đậm (`aria-current="step"`). */
  current: WizardStep
  infoDone: boolean
  itemsDone: boolean
  /** Số dòng đã đủ thông tin — hiện cạnh bước ② khi > 0. */
  lineCount: number
  /** Mọi nút đều gọi nó — luật cho/không cho đi là việc của nơi dùng. */
  onSelect: (step: WizardStep) => void
  /** Khoá cả ba nút (đang gửi). */
  disabled?: boolean
  /** Khoá các bước đứng sau `current` (đang upload chứng từ — chưa được tiến); lùi vẫn được. */
  lockForward?: boolean
}

type Step = {
  key: WizardStep
  number: number
  glyph: string
  label: string
  extra?: string
  done: boolean
}

/**
 * Dải 3 bước ① Thông tin phiếu ── ② Chi tiết vật tư ── ③ Kiểm tra & lưu: vòng số nối nhau bằng đường kẻ, mỗi vòng là
 * một nút điều hướng. Bước đủ thông tin đổi số thành ✓ (tên nút "Đã xong: …" cho trình đọc màn hình) và
 * đường nối phía sau nó đổi màu. Màn hẹp (< sm) chỉ giữ nhãn của bước đang xem, bỏ phần "· n dòng".
 */
export function ImportFormStepper({
  current,
  infoDone,
  itemsDone,
  lineCount,
  onSelect,
  disabled,
  lockForward,
}: Props) {
  const { t } = useTranslation('importForms')
  const steps: Step[] = [
    { key: 'info', number: 1, glyph: '①', label: t('stepSeller'), done: infoDone },
    {
      key: 'items',
      number: 2,
      glyph: '②',
      label: t('stepItems'),
      extra: lineCount > 0 ? t('stepLineCount', { count: lineCount }) : undefined,
      done: itemsDone,
    },
    { key: 'review', number: 3, glyph: '③', label: t('stepReview'), done: false },
  ]
  const currentIndex = steps.findIndex((s) => s.key === current)

  return (
    <nav aria-label={t('stepsLabel')}>
      <ol className="flex items-center">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              disabled={disabled || (lockForward && i > currentIndex)}
              aria-current={s.key === current ? 'step' : undefined}
              // Tên ghép tường minh: ghép từ các phần tử con thì mất khoảng trắng giữa chúng.
              aria-label={`${s.done ? `${t('stepDone')}:` : s.glyph} ${s.label}${s.extra ? ` · ${s.extra}` : ''}`}
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
                {s.done ? <CheckIcon className="size-4" /> : s.number}
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
