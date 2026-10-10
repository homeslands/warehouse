import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

function setup(onValueChange = vi.fn()) {
  render(
    <Tabs value="a" onValueChange={onValueChange}>
      <TabsList aria-label="Mục">
        <TabsTrigger value="a">Vật tư</TabsTrigger>
        <TabsTrigger value="b">Giao dịch</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Nội dung A</TabsContent>
      <TabsContent value="b">Nội dung B</TabsContent>
    </Tabs>,
  )
  return { onValueChange, user: userEvent.setup() }
}

describe('Tabs', () => {
  it('tablist có tên; tab đang chọn aria-selected; chỉ hiện nội dung tab đang chọn', () => {
    setup()
    expect(screen.getByRole('tablist', { name: 'Mục' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Vật tư' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nội dung A')).toBeInTheDocument()
    expect(screen.queryByText('Nội dung B')).not.toBeInTheDocument()
  })

  it('bấm tab khác → onValueChange với value của tab đó', async () => {
    const { onValueChange, user } = setup()
    await user.click(screen.getByRole('tab', { name: 'Giao dịch' }))
    expect(onValueChange).toHaveBeenCalledWith('b')
  })
})
