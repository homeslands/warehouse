import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useImperativeHandle, useRef, type Ref } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Combobox } from '@/shared/ui/Combobox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { NumberInput } from '@/shared/ui/NumberInput'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import {
  INVENTORY_WAREHOUSE_INACTIVE,
  useCreateWarehouseMaterial,
  type AddedMaterial,
} from '@/entities/inventory'
import { useMaterialTypeOptions } from '@/entities/material-type'
import { supplierKeys, useSuppliers } from '@/entities/supplier'
import { useUnitOptions } from '@/entities/unit'
import {
  addMaterialDefaults,
  addMaterialSchema,
  type AddMaterialValues,
} from '../model/add-material.schema'
import { codeNameLabel } from '../model/labels'

/** Mã lỗi vật tư (1007xx) của phần `material` trong POST → ô tương ứng (như `MaterialFormSheet`). */
const FIELD_BY_CODE = {
  100702: 'name',
  100703: 'code',
  100704: 'code',
  100705: 'code',
  100706: 'code',
  100707: 'typeSlug',
  // Ngưỡng mặc định của vật tư (trong `material`): tối thiểu / tối đa sai, tối đa < tối thiểu.
  100708: 'minimumInventory',
  100709: 'maximumInventory',
  100710: 'maximumInventory',
  100601: 'typeSlug',
  100723: 'baseUnitSlug',
  100724: 'baseUnitSlug',
  100901: 'baseUnitSlug',
  // Phần `supplierSlug` của cùng POST: NCC không tồn tại (101201) / không hợp lệ (100816).
  101201: 'supplierSlug',
  100816: 'supplierSlug',
} as const

/** Tóm tắt ở bước xác nhận (nằm trong hộp cha). `supplier` chỉ có khi sẽ gắn NCC. */
export type CreateMaterialSummary = {
  code: string
  name: string
  unit: string
  supplier: string | null
}

/** Hộp cha bấm nút xác nhận ở bước xác nhận → gửi đúng giá trị đã hỏi. */
export type CreateMaterialHandle = { submit: () => void }

type Props = {
  ref?: Ref<CreateMaterialHandle>
  /** Form hợp lệ → hộp cha chuyển sang bước xác nhận (chưa gửi). */
  onAsk: (summary: CreateMaterialSummary) => void
  /** Lỗi thuộc ô sau khi xác nhận → hộp cha về màn nhập. */
  onFieldError: () => void
  /** Nút submit nằm ở footer của hộp (`<Button type="submit" form={formId}>`), không nằm trong section. */
  formId: string
  /** `id` của dòng lý do thiếu quyền — nút submit ở footer trỏ `aria-describedby` vào đây. */
  hintId: string
  warehouseSlug: string
  initialSearch: string
  canCreate: boolean
  canAttachSupplier: boolean
  /** NCC chọn sẵn (NCC của dòng phiếu nhập); chỉ áp dụng khi có quyền gắn NCC. */
  defaultSupplierSlug?: string
  /** `name` = tên server trả về (cho toast). `withSupplier`: có chọn NCC — server gắn NCC trong cùng POST. */
  onCreated: (added: AddedMaterial, name: string, withSupplier: boolean) => Promise<void> | void
  /** Hộp chặn đóng khi đang gửi. */
  onBusyChange: (busy: boolean) => void
  onWarehouseInactive: () => void
}

const label = codeNameLabel

export function CreateMaterialSection({
  ref,
  onAsk,
  onFieldError,
  formId,
  hintId,
  warehouseSlug,
  initialSearch,
  canCreate,
  canAttachSupplier,
  defaultSupplierSlug,
  onCreated,
  onBusyChange,
  onWarehouseInactive,
}: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const create = useCreateWarehouseMaterial()
  const qc = useQueryClient()
  const types = useMaterialTypeOptions({ enabled: canCreate })
  const units = useUnitOptions({ enabled: canCreate })
  const suppliers = useSuppliers(
    { page: 1, size: 100 },
    { enabled: canAttachSupplier && canCreate },
  )
  const form = useForm<AddMaterialValues>({
    resolver: zodResolver(addMaterialSchema),
    mode: 'onTouched',
    defaultValues: {
      ...addMaterialDefaults(initialSearch),
      supplierSlug: canAttachSupplier ? (defaultSupplierSlug ?? '') : '',
    },
  })

  // Luật "tối đa ≥ tối thiểu" nằm ở ô tối đa — sửa ô tối thiểu thì kiểm lại ô tối đa.
  useRevalidateWhenTouched(form, 'minimumInventory', 'maximumInventory')

  // `isPending` về false ngay khi POST xong, còn onCreated vẫn chạy → chốt cả luồng bằng ref.
  const inFlight = useRef(false)

  // Giá trị đã hỏi xác nhận — gửi đúng bản này (không đọc lại form).
  const asked = useRef<AddMaterialValues | null>(null)

  const ask = (values: AddMaterialValues) => {
    asked.current = values
    onAsk({
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      unit: unitOptions.find((o) => o.value === values.baseUnitSlug)?.label ?? values.baseUnitSlug,
      supplier:
        canAttachSupplier && values.supplierSlug !== ''
          ? (supplierOptions.find((o) => o.value === values.supplierSlug)?.label ??
            values.supplierSlug)
          : null,
    })
  }

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (asked.current) send(asked.current)
    },
  }))

  const send = (values: AddMaterialValues) => {
    if (inFlight.current) return
    inFlight.current = true
    onBusyChange(true)
    const withSupplier = canAttachSupplier && values.supplierSlug !== ''
    create.mutate(
      {
        warehouseSlug,
        material: {
          code: values.code.trim(),
          name: values.name.trim(),
          typeSlug: values.typeSlug,
          baseUnitSlug: values.baseUnitSlug,
          minimumInventory: values.minimumInventory,
          maximumInventory: values.maximumInventory,
        },
        supplierSlug: withSupplier ? values.supplierSlug : undefined,
      },
      {
        onSuccess: async (item) => {
          const unitLabel = unitOptions.find((o) => o.value === values.baseUnitSlug)
          const added: AddedMaterial = {
            slug: item.materialSlug,
            label: label(values.code.trim().toUpperCase(), values.name.trim()),
            baseUnit: { slug: values.baseUnitSlug, label: unitLabel?.label ?? values.baseUnitSlug },
          }
          try {
            await onCreated(added, item.materialName, withSupplier)
          } finally {
            inFlight.current = false
            onBusyChange(false)
          }
        },
        onError: (error) => {
          inFlight.current = false
          onBusyChange(false)
          if (isApiError(error) && error.code === INVENTORY_WAREHOUSE_INACTIVE) {
            toastApiError(error)
            onWarehouseInactive()
            return
          }
          // NCC vừa bị xoá nhưng còn trong ô chọn: làm mới danh sách để nó biến mất.
          if (isApiError(error) && error.code === 101201) {
            void qc.invalidateQueries({ queryKey: supplierKeys.all })
          }
          if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) {
            onFieldError()
            return
          }
          toastApiError(error)
        },
      },
    )
  }

  const typeOptions = (types.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))
  const unitOptions = (units.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))
  const supplierOptions = (suppliers.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))

  return (
    <Form {...form}>
      {/* Hộp nằm trong portal nhưng cây React vẫn nằm trong <form> của FormSheet → sự kiện submit nổi lên tới phiếu nhập;
          chặn lại để Enter / nút "Tạo và gắn vào kho" chỉ tạo vật tư. */}
      <form
        id={formId}
        noValidate
        className="space-y-4"
        aria-label={t('inventory:createMaterialSection')}
        onSubmit={(e) => {
          e.stopPropagation()
          void form.handleSubmit(ask)(e)
        }}
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('inventory:fieldMaterialCode')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" disabled={!canCreate} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('inventory:fieldMaterialName')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" disabled={!canCreate} />
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
                <FormLabel>{t('inventory:fieldMaterialType')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={typeOptions}
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder={t('inventory:typePlaceholder')}
                    disabled={!canCreate}
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
                <FormLabel>{t('inventory:fieldBaseUnit')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={unitOptions}
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder={t('inventory:baseUnitPlaceholder')}
                    disabled={!canCreate}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {canAttachSupplier && (
            <FormField
              control={form.control}
              name="supplierSlug"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t('inventory:fieldSupplierOptional')}</FormLabel>
                  <FormControl>
                    <Combobox
                      options={supplierOptions}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      placeholder={t('inventory:supplierPlaceholder')}
                      disabled={!canCreate}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {(['minimumInventory', 'maximumInventory'] as const).map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t(
                      name === 'minimumInventory'
                        ? 'inventory:fieldMinimum'
                        : 'inventory:fieldMaximum',
                    )}
                  </FormLabel>
                  <FormControl>
                    <NumberInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      disabled={!canCreate}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <p className="text-muted-foreground -mt-2 text-sm sm:col-span-2">
            {t('inventory:thresholdCreateHint')}
          </p>
        </div>
        <p className="text-muted-foreground text-sm">{t('inventory:createMaterialHint')}</p>
        {!canCreate && (
          <p id={hintId} className="text-muted-foreground text-xs">
            {t('inventory:needCreatePermission')}
          </p>
        )}
      </form>
    </Form>
  )
}
