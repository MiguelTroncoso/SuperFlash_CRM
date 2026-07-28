'use client';

import { Button } from './button';
import { Drawer } from './drawer';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  onClose,
  onConfirm,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}): React.ReactElement | null {
  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose} variant="outline">
          Cancelar
        </Button>
        <Button onClick={onConfirm} variant="danger">
          {confirmLabel}
        </Button>
      </div>
    </Drawer>
  );
}
