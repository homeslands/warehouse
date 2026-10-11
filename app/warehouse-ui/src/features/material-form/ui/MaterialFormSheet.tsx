import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { PackageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import { formatQuantity } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { FormSheet } from '@/shared/ui/FormSheet'
import { NumberInput } from '@/shared/ui/NumberInput'
import { SummaryList } from '@/shared/ui/SummaryList'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { useCreateMaterial, useUpdateMaterial, type Material } from '@/entities/material'
import { useMaterialTypeOptions } from '@/entities/material-type'
import { supplierKeys } from '@/entities/supplier'
import { unitKeys, useUnitOptions } from '@/entities/unit'
import {
  EMPTY_MATERIAL_FORM,
  materialFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type MaterialFormValues,
} from '../model/material-form.schema'

const FIELD_BY_CODE = {
  100702: 'name',
  100703: 'code',
  100704: 'code',
  100705: 'code',
  100706: 'code',
  100707: 'typeSlug',
  100601: 'typeSlug',
  100708: 'minimumInventory',
  100709: 'maximumInventory',
  100710: 'maximumInventory',
  100723: 'baseUnitSlug',
  100724: 'baseUnitSlug',
  100901: 'baseUnitSlug',
} as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa vật tư này; không có = tạo mới. */
  material?: Material
}

const optionLabel = (code: string, name: string) => `${code} · ${name}`

/** Ô chọn chỉ có 100 bản ghi đầu: giá trị đang gán nằm ngoài thì thêm từ chính bản ghi để vẫn hiện đúng. */
function withCurrent(options: ComboboxOption[], current: ComboboxOption | null): ComboboxOption[] {
  if (!current || options.some((o) => o.value === current.value)) return options
  return [current, ...options]
}

export function MaterialFormSheet({ open, onOpenChange, material }: Props) {
  const { t } = useTranslation(['materials', 'common'])
  const qc = useQueryClient()
  const create = useCreateMaterial()
  const update = useUpdateMaterial()
  const isPending = create.isPending || update.isPending
  const types = useMaterialTypeOptions({ enabled: open })
  const units = useUnitOptions({ enabled: open })

  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY_MATERIAL_FORM,
  })
  useRevalidateWhenTouched(form, 'minimumInventory', 'maximumInventory')

  useEffect(() => {
    if (!open) return
    form.reset(material ? toFormValues(material) : EMPTY_MATERIAL_FORM)
  }, [open, material, form])

  const typeOptions = withCurrent(
    (types.data?.items ?? []).map((x) => ({ value: x.slug, label: optionLabel(x.code, x.name) })),
    material
      ? { value: material.typeSlug, label: optionLabel(material.typeCode, material.typeName) }
      : null,
  )
  const unitOptions = withCurrent(
    (units.data?.items ?? []).map((x) => ({ value: x.slug, label: optionLabel(x.code, x.name) })),
    material?.baseUnitSlug && material.baseUnitCode
      ? {
          value: material.baseUnitSlug,
          label: optionLabel(material.baseUnitCode, material.baseUnitName ?? ''),
        }
      : null,
  )

  const invalidateRelated = () => {
    // Đếm "đang dùng" của đơn vị + bảng vật tư của nhà cung cấp hiện tên / loại / đơn vị.
    void qc.invalidateQueries({ queryKey: unitKeys.all })
    void qc.invalidateQueries({ queryKey: supplierKeys.all })
  }

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi xác nhận rồi mới gửi. Sửa: lưu thẳng.
  const [toCreate, setToCreate] = useState<MaterialFormValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => {
        invalidateRelated()
        onOpenChange(false)
      },
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  const onSubmit = (values: MaterialFormValues) => {
    if (!material) {
      setToCreate(values)
      return
    }
    const input = toUpdateInput(values, material)
    if (Object.keys(input).length === 0) {
      onOpenChange(false)
      return
    }
    update.mutate(
      { slug: material.slug, input },
      {
        onSuccess: () => {
          invalidateRelated()
          onOpenChange(false)
        },
        onError: handleError,
      },
    )
  }

  const labelOf = (options: ComboboxOption[], value: string) =>
    options.find((o) => o.value === value)?.label ?? ''

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={material ? t('materials:edit') : t('materials:create')}
      submitLabel={material ? t('common:save') : t('materials:create')}
      isPending={isPending}
      submitDisabled={material ? !form.formState.isDirty : false}
      isDirty={form.formState.isDirty}
      confirmation={
        material
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <PackageIcon />,
              title: t('materials:createConfirmTitle'),
              description: t('materials:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    { label: t('materials:fieldCode'), value: toCreate.code.trim().toUpperCase() },
                    { label: t('materials:fieldName'), value: toCreate.name.trim() },
                    {
                      label: t('materials:fieldType'),
                      value: labelOf(typeOptions, toCreate.typeSlug),
                    },
                    {
                      label: t('materials:fieldBaseUnit'),
                      value: labelOf(unitOptions, toCreate.baseUnitSlug),
                    },
                    {
                      label: t('materials:fieldMinimum'),
                      value: formatQuantity(toCreate.minimumInventory ?? 0),
                    },
                    {
                      label: t('materials:fieldMaximum'),
                      value: formatQuantity(toCreate.maximumInventory ?? 0),
                    },
                  ]}
                />
              ),
              confirmLabel: t('materials:createConfirmAction'),
              onConfirm: confirmCreate,
            }
      }
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('materials:fieldCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('materials:codeHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('materials:fieldName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="typeSlug"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('materials:fieldType')}</FormLabel>
              <FormControl>
                <Combobox
                  options={typeOptions}
                  value={field.value === '' ? undefined : field.value}
                  onChange={(next) => field.onChange(next ?? '')}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  placeholder={
                    types.isPending ? t('common:loading') : t('materials:typePlaceholder')
                  }
                  emptyText={t('materials:noTypes')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="baseUnitSlug"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('materials:fieldBaseUnit')}</FormLabel>
              <FormControl>
                <Combobox
                  options={unitOptions}
                  value={field.value === '' ? undefined : field.value}
                  onChange={(next) => field.onChange(next ?? '')}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  placeholder={
                    units.isPending ? t('common:loading') : t('materials:baseUnitPlaceholder')
                  }
                  emptyText={t('materials:noUnits')}
                />
              </FormControl>
              {/* Sửa vật tư đã có đơn vị gốc: backend khoá đổi khi đã có tồn / đơn vị quy đổi khác (100723) —
                  FE không biết trước tồn kho nên không khoá sẵn, chỉ nhắc. Vật tư cũ chưa có thì là lần chọn đầu. */}
              <FormDescription>
                {material?.baseUnitSlug
                  ? t('materials:baseUnitLockHint')
                  : t('materials:baseUnitHint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="minimumInventory"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('materials:fieldMinimum')}</FormLabel>
              <FormControl>
                <NumberInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              </FormControl>
              <FormDescription>{t('materials:inventoryHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maximumInventory"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('materials:fieldMaximum')}</FormLabel>
              <FormControl>
                <NumberInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              </FormControl>
              <FormDescription>{t('materials:inventoryHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
