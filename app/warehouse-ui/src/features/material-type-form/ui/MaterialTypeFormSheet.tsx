import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { TagsIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { FormSheet } from '@/shared/ui/FormSheet'
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
import { Textarea } from '@/shared/ui/textarea'
import { materialKeys } from '@/entities/material'
import {
  useCreateMaterialType,
  useUpdateMaterialType,
  type MaterialType,
} from '@/entities/material-type'
import {
  EMPTY_MATERIAL_TYPE_FORM,
  materialTypeFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type MaterialTypeFormValues,
} from '../model/material-type-form.schema'

const FIELD_BY_CODE = {
  100602: 'name',
  100603: 'name',
  100604: 'code',
  100605: 'code',
  100606: 'code',
  100607: 'code',
} as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa loại này; không có = tạo mới. */
  materialType?: MaterialType
}

export function MaterialTypeFormSheet({ open, onOpenChange, materialType }: Props) {
  const { t } = useTranslation(['materialTypes', 'common'])
  const qc = useQueryClient()
  const create = useCreateMaterialType()
  const update = useUpdateMaterialType()
  const isPending = create.isPending || update.isPending

  const form = useForm<MaterialTypeFormValues>({
    resolver: zodResolver(materialTypeFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY_MATERIAL_TYPE_FORM,
  })

  useEffect(() => {
    if (!open) return
    form.reset(materialType ? toFormValues(materialType) : EMPTY_MATERIAL_TYPE_FORM)
  }, [open, materialType, form])

  // Bảng vật tư hiện tên loại → sửa loại thì tải lại phía vật tư (tạo loại mới thì không ảnh hưởng).
  const invalidateMaterials = () => qc.invalidateQueries({ queryKey: materialKeys.all })

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi xác nhận rồi mới gửi. Sửa: lưu thẳng.
  const [toCreate, setToCreate] = useState<MaterialTypeFormValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô (vd mã đã tồn tại) hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  const onSubmit = (values: MaterialTypeFormValues) => {
    if (!materialType) {
      setToCreate(values)
      return
    }
    const input = toUpdateInput(values, materialType)
    if (Object.keys(input).length === 0) {
      onOpenChange(false)
      return
    }
    update.mutate(
      { slug: materialType.slug, input },
      {
        onSuccess: () => {
          void invalidateMaterials()
          onOpenChange(false)
        },
        onError: handleError,
      },
    )
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={materialType ? t('materialTypes:edit') : t('materialTypes:create')}
      submitLabel={materialType ? t('common:save') : t('materialTypes:create')}
      isPending={isPending}
      submitDisabled={materialType ? !form.formState.isDirty : false}
      isDirty={form.formState.isDirty}
      confirmation={
        materialType
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <TagsIcon />,
              title: t('materialTypes:createConfirmTitle'),
              description: t('materialTypes:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    {
                      label: t('materialTypes:fieldCode'),
                      value: toCreate.code.trim().toUpperCase(),
                    },
                    { label: t('materialTypes:fieldName'), value: toCreate.name.trim() },
                  ]}
                />
              ),
              confirmLabel: t('materialTypes:createConfirmAction'),
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
              <FormLabel>{t('materialTypes:fieldCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('materialTypes:codeHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('materialTypes:fieldName')}</FormLabel>
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
              <FormLabel>{t('materialTypes:fieldDescription')}</FormLabel>
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
