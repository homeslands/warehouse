import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox, type ComboboxOption } from './Combobox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

const OPTIONS: ComboboxOption[] = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'hcm', label: 'Hồ Chí Minh' },
  { value: 'dn', label: 'Đà Nẵng' },
]

function setup(initial?: string) {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState<string | undefined>(initial)
    return (
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Harness />)
  return { onChange, user: userEvent.setup() }
}

describe('Combobox', () => {
  it('mục disabled hiện ra nhưng không chọn được', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Combobox
        aria-label="Tỉnh"
        options={[...OPTIONS, { value: 'x', label: 'Hết hàng', disabled: true }]}
        value={undefined}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    const item = screen.getByRole('option', { name: 'Hết hàng' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('mở ra thấy mọi lựa chọn, chọn một → onChange(value) và đóng', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.click(screen.getByRole('option', { name: 'Đà Nẵng' }))

    expect(onChange).toHaveBeenLastCalledWith('dn')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Đà Nẵng')
  })

  it('gõ để lọc, không phân biệt dấu', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    // Ô tìm có tên truy cập được (placeholder không phải nhãn).
    await user.type(screen.getByRole('combobox', { name: 'Tìm...' }), 'da nang')

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Đà Nẵng'])
  })

  it('không khớp gì → hiện "Không có kết quả."', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.type(screen.getByPlaceholderText('Tìm...'), 'xyz')

    expect(screen.getByText('Không có kết quả.')).toBeInTheDocument()
  })

  it('mục đang chọn được đánh dấu', async () => {
    const { user } = setup('hcm')
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.getByRole('option', { name: 'Hồ Chí Minh' })).toHaveAttribute(
      'data-checked',
      'true',
    )
    expect(screen.getByRole('option', { name: 'Hà Nội' })).toHaveAttribute('data-checked', 'false')
  })

  it('bàn phím: ↓ rồi Enter chọn mục thứ hai', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenLastCalledWith('hcm')
  })

  it('Esc đóng mà không chọn gì', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('onOpenChange báo mở, đóng bằng Esc và đóng sau khi chọn', async () => {
    const onOpenChange = vi.fn()
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.click(await screen.findByRole('option', { name: 'Đà Nẵng' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('nút xoá → onChange(undefined), trở về placeholder', async () => {
    const { onChange, user } = setup('hn')
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))

    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Chọn...')
    // Nút xoá biến mất — focus về nút mở, không rơi xuống <body>.
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveFocus()
  })

  it('ref ngoài vẫn trỏ vào nút mở (RHF focus ô lỗi)', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Combobox
        ref={ref}
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
      />,
    )
    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Tỉnh' }))
  })

  it('nằm trong Dialog: mở, gõ lọc, chọn được và Dialog vẫn mở', async () => {
    const onChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState<string | undefined>()
      return (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Hộp</DialogTitle>
            <DialogDescription>Mô tả</DialogDescription>
            <Combobox
              aria-label="Tỉnh"
              options={OPTIONS}
              value={value}
              onChange={(next) => {
                onChange(next)
                setValue(next)
              }}
            />
          </DialogContent>
        </Dialog>
      )
    }
    render(<Harness />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.type(screen.getByRole('combobox', { name: 'Tìm...' }), 'da nang')
    await user.click(screen.getByRole('option', { name: 'Đà Nẵng' }))

    expect(onChange).toHaveBeenLastCalledWith('dn')
    expect(screen.getByRole('dialog', { name: 'Hộp' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Đà Nẵng')
  })

  it('disabled → không mở được, không có nút xoá', async () => {
    const onChange = vi.fn()
    render(<Combobox aria-label="Tỉnh" options={OPTIONS} value="hn" onChange={onChange} disabled />)
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xoá lựa chọn' })).not.toBeInTheDocument()
  })

  it('nhãn dài không khoảng trắng được ngắt dòng trong danh sách (không bị cắt giữa chữ)', async () => {
    const label = 'ONG114 · ỐngNhựaPVCBìnhMinhPhi114x4,9mmClass3TiêuChuẩnISO1452'
    render(
      <Combobox
        aria-label="Đơn vị"
        options={[{ value: 'x', label }]}
        value={undefined}
        onChange={() => {}}
      />,
    )
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Đơn vị' }))

    expect(screen.getByText(label)).toHaveClass('min-w-0', 'break-words')
  })

  describe('mở gần mép dưới màn hình', () => {
    function placeTrigger(bottom: number) {
      const trigger = screen.getByRole('combobox', { name: 'Tỉnh' })
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top: bottom - 36,
        bottom,
        left: 0,
        right: 200,
        width: 200,
        height: 36,
        x: 0,
        y: bottom - 36,
        toJSON: () => ({}),
      } as DOMRect)
      return trigger
    }

    it('phía dưới còn ít chỗ → cuộn ô chọn lên giữa trước khi mở danh sách', async () => {
      const { user } = setup()
      const trigger = placeTrigger(window.innerHeight - 100)
      const scroll = vi.spyOn(trigger, 'scrollIntoView')
      await user.click(trigger)
      expect(scroll).toHaveBeenCalledWith({ block: 'center' })
      expect(screen.getAllByRole('option')).toHaveLength(3)
    })

    it('minListSpace lớn hơn chỗ còn lại → cuộn dù đủ 320px; mặc định thì không', async () => {
      const bottom = window.innerHeight - 400
      const { user } = setup()
      const trigger = placeTrigger(bottom)
      const scroll = vi.spyOn(trigger, 'scrollIntoView')
      await user.click(trigger)
      expect(scroll).not.toHaveBeenCalled()
      await user.keyboard('{Escape}')

      cleanup()
      render(
        <Combobox
          aria-label="Tỉnh"
          options={OPTIONS}
          value={undefined}
          onChange={vi.fn()}
          minListSpace={480}
        />,
      )
      const tall = placeTrigger(bottom)
      const tallScroll = vi.spyOn(tall, 'scrollIntoView')
      await user.click(tall)
      expect(tallScroll).toHaveBeenCalledWith({ block: 'center' })
    })

    it('phía dưới đủ chỗ → không cuộn', async () => {
      const { user } = setup()
      const trigger = placeTrigger(100)
      const scroll = vi.spyOn(trigger, 'scrollIntoView')
      await user.click(trigger)
      expect(scroll).not.toHaveBeenCalled()
    })
  })

  describe('footer', () => {
    function setupFooter() {
      const onFooter = vi.fn()
      render(
        <Combobox
          aria-label="Tỉnh"
          options={OPTIONS}
          value={undefined}
          onChange={vi.fn()}
          footer={(search, close) => (
            <button
              type="button"
              onClick={() => {
                onFooter(search)
                close()
              }}
            >
              Thêm “{search}”
            </button>
          )}
        />,
      )
      return { onFooter, user: userEvent.setup() }
    }

    it('luôn ở cuối danh sách, kể cả khi không có kết quả; nhận chữ đang gõ; close() đóng danh sách', async () => {
      const { onFooter, user } = setupFooter()
      await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
      expect(screen.getByRole('button', { name: 'Thêm “”' })).toBeInTheDocument()
      await user.type(screen.getByRole('combobox', { name: /Tìm/ }), 'xyz')
      expect(screen.queryAllByRole('option')).toHaveLength(0)
      await user.click(screen.getByRole('button', { name: 'Thêm “xyz”' }))
      expect(onFooter).toHaveBeenCalledWith('xyz')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('mở lại → ô tìm trống', async () => {
      const { user } = setupFooter()
      const trigger = screen.getByRole('combobox', { name: 'Tỉnh' })
      await user.click(trigger)
      await user.type(screen.getByRole('combobox', { name: /Tìm/ }), 'abc')
      await user.keyboard('{Escape}')
      await user.click(trigger)
      expect(screen.getByRole('button', { name: 'Thêm “”' })).toBeInTheDocument()
    })
  })

  it('groups → vẽ tiêu đề nhóm đúng thứ tự, chọn vẫn trả value', async () => {
    const onChange = vi.fn()
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={onChange}
        groups={[
          { heading: 'Miền Nam', options: [OPTIONS[1]] },
          { heading: 'Khác', options: [OPTIONS[0], OPTIONS[2]] },
        ]}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    const headings = document.querySelectorAll('[cmdk-group-heading]')
    expect(Array.from(headings).map((h) => h.textContent)).toEqual(['Miền Nam', 'Khác'])
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Hồ Chí Minh',
      'Hà Nội',
      'Đà Nẵng',
    ])
    await user.click(screen.getByRole('option', { name: 'Hà Nội' }))
    expect(onChange).toHaveBeenLastCalledWith('hn')
  })

  it('serverFiltered + onSearchChange → báo chữ gõ, không lọc tại chỗ; đóng thì báo rỗng', async () => {
    const onSearchChange = vi.fn()
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
        serverFiltered
        onSearchChange={onSearchChange}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.type(screen.getByPlaceholderText('Tìm...'), 'xi')

    expect(onSearchChange).toHaveBeenLastCalledWith('xi')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.keyboard('{Escape}')
    expect(onSearchChange).toHaveBeenLastCalledWith('')
  })

  it('isLoading → hiện loadingText thay cho "Không có kết quả."', async () => {
    render(
      <Combobox
        aria-label="Tỉnh"
        options={[]}
        value={undefined}
        onChange={vi.fn()}
        serverFiltered
        isLoading
        loadingText="Đang tìm…"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    expect(screen.getByText('Đang tìm…')).toBeInTheDocument()
    expect(screen.queryByText('Không có kết quả.')).not.toBeInTheDocument()
  })

  it('renderOption → mục vẽ nội dung của hàm; value / chọn / dấu tích vẫn như cũ', async () => {
    const onChange = vi.fn()
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value="hn"
        onChange={onChange}
        renderOption={(o) => <b data-testid={`opt-${o.value}`}>{`** ${o.label} **`}</b>}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.getByTestId('opt-dn')).toHaveTextContent('** Đà Nẵng **')
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('data-checked'))).toEqual([
      'true',
      'false',
      'false',
    ])
    await user.type(screen.getByPlaceholderText('Tìm...'), 'da nang')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByTestId('opt-dn'))
    expect(onChange).toHaveBeenLastCalledWith('dn')
  })

  it('listClassName → ghép vào [cmdk-list], vẫn giữ lớp cũ', async () => {
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
        listClassName="max-h-[60vh]"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    const list = document.querySelector('[cmdk-list]')
    expect(list).toHaveClass('max-h-[60vh]', 'min-h-0')
  })

  it('widthAnchor → lúc mở, danh sách rộng bằng phần tử neo; không có thì rộng theo nút mở như cũ', async () => {
    const anchor = document.createElement('div')
    anchor.getBoundingClientRect = () => ({ left: 40, width: 640 }) as DOMRect
    const anchorRef = { current: anchor }
    render(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
        widthAnchor={anchorRef}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    const content = document.querySelector('[data-slot="popover-content"]') as HTMLElement
    expect(content.style.width).toBe('640px')
  })

  it('không widthAnchor → không đặt bề rộng nội tuyến', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    const content = document.querySelector('[data-slot="popover-content"]') as HTMLElement
    expect(content.style.width).toBe('')
  })
})

describe('Combobox — mũi tên', () => {
  it('mặc định dùng icon ⇅; chevron="down" dùng icon ⌄', () => {
    const { rerender } = render(
      <Combobox aria-label="Tỉnh" options={OPTIONS} value={undefined} onChange={vi.fn()} />,
    )
    const trigger = () => screen.getByRole('combobox', { name: 'Tỉnh' })
    expect(trigger().querySelector('svg.lucide-chevrons-up-down')).not.toBeNull()
    expect(trigger().querySelector('svg.lucide-chevron-down')).toBeNull()

    rerender(
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
        chevron="down"
      />,
    )
    expect(trigger().querySelector('svg.lucide-chevron-down')).not.toBeNull()
    expect(trigger().querySelector('svg.lucide-chevrons-up-down')).toBeNull()
  })
})
