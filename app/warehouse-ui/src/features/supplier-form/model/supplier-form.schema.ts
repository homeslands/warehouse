import { z } from 'zod'
import type { Supplier, SupplierInput, SupplierUpdateInput } from '@/entities/supplier'

/** Khớp `supplier.constants.ts` của backend. */
const CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/
const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/
const PHONE_REGEX = /^0\d{8,10}$/
const TEXT_MAX = 255
const NOTE_MAX = 1000
const emailSchema = z.email()

const optionalText = (regex: RegExp, message: string) =>
  z
    .string()
    .max(TEXT_MAX, 'suppliers:tooLong')
    .refine((v) => v.trim() === '' || regex.test(v.trim()), message)

export const supplierFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'suppliers:codeRequired')
    .regex(CODE_REGEX, 'suppliers:codeInvalid'),
  name: z.string().trim().min(1, 'suppliers:nameRequired').max(TEXT_MAX, 'suppliers:tooLong'),
  taxCode: optionalText(TAX_CODE_REGEX, 'suppliers:taxCodeInvalid'),
  phonenumber: optionalText(PHONE_REGEX, 'suppliers:phonenumberInvalid'),
  email: z
    .string()
    .max(TEXT_MAX, 'suppliers:tooLong')
    .refine(
      (v) => v.trim() === '' || emailSchema.safeParse(v.trim()).success,
      'suppliers:emailInvalid',
    ),
  address: z.string().max(TEXT_MAX, 'suppliers:tooLong'),
  contactPerson: z.string().max(TEXT_MAX, 'suppliers:tooLong'),
  note: z.string().max(NOTE_MAX, 'suppliers:noteTooLong'),
})

export type SupplierFormValues = z.input<typeof supplierFormSchema>

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  code: '',
  name: '',
  taxCode: '',
  phonenumber: '',
  email: '',
  address: '',
  contactPerson: '',
  note: '',
}

const OPTIONAL = ['taxCode', 'phonenumber', 'email', 'address', 'contactPerson', 'note'] as const

export function toCreateInput(values: SupplierFormValues): SupplierInput {
  const input: SupplierInput = { code: values.code.trim(), name: values.name.trim() }
  for (const key of OPTIONAL) {
    const v = values[key].trim()
    if (v !== '') input[key] = v
  }
  return input
}

/** Chỉ trường đã đổi. Ô tuỳ chọn bị xoá trống → bỏ qua (PATCH backend `pickDefined`, chưa nhận xoá trống). */
export function toUpdateInput(values: SupplierFormValues, original: Supplier): SupplierUpdateInput {
  const input: SupplierUpdateInput = {}
  if (values.code.trim() !== original.code) input.code = values.code.trim()
  if (values.name.trim() !== original.name) input.name = values.name.trim()
  for (const key of OPTIONAL) {
    const v = values[key].trim()
    if (v !== '' && v !== (original[key] ?? '')) input[key] = v
  }
  return input
}

export function toFormValues(supplier: Supplier): SupplierFormValues {
  return {
    code: supplier.code,
    name: supplier.name,
    taxCode: supplier.taxCode ?? '',
    phonenumber: supplier.phonenumber ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    contactPerson: supplier.contactPerson ?? '',
    note: supplier.note ?? '',
  }
}
