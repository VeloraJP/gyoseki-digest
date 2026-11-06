import { esc } from "./dom.js";

// 推移グラフ（インラインSVGの棒グラフ）。登録済みデータの表示専用で、
// 計算や推測は行わない。正確な金額は各バーの title と、同じ画面の表で確認できる。

// グラフのラベル用の短い金額表記（例：1,000万円、80万円、−12.3万円）。
// 概数であることが分かるよう、正確な金額は title 側に必ず持たせる。
export function formatCompactYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "―";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs < 10_000) return `${sign}${Math.round(abs).toLocaleString("ja-JP")}円`;
  const man = Math.round((abs / 10_000) * 10) / 10;
  const text = Number.isInteger(man) ? String(man) : man.toFixed(1);
  return `${sign}${Number(text).toLocaleString("ja-JP")}万円`;
}

// points: [{ label, value, title }]
// barClass: バーの色クラス（""=基調色、"chart-bar--profit"=利益用）
export function barChartSvg({ points, barClass = "", ariaLabel = "" }) {
  const list = (points ?? []).filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
  if (list.length === 0) return "";

  const slotW = 46;
  const plotH = 104;
  const valueH = 15;
  const labelH = 15;
  const width = Math.max(120, list.length * slotW + 4);
  const height = valueH + plotH + labelH;

  const values = list.map((p) => p.value);
  const maxPos = Math.max(0, ...values);
  const minNeg = Math.min(0, ...values);
  const range = maxPos - minNeg || 1;
  const zeroY = valueH + (maxPos / range) * plotH;

  const bars = list.map((p, i) => {
    const barW = Math.round(slotW * 0.58);
    const x = i * slotW + (slotW - barW) / 2 + 2;
    const h = Math.max(Math.abs(p.value) / range * plotH, p.value === 0 ? 0 : 1.5);
    const y = p.value >= 0 ? zeroY - h : zeroY;
    const valueY = p.value >= 0 ? y - 3.5 : y + h + 10.5;
    const cls = `chart-bar${barClass ? ` ${barClass}` : ""}${p.value < 0 ? " chart-bar--neg" : ""}`;
    return `<g>
      <rect class="${cls}" x="${x}" y="${round2(y)}" width="${barW}" height="${round2(h)}" rx="3"><title>${esc(p.title ?? "")}</title></rect>
      <text class="chart-value" x="${x + barW / 2}" y="${round2(valueY)}">${esc(formatCompactYen(p.value))}</text>
      <text class="chart-label" x="${x + barW / 2}" y="${height - 3}">${esc(p.label ?? "")}</text>
    </g>`;
  }).join("");

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" style="width:${width}px" role="img" aria-label="${esc(ariaLabel)}">
    <line class="chart-zero" x1="0" y1="${round2(zeroY)}" x2="${width}" y2="${round2(zeroY)}"/>
    ${bars}
  </svg>`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
