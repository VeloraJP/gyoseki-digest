import {
  SIMULATIONS, SIMULATION_BY_ID,
  computeSimulation, resolveSimInitialValues, validateSimulation
} from "../core/simulations.js";
import { AMOUNT_INPUT_UNIT_LABELS, AMOUNT_INPUT_UNITS } from "../config/constants.js";
import {
  backButtonHtml, diffClass, esc, formatDiff, formatPercent, formatYen,
  parseAmountInput, toYen, fromYen
} from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function backHtml({ company, link }) {
  return company
    ? backButtonHtml({ topHref: link(ROUTES.HOME, { company: company.id }) })
    : backButtonHtml({ topHref: link(ROUTES.START), topLabel: "会社選択へ", topIcon: "building" });
}

function valueParams(sim, values) {
  const out = {};
  for (const field of sim.fields) {
    const v = values[field.id];
    if (v !== null && v !== undefined && v !== "") out[field.id] = String(v);
  }
  return out;
}

// URLパラメータ（プレーンオブジェクト）から入力値を復元する。
// 結果画面の再計算と、結果→入力への復帰（入力値の保持）に使う。
function valuesFromParams(sim, params) {
  const values = {};
  for (const field of sim.fields) {
    const raw = params[field.id];
    if (raw === undefined || raw === null || raw === "") {
      values[field.id] = field.kind === "select" ? "" : null;
      continue;
    }
    if (field.kind === "select") values[field.id] = raw;
    else {
      const parsed = Number(raw);
      values[field.id] = Number.isFinite(parsed) ? parsed : null;
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// 試算の一覧
// ---------------------------------------------------------------------------

export function renderSimulations({ company, link }) {
  const base = company ? { company: company.id } : {};
  const cards = SIMULATIONS.map((sim) => `
    <div class="card">
      <h3 style="margin-top:0">${sim.no}. ${esc(sim.title)}</h3>
      <p><strong>${esc(sim.question)}</strong></p>
      <p class="note">${esc(sim.description)}</p>
      <div class="btn-row">
        <a class="btn btn--primary" href="${link(ROUTES.SIMULATION, { ...base, sim: sim.id })}">入力する</a>
      </div>
    </div>
  `).join("");

  return `
    ${backHtml({ company, link })}
    <div class="page-head">
      <h1>${pageIcon("calculator")}試算（簡易シミュレーション）</h1>
      <p class="note">価格・人件費・借入など、10種類の試算ができます。会社の登録がなくても、手入力だけで計算できます。${company ? `${esc(company.name)}を開いている場合は、登録データから入っている項目を初期値として入れます。` : ""}試算の入力は保存されません（その場限りです）。</p>
    </div>
    ${cards}
  `;
}

// ---------------------------------------------------------------------------
// 入力画面
// ---------------------------------------------------------------------------

function fieldHtml(field, displayValue) {
  const id = `simf-${field.id}`;
  const hint = field.hint ? `<span class="hint">${esc(field.hint)}</span>` : "";
  const requiredMark = field.required ? "（必須）" : "";
  if (field.kind === "select") {
    const options = field.options.map((o) =>
      `<option value="${esc(o.value)}" ${o.value === displayValue ? "selected" : ""}>${esc(o.label)}</option>`
    ).join("");
    return `
      <div class="field">
        <label for="${id}">${esc(field.label)}${requiredMark}${hint}</label>
        <select id="${id}" data-sim-field="${field.id}" data-kind="select">
          <option value="">選択してください</option>
          ${options}
        </select>
      </div>
    `;
  }
  const inputmode = field.kind === "integer" ? "numeric" : "decimal";
  const suffix = field.kind === "percent" ? "（%）" : field.id === "targetPaybackYears" ? "（年）" : "";
  return `
    <div class="field">
      <label for="${id}">${esc(field.label)}${suffix}${requiredMark}${hint}</label>
      <input type="number" inputmode="${inputmode}" id="${id}"
        data-sim-field="${field.id}" data-kind="${field.kind}"
        value="${displayValue === null || displayValue === undefined ? "" : esc(String(displayValue))}">
    </div>
  `;
}

export function renderSimInput({ params, company, link }) {
  const sim = SIMULATION_BY_ID[params.sim];
  if (!sim) return "";
  const unit = company ? company.amountInputUnit : AMOUNT_INPUT_UNITS.YEN;

  // 結果画面から戻ってきた場合はパラメータの値を優先し（入力値の保持）、
  // 初めて開いた場合は会社情報からの初期値を使う。
  const fromParams = sim.fields.some((f) => params[f.id] !== undefined);
  const initial = fromParams ? null : resolveSimInitialValues(company, sim.id);
  const initialValues = initial ? initial.values : valuesFromParams(sim, params);

  const displayValue = (field) => {
    const v = initialValues[field.id];
    if (v === null || v === undefined || v === "") return v;
    if (field.kind === "amount") return fromYen(v, unit);
    return v;
  };

  return `
    ${backHtml({ company, link })}
    <div class="page-head">
      <p class="crumb">試算 ${sim.no} ／ ${esc(sim.question)}</p>
      <h1>${pageIcon("calculator")}${esc(sim.title)}</h1>
      <p class="note">${esc(sim.description)}金額の入力単位は「${esc(AMOUNT_INPUT_UNIT_LABELS[unit])}」です。入力した数字は保存されません。</p>
      ${initial && initial.sourceNote ? `<p class="note"><span class="tag">初期値</span> ${esc(initial.sourceNote)}</p>` : ""}
    </div>
    <form id="sim-form" class="card" novalidate>
      <div id="sim-errors"></div>
      ${sim.fields.map((field) => fieldHtml(field, displayValue(field))).join("")}
      <div class="btn-row">
        <button type="submit" class="btn btn--primary btn--block">計算する</button>
      </div>
      <div class="btn-row">
        <a class="btn" href="${link(ROUTES.SIMULATIONS, company ? { company: company.id } : {})}">試算の一覧へ</a>
      </div>
    </form>
  `;
}

export function mountSimInput(main, { params, company, navigate }) {
  const sim = SIMULATION_BY_ID[params.sim];
  if (!sim) return;
  const unit = company ? company.amountInputUnit : AMOUNT_INPUT_UNITS.YEN;
  const form = main.querySelector("#sim-form");
  const errorsBox = main.querySelector("#sim-errors");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = {};
    const parseErrors = [];
    for (const field of sim.fields) {
      const input = form.querySelector(`[data-sim-field="${field.id}"]`);
      const raw = input ? input.value.trim() : "";
      if (field.kind === "select") {
        values[field.id] = raw === "" ? null : raw;
        continue;
      }
      if (raw === "") {
        values[field.id] = null;
        continue;
      }
      const parsed = parseAmountInput(raw);
      if (parsed === null) {
        parseErrors.push({ field: field.id, message: `${field.label}は数字で入力してください` });
        values[field.id] = null;
        continue;
      }
      values[field.id] = field.kind === "amount" ? toYen(parsed, unit) : parsed;
    }

    const errors = [...parseErrors, ...validateSimulation(sim, values)];
    if (errors.length > 0) {
      errorsBox.innerHTML = `<div class="error-box"><ul>${errors.map((e) => `<li>${esc(e.message)}</li>`).join("")}</ul></div>`;
      errorsBox.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    errorsBox.innerHTML = "";

    const next = { sim: sim.id, ...valueParams(sim, values) };
    if (company) next.company = company.id;
    navigate(ROUTES.SIM_RESULT, next);
  });
}

// ---------------------------------------------------------------------------
// 結果画面
// ---------------------------------------------------------------------------

function trimNumber(value, digits) {
  return String(Number(value.toFixed(digits)));
}

function formatResultValue(r) {
  switch (r.format) {
    case "yen": return formatYen(r.value);
    case "diff": return formatDiff(r.value);
    case "percent": return formatPercent(r.value * 100);
    case "times": return `${trimNumber(r.value, 2)} 倍`;
    case "years": return `${trimNumber(r.value, 2)} 年`;
    case "months": return `${trimNumber(r.value, 1)} か月`;
    case "count": return `${Math.round(r.value).toLocaleString("ja-JP")} ${r.unit}`;
    default: return String(r.value);
  }
}

function formatCell(format, value) {
  if (!isNum(value)) return "―";
  if (format === "yen") return formatYen(value);
  if (format === "month") return `${value}か月目`;
  return String(value);
}

export function renderSimResult({ params, company, link }) {
  const sim = SIMULATION_BY_ID[params.sim];
  if (!sim) return "";
  const values = valuesFromParams(sim, params);
  const inputParams = { sim: sim.id, ...valueParams(sim, values) };
  if (company) inputParams.company = company.id;
  const listParams = company ? { company: company.id } : {};

  const validationErrors = validateSimulation(sim, values);
  if (validationErrors.length > 0) {
    return `
      ${backHtml({ company, link })}
      <div class="page-head">
        <p class="crumb">試算 ${sim.no} の結果</p>
        <h1>${pageIcon("calculator")}${esc(sim.title)}：計算できませんでした</h1>
      </div>
      <div class="card">
        <div class="error-box"><ul>${validationErrors.map((e) => `<li>${esc(e.message)}</li>`).join("")}</ul></div>
        <div class="btn-row">
          <a class="btn btn--primary btn--block" href="${link(ROUTES.SIMULATION, inputParams)}">入力に戻って直す</a>
        </div>
      </div>
    `;
  }

  const output = computeSimulation(sim, values);
  const [first, ...rest] = output.results;

  const valueHtml = (r) => {
    if (r.value === null) return "―";
    const text = esc(formatResultValue(r));
    return r.format === "diff" ? `<span class="${diffClass(r.value)}">${text}</span>` : text;
  };

  const kpiItem = (r) => `
    <div class="kpi-item">
      <div class="kpi-label">${esc(r.label)}</div>
      <div class="kpi-value">${valueHtml(r)}</div>
      <div class="kpi-sub">${esc(r.value !== null ? r.hint : (r.reason ?? r.hint))}</div>
    </div>
  `;

  // 主結果は濃色カードに大きく出す（既存画面のヒーロー表示と同じ組み立て）
  const heroItem = (r) => `
    <div class="kpi-big">
      <div class="kpi-label">${esc(r.label)}<span class="hint">${esc(r.hint)}</span></div>
      <div class="kpi-value">${valueHtml(r)}</div>
      ${r.value === null && r.reason ? `<div class="kpi-sub">${esc(r.reason)}</div>` : ""}
    </div>
  `;

  const tables = (output.tables ?? []).map((t) => `
    <div class="card">
      <h3 style="margin-top:0">${esc(t.title)}</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>${t.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
        <tbody>${t.rows.map((row) => `<tr>${row.map((cell, i) => `<td>${esc(formatCell(t.columns[i].format, cell))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </div>
  `).join("");

  return `
    ${backHtml({ company, link })}
    <div class="page-head">
      <p class="crumb">試算 ${sim.no} の結果 ／ ${esc(sim.question)}</p>
      <h1>${pageIcon("calculator")}${esc(sim.title)}</h1>
      <p class="note">入力した数字だけで計算した結果です（保存はされません）。</p>
    </div>
    ${first ? `<div class="card card--accent">${heroItem(first)}</div>` : ""}
    ${rest.length > 0 ? `<div class="card"><div class="kpi-grid">${rest.map(kpiItem).join("")}</div></div>` : ""}
    ${tables}
    <div class="note-box">
      <strong>計算の考え方</strong>
      <ul>${(output.basis ?? []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      ${(output.notes ?? []).map((n) => `<p>${esc(n)}</p>`).join("")}
    </div>
    <div class="card">
      <div class="btn-row">
        <a class="btn btn--primary" href="${link(ROUTES.SIMULATION, inputParams)}">入力に戻って直す</a>
        <a class="btn" href="${link(ROUTES.SIMULATIONS, listParams)}">試算の一覧へ</a>
      </div>
    </div>
  `;
}
