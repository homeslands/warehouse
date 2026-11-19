import { usePeriodStore } from './period-store'

beforeEach(() => usePeriodStore.getState().reset())

describe('usePeriodStore', () => {
  it('mặc định tháng, offset 0', () => {
    expect(usePeriodStore.getState()).toMatchObject({ period: 'month', offset: 0 })
  })
  it('setPeriod đưa offset về 0', () => {
    usePeriodStore.getState().back()
    usePeriodStore.getState().setPeriod('week')
    expect(usePeriodStore.getState()).toMatchObject({ period: 'week', offset: 0 })
  })
  it('forward ở 0 vẫn 0; back tăng; forward giảm', () => {
    const s = usePeriodStore.getState()
    s.forward()
    expect(usePeriodStore.getState().offset).toBe(0)
    s.back()
    s.back()
    expect(usePeriodStore.getState().offset).toBe(2)
    s.forward()
    expect(usePeriodStore.getState().offset).toBe(1)
  })
  it('reset về mặc định', () => {
    usePeriodStore.getState().setPeriod('year')
    usePeriodStore.getState().back()
    usePeriodStore.getState().reset()
    expect(usePeriodStore.getState()).toMatchObject({ period: 'month', offset: 0 })
  })
})
