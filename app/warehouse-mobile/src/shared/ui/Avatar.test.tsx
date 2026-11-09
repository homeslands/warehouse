import { render, screen } from '@testing-library/react-native'

import { Avatar, initialsOf } from './Avatar'

describe('initialsOf', () => {
  it('chữ đầu của từ đầu và từ cuối, viết hoa', () => {
    expect(initialsOf('Nguyễn Văn A')).toBe('NA')
    expect(initialsOf('  trần   bình ')).toBe('TB')
    expect(initialsOf('Đức')).toBe('Đ')
  })

  it('rỗng/null → ""', () => {
    expect(initialsOf('')).toBe('')
    expect(initialsOf('   ')).toBe('')
    expect(initialsOf(null)).toBe('')
  })
})

describe('Avatar', () => {
  it('có tên → chữ cái đầu', async () => {
    await render(<Avatar name="Nguyễn Văn A" />)
    expect(screen.getByText('NA', { includeHiddenElements: true })).toBeOnTheScreen()
    expect(screen.queryByTestId('avatar-icon', { includeHiddenElements: true })).toBeNull()
  })

  it('chưa có tên → icon người', async () => {
    await render(<Avatar name="" />)
    expect(screen.getByTestId('avatar-icon', { includeHiddenElements: true })).toBeOnTheScreen()
  })
})
