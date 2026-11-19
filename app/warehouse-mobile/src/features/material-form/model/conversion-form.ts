import type { MaterialRef } from '@/entities/material'
import { parseDecimalInput } from '@/shared/lib/format'

export type ConversionFormErrors = { unit?: 'required'; rate?: 'required' | 'numberInvalid' }

export function validateConversionForm(v: {
  unit: MaterialRef | null
  rate: string
}): ConversionFormErrors {
  const errors: ConversionFormErrors = {}
  if (v.unit === null) errors.unit = 'required'
  if (v.rate.trim() === '') errors.rate = 'required'
  else {
    const n = parseDecimalInput(v.rate)
    if (n === null || n <= 0 || n >= 1e12) errors.rate = 'numberInvalid'
  }
  return errors
}
