/** Per-route metadata read by the layout through useMatches(). */
export interface RouteHandle {
  /** The screen manages its own width and spacing (no centered max-width container). */
  fullBleed?: boolean;
}

export const FULL_BLEED: RouteHandle = { fullBleed: true };
