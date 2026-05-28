'use client'
import { type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type EntityFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Left side — scrollable form */
  form: ReactNode
  /** Right side — live preview card */
  preview?: ReactNode
  saveLabel?: string
  cancelLabel?: string
  onSave?: () => void
  saving?: boolean
  /** Disable save button */
  saveDisabled?: boolean
  className?: string
}

/**
 * Wide modal with form (left) + live preview (right) panels.
 * Used for Service/Master/Promo CRUD.
 */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  preview,
  saveLabel = 'Сохранить',
  cancelLabel = 'Отмена',
  onSave,
  saving = false,
  saveDisabled = false,
  className = '',
}: EntityFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className={className}>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        <div
          className={`grid gap-6 ${
            preview ? 'sm:grid-cols-[1fr_360px]' : 'grid-cols-1'
          }`}
        >
          <div className="min-w-0 max-h-[60vh] overflow-y-auto pr-2">
            {form}
          </div>
          {preview && (
            <div className="bg-cream-2 rounded-2xl p-4 border border-line-soft self-start">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Превью
              </div>
              {preview}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="default"
            onClick={onSave}
            disabled={saving || saveDisabled}
          >
            {saving ? 'Сохраняем…' : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
