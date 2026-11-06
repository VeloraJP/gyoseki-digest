// ハッシュルーター。"#/annual?company=xxx&period=yyy" 形式を扱う。
export const ROUTES = Object.freeze({
  START: "start",
  SETUP: "setup",
  HOME: "home",
  ANNUAL: "annual",
  MONTHLY: "monthly",
  ANALYSIS: "analysis",
  REVIEW: "review",
  DATA: "data"
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
    this.browserWindow.location.hash = buildHash(route, params);
  }

  handleChange() {
    this.onRoute(this.current());
  }
}
