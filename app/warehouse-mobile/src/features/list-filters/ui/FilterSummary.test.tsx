import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { create } from 'zustand'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { createChipFilterSlice, initialChipFilters } from '../store'
import type { ChipFilterActions, ChipFilters } from '../store'
import { FilterSummary } from './FilterSummary'

const useChips = create<ChipFilters & ChipFilterActions>((set) => createChipFilterSlice(set))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  useChips.setState({ ...initialChipFilters })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u-1', userName: 'an', scope: ['USER_READ'] } as never,
  })
})

describe('FilterSummary', () => {
  it('không có gì đang lọc → không hiện', async () => {
    await render(<FilterSummary store={useChips} onOpen={jest.fn()} />)
    expect(screen.queryByTestId('filter-summary')).toBeNull()
  })

  it('nối nhãn chip và `extraLabels` bằng " · "; chạm dòng → onOpen', async () => {
    useChips.setState({ time: 'last7', requester: { slug: 'u-9', name: 'Bình' } })
    const onOpen = jest.fn()
    await render(<FilterSummary store={useChips} extraLabels={['Bán hàng']} onOpen={onOpen} />)
    expect(screen.getByText('7 ngày qua · Bình · Bán hàng')).toBeOnTheScreen()
    await act(async () => fireEvent.press(screen.getByText('7 ngày qua · Bình · Bán hàng')))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('chỉ `extraLabels` → vẫn hiện; ✕ gọi onClearExtra', async () => {
    const onClearExtra = jest.fn()
    await render(
      <FilterSummary
        store={useChips}
        extraLabels={['Bán hàng']}
        onClearExtra={onClearExtra}
        onOpen={jest.fn()}
      />,
    )
    expect(screen.getByText('Bán hàng')).toBeOnTheScreen()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    expect(onClearExtra).toHaveBeenCalledTimes(1)
  })

  it('chip + extra → ✕ xoá cả hai', async () => {
    useChips.setState({ time: 'today' })
    const onClearExtra = jest.fn()
    await render(
      <FilterSummary
        store={useChips}
        extraLabels={['Bán hàng']}
        onClearExtra={onClearExtra}
        onOpen={jest.fn()}
      />,
    )
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    expect(useChips.getState().time).toBeNull()
    expect(onClearExtra).toHaveBeenCalledTimes(1)
  })
})
