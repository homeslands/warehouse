import { render, screen } from '@testing-library/react-native'

import { lightColors } from '../theme/tokens'
import { AppMark } from './AppMark'

describe('AppMark', () => {
  it('ô đen bo góc theo kích thước, ẩn với trình đọc màn hình', async () => {
    await render(<AppMark size={60} />)
    const mark = screen.getByTestId('app-mark', { includeHiddenElements: true })
    expect(mark).toHaveStyle({ width: 60, height: 60, backgroundColor: lightColors.primary })
    expect(mark.props['aria-hidden']).toBe(true)
  })
})
