import type { InputHTMLAttributes } from 'react';

import { Input } from './input';

export function SearchBar({
  placeholder = 'Buscar...',
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content-muted">
        ⌕
      </span>
      <Input className="pl-9" placeholder={placeholder} {...props} />
    </div>
  );
}
