// The extension logo: a bookmark with a magnifying glass over it, white on an accent-gradient tile.
// One geometry (24-unit grid, like icons.js) feeds the popup/settings SVG, the PNGs in icons/
// (scripts/make-icons.mjs) and the toolbar icon drawn in the user's accent (background.js).

const BOOKMARK = 'M15 22l-6-4-6 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z';
const LENS = { cx: 14.5, cy: 9.5, r: 4.5 };
const HANDLE = 'M17.7 12.7 21.5 16.5';
const LENS_PATH = `M${LENS.cx - LENS.r} ${LENS.cy}a${LENS.r} ${LENS.r} 0 1 0 ${2 * LENS.r} 0a${LENS.r} ${LENS.r} 0 1 0 ${-2 * LENS.r} 0`;
const GAP = 3; // extra stroke width of the knockout that separates the glass from the bookmark

// Inline SVG for the .logo tile; the tile's CSS gradient shows through the knockout.
export const logoSvg = (size = 14, strokeWidth = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<mask id="logo-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">` +
  `<rect width="24" height="24" fill="#fff" stroke="none"/>` +
  `<g stroke="#000" stroke-width="${strokeWidth + GAP}"><path d="${LENS_PATH}" fill="#000"/><path d="${HANDLE}"/></g></mask>` +
  `<path d="${BOOKMARK}" mask="url(#logo-knockout)"/><path d="${LENS_PATH}"/><path d="${HANDLE}"/></svg>`;

// Mixes a #rrggbb colour with white (t > 0) or black (t < 0) by |t|.
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const target = t > 0 ? 255 : 0;
  const ch = (shift) => Math.round(((n >> shift) & 255) + (target - ((n >> shift) & 255)) * Math.abs(t));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// Small icons fill the canvas and use bolder strokes so they stay legible in the toolbar;
// the 128px one keeps the Web Store's 16px transparent margin.
const layout = (size) => size >= 128
  ? { margin: size / 8, glyph: 0.62, stroke: 2 }
  : { margin: 0, glyph: size <= 16 ? 0.86 : 0.72, stroke: size <= 16 ? 2.4 : 2.2 };

// Draws the logo into a size×size canvas context (a page canvas or an OffscreenCanvas).
export function drawLogo(ctx, size, accent) {
  const { margin, glyph, stroke } = layout(size);
  const tile = size - 2 * margin;

  const bg = ctx.createLinearGradient(margin, margin, margin + tile, margin + tile);
  bg.addColorStop(0, shade(accent, 0.2));
  bg.addColorStop(1, shade(accent, -0.2));
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(margin, margin, tile, tile, tile * 0.22);
  ctx.fill();

  // The glyph goes on its own layer so the knockout erases only the bookmark, not the tile.
  const layer = new OffscreenCanvas(size, size);
  const g = layer.getContext('2d');
  const scale = (tile * glyph) / 24;
  g.translate(margin + (tile - 24 * scale) / 2, margin + (tile - 24 * scale) / 2);
  g.scale(scale, scale);
  Object.assign(g, { strokeStyle: '#fff', fillStyle: '#000', lineWidth: stroke, lineCap: 'round', lineJoin: 'round' });
  g.stroke(new Path2D(BOOKMARK));
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = stroke + GAP;
  g.fill(new Path2D(LENS_PATH));
  g.stroke(new Path2D(LENS_PATH));
  g.stroke(new Path2D(HANDLE));
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = stroke;
  g.stroke(new Path2D(LENS_PATH));
  g.stroke(new Path2D(HANDLE));
  ctx.drawImage(layer, 0, 0);
}
