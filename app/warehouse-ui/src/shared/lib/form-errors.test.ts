import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import type { ApiError } from '@/shared/api/types'
import { applyApiErrorToForm } from './form-errors'

type Values = { name: string; description: string }

const apiError = (code?: number): ApiError => ({
  statusCode: 422,
  ...(code === undefined ? {} : { code }),
  timestamp: '',
  path: '/examples',
  method: 'POST',
  message: 'Example name does exist',
})

function setup() {
  return renderHook(() => useForm<Values>({ defaultValues: { name: '', description: '' } }))
}

describe('applyApiErrorToForm', () => {
  it('mã có trong bảng → lỗi vào đúng ô với message đã dịch, trả true', () => {
    const { result } = setup()
    let handled = false

    act(() => {
      handled = applyApiErrorToForm(result.current, apiError(999902), { 999902: 'name' })
    })

    expect(handled).toBe(true)
    expect(result.current.getFieldState('name').error?.message).toBe(
      i18n.t('errors:exampleNameDoesExist'),
    )
    expect(result.current.getFieldState('description').error).toBeUndefined()
  })

  it('mã không có trong bảng → không đụng form, trả false', () => {
    const { result } = setup()
    let handled = true

    act(() => {
      handled = applyApiErrorToForm(result.current, apiError(999901), { 999902: 'name' })
    })

    expect(handled).toBe(false)
    expect(result.current.getFieldState('name').error).toBeUndefined()
  })

  it.each([
    ['ApiError không có code', apiError()],
    ['lỗi mạng (không phải ApiError)', new Error('Network Error')],
  ])('%s → trả false', (_label, error) => {
    const { result } = setup()
    expect(applyApiErrorToForm(result.current, error, { 999902: 'name' })).toBe(false)
  })
})
