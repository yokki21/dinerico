// Gráficos SVG ligeros, sin dependencias.
import { esc } from './util.js';

export const PALETTE = ['#4f7cff', '#22b07d', '#f4a62a', '#e8577a', '#8e6cf0', '#1fb5c9', '#d9773b', '#7fa63a', '#c75fc0', '#5a6f8f', '#b0894f', '#3e9e9e'];

/** Donut: items [{label, value, color?}] */
export function donut(items, { size = 180, thickness = 26, center = '', sub = '' } = {}) {
  const total = items.reduce((a, x) => a + Math.max(0, x.value), 0);
  const r = size / 2 - thickness / 2 - 2, c = size / 2, C = 2 * Math.PI * r;
  let off = 0; let arcs = '';
  if (total <= 0) arcs = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${thickness}"/>`;
  else items.forEach((x, i) => {
    const len = (Math.max(0, x.value) / total) * C;
    if (len <= 0) return;
    arcs += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${x.color || PALETTE[i % PALETTE.length]}" stroke-width="${thickness}"
      stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"><title>${esc(x.label)}</title></circle>`;
    off += len;
  });
  return `<svg class="chart donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">
    ${arcs}
    <text x="50%" y="${c - 2}" text-anchor="middle" class="donut-c">${esc(center)}</text>
    <text x="50%" y="${c + 16}" text-anchor="middle" class="donut-s">${esc(sub)}</text></svg>`;
}

/** Barras agrupadas: labels[], series [{name, color, values[]}] */
export function bars(labels, series, { h = 170, fmt = (v) => v } = {}) {
  const W = 340, pad = { l: 8, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const gw = (W - pad.l - pad.r) / labels.length;
  const bw = Math.min(18, (gw - 8) / series.length);
  const ih = h - pad.t - pad.b;
  let out = '';
  labels.forEach((lb, i) => {
    const gx = pad.l + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = Math.max(0, s.values[i] || 0); const bh = (v / max) * ih;
      out += `<rect x="${gx + j * bw}" y="${pad.t + ih - bh}" width="${bw - 2}" height="${bh}" rx="3" fill="${s.color}"><title>${esc(s.name)}: ${esc(fmt(v))}</title></rect>`;
    });
    out += `<text x="${pad.l + i * gw + gw / 2}" y="${h - 7}" text-anchor="middle" class="axis">${esc(lb)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img">
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="var(--line)"/>${out}</svg>`;
}

/** Línea: points [{label, value}] con área. Admite varias series: series [{color, values}] */
export function line(labels, series, { h = 160, fmt = (v) => v, zero = false } = {}) {
  const W = 340, pad = { l: 8, r: 8, t: 12, b: 22 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '';
  let min = Math.min(...all), max = Math.max(...all);
  if (zero) min = Math.min(0, min);
  if (max === min) { max += 1; min -= 1; }
  const ih = h - pad.t - pad.b, iw = W - pad.l - pad.r;
  const X = (i) => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const Y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  let out = '';
  series.forEach((s, k) => {
    const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    if (k === 0 && s.area !== false) out += `<path d="${d}L${pts.at(-1)[0]},${pad.t + ih}L${pts[0][0]},${pad.t + ih}Z" fill="${s.color}" opacity=".12"/>`;
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (pts.length <= 24) pts.forEach((p, i) => { out += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${s.color}"><title>${esc(labels[i])}: ${esc(fmt(s.values[i]))}</title></circle>`; });
  });
  if (min < 0 && max > 0) out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)" stroke-dasharray="3 3"/>`;
  const step = Math.ceil(labels.length / 6);
  labels.forEach((lb, i) => { if (i % step === 0 || i === labels.length - 1) out += `<text x="${X(i)}" y="${h - 6}" text-anchor="middle" class="axis">${esc(lb)}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img">${out}</svg>`;
}

export function progress(ratio, level = '') {
  const w = Math.max(0, Math.min(100, ratio * 100));
  return `<div class="bar ${level}"><span style="width:${w}%"></span></div>`;
}
