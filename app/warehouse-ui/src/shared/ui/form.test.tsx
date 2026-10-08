import { zodResolver } from '@hookform/resolvers/zod'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import i18n from '@/shared/i18n'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form'
import { Input } from './input'

const schema = z.object({ name: z.string().min(1, 'examples:nameRequired') })
type Values = z.infer<typeof schema>

function TestForm({ serverMessage }: { serverMessage?: string }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  useEffect(() => {
    if (serverMessage) form.setError('name', { message: serverMessage })
  }, [form, serverMessage])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Lưu</button>
      </form>
    </Form>
  )
}

function TestFormRequired({ required }: { required?: boolean }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required={required}>
              <FormLabel>Tên</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}

afterEach(async () => {
  await i18n.changeLanguage('vi')
})

describe('FormMessage', () => {
  it('message là khoá i18n → hiện bản dịch, ô được đánh dấu lỗi và nối với message', async () => {
    render(<TestForm />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu' }))

    const message = await screen.findByText('Vui lòng nhập tên')
    const input = screen.getByRole('textbox', { name: 'Tên' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(message.id)
  })

  it('đổi ngôn ngữ → message dịch lại', async () => {
    render(<TestForm />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByText('Vui lòng nhập tên')

    await act(async () => {
      await i18n.changeLanguage('en')
    })

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it.each([
    ['câu đã dịch (lỗi backend)', 'Tên example đã tồn tại'],
    ['câu tiếng Anh có dấu hai chấm', 'Error: name exists'],
    ['dạng khoá nhưng khoá không tồn tại', 'examples:khongCoKhoaNay'],
  ])('%s → hiện nguyên', async (_label, text) => {
    render(<TestForm serverMessage={text} />)
    expect(await screen.findByText(text)).toBeInTheDocument()
  })
})

describe('FormItem required', () => {
  it('required → hiện dấu * (aria-hidden) và control có aria-required="true"', () => {
    render(<TestFormRequired required />)

    const asterisk = screen.getByText('*')
    expect(asterisk).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true')
  })

  it('không truyền required → không có dấu * và control không có aria-required', () => {
    render(<TestFormRequired />)

    expect(screen.queryByText('*')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-required')
  })

  it('dấu * bị ẩn khỏi tên có thể truy cập — getByRole tìm theo tên "Tên", không phải "Tên*"', () => {
    render(<TestFormRequired required />)

    expect(screen.getByRole('textbox', { name: 'Tên' })).toBeInTheDocument()
  })
})

// "Phạt muộn": ô trống mà người dùng chỉ đi ngang qua (focus rồi rời) chưa bị la "bắt buộc" — chỉ khi bấm gửi.
// Ô đã có nội dung thì kiểm ngay khi rời ô; ô đang sửa mà xoá trắng (khác giá trị gốc) cũng báo ngay.
const formatSchema = z.object({
  name: z.string().trim().min(1, 'examples:nameRequired'),
  code: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập mã')
    .regex(/^[A-Z]+$/, 'Mã sai định dạng'),
})

function BlurForm({
  defaults = { name: '', code: '' },
}: {
  defaults?: { name: string; code: string }
}) {
  const form = useForm({
    resolver: zodResolver(formatSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>Tên</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>Mã</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Chữ in hoa</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Lưu</button>
      </form>
    </Form>
  )
}

describe('thời điểm báo lỗi', () => {
  it('ô trống đi ngang qua (focus rồi rời) → chưa báo, ô không aria-invalid', async () => {
    const user = userEvent.setup()
    render(<BlurForm />)
    await user.click(screen.getByRole('textbox', { name: 'Tên' }))
    await user.tab()

    expect(screen.queryByText('Vui lòng nhập tên')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveAttribute('aria-invalid', 'false')
  })

  it('bấm gửi → ô trống báo "bắt buộc"', async () => {
    const user = userEvent.setup()
    render(<BlurForm />)
    await user.click(screen.getByRole('textbox', { name: 'Tên' }))
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Vui lòng nhập tên')).toBeInTheDocument()
  })

  it('ô có nội dung sai → báo ngay khi rời ô', async () => {
    const user = userEvent.setup()
    render(<BlurForm />)
    await user.type(screen.getByRole('textbox', { name: 'Mã' }), 'abc')
    await user.tab()

    expect(await screen.findByText('Mã sai định dạng')).toBeInTheDocument()
  })

  it('ô đang sửa bị xoá trắng (khác giá trị gốc) → báo ngay khi rời ô', async () => {
    const user = userEvent.setup()
    render(<BlurForm defaults={{ name: 'Kho A', code: 'KA' }} />)
    await user.clear(screen.getByRole('textbox', { name: 'Tên' }))
    await user.tab()

    expect(await screen.findByText('Vui lòng nhập tên')).toBeInTheDocument()
  })

  it('gợi ý hiện sẵn; có lỗi thì câu lỗi thay chỗ gợi ý; sửa đúng thì gợi ý quay lại', async () => {
    const user = userEvent.setup()
    render(<BlurForm />)
    const code = screen.getByRole('textbox', { name: 'Mã' })
    const hint = screen.getByText('Chữ in hoa')
    expect(code.getAttribute('aria-describedby')).toContain(hint.id)

    await user.type(code, 'abc')
    await user.tab()

    const message = await screen.findByText('Mã sai định dạng')
    expect(screen.queryByText('Chữ in hoa')).not.toBeInTheDocument()
    expect(code.getAttribute('aria-describedby')).toContain(message.id)

    await user.clear(code)
    await user.type(code, 'ABC')
    expect(screen.queryByText('Mã sai định dạng')).not.toBeInTheDocument()
    expect(screen.getByText('Chữ in hoa')).toBeInTheDocument()
  })
})
