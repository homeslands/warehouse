import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { PasswordInput } from './PasswordInput'

function Field({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor="pw">Mật khẩu</label>
      <PasswordInput id="pw" aria-invalid defaultValue="bí mật" autoComplete="new-password" />
    </form>
  )
}

describe('PasswordInput', () => {
  it('mặc định ẩn; mọi prop (id, aria-*, autoComplete) đi vào thẻ input nên nhãn nối đúng ô', () => {
    renderWithProviders(<Field />)

    const input = screen.getByLabelText('Mật khẩu')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
  })

  it('icon mắt nằm trong ô: bấm để hiện, bấm lại để ẩn — nhãn và aria-pressed đổi theo', async () => {
    const { user } = renderWithProviders(<Field />)
    const input = screen.getByLabelText('Mật khẩu')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('bấm icon KHÔNG submit form bọc ngoài', async () => {
    const onSubmit = vi.fn()
    const { user } = renderWithProviders(<Field onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hai ô cạnh nhau bật/tắt độc lập', async () => {
    const { user } = renderWithProviders(
      <>
        <label htmlFor="a">Ô A</label>
        <PasswordInput id="a" />
        <label htmlFor="b">Ô B</label>
        <PasswordInput id="b" />
      </>,
    )

    await user.click(screen.getAllByRole('button', { name: 'Hiện mật khẩu' })[0])

    expect(screen.getByLabelText('Ô A')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Ô B')).toHaveAttribute('type', 'password')
  })
})
