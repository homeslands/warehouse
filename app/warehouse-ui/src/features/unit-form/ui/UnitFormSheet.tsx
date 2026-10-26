import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { RulerIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { changedFieldLabels } from '@/shared/lib/changed-fields'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { FormSheet } from '@/shared/ui/FormSheet'
import { SummaryList } from '@/shared/ui/SummaryList'
import { useSaveChangesConfirmation } from '@/shared/ui/useSaveChangesConfirmation'
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
import { Textarea } from '@/shared/ui/textarea'
import { materialKeys } from '@/entities/material'
import { useCreateUnit, useUpdateUnit, type Unit } from '@/entities/unit'
import {
  EMPTY_UNIT_FORM,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  unitFormSchema,
  type UnitFormValues,
} from '../model/unit-form.schema'

const FIELD_BY_CODE = {
  100902: 'name',
  100903: 'name',
  100904: 'code',
  100905: 'code',
  100906: 'code',
  100907: 'code',
} as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa đơn vị này; không có = tạo mới. */
  unit?: Unit
}

export function UnitFormSheet({ open, onOpenChange, unit }: Props) {
  const { t } = useTranslation(['units', 'common'])
  const qc = useQueryClient()
  const create = useCreateUnit()
  const update = useUpdateUnit()
  const isPending = create.isPending || update.isPending

  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY_UNIT_FORM,
  })

  useEffect(() => {
    if (!open) return
    form.reset(unit ? toFormValues(unit) : EMPTY_UNIT_FORM)
  }, [open, unit, form])

  // Tạo: hộp quy đổi của vật tư liệt kê đơn vị gắn được (dưới `materialKeys`). Sửa: bảng vật tư hiện mã / tên
  // đơn vị gốc. Cả hai đều phải tải lại phía vật tư.
  const invalidateMaterials = () => qc.invalidateQueries({ queryKey: materialKeys.all })

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi xác nhận rồi mới gửi. Sửa: cũng hỏi "Lưu thay đổi …?" (useSaveChangesConfirmation).
  const [toCreate, setToCreate] = useState<UnitFormValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => {
        void invalidateMaterials()
        onOpenChange(false)
      },
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô (vd mã đã tồn tại) hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  // Sửa: form hợp lệ → hỏi "Lưu thay đổi …?" rồi mới PATCH.
  const saveConfirmation = useSaveChangesConfirmation<UnitFormValues>({
    open,
    entity: t('units:entityName'),
    name: unit?.code ?? '',
    changed: changedFieldLabels(form.formState.dirtyFields, {
      code: t('units:fieldCode'),
      name: t('units:fieldName'),
      description: t('units:fieldDescription'),
    }),
    icon: <RulerIcon />,
    onConfirm: (values) => {
      if (!unit) return
      const input = toUpdateInput(values, unit)
      if (Object.keys(input).length === 0) {
        saveConfirmation.close()
        onOpenChange(false)
        return
      }
      update.mutate(
        { slug: unit.slug, input },
        {
          onSuccess: () => {
            void invalidateMaterials()
            onOpenChange(false)
          },
          onError: (error) => {
            // Đóng hộp xác nhận để lỗi tại ô (vd mã đã tồn tại) hiện ra.
            saveConfirmation.close()
            handleError(error)
          },
        },
      )
    },
  })

  const onSubmit = (values: UnitFormValues) => {
    if (!unit) {
      setToCreate(values)
      return
    }
    if (Object.keys(toUpdateInput(values, unit)).length === 0) {
      onOpenChange(false)
      return
    }
    saveConfirmation.request(values)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={unit ? t('units:edit') : t('units:create')}
      submitLabel={unit ? t('common:save') : t('units:create')}
      isPending={isPending}
      submitDisabled={unit ? !form.formState.isDirty : false}
      isDirty={form.formState.isDirty}
      confirmation={
        unit
          ? saveConfirmation.confirmation
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <RulerIcon />,
              title: t('units:createConfirmTitle'),
              description: t('units:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    { label: t('units:fieldCode'), value: toCreate.code.trim().toUpperCase() },
                    { label: t('units:fieldName'), value: toCreate.name.trim() },
                  ]}
                />
              ),
              confirmLabel: t('units:createConfirmAction'),
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
              <FormLabel>{t('units:fieldCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('units:codeHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('units:fieldName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('units:fieldDescription')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
