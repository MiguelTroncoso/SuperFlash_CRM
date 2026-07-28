import { Button } from './button';

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>
        Página {page} de {Math.max(totalPages, 1)}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          variant="outline"
        >
          Anterior
        </Button>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          variant="outline"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
