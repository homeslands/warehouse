/**
 * Lưới an toàn cuối cùng: hiện lỗi cấu hình dưới dạng đọc được thay vì màn hình trắng.
 *
 * Cố ý KHÔNG dùng React và KHÔNG dùng i18n. Hàm này chạy đúng vào lúc ta biết môi trường
 * đang hỏng, nên nó không được phép phụ thuộc vào bất cứ thứ gì có thể cũng đang hỏng.
 * Chuỗi tiếng Việt viết thẳng vào đây là có chủ đích.
 */
export function renderEnvError(container: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  container.replaceChildren()

  const wrapper = document.createElement('div')
  wrapper.setAttribute(
    'style',
    'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font-family:system-ui,sans-serif;background:#fff;color:#111',
  )

  const box = document.createElement('div')
  box.setAttribute('style', 'max-width:32rem;text-align:center')

  const title = document.createElement('h1')
  title.setAttribute('style', 'font-size:1.25rem;font-weight:600;margin:0 0 12px')
  title.textContent = 'Thiếu cấu hình'

  const detail = document.createElement('pre')
  detail.setAttribute(
    'style',
    'white-space:pre-wrap;text-align:left;background:#f4f4f5;border-radius:6px;' +
      'padding:12px;font-size:0.8125rem;margin:0',
  )
  detail.textContent = message

  box.append(title, detail)
  wrapper.append(box)
  container.append(wrapper)
}
