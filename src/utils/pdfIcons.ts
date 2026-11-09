import type { jsPDF } from 'jspdf';

export type IconName = 'person' | 'phone' | 'mail' | 'car' | 'calendar' | 'plate' | 'pin';

/** Line icons drawn with vector paths. `x`, `y` and `size` are in mm (the jsPDF unit). */
export function drawIcon(doc: jsPDF, name: IconName, x: number, y: number, size: number, color: string): void {
  // Keeping every stroke inside the box prevents small icons from being clipped.
  doc.saveGraphicsState();
  x += size * 0.1;
  y += size * 0.1;
  size *= 0.8;
  doc.setDrawColor(color);
  doc.setLineWidth(0.35);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  const cx = x + size / 2;
  switch (name) {
    case 'person':
      doc.circle(cx, y + size * 0.28, size * 0.16, 'S');
      doc.lines([
        [size * 0.18, 0],
        [0, -size * 0.22, size * 0.14, -size * 0.35, size * 0.32, -size * 0.35],
        [size * 0.18, 0, size * 0.32, size * 0.13, size * 0.32, size * 0.35],
      ], x + size * 0.18, y + size * 0.9, [1, 1], 'S');
      break;
    case 'car':
      doc.lines([
        [size * 0.04, -size * 0.16],
        [size * 0.15, -size * 0.02],
        [size * 0.12, -size * 0.24],
        [size * 0.28, 0],
        [size * 0.13, size * 0.24],
        [size * 0.12, size * 0.02],
        [size * 0.03, size * 0.16],
        [-size * 0.87, 0],
      ], x + size * 0.08, y + size * 0.62, [1, 1], 'S', true);
      doc.lines([
        [size * 0.09, -size * 0.18],
        [size * 0.25, 0],
        [size * 0.1, size * 0.18],
      ], x + size * 0.31, y + size * 0.42, [1, 1], 'S');
      doc.circle(x + size * 0.29, y + size * 0.69, size * 0.1, 'S');
      doc.circle(x + size * 0.72, y + size * 0.69, size * 0.1, 'S');
      break;
    case 'phone':
      doc.setFillColor(color);
      doc.lines([
        [size * 0.07, size * 0.07, size * 0.13, size * 0.13, size * 0.19, size * 0.19],
        [-size * 0.1, size * 0.13],
        [size * 0.28, size * 0.48, size * 0.4, size * 0.61, size * 0.31, size * 0.33],
        [size * 0.13, -size * 0.12],
        [size * 0.19, size * 0.19],
        [-size * 0.13, size * 0.13],
        [-size * 0.11, size * 0.1, -size * 0.24, size * 0.04, -size * 0.38, -size * 0.08],
        [-size * 0.17, -size * 0.13, -size * 0.33, -size * 0.35, -size * 0.36, -size * 0.54],
        [-size * 0.01, -size * 0.12, size * 0.06, -size * 0.21, size * 0.15, -size * 0.23],
      ], x + size * 0.2, y + size * 0.08, [1, 1], 'F', true);
      break;
    case 'mail':
      doc.roundedRect(x + size * 0.08, y + size * 0.19, size * 0.84, size * 0.62, 0.5, 0.5, 'S');
      doc.line(x + size * 0.08, y + size * 0.25, cx, y + size * 0.57);
      doc.line(cx, y + size * 0.57, x + size * 0.92, y + size * 0.25);
      break;
    case 'calendar':
      doc.roundedRect(x + size * 0.14, y + size * 0.18, size * 0.72, size * 0.7, 0.5, 0.5, 'S');
      doc.line(x + size * 0.14, y + size * 0.38, x + size * 0.86, y + size * 0.38);
      doc.line(x + size * 0.33, y + size * 0.08, x + size * 0.33, y + size * 0.27);
      doc.line(x + size * 0.67, y + size * 0.08, x + size * 0.67, y + size * 0.27);
      break;
    case 'plate':
      doc.roundedRect(x + size * 0.08, y + size * 0.25, size * 0.84, size * 0.52, 0.6, 0.6, 'S');
      doc.line(x + size * 0.25, y + size * 0.5, x + size * 0.42, y + size * 0.5);
      doc.line(x + size * 0.59, y + size * 0.5, x + size * 0.76, y + size * 0.5);
      break;
    case 'pin':
      doc.lines([
        [-size * 0.14, -size * 0.18, -size * 0.32, -size * 0.38, -size * 0.32, -size * 0.58],
        [0, -size * 0.18, size * 0.14, -size * 0.3, size * 0.32, -size * 0.3],
        [size * 0.18, 0, size * 0.32, size * 0.12, size * 0.32, size * 0.3],
        [0, size * 0.2, -size * 0.18, size * 0.4, -size * 0.32, size * 0.58],
      ], cx, y + size * 0.96, [1, 1], 'S', true);
      doc.circle(cx, y + size * 0.38, size * 0.1, 'S');
      break;
  }
  doc.restoreGraphicsState();
}
