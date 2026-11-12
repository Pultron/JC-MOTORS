/**
 * Scrolls to and focuses the first field marked aria-invalid="true" (DOM order, which is the tab order
 * of the form). Reusable by any form that renders aria-invalid on its controls.
 * Returns the element that received focus, or null when nothing is invalid.
 */
export function focusFirstInvalid(root: ParentNode = document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[aria-invalid="true"]'));
  const target = candidates.find((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
  if (!target) return null;
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
  return target;
}
