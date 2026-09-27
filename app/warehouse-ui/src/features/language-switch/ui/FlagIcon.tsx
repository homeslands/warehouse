import { useId } from 'react'
import type { SupportedLanguage } from '@/shared/i18n'

/**
 * Cờ tròn cho menu chọn ngôn ngữ. Vẽ bằng SVG, KHÔNG dùng emoji cờ (🇻🇳 🇬🇧): Windows không có glyph cờ
 * nên emoji hiện thành hai chữ cái "VN" / "GB". Tiếng Anh dùng cờ Anh (Union Jack) — quy ước phổ biến
 * nhất cho "English".
 *
 * Trang trí thuần tuý (`aria-hidden`): tên ngôn ngữ đứng ngay cạnh đã nói đủ.
 */
export function FlagIcon({ lang }: { lang: SupportedLanguage }) {
  // Union Jack cắt bằng clipPath theo id — id cố định thì hai lá cờ trên cùng trang sẽ dùng chung
  // clipPath của lá đầu. React 19 sinh id dạng «r0»; bỏ ký tự lạ cho chắc khi đặt trong `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  return (
    <span
      data-flag={lang}
      aria-hidden="true"
      className="inline-flex size-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/20"
    >
      {lang === 'vi' ? (
        <svg viewBox="0 0 32 32" className="size-full">
          <rect width="32" height="32" fill="#DA251D" />
          <polygon
            fill="#FFFF00"
            points="16,8.8 17.7,13.65 22.85,13.78 18.76,16.9 20.23,21.82 16,18.9 11.77,21.82 13.24,16.9 9.15,13.78 14.3,13.65"
          />
        </svg>
      ) : (
        // Cờ 60×30, cắt lấy hình vuông giữa (x 15–45) để bo tròn không méo chữ thập.
        <svg viewBox="15 0 30 30" className="size-full">
          <clipPath id={`${uid}-s`}>
            <path d="M0,0 v30 h60 v-30 z" />
          </clipPath>
          <clipPath id={`${uid}-t`}>
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
          </clipPath>
          <g clipPath={`url(#${uid}-s)`}>
            <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
            <path
              d="M0,0 L60,30 M60,0 L0,30"
              clipPath={`url(#${uid}-t)`}
              stroke="#C8102E"
              strokeWidth="4"
            />
            <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
            <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
          </g>
        </svg>
      )}
    </span>
  )
}
