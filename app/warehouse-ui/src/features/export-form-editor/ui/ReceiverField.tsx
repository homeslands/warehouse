import { useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Combobox } from '@/shared/ui/Combobox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { useWarehouses } from '@/entities/warehouse'
import type { ExportFormValues } from '../model/export-form-editor.schema'
import { formatWarehouseReceiver, parseWarehouseReceiver } from '../model/receiver'

type ReceiverFieldProps = {
  form: UseFormReturn<ExportFormValues>
  /** Kho đang lập phiếu — không chọn làm kho đích. */
  warehouseSlug: string
  /** Có `WAREHOUSE_READ`: Chuyển kho mới được chọn kho đích từ danh sách. */
  canReadWarehouses: boolean
}

/**
 * Ô "Người nhận". Chuyển kho + có quyền đọc kho → ô chọn kho đích (lưu `Kho: <mã> · <tên>`) cùng lối "Kho khác — nhập
 * tên"; còn lại là ô chữ. Trạng thái "đã chọn nhập tay" nằm trong component — cha gắn `key` theo lý do xuất để đổi lý
 * do thì chọn lại từ đầu.
 */
export function ReceiverField({ form, warehouseSlug, canReadWarehouses }: ReceiverFieldProps) {
  const { t } = useTranslation(['exportForms'])
  const type = form.watch('type')
  const transfer = type === 'TRANSFER' && canReadWarehouses
  const [manual, setManual] = useState(false)
  const switched = useRef(false)

  // Không có quyền / không phải Chuyển kho → không gọi API (BE trả 403 cho người thiếu WAREHOUSE_READ).
  const { data, isPending } = useWarehouses(
    { page: 1, size: 100, isActive: true },
    { enabled: transfer },
  )
  const warehouses = (data?.items ?? []).filter((w) => w.isActive && w.slug !== warehouseSlug)

  // Chữ chưa khớp kho nào (nháp mở lại với người nhận tự do) → chốt chế độ nhập tay. Một chiều: xoá trắng để gõ lại
  // không được đổi ô (mất focus).
  const receiver = form.watch('receiver')
  useEffect(() => {
    if (!transfer || manual || isPending || receiver.trim() === '') return
    if (parseWarehouseReceiver(receiver, warehouses) === null) setManual(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer, manual, isPending, receiver, data])

  // Sau khi bấm "Kho khác" thì đưa con trỏ vào ô chữ vừa hiện ra.
  useEffect(() => {
    if (manual && switched.current) form.setFocus('receiver')
  }, [manual, form])

  return (
    <FormField
      control={form.control}
      name="receiver"
      render={({ field }) => {
        const slug = transfer ? parseWarehouseReceiver(field.value, warehouses) : null
        // Nháp có chữ chưa khớp kho nào (kho không thấy được / chữ tự do) → ô chữ; đang tải thì chờ chứ chưa kết luận.
        const picker =
          transfer && !manual && (field.value.trim() === '' || slug !== null || isPending)
        return (
          <FormItem required>
            <FormLabel>
              {transfer ? t('exportForms:fieldReceiverWarehouse') : t('exportForms:fieldReceiver')}
            </FormLabel>
            <FormControl>
              {picker ? (
                <Combobox
                  ref={field.ref}
                  options={warehouses.map((w) => ({
                    value: w.slug,
                    label: formatWarehouseReceiver(w),
                  }))}
                  value={slug ?? undefined}
                  isLoading={isPending}
                  onChange={(next) => {
                    const warehouse = warehouses.find((w) => w.slug === next)
                    field.onChange(warehouse ? formatWarehouseReceiver(warehouse) : '')
                  }}
                  placeholder={t('exportForms:warehousePlaceholder')}
                  footer={(_, close) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start font-normal"
                      onClick={() => {
                        close()
                        if (slug !== null) field.onChange('')
                        switched.current = true
                        setManual(true)
                      }}
                    >
                      {t('exportForms:warehouseOther')}
                    </Button>
                  )}
                />
              ) : (
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder={t('exportForms:receiverPlaceholder')}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
