import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { SearchField } from './SearchField'

describe('SearchField', () => {
  it('gõ → onChangeText; placeholder là nhãn trợ năng', async () => {
    const onChangeText = jest.fn()
    await render(<SearchField value="" onChangeText={onChangeText} placeholder="Tìm kho" />)
    await fireEvent.changeText(screen.getByLabelText('Tìm kho'), 'thu duc')
    expect(onChangeText).toHaveBeenCalledWith('thu duc')
  })
})

describe('SearchField — nút xoá tự vẽ (Android không có clearButtonMode)', () => {
  it('có clearLabel + có chữ → nút xoá gọi onChangeText(""); ô trống → không có nút', async () => {
    const onChangeText = jest.fn()
    await render(
      <SearchField
        value="pn"
        onChangeText={onChangeText}
        placeholder="Tìm phiếu"
        clearLabel="Xoá tìm kiếm"
      />,
    )
    expect(screen.getByLabelText('Tìm phiếu').props.clearButtonMode).toBe('never')
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá tìm kiếm' }))
    expect(onChangeText).toHaveBeenCalledWith('')

    await screen.rerender(
      <SearchField
        value=""
        onChangeText={onChangeText}
        placeholder="Tìm phiếu"
        clearLabel="Xoá tìm kiếm"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Xoá tìm kiếm' })).toBeNull()
  })

  it('nút xoá: vùng chạm thật ≥ 44×44 (khung + hitSlop)', async () => {
    await render(
      <SearchField
        value="pn"
        onChangeText={jest.fn()}
        placeholder="Tìm phiếu"
        clearLabel="Xoá tìm kiếm"
      />,
    )
    const button = screen.getByRole('button', { name: 'Xoá tìm kiếm' })
    const { width, height } = StyleSheet.flatten(button.props.style) as {
      width: number
      height: number
    }
    const slop = button.props.hitSlop as {
      top: number
      bottom: number
      left: number
      right: number
    }
    expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(44)
    expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44)
  })

  it('không có clearLabel → giữ nút xoá của hệ thống (iOS), không vẽ nút riêng', async () => {
    await render(<SearchField value="pn" onChangeText={jest.fn()} placeholder="Tìm kho" />)
    expect(screen.getByLabelText('Tìm kho').props.clearButtonMode).toBe('while-editing')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SearchField — kính lúp theo nền tảng', () => {
  afterEach(() => jest.restoreAllMocks())
  const symbol = () => screen.container.queryAll((n) => n.props.name === 'magnifyingglass')

  it('iOS: SF Symbol magnifyingglass', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await render(<SearchField value="" onChangeText={jest.fn()} placeholder="Tìm kho" />)
    expect(symbol().length).toBeGreaterThan(0)
  })

  it('Android: icon lucide, không SF Symbol', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(<SearchField value="" onChangeText={jest.fn()} placeholder="Tìm kho" />)
    expect(symbol()).toHaveLength(0)
  })
})
