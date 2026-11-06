import { LocalStorageRepository } from "./storage/repository.js";
import { AppStore } from "./state/store.js";
import { HashRouter, ROUTES, buildHash } from "./navigation/router.js";
import { renderStart } from "./views/start.js";
import { mountSetup, renderSetup } from "./views/setup.js";
import { renderHome } from "./views/home.js";
import { mountAnnual, renderAnnual } from "./views/annual.js";
import { mountMonthly, renderMonthly } from "./views/monthly.js";
import { renderAnalysis } from "./views/analysis.js";
import { mountReview, renderReview } from "./views/review.js";
import { mountData, renderData } from "./views/data.js";
import { findMonthlyRecord } from "./core/calc.js";

const main = document.querySelector("#app");
const repository = new LocalStorageRepository({ storage: window.localStorage });
const store = new AppStore({ repository });

function link(route, params) {
  return buildHash(route, params);
}

function notFoundCompany() {
  main.innerHTML = `
    <div class="card">
      <p>会社が見つかりませんでした。</p>
      <div class="btn-row"><a class="btn" href="${link(ROUTES.START)}">会社選択へ戻る</a></div>
    </div>`;
}

function render({ route, params }) {
  const data = store.getSnapshot();
  const ctx = { data, params, link, store, repository, navigate };
  window.scrollTo(0, 0);

  switch (route) {
    case ROUTES.START:
      main.innerHTML = renderStart(ctx);
      break;
    case ROUTES.SETUP: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (params.company && !company) { notFoundCompany(); break; }
      main.innerHTML = renderSetup({ ...ctx, company });
      mountSetup(main, ctx);
      break;
    }
    case ROUTES.HOME: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (!company) { notFoundCompany(); break; }
      main.innerHTML = renderHome({ ...ctx, company });
      break;
    }
    case ROUTES.ANNUAL: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (!company) { notFoundCompany(); break; }
      let period = null;
      if (params.period && params.period !== "new") {
        period = company.annualPeriods.find((p) => p.id === params.period) ?? null;
        if (!period) { notFoundCompany(); break; }
      }
      main.innerHTML = renderAnnual({ ...ctx, company, period });
      mountAnnual(main, { ...ctx, company, period });
      break;
    }
    case ROUTES.MONTHLY: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (!company) { notFoundCompany(); break; }
      const yearMonth = params.ym ?? null;
      const record = yearMonth ? findMonthlyRecord(company, yearMonth) : null;
      main.innerHTML = renderMonthly({ ...ctx, company, yearMonth, record });
      mountMonthly(main, { ...ctx, company });
      break;
    }
    case ROUTES.ANALYSIS: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (!company) { notFoundCompany(); break; }
      main.innerHTML = renderAnalysis({ ...ctx, company });
      break;
    }
    case ROUTES.REVIEW: {
      const company = params.company ? store.getCompany(params.company) : null;
      if (!company) { notFoundCompany(); break; }
      main.innerHTML = renderReview({ ...ctx, company });
      mountReview(main, ctx);
      break;
    }
    case ROUTES.DATA:
      main.innerHTML = renderData(ctx);
      mountData(main, ctx);
      break;
    default:
      main.innerHTML = renderStart(ctx);
  }
  main.focus({ preventScroll: true });
}

const router = new HashRouter({
  browserWindow: window,
  onRoute: render
});

function navigate(route, params) {
  router.navigate(route, params);
}

try {
  store.initialize();
} catch (error) {
  main.innerHTML = `
    <div class="card">
      <h1>データを読み込めませんでした</h1>
      <p>${error?.message ?? "保存データの読み込みに失敗しました。"}</p>
      <p class="note">データが壊れている可能性があります。このままでは上書きされません。</p>
    </div>`;
  throw error;
}

router.start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
