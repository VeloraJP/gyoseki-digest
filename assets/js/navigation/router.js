// ハッシュルーター。"#/annual?company=xxx&period=yyy" 形式を扱う。
export const ROUTES = Object.freeze({
  START: "start",
  SETUP: "setup",
  HOME: "home",
  ANNUAL: "annual",
  MONTHLY: "monthly",
  ANALYSIS: "analysis",
  SUMMARY: "summary",
  GOAL: "goal",
  REVIEW: "review",
  DATA: "data",
  SIMULATIONS: "simulations",
  SIMULATION: "simulation",
  SIM_RESULT: "sim-result"
});

const ROUTE_SET = new Set(Object.values(ROUTES));

export function parseHash(hash) {
  const raw = (hash ?? "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const route = ROUTE_SET.has(path) ? path : ROUTES.START;
  const params = Object.fromEntries(new URLSearchParams(query));
  return { route, params };
}

export function buildHash(route, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  return `#/${route}${query ? `?${query}` : ""}`;
}

export class HashRouter {
  constructor({ browserWindow = window, onRoute }) {
    this.browserWindow = browserWindow;
    this.onRoute = onRoute;
    this.handleChange = this.handleChange.bind(this);
    // 「戻る」用に、表示した画面の履歴（ハッシュ文字列）を保持する。
    this.historyStack = [];
    this.currentHash = null;
    this.suppressPush = false;
  }

  current() {
    return parseHash(this.browserWindow.location.hash);
  }

  start() {
    this.browserWindow.addEventListener("hashchange", this.handleChange);
    this.handleChange();
  }

  stop() {
    this.browserWindow.removeEventListener("hashchange", this.handleChange);
  }

  navigate(route, params = {}) {
    const next = buildHash(route, params);
    // 同じハッシュへの代入では hashchange が発火せず、再描画されない。
    // 保存後のように「同じ画面を表示し直したい」場合は、明示的に処理を呼ぶ。
    if (this.browserWindow.location.hash === next || this.currentHash === next) {
      this.handleChange();
      return;
    }
    this.browserWindow.location.hash = next;
  }

  // 直前に表示していた画面へ戻る。履歴がなければ fallbackHash へ移動する。
  back(fallbackHash = null) {
    while (this.historyStack.length) {
      const target = this.historyStack.pop();
      if (target !== this.currentHash) {
        this.suppressPush = true;
        this.browserWindow.location.hash = target;
        return true;
      }
    }
    if (fallbackHash) {
      if (fallbackHash !== this.currentHash) {
        this.browserWindow.location.hash = fallbackHash;
      } else {
        this.handleChange();
      }
      return true;
    }
    return false;
  }

  handleChange() {
    const current = this.current();
    const hash = buildHash(current.route, current.params);
    if (this.currentHash !== null && this.currentHash !== hash && !this.suppressPush) {
      this.historyStack.push(this.currentHash);
      if (this.historyStack.length > 50) this.historyStack.shift();
    }
    this.suppressPush = false;
    this.currentHash = hash;
    this.onRoute(current);
  }
}
