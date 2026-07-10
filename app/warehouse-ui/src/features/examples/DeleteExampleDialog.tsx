import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Example } from './api'

type Props = {
  example: Example | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

export function DeleteExampleDialog({ example, onOpenChange, onConfirm, isPending }: Props) {
  return (
    <Dialog open={example !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xoá example</DialogTitle>
        </DialogHeader>

        <p className="text-sm">
          Xoá <span className="font-medium">{example?.name}</span>? Thao tác này không hoàn tác được.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => example && onConfirm(example.slug)}
          >
            {isPending ? 'Đang xoá...' : 'Xoá'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
