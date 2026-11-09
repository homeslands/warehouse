import { render, screen } from '@testing-library/react-native'

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
})
