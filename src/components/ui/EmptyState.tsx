import type { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  testId?: string;
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: EmptyStateAction;
  testId?: string;
  /** Adds the top separator used when the state sits right under a toolbar. */
  bordered?: boolean;
  className?: string;
}

const BUTTON_BASE = 'mt-4 inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mac-accent';
const BUTTON_VARIANT = {
  primary: 'bg-mac-accent text-white hover:opacity-90',
  secondary: 'bg-mac-fill text-mac-ink hover:bg-mac-separator',
} as const;

/** Shared empty / no-results panel: icon, title, optional text and optional action. */
export function EmptyState({ icon, title, text, action, testId, bordered = false, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center px-6 py-12 text-center ${bordered ? 'border-t border-mac-separator' : ''} ${className}`}
      data-testid={testId}
    >
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-mac-tint text-mac-accent-text">{icon}</span>
      <p className="mt-3 text-[14px] font-semibold text-mac-ink">{title}</p>
      {text && <p className="mt-1 max-w-xs text-[13px] text-mac-ink-2">{text}</p>}
      {action && (
        <button type="button" className={`${BUTTON_BASE} ${BUTTON_VARIANT[action.variant ?? 'secondary']}`} data-testid={action.testId} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export type EmptyKind = 'none' | 'search' | 'status';

/** Which of the three distinct empty cases applies (null when there are rows to show). */
export function emptyKind(total: number, matchesAfterSearch: number, matchesAfterStatus: number, hasSearch: boolean, hasStatus: boolean): EmptyKind | null {
  if (matchesAfterStatus > 0) return null;
  if (total === 0) return 'none';
  if (hasSearch && matchesAfterSearch === 0) return 'search';
  if (hasStatus) return 'status';
  return 'search';
}
