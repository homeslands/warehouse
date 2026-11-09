import { canEnterStep3, stepStatus } from './wizard-steps'

const states = (r: ReturnType<typeof stepStatus>) => r.map((s) => s.state)
const pressable = (r: ReturnType<typeof stepStatus>) => r.map((s) => s.pressable)

describe('stepStatus', () => {
  it('new form on step 2: step 1 done+pressable, step 3 todo not pressable', () => {
    const r = stepStatus({ current: 2, step1Ok: true, step2Ok: false, existing: false })
    expect(states(r)).toEqual(['done', 'current', 'todo'])
    expect(pressable(r)).toEqual([true, false, false])
  })

  it('new form on step 2: step 3 stays not pressable even when both steps are ok', () => {
    const r = stepStatus({ current: 2, step1Ok: true, step2Ok: true, existing: false })
    expect(states(r)).toEqual(['done', 'current', 'todo'])
    expect(pressable(r)).toEqual([true, false, false])
  })

  it('existing form on step 2 with step1Ok false: step 1 todo but pressable, step 3 not pressable', () => {
    const r = stepStatus({ current: 2, step1Ok: false, step2Ok: true, existing: true })
    expect(states(r)).toEqual(['todo', 'current', 'todo'])
    expect(pressable(r)).toEqual([true, false, false])
  })

  it('existing form on step 1 with both ok: step 3 pressable', () => {
    const r = stepStatus({ current: 1, step1Ok: true, step2Ok: true, existing: true })
    expect(states(r)).toEqual(['current', 'done', 'todo'])
    expect(pressable(r)).toEqual([false, true, true])
  })

  it('existing form on step 1 with step 2 missing: step 2 pressable, step 3 not', () => {
    const r = stepStatus({ current: 1, step1Ok: true, step2Ok: false, existing: true })
    expect(states(r)).toEqual(['current', 'todo', 'todo'])
    expect(pressable(r)).toEqual([false, true, false])
  })

  it('new form on step 1: later steps not pressable', () => {
    const r = stepStatus({ current: 1, step1Ok: true, step2Ok: true, existing: false })
    expect(pressable(r)).toEqual([false, false, false])
  })

  it('step 2 shows done only when step1Ok and step2Ok', () => {
    const on3 = (step1Ok: boolean, step2Ok: boolean) =>
      stepStatus({ current: 3, step1Ok, step2Ok, existing: false })[1].state
    expect(on3(true, true)).toBe('done')
    expect(on3(false, true)).toBe('todo')
    expect(on3(true, false)).toBe('todo')
  })

  it('step 3 is never done (it is done only once saved)', () => {
    const r = stepStatus({ current: 1, step1Ok: true, step2Ok: true, existing: false })
    expect(r[2].state).toBe('todo')
  })

  it('step 3 is current and earlier steps are pressable', () => {
    const r = stepStatus({ current: 3, step1Ok: true, step2Ok: true, existing: false })
    expect(states(r)).toEqual(['done', 'done', 'current'])
    expect(pressable(r)).toEqual([true, true, false])
  })
})

describe('canEnterStep3', () => {
  it('needs both step 1 and step 2', () => {
    expect(canEnterStep3(true, true)).toBe(true)
    expect(canEnterStep3(true, false)).toBe(false)
    expect(canEnterStep3(false, true)).toBe(false)
  })
})
