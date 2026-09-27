import { render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it } from 'vitest'
import { Toaster } from './sonner'

/**
 * Cố ý KHÔNG mock 'sonner' (khác phần lớn test trong repo): thứ cần kiểm ở đây chính là phần
 * sonner render ra. Sonner dựng toast thành `<li data-sonner-toast>` trong một `<ol>` — nó KHÔNG
 * có `role="status"`, nên phải tìm theo thuộc tính.
 */
async function showToast(show: () => void) {
  render(<Toaster />)
  show()
  // `<ol data-sonner-toaster>` chỉ xuất hiện khi có toast đầu tiên — phải chờ rồi mới tìm.
  await waitFor(() => expect(document.querySelector('[data-sonner-toast]')).not.toBeNull())
  return {
    toaster: document.querySelector('[data-sonner-toaster]'),
    element: document.querySelector('[data-sonner-toast]')!,
  }
}

describe('Toaster', () => {
  it('hiện ở giữa trên', async () => {
    const { toaster } = await showToast(() => toast.success('Xong'))

    expect(toaster).toHaveAttribute('data-y-position', 'top')
    expect(toaster).toHaveAttribute('data-x-position', 'center')
  })

  it.each([
    ['success', 'bg-success'],
    ['error', 'bg-destructive'],
    ['warning', 'bg-warning'],
    ['info', 'bg-info'],
  ] as const)('toast %s có huy hiệu tròn nền đặc %s, icon trắng', async (kind, bgClass) => {
    const { element } = await showToast(() => toast[kind]('Nội dung thông báo'))

    expect(element).toHaveTextContent('Nội dung thông báo')
    await waitFor(() => expect(element.querySelector(`.${bgClass}`)).not.toBeNull())
    expect(element.querySelector(`.${bgClass}`)).toHaveClass('rounded-full', 'text-white')
  })

  it('mỗi loại một màu riêng — không dùng chung một huy hiệu', async () => {
    const { element } = await showToast(() => toast.success('Xong'))

    await waitFor(() => expect(element.querySelector('.bg-success')).not.toBeNull())
    expect(element.querySelector('.bg-destructive')).toBeNull()
  })

  it('không viền, dạng viên thuốc bo tròn hai đầu', async () => {
    const { element } = await showToast(() => toast.success('Xong'))

    expect(element).toHaveClass('!border-0', '!rounded-full')
  })

  it('toast co theo nội dung, không giữ chiều rộng cố định', async () => {
    const { toaster, element } = await showToast(() => toast.success('Xong'))

    // sonner mặc định --width: 356px cho CẢ <ol> lẫn <li> → nội dung ngắn vẫn dư một khoảng
    // trống bên phải. Đổi biến là cả hai cùng co.
    // `--width` là TRẦN của <ol> (không được là fit-content: <li> position:absolute nên <ol>
    // sẽ co về 0 và toast bị bẻ từng ký tự). Toast tự co bằng w-fit, căn giữa bằng mx-auto.
    expect(toaster).toHaveStyle({ '--width': 'min(90vw, 28rem)' })
    expect(element).toHaveClass('!w-fit', '!mx-auto')
    expect(element).not.toHaveClass('w-full')
  })

  it('padding hai đầu bằng nhau', async () => {
    const { element } = await showToast(() => toast.success('Xong'))

    expect(element).toHaveClass('!px-3')
  })

  it('toast thành công dùng dấu tick trần, không phải vòng-tròn-tick', async () => {
    const { element } = await showToast(() => toast.success('Xong'))

    await waitFor(() => expect(element.querySelector('svg')).not.toBeNull())
    // Huy hiệu bọc ngoài đã là hình tròn rồi — icon lồng thêm một vòng tròn nữa là thừa.
    expect(element.querySelector('svg.lucide-check')).not.toBeNull()
    expect(element.querySelector('svg.lucide-circle-check')).toBeNull()
  })
})
