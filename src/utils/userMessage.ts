/**
 * Turns any caught error into text that is safe to show: a generic Spanish message per context, with the technical
 * detail going to the console only. Errors that already carry a message written for the user (UserMessageError, plus
 * the typed validation errors a caller opts in with `keep`) are shown as they are.
 */

/** An Error whose `message` was written for the person using the app (validation, "revisa tus datos", etc.). */
export class UserMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserMessageError';
  }
}

export type ErrorContext =
  | 'pdf-generar'
  | 'pdf-guardar'
  | 'factura-pdf'
  | 'factura-original'
  | 'gastos-guardar'
  | 'gastos-cargar';

const GENERIC: Record<ErrorContext, string> = {
  'pdf-generar': 'No se pudo generar el PDF. Intenta de nuevo.',
  'pdf-guardar': 'No se pudo guardar el PDF. Intenta de nuevo.',
  'factura-pdf': 'No se pudo generar el PDF de la factura. Intenta de nuevo.',
  'factura-original': 'No se pudo guardar el archivo original. Intenta de nuevo.',
  'gastos-guardar': 'No se pudieron guardar los gastos. Intenta de nuevo.',
  'gastos-cargar': 'No se pudo cargar la información interna. Intenta de nuevo.',
};

export function userMessage(error: unknown, context: ErrorContext, keep?: (error: unknown) => boolean): string {
  if (error instanceof UserMessageError || (keep?.(error) ?? false)) return (error as Error).message;
  console.error(`[${context}]`, error);
  return GENERIC[context];
}
