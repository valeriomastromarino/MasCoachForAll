// Draws the picture of a ride on a canvas, 1080 px wide: A «Poster» (the app's colour, the route in white, three big numbers)
// and E «Sulla tua foto» (the athlete's photo with the route and the numbers on top), as in the previews (drawn for a
// 360 px wide picture: here every size is multiplied by k).
// Everything happens in the phone, without the network: the fonts are the app's own and the photo never leaves the device.
import { fitRoute, SHARE_SIZE, type Part, type ShareCard, type ShareFormat, type ShareStat, type ShareStyle, type XY } from "@/lib/share/rideShare";

type Ctx = CanvasRenderingContext2D;
export type ShareInk = { brand: string; onBrand: string; fatigue: string; fitness: string; hrv: string; sans: string; mono: string };
type Ink = ShareInk;

/** The app's colours as the browser computes them (a colour chosen in Impostazioni included) and its two fonts. */
function readInk(): Ink {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const color = (name: string, fallback: string) => {
    probe.style.color = fallback;
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color || fallback;
  };
  const css = getComputedStyle(document.body);
  const family = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ink = {
    brand: color("--brand", "#9f5f45"),
    onBrand: color("--on-brand", "#ffffff"),
    fatigue: color("--fatigue", "#b993e8"),
    fitness: color("--fitness", "#6fa6ee"),
    hrv: color("--hrv", "#45b8a0"),
    sans: `${family("--font-geist-sans", '"Geist"')}, system-ui, sans-serif`,
    mono: `${family("--font-geist-mono", '"Geist Mono"')}, ui-monospace, monospace`,
  };
  probe.remove();
  return ink;
}

/** A canvas draws with a font only once it is loaded: otherwise the first picture comes out in the fallback font. */
async function loadFonts(ink: Ink): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([`700 40px ${ink.sans}`, `600 40px ${ink.sans}`, `500 40px ${ink.sans}`, `500 40px ${ink.mono}`].map((f) => document.fonts.load(f))).catch(
    () => undefined,
  );
}

const setFont = (ctx: Ctx, weight: number, px: number, family: string) => {
  ctx.font = `${weight} ${px}px ${family}`;
};
const setSpacing = (ctx: Ctx, px: number) => {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
};

/** Baseline of a line of text in a box of height `lineH` starting at `top`, the way CSS centres the font in its line. */
function baseline(ctx: Ctx, top: number, lineH: number): number {
  const m = ctx.measureText("0");
  const asc = m.fontBoundingBoxAscent || lineH * 0.8;
  const desc = m.fontBoundingBoxDescent || lineH * 0.2;
  return top + (lineH - (asc + desc)) / 2 + asc;
}

function ellipsize(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Splits the text in lines no wider than `maxW`; the last allowed line ends with «…» when there is more. */
function wrap(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || ctx.measureText(next).width <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = lines.slice(maxLines - 1).join(" ");
    return kept.map((l) => ellipsize(ctx, l, maxW));
  }
  return lines.map((l) => ellipsize(ctx, l, maxW));
}

// ── Numbers with smaller units ────────────────────────────────────────────────────────────────────────────

type NumStyle = { px: number; weight: number; unit: number; unitWeight: number; gap: number; tracking: number; family: string };

function partsWidth(ctx: Ctx, parts: Part[], st: NumStyle): number {
  let w = 0;
  for (const p of parts) {
    setFont(ctx, p.small ? st.unitWeight : st.weight, p.small ? st.px * st.unit : st.px, st.family);
    setSpacing(ctx, p.small ? 0 : st.tracking * st.px);
    w += ctx.measureText(p.t).width + (p.space ? st.gap : p.small ? st.gap / 3 : 0);
  }
  setSpacing(ctx, 0);
  return w;
}

/** Draws the parts on one baseline; returns where they end. */
function drawParts(ctx: Ctx, parts: Part[], x: number, base: number, st: NumStyle): number {
  for (const p of parts) {
    setFont(ctx, p.small ? st.unitWeight : st.weight, p.small ? st.px * st.unit : st.px, st.family);
    setSpacing(ctx, p.small ? 0 : st.tracking * st.px);
    x += p.space ? st.gap : p.small ? st.gap / 3 : 0;
    ctx.fillText(p.t, x, base);
    x += ctx.measureText(p.t).width;
  }
  setSpacing(ctx, 0);
  return x;
}

/** The same style, smaller until the number fits in `maxW` (never below 70%). */
function fitted(ctx: Ctx, parts: Part[], st: NumStyle, maxW: number): NumStyle {
  const w = partsWidth(ctx, parts, st);
  return w <= maxW ? st : { ...st, px: st.px * Math.max(0.7, maxW / w), gap: st.gap * Math.max(0.7, maxW / w) };
}

// ── Route, profile and logo ───────────────────────────────────────────────────────────────────────────────

function strokePath(ctx: Ctx, pts: XY[], color: string, width: number) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawRoute(
  ctx: Ctx,
  route: XY[],
  box: { x: number; y: number; w: number; h: number },
  o: { pad: number; color: string; width: number; halo: string; haloWidth: number; ring: string; k: number },
) {
  const pts = fitRoute(route, box, o.pad);
  strokePath(ctx, pts, o.halo, o.width + o.haloWidth);
  strokePath(ctx, pts, o.color, o.width);
  // The dot where the picture starts (at least 500 m from the real start, when the ends are hidden).
  const [sx, sy] = pts[0];
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(3.5 * o.k, o.width * 1.3), 0, Math.PI * 2);
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.lineWidth = 2.5 * o.k;
  ctx.strokeStyle = o.ring;
  ctx.stroke();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Power of the whole ride as bars: the picture of the poster for a ride without a route. */
function drawProfile(ctx: Ctx, bars: number[], box: { x: number; y: number; w: number; h: number }, color: string) {
  const step = box.w / bars.length;
  const bw = step * 0.62;
  ctx.fillStyle = color;
  bars.forEach((v, i) => {
    const bh = v * box.h;
    roundRect(ctx, box.x + i * step + (step - bw) / 2, box.y + box.h - bh, bw, bh, Math.min(bw / 2, 6));
    ctx.fill();
  });
}

/** The MasCoach wordmark (components/brand/Logo.tsx): three lines, the name in the terminal font and the cursor. */
function drawLogo(ctx: Ctx, ink: Ink, x: number, midY: number, size: number, textColor: string) {
  const barH = Math.max(2, size * 0.12);
  const gap = size * 0.13;
  let y = midY - (3 * barH + 2 * gap) / 2;
  for (const [w, off, c] of [[0.82, 0, ink.fatigue], [0.58, 0.24, ink.fitness], [0.36, 0.46, ink.hrv]] as const) {
    ctx.fillStyle = c;
    roundRect(ctx, x + off * size, y, w * size, barH, barH / 2);
    ctx.fill();
    y += barH + gap;
  }
  const tx = x + 0.82 * size + 0.38 * size;
  setFont(ctx, 500, size, ink.mono);
  setSpacing(ctx, -0.02 * size);
  ctx.fillStyle = textColor;
  ctx.fillText("MasCoach", tx, baseline(ctx, midY - size / 2, size));
  const tw = ctx.measureText("MasCoach").width;
  setSpacing(ctx, 0);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = ink.fitness;
  roundRect(ctx, tx + tw + 0.12 * size, midY - (0.74 * size) / 2, 0.42 * size, 0.74 * size, size * 0.06);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── A «Poster» ────────────────────────────────────────────────────────────────────────────────────────────

const POSTER: Record<ShareFormat, { top: number; side: number; bottom: number; title: number; route: number; routeGap: number; big: number; rule: [number, number]; small: number; logoGap: number; logo: number }> = {
  storia: { top: 34, side: 26, bottom: 24, title: 36, route: 4.2, routeGap: 10, big: 35, rule: [16, 12], small: 14, logoGap: 22, logo: 17 },
  post: { top: 22, side: 22, bottom: 18, title: 27, route: 3.4, routeGap: 6, big: 29, rule: [11, 9], small: 12.5, logoGap: 12, logo: 14 },
  quadrato: { top: 20, side: 20, bottom: 16, title: 24, route: 3.2, routeGap: 4, big: 26, rule: [9, 8], small: 12, logoGap: 10, logo: 13 },
};

function drawPoster(ctx: Ctx, card: ShareCard, format: ShareFormat, ink: Ink, W: number, H: number) {
  const k = W / 360;
  const m = POSTER[format];
  const side = m.side * k;
  const inner = W - 2 * side;
  const white = ink.onBrand;

  ctx.fillStyle = ink.brand;
  ctx.fillRect(0, 0, W, H);
  // A soft light in the middle and a darker bottom, as in the preview.
  ctx.save();
  ctx.translate(W / 2, H * 0.38);
  ctx.scale(1.1 * W, 0.6 * H);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, "rgba(255,255,255,0.12)");
  glow.addColorStop(0.62, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, "rgba(55,22,10,0)");
  shade.addColorStop(1, "rgba(55,22,10,0.32)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  ctx.fillStyle = white;
  ctx.textBaseline = "alphabetic";

  // Top: the day and the name of the ride (two lines at most).
  let y = m.top * k;
  const datePx = 12 * k;
  setFont(ctx, 500, datePx, ink.sans);
  setSpacing(ctx, 0.09 * datePx);
  ctx.globalAlpha = 0.86;
  ctx.fillText(ellipsize(ctx, card.when.toLocaleUpperCase("it-IT"), inner), side, baseline(ctx, y, datePx * 1.25));
  ctx.globalAlpha = 1;
  setSpacing(ctx, 0);
  y += datePx * 1.25 + 7 * k;
  let titlePx = m.title * k;
  setFont(ctx, 700, titlePx, ink.sans);
  setSpacing(ctx, -0.025 * titlePx);
  let lines = wrap(ctx, card.title, inner, 2);
  if (lines.length === 2 || lines[0]?.endsWith("…")) {
    // A long name: a little smaller, so that it fits in two lines more often.
    titlePx *= 0.86;
    setFont(ctx, 700, titlePx, ink.sans);
    setSpacing(ctx, -0.025 * titlePx);
    lines = wrap(ctx, card.title, inner, 2);
  }
  for (const line of lines) {
    ctx.fillText(line, side, baseline(ctx, y, titlePx * 1.05));
    y += titlePx * 1.05;
  }
  setSpacing(ctx, 0);
  const headerEnd = y;

  // Bottom, from the bottom up: logo, small numbers, line, big numbers.
  let b = H - m.bottom * k;
  const logoPx = m.logo * k;
  drawLogo(ctx, ink, side, b - logoPx / 2, logoPx, white);
  ctx.fillStyle = white;
  b -= logoPx + m.logoGap * k;
  if (card.more.length) {
    const px = m.small * k;
    const lineH = px * 1.25;
    const items = card.more.map((s) => s.line);
    const widthOf = (it: ShareStat["line"]) => {
      setFont(ctx, 500, px, ink.sans);
      const a = ctx.measureText(it.pre).width + ctx.measureText(it.post).width;
      setFont(ctx, 700, px, ink.sans);
      return a + ctx.measureText(it.bold).width;
    };
    const widths = items.map(widthOf);
    const free = inner - widths.reduce((a, w) => a + w, 0);
    const gap = items.length > 1 ? free / (items.length - 1) : 0;
    let x = side;
    ctx.globalAlpha = 0.96;
    setFont(ctx, 500, px, ink.sans);
    const base = baseline(ctx, b - lineH, lineH);
    items.forEach((it, i) => {
      setFont(ctx, 500, px, ink.sans);
      ctx.fillText(it.pre, x, base);
      x += ctx.measureText(it.pre).width;
      setFont(ctx, 700, px, ink.sans);
      ctx.fillText(it.bold, x, base);
      x += ctx.measureText(it.bold).width;
      setFont(ctx, 500, px, ink.sans);
      ctx.fillText(it.post, x, base);
      x += ctx.measureText(it.post).width + (i < items.length - 1 ? gap : 0);
    });
    ctx.globalAlpha = 1;
    b -= lineH + m.rule[1] * k;
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fillRect(side, b - k, inner, k);
    ctx.fillStyle = white;
    b -= k + m.rule[0] * k;
  }
  let footerTop = b;
  if (card.big.length) {
    const labelPx = 11 * k;
    const labelH = labelPx * 1.25;
    const valuePx = m.big * k;
    const cellH = valuePx + 6 * k + labelH;
    const top = b - cellH;
    const fr = card.big.map((_, i) => (i === 0 ? 1.15 : 1));
    const colGap = 10 * k;
    const unitW = (inner - colGap * (fr.length - 1)) / fr.reduce((a, f) => a + f, 0);
    let x = side;
    card.big.forEach((s, i) => {
      const w = unitW * fr[i];
      const st = fitted(ctx, s.parts, { px: valuePx, weight: 700, unit: 0.42, unitWeight: 600, gap: 3 * k, tracking: -0.035, family: ink.sans }, w);
      setFont(ctx, 700, st.px, ink.sans);
      drawParts(ctx, s.parts, x, baseline(ctx, top + (valuePx - st.px) / 2, st.px), st);
      setFont(ctx, 500, labelPx, ink.sans);
      setSpacing(ctx, 0.09 * labelPx);
      ctx.globalAlpha = 0.82;
      ctx.fillText(ellipsize(ctx, s.label.toLocaleUpperCase("it-IT"), w), x, baseline(ctx, top + valuePx + 6 * k, labelH));
      ctx.globalAlpha = 1;
      setSpacing(ctx, 0);
      x += w + colGap;
    });
    footerTop = top;
  }

  // In the middle: the route, or the power of the ride when there is no route.
  const gap = m.routeGap * k;
  const box = { x: (W - Math.min(308 * k, inner)) / 2, y: headerEnd + gap, w: Math.min(308 * k, inner), h: footerTop - headerEnd - 2 * gap };
  if (box.h < 40 * k) return;
  if (card.route) {
    drawRoute(ctx, card.route, box, { pad: 10 * k, color: white, width: m.route * k, halo: "rgba(60,24,10,0.28)", haloWidth: 5 * k, ring: "rgba(60,24,10,0.35)", k });
  } else if (card.profile) {
    const h = Math.min(box.h * 0.62, 150 * k);
    ctx.globalAlpha = 0.9;
    drawProfile(ctx, card.profile, { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h }, white);
    ctx.globalAlpha = 1;
  }
}

// ── E «Sulla tua foto» ────────────────────────────────────────────────────────────────────────────────────

const PHOTO: Record<ShareFormat, { route: { top: number; right: number; w: number; h: number }; side: number; bottom: number; big: number; row: number; logoGap: number; logo: number }> = {
  storia: { route: { top: 54, right: 20, w: 132, h: 112 }, side: 24, bottom: 26, big: 58, row: 20, logoGap: 18, logo: 15 },
  post: { route: { top: 44, right: 16, w: 104, h: 88 }, side: 18, bottom: 18, big: 46, row: 17, logoGap: 12, logo: 13 },
  quadrato: { route: { top: 34, right: 14, w: 96, h: 80 }, side: 16, bottom: 16, big: 40, row: 15, logoGap: 10, logo: 12 },
};

/** Fills the picture with the photo (cut to fit, centred), or a dark background while there is none. */
function drawBackground(ctx: Ctx, photo: ImageBitmap | null, W: number, H: number, ink: Ink) {
  if (!photo) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#4a403b");
    g.addColorStop(1, "#1f1b19");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const px = (W / 360) * 15;
    setFont(ctx, 500, px, ink.sans);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    ctx.fillText("Scegli una foto", W / 2, H * 0.42);
    ctx.textAlign = "start";
    return;
  }
  const s = Math.max(W / photo.width, H / photo.height);
  const dw = photo.width * s, dh = photo.height * s;
  ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawPhoto(ctx: Ctx, card: ShareCard, format: ShareFormat, ink: Ink, W: number, H: number, photo: ImageBitmap | null) {
  const k = W / 360;
  const m = PHOTO[format];
  drawBackground(ctx, photo, W, H, ink);
  // Darker at the top and at the bottom: the numbers can be read on any photo.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0.28)");
  g.addColorStop(0.22, "rgba(0,0,0,0)");
  g.addColorStop(0.48, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (card.route) {
    const r = m.route;
    const box = { x: W - (r.right + r.w) * k, y: r.top * k, w: r.w * k, h: r.h * k };
    drawRoute(ctx, card.route, box, { pad: 6 * k, color: "#ffffff", width: 3 * k, halo: "rgba(0,0,0,0.35)", haloWidth: 3 * k, ring: "rgba(0,0,0,0.35)", k });
  }

  const side = m.side * k;
  const inner = W - 2 * side;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8 * k;
  ctx.shadowOffsetY = 1 * k;

  let b = H - m.bottom * k;
  const logoPx = m.logo * k;
  // No shadow on the logo: the coloured lines would look blurred.
  ctx.save();
  ctx.shadowColor = "transparent";
  drawLogo(ctx, ink, side, b - logoPx / 2, logoPx, "#ffffff");
  ctx.restore();
  b -= logoPx + m.logoGap * k;

  // The line under the big number: the other big numbers, then power (when it is in the picture).
  const row = [...card.big.slice(1), ...card.more.filter((s) => s.id === "np" || s.id === "tss").slice(0, 1)].slice(0, 3);
  const rowPx = m.row * k;
  if (row.length) {
    const st: NumStyle = { px: rowPx, weight: 600, unit: 0.62, unitWeight: 600, gap: 0.22 * rowPx, tracking: 0, family: ink.sans };
    const partsOf = (s: ShareStat): Part[] => (s.tag ? [...s.parts.filter((p) => !p.small), { t: s.tag, small: true, space: true }] : s.parts);
    let x = side;
    setFont(ctx, 600, rowPx, ink.sans);
    const base = baseline(ctx, b - rowPx * 1.2, rowPx * 1.2);
    for (const s of row) {
      const parts = partsOf(s);
      if (x + partsWidth(ctx, parts, st) > side + inner) break;
      x = drawParts(ctx, parts, x, base, st) + 16 * k;
    }
    b -= rowPx * 1.2 + 8 * k;
  }

  const main = card.big[0];
  if (main) {
    const st = fitted(ctx, main.parts, { px: m.big * k, weight: 700, unit: 0.4, unitWeight: 600, gap: 4 * k, tracking: -0.04, family: ink.sans }, inner);
    setFont(ctx, 700, st.px, ink.sans);
    drawParts(ctx, main.parts, side, baseline(ctx, b - st.px, st.px), st);
    b -= st.px + 4 * k;
  }

  const px = 13 * k;
  setFont(ctx, 500, px, ink.sans);
  ctx.globalAlpha = 0.92;
  ctx.fillText(ellipsize(ctx, `${card.title} · ${card.whenShort}`, inner), side, baseline(ctx, b - px * 1.25, px * 1.25));
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

// ── Entry points ──────────────────────────────────────────────────────────────────────────────────────────

/** Colours and fonts, once per sheet: after this every drawing is immediate (a change of switch redraws at once). */
export async function prepareShare(): Promise<ShareInk> {
  const ink = readInk();
  await loadFonts(ink);
  return ink;
}

/** Draws the picture in `canvas` (which takes the size of the format). */
export function drawShare(canvas: HTMLCanvasElement, card: ShareCard, style: ShareStyle, format: ShareFormat, photo: ImageBitmap | null, ink: ShareInk): void {
  const { w, h } = SHARE_SIZE[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("questo dispositivo non riesce a disegnare l'immagine");
  if (style === "foto") drawPhoto(ctx, card, format, ink, w, h, photo);
  else drawPoster(ctx, card, format, ink, w, h);
}

/** The picture as a file: PNG for the poster (flat colours, sharp), JPEG for a photo (a PNG would be several MB). */
export function exportShare(canvas: HTMLCanvasElement, style: ShareStyle): Promise<{ blob: Blob; mime: string; ext: string }> {
  const mime = style === "foto" ? "image/jpeg" : "image/png";
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, mime, ext: style === "foto" ? "jpg" : "png" }) : reject(new Error("Immagine non creata."))), mime, 0.92),
  );
}

/** Reads a photo from the gallery, already turned the right way, no larger than needed for a 1080 × 1920 picture. */
export async function readPhoto(file: File): Promise<ImageBitmap> {
  const full = await createImageBitmap(file);
  const s = Math.min(1, 1920 / Math.min(full.width, full.height));
  if (s >= 1) return full;
  const small = await createImageBitmap(full, { resizeWidth: Math.round(full.width * s), resizeHeight: Math.round(full.height * s), resizeQuality: "high" });
  full.close();
  return small;
}
