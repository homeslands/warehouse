import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { isVersionConflict } from '@/shared/api/http'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import {
  useCreateExample,
  useUpdateExample,
  type Example,
  type ExampleInput,
} from '@/entities/example'

type ExampleErrorKey = 'examples:nameRequired'

const schema = z.object({
  name: z.string().min(1, 'examples:nameRequired' satisfies ExampleErrorKey),
  description: z.string().optional(),
})

// warehouse-api src/example/example.validation.ts: EXAMPLE_NAME_DOES_EXIST = 999902 (HTTP 422).
const FIELD_BY_CODE = { 999902: 'name' } as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa bản ghi này (gửi kèm `version`); không có = tạo mới. */
  example?: Example
}

export function ExampleFormDialog({ open, onOpenChange, example }: Props) {
  const { t } = useTranslation(['examples', 'common'])
  const create = useCreateExample()
  const update = useUpdateExample()
  const isPending = create.isPending || update.isPending
  const form = useForm<ExampleInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })
  // Sửa: khoá Lưu tới khi khác giá trị đã `reset` lúc mở dialog (baseline là bản ghi đang sửa,
  // không phải defaultValues lúc khai useForm) — không khoá vì form invalid, bấm Lưu vẫn phải báo
  // lỗi tại ô. Tạo: không có baseline để so nên luôn cho bấm (trừ lúc đang pending).
  const disableSubmit = isPending || (example ? !form.formState.isDirty : false)

  // Mở lại dialog không được còn giá trị/lỗi của lần trước.
  useEffect(() => {
    if (open) form.reset({ name: example?.name ?? '', description: example?.description ?? '' })
  }, [open, example, form])

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
    // Bản đang sửa đã cũ (hook đã tải lại danh sách): đóng để người dùng mở lại từ dữ liệu mới.
    if (isVersionConflict(error)) onOpenChange(false)
  }

  const onSubmit = (input: ExampleInput) => {
    const options = { onSuccess: () => onOpenChange(false), onError: handleError }
    if (example) {
      update.mutate({ slug: example.slug, input: { ...input, version: example.version } }, options)
    } else {
      create.mutate(input, options)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{example ? t('examples:edit') : t('examples:create')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem required>
                  <FormLabel>{t('examples:columnName')}</FormLabel>
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
                  <FormLabel>{t('examples:columnDescription')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={disableSubmit}>
                {isPending ? t('common:saving') : t('common:save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
