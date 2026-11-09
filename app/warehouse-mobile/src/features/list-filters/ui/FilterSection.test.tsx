import { render, screen } from '@testing-library/react-native'
import { Calendar } from '@/shared/ui/icons'
import { Platform, StyleSheet, Text } from 'react-native'

import { expandAnimations, FilterSection } from './FilterSection'

describe('FilterSection — mở/thu nội dung', () => {
  it('Reduce Motion → không có hiệu ứng vào/ra (đổi tức thì); bình thường → mờ vào/ra', () => {
    expect(expandAnimations(true)).toEqual({})
    const normal = expandAnimations(false)
    expect(normal.entering).toBeDefined()
    expect(normal.exiting).toBeDefined()
  })

  it('TẮT → không có nội dung; BẬT → nội dung dưới dòng đầu', async () => {
    const view = await render(
      <FilterSection testID="s" icon={Calendar} label="Thời gian" on={false} onToggle={jest.fn()}>
        <Text>nội dung</Text>
      </FilterSection>,
    )
    expect(screen.queryByText('nội dung')).toBeNull()
    await view.rerender(
      <FilterSection testID="s" icon={Calendar} label="Thời gian" on onToggle={jest.fn()}>
        <Text>nội dung</Text>
      </FilterSection>,
    )
    expect(screen.getByText('nội dung')).toBeOnTheScreen()
    expect(screen.getByRole('switch', { name: 'Thời gian' })).toBeChecked()
  })

  it('iOS: công tắc dời xuống 2pt cho khớp tâm nét chữ SF (hộp chữ cao hơn nét); Android không dời', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios')
    const view = await render(
      <FilterSection
        testID="s"
        icon={Calendar}
        label="Thời gian"
        on={false}
        onToggle={jest.fn()}
      />,
    )
    const ios = StyleSheet.flatten(screen.getByTestId('s-switch').props.style)
    expect(ios.transform).toEqual([{ translateY: 2 }])
    os.replaceValue('android')
    await view.rerender(
      <FilterSection testID="s" icon={Calendar} label="Thời gian" on onToggle={jest.fn()} />,
    )
    const android = StyleSheet.flatten(screen.getByTestId('s-switch').props.style)
    expect(android?.transform).toBeUndefined()
    os.restore()
  })

  it('không có nền thẻ: nằm thẳng trên nền sheet, không bo, không lề trong ngang', async () => {
    await render(
      <FilterSection testID="s" icon={Calendar} label="Thời gian" on onToggle={jest.fn()}>
        <Text>nội dung</Text>
      </FilterSection>,
    )
    const style = StyleSheet.flatten(screen.getByTestId('s').props.style)
    expect(style.backgroundColor).toBeUndefined()
    expect(style.borderRadius).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('s-header').props.style).paddingHorizontal).toBe(0)
  })
})
