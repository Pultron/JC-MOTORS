interface Props {
  saved: boolean;
}

export function SaveStatusBadge({ saved }: Props) {
  return <span data-testid="estado-guardado" role="status" className="inline-flex items-center gap-1.5 rounded-full bg-mac-fill px-3 py-1 text-xs font-medium text-mac-ink-2">
    <span aria-hidden="true" className={`size-1.5 rounded-full ${saved ? 'bg-mac-success' : 'bg-mac-ink-2'}`} />
    {saved ? 'Guardado' : 'Borrador sin guardar'}
  </span>;
}
