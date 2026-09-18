import { zodResolver } from '@hookform/resolvers/zod'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import i18n from '@/shared/i18n'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form'
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
    const input = screen.getByLabelText('Tên')
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
