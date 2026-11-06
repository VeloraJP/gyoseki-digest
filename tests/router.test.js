import test from "node:test";
import assert from "node:assert/strict";
import { HashRouter, ROUTES, buildHash } from "../assets/js/navigation/router.js";

// location.hash の代入で hashchange を同期発火させる偽ウィンドウ。
// 同じ値の代入では発火しない（実ブラウザと同じ挙動）。
class FakeWindow {
  constructor() {
    this.handlers = new Map();
    let hash = "";
    this.location = {};
    Object.defineProperty(this.location, "hash", {
      get: () => hash,
      set: (value) => {
        if (hash === value) return;
        hash = value;
        this.emit("hashchange");
      }
    });
  }

  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type) {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

function setupRouter() {
  const fakeWindow = new FakeWindow();
  const calls = [];
  const router = new HashRouter({
    browserWindow: fakeWindow,
    onRoute: ({ route, params }) => calls.push(buildHash(route, params))
  });
  router.start();
  return { router, calls };
}

test("初期表示でスタート画面になる", () => {
  const { calls } = setupRouter();
  assert.deepEqual(calls, ["#/start"]);
});

test("navigateで画面が切り替わる", () => {
  const { router, calls } = setupRouter();
  router.navigate(ROUTES.HOME, { company: "c1" });
  assert.deepEqual(calls, ["#/start", "#/home?company=c1"]);
});

test("同じハッシュへのnavigateでも再描画される（保存後の表示更新）", () => {
  const { router, calls } = setupRouter();
  router.navigate(ROUTES.GOAL, { company: "c1", period: "p1" });
  const before = calls.length;
  // 目標の保存直後など、同じURLへのnavigateでもう一度描画されること。
  router.navigate(ROUTES.GOAL, { company: "c1", period: "p1" });
  assert.equal(calls.length, before + 1);
  assert.equal(calls[calls.length - 1], "#/goal?company=c1&period=p1");
});

test("backで直前の画面に戻り、履歴がなければfallbackへ行く", () => {
  const { router, calls } = setupRouter();
  router.navigate(ROUTES.HOME, { company: "c1" });
  router.navigate(ROUTES.GOAL, { company: "c1" });
  assert.equal(router.back(), true);
  assert.equal(calls[calls.length - 1], "#/home?company=c1");
  assert.equal(router.back(), true);
  assert.equal(calls[calls.length - 1], "#/start");
  // ここまでで履歴は空。fallbackが使われる。
  assert.equal(router.back("#/data"), true);
  assert.equal(calls[calls.length - 1], "#/data");
});
