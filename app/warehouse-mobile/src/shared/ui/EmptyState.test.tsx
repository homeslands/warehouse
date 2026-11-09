import { render, screen } from '@testing-library/react-native'
import { PackagePlus } from './icons'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('icon, tiêu đề, mô tả và viên "Sắp có"', async () => {
    await render(
      <EmptyState icon={PackagePlus} title="Tiêu đề" description="Mô tả" badge="Sắp có" />,
    )
    expect(
      screen.getByTestId('empty-state-icon', { includeHiddenElements: true }),
    ).toBeOnTheScreen()
    expect(screen.getByText('Tiêu đề')).toBeOnTheScreen()
    expect(screen.getByText('Mô tả')).toBeOnTheScreen()
    expect(screen.getByText('Sắp có')).toBeOnTheScreen()
  })

  it('không có badge thì không vẽ viên', async () => {
    await render(<EmptyState icon={PackagePlus} title="T" description="D" />)
    expect(screen.queryByText('Sắp có')).toBeNull()
  })
})
