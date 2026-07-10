import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Example, ExampleInput } from './api'

type ExampleErrorKey = 'examples:nameRequired'

const schema = z.object({
  name: z.string().min(1, 'examples:nameRequired' satisfies ExampleErrorKey),
  description: z.string().optional(),
})

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  example?: Example
  onSubmit: (input: ExampleInput) => void
  isPending: boolean
}

export function ExampleFormDialog({ open, onOpenChange, example, onSubmit, isPending }: Props) {
  const { t } = useTranslation(['examples', 'common'])
  const form = useForm<ExampleInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  useEffect(() => {
    form.reset({ name: example?.name ?? '', description: example?.description ?? '' })
  }, [example, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{example ? t('examples:edit') : t('examples:create')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('examples:columnName')}</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-destructive text-sm">
                {t(form.formState.errors.name.message as ExampleErrorKey)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('examples:columnDescription')}</Label>
            <Input id="description" {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('common:saving') : t('common:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
