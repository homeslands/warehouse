import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

type Props = {
  /** Khối đang ở đầu vùng cuộn — bước đó được tô đậm (`aria-current="step"`). */
  active: 'seller' | 'items'
  sellerDone: boolean
  itemsDone: boolean
  /** Số dòng đã đủ thông tin — hiện cạnh bước ② khi > 0. */
  lineCount: number
  onSeller: () => void
  onItems: () => void
  /** Tạo: gửi form (mở hộp Kiểm tra). Sửa: chỉ đưa nút "Lưu" vào tầm nhìn và focus nó, không gửi. */
  onReview: () => void
  reviewDisabled?: boolean
}

type Step = {
  key: string
  number: number
  glyph: string
  label: string
  extra?: string
  done: boolean
  current: boolean
  onClick: () => void
  disabled?: boolean
}

/**
 * Dải 3 bước ① Thông tin phiếu ── ② Chi tiết vật tư ── ③ Kiểm tra & lưu: vòng số nối nhau bằng đường kẻ. Chỉ để định hướng: bấm ①/②
 * cuộn tới khối, ③ như nút gửi. Bước đủ thông tin đổi số thành ✓ (tên nút "Đã xong: …" cho trình đọc màn hình) và
 * đường nối phía sau nó đổi màu. Màn hẹp (< sm) chỉ giữ nhãn của bước đang xem, bỏ phần "· n dòng".
 */
export function ImportFormStepper({
  active,
  sellerDone,
  itemsDone,
  lineCount,
  onSeller,
  onItems,
  onReview,
  reviewDisabled,
}: Props) {
  const { t } = useTranslation('importForms')
  const steps: Step[] = [
    {
      key: 'seller',
      number: 1,
      glyph: '①',
      label: t('stepSeller'),
      done: sellerDone,
      current: active === 'seller',
      onClick: onSeller,
    },
    {
      key: 'items',
      number: 2,
      glyph: '②',
      label: t('stepItems'),
      extra: lineCount > 0 ? t('stepLineCount', { count: lineCount }) : undefined,
      done: itemsDone,
      current: active === 'items',
      onClick: onItems,
    },
    {
      key: 'review',
      number: 3,
      glyph: '③',
      label: t('stepReview'),
      done: false,
      current: false,
      onClick: onReview,
      disabled: reviewDisabled,
    },
  ]

  return (
    <nav aria-label={t('stepsLabel')}>
      <ol className="flex items-center">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={s.onClick}
              disabled={s.disabled}
              aria-current={s.current ? 'step' : undefined}
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
                    : s.current
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
                  s.current
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground group-hover:text-foreground max-sm:hidden',
                  s.done && !s.current && 'text-foreground',
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
