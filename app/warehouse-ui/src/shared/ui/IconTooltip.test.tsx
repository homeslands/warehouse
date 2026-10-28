import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { IconTooltip } from './IconTooltip'

describe('IconTooltip', () => {
  it('hover nút → tooltip có đúng nhãn', async () => {
    const { user } = renderWithProviders(
      <IconTooltip label="Xoá dòng">
        <Button aria-label="Xoá dòng">x</Button>
      </IconTooltip>,
    )
    await user.hover(screen.getByRole('button', { name: 'Xoá dòng' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Xoá dòng')
  })

  it('focus bàn phím → tooltip hiện', async () => {
    const { user } = renderWithProviders(
      <IconTooltip label="Đổi giao diện">
        <Button aria-label="Đổi giao diện">x</Button>
      </IconTooltip>,
    )
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Đổi giao diện')
  })

  it('nút disabled vẫn hiện tooltip khi hover vùng bọc', async () => {
    const { user } = renderWithProviders(
      <IconTooltip label="Xoá" disabled>
        <Button aria-label="Xoá" disabled>
          x
        </Button>
      </IconTooltip>,
    )
    const button = screen.getByRole('button', { name: 'Xoá' })
    await user.hover(button.parentElement!)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Xoá')
  })

  it('lồng với DropdownMenuTrigger: bấm vẫn mở menu và hover vẫn có tooltip', async () => {
    const { user } = renderWithProviders(
      <DropdownMenu>
        <IconTooltip label="Thao tác khác">
          <DropdownMenuTrigger asChild>
            <Button aria-label="Thao tác khác">⋯</Button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent>
          <DropdownMenuItem>Sửa</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const trigger = screen.getByRole('button', { name: 'Thao tác khác' })
    await user.hover(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Thao tác khác')
    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Sửa' })).toBeInTheDocument()
  })
})

describe('IconTooltip — focus do code trả về', () => {
  function Menu() {
    return (
      <DropdownMenu>
        <IconTooltip label="Thao tác khác">
          <DropdownMenuTrigger asChild>
            <Button aria-label="Thao tác khác">⋯</Button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent>
          <DropdownMenuItem>Sửa</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  it('Tab bằng bàn phím vào nút vẫn hiện tooltip', async () => {
    const { user } = renderWithProviders(<Menu />)
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Thao tác khác')
  })

  it('mở menu bằng chuột rồi Esc: focus về nút nhưng KHÔNG hiện tooltip', async () => {
    const { user } = renderWithProviders(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Thao tác khác' })
    await user.click(trigger)
    await screen.findByRole('menuitem', { name: 'Sửa' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
