import { fireEvent, render, screen } from '@testing-library/react-native'

import { LineSummaryRow } from './LineSummaryRow'
import { SwipeToDelete } from './SwipeToDelete'

const onDelete = jest.fn()
beforeEach(() => jest.clearAllMocks())

function show(enabled: boolean) {
  return render(
    <SwipeToDelete testID="swipe" label="Xoá" enabled={enabled} onDelete={onDelete}>
      <LineSummaryRow
        testID="row"
        title="Keo dán"
        amount="9.000 đ"
        line2="1 tuýp × 9.000 đ"
        line3="VT-0107"
        first
        last
        onPress={() => {}}
        accessibilityLabel="Keo dán"
      />
    </SwipeToDelete>,
  )
}
/** Phần tử a11y của dòng — nơi trình đọc màn hình thấy thao tác "Xoá". */
const summary = () => screen.getByTestId('row')

describe('SwipeToDelete', () => {
  it('delete accessibility action calls onDelete', async () => {
    await show(true)
    const el = summary()
    expect(el.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Xoá' }])
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('disabled has no delete action', async () => {
    await show(false)
    const el = summary()
    expect(el.props.accessibilityActions ?? []).toEqual([])
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } })
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('nút tròn xoá nằm sau thẻ (lộ ra khi vuốt), ẩn với trình đọc màn hình; chạm → onDelete', async () => {
    await show(true)
    const button = screen.getByTestId('swipe-delete', { includeHiddenElements: true })
    expect(button.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(button).toHaveStyle({ width: 44, height: 44, borderRadius: 22 })
    await fireEvent.press(button)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
