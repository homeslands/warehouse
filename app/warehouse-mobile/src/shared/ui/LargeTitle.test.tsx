import { render, screen } from '@testing-library/react-native'

import { LargeTitle } from './LargeTitle'

describe('LargeTitle', () => {
  it('là header với đúng chữ', async () => {
    await render(<LargeTitle>Tài khoản</LargeTitle>)
    expect(screen.getByRole('header', { name: 'Tài khoản' })).toBeOnTheScreen()
  })
})
