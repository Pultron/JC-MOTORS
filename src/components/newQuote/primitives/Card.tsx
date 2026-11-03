import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Retraso de la animación de entrada. */
  delayMs?: number;
  /** Permite que listas desplegables salgan de la tarjeta. */
  allowOverflow?: boolean;
  as?: 'section' | 'div';
}

export function Card({ children, className = '', delayMs = 0, allowOverflow = false, as: Tag = 'section' }: Props) {
  const style: CSSProperties | undefined = delayMs ? { animationDelay: `${delayMs}ms` } : undefined;
  return <Tag style={style} className={`animate-card-in rounded-[14px] bg-white shadow-mac-card ${allowOverflow ? '' : 'overflow-hidden'} ${className}`}>{children}</Tag>;
}
