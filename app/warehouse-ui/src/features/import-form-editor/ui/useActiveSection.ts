import { useEffect, useState, type RefObject } from 'react'

/**
 * Khối nào đang nằm ở dải trên cùng (40% đầu) của vùng cuộn — để dải bước tô đậm đúng bước đang xem. Nhiều khối cùng
 * chạm dải thì lấy khối đứng sau cùng trong tài liệu (người dùng đã cuộn tới nó). Không có `IntersectionObserver`
 * (jsdom) thì giữ khối đầu tiên.
 */
export function useActiveSection<K extends string>(
  sections: readonly { key: K; ref: RefObject<HTMLElement | null> }[],
  enabled: boolean,
): K {
  const first = sections[0].key
  const [active, setActive] = useState<K>(first)
  const keys = sections.map((s) => s.key).join('|')

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const visible = new Set<K>()
    const keyOf = new Map<Element, K>()
    for (const s of sections) if (s.ref.current) keyOf.set(s.ref.current, s.key)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = keyOf.get(e.target)
          if (key === undefined) continue
          if (e.isIntersecting) visible.add(key)
          else visible.delete(key)
        }
        const last = [...sections].reverse().find((s) => visible.has(s.key))
        if (last) setActive(last.key)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    keyOf.forEach((_, el) => observer.observe(el))
    return () => observer.disconnect()
    // `sections` là mảng mới mỗi lần render; `keys` đại diện cho nó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keys])

  useEffect(() => {
    if (!enabled) setActive(first)
  }, [enabled, first])

  return active
}
