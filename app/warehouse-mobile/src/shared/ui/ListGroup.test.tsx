import { render, screen } from '@testing-library/react-native'

import { Globe } from './icons'
import { lightColors, radius } from '../theme/tokens'

import { ListGroup } from './ListGroup'
import { ListRow } from './ListRow'

describe('ListGroup', () => {
  it('kẻ giữa các dòng (không kẻ trước dòng đầu), bỏ qua con null', async () => {
    await render(
      <ListGroup>
        <ListRow label="A" />
        {null}
        <ListRow label="B" />
        <ListRow label="C" />
      </ListGroup>,
    )
    expect(screen.getAllByTestId('list-separator')).toHaveLength(2)
  })

  it('đường kẻ bắt đầu sau ô icon (mặc định 53), đổi được qua `inset`', async () => {
    const view = await render(
      <ListGroup>
        <ListRow label="A" />
        <ListRow label="B" />
      </ListGroup>,
    )
    expect(screen.getByTestId('list-separator')).toHaveStyle({ marginLeft: 53 })
    await view.rerender(
      <ListGroup inset={14}>
        <ListRow label="A" />
        <ListRow label="B" />
      </ListGroup>,
    )
    expect(screen.getByTestId('list-separator')).toHaveStyle({ marginLeft: 14 })
  })

  it('một dòng → không có đường kẻ', async () => {
    await render(
      <ListGroup>
        <ListRow label="A" />
      </ListGroup>,
    )
    expect(screen.queryByTestId('list-separator')).toBeNull()
  })

  it('mặc định: bo radius.group (12), không lề trong, đường kẻ 53 — giữ nguyên giao diện cũ', async () => {
    await render(
      <ListGroup>
        <ListRow label="A" icon={Globe} />
        <ListRow label="B" />
      </ListGroup>,
    )
    expect(screen.getByTestId('list-separator').parent).toBeTruthy()
    expect(screen.getByTestId('list-separator').parent).toHaveStyle({ borderRadius: radius.group })
    expect(screen.getByTestId('list-separator')).toHaveStyle({ marginLeft: 53 })
    expect(screen.queryByTestId('card-icon-circle', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('icon-tile', { includeHiddenElements: true })).toBeOnTheScreen()
  })

  it('variant="card": bo 24, đường kẻ thụt 72 (lề 20 + vòng 40 + khoảng 12), icon trong vòng 40 nền fill', async () => {
    await render(
      <ListGroup variant="card">
        <ListRow label="A" icon={Globe} />
        <ListRow label="B" />
      </ListGroup>,
    )
    const sep = screen.getByTestId('list-separator')
    expect(sep.parent).toHaveStyle({ borderRadius: 24 })
    expect(sep).toHaveStyle({ marginLeft: 72 })
    expect(screen.getByTestId('card-icon-circle', { includeHiddenElements: true })).toHaveStyle({
      width: 40,
      height: 40,
      backgroundColor: lightColors.fill,
    })
    expect(screen.queryByTestId('icon-tile', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('A')).toHaveStyle({ fontSize: 17 })
  })

  it('variant="iconCard": vòng icon cách mép trái = mép trên = mép dưới (12, dòng cao 64); đường kẻ thụt 64', async () => {
    await render(
      <ListGroup variant="iconCard">
        <ListRow label="Kho" icon={Globe} onPress={jest.fn()} />
        <ListRow label="Ngôn ngữ" icon={Globe} onPress={jest.fn()} />
      </ListGroup>,
    )
    const row = screen.getByRole('button', { name: 'Kho' })
    expect(row).toHaveStyle({ paddingLeft: 12, paddingVertical: 12, minHeight: 64 })
    expect(screen.getByTestId('list-separator')).toHaveStyle({ marginLeft: 64 })
    expect(screen.getByTestId('list-separator').parent).toHaveStyle({ borderRadius: 24 })
    expect(screen.getAllByTestId('card-icon-circle', { includeHiddenElements: true })).toHaveLength(
      2,
    )
  })
})
