import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useRevalidateWhenTouched } from './form-validation'

const schema = z
  .object({ password: z.string(), confirm: z.string().min(1, 'required') })
  .refine((v) => v.confirm === '' || v.confirm === v.password, {
    path: ['confirm'],
    message: 'mismatch',
  })

function Harness() {
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  })
  useRevalidateWhenTouched(form, 'password', 'confirm')
  const error = form.formState.errors.confirm?.message
  return (
    <form>
      <input aria-label="password" {...form.register('password')} />
      <input aria-label="confirm" {...form.register('confirm')} />
      <p role="status">{error ?? ''}</p>
    </form>
  )
}

function setup() {
  render(<Harness />)
  return userEvent.setup()
}

describe('useRevalidateWhenTouched', () => {
  it('ô đích chưa chạm → gõ ô nguồn không làm hiện lỗi ở ô đích', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('password'), 'abc')
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('ô đích đã chạm → sửa ô nguồn cho khớp thì lỗi "mismatch" biến mất ngay', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('password'), 'abc')
    await user.type(screen.getByLabelText('confirm'), 'abd')
    await user.tab()
    expect(await screen.findByText('mismatch')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('password'))
    await user.type(screen.getByLabelText('password'), 'abd')

    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('ô đích đã chạm → sửa ô nguồn cho lệch thì hiện "mismatch" ngay', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('password'), 'abc')
    await user.type(screen.getByLabelText('confirm'), 'abc')
    await user.tab()
    expect(screen.getByRole('status')).toHaveTextContent('')

    await user.type(screen.getByLabelText('password'), 'x')

    expect(await screen.findByText('mismatch')).toBeInTheDocument()
  })
})
