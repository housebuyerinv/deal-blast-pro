import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { build } from "esbuild";
import { createRequire } from "node:module";

const compiled = await build({
  entryPoints: ["src/pages/app/BuyerMatch.tsx"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react-dom", "react-router-dom"],
  plugins: [
    {
      name: "synthetic-component-boundary",
      setup(b) {
        b.onResolve({ filter: /store\/useAppStore$|lib\/supabase$/ }, (a) => ({
          path: a.path,
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents: a.path.endsWith("useAppStore")
            ? 'export const useAppStore=Object.assign(s=>s({user:{id:"synthetic-owner"}}),{getState:()=>({user:{id:"synthetic-owner"}})});'
            : 'export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:"synthetic-owner"},access_token:"dummy-not-a-credential"}}})}};',
        }));
      },
    },
  ],
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const Page = module.exports.default;
const text = (n) =>
  typeof n === "string" ? n : (n?.children || []).map(text).join("");
async function fixture(route, responses) {
  const previous = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, "GET");
    const action = new URL(url, "http://synthetic.invalid").searchParams.get(
      "action",
    );
    calls.push(action);
    const data = responses[action] || {};
    return { ok: !data.error, json: async () => data };
  };
  const router = createMemoryRouter(
    [{ path: "/app/buyermatch/*", element: React.createElement(Page) }],
    { initialEntries: [route] },
  );
  let view;
  await act(async () => {
    view = create(React.createElement(RouterProvider, { router }));
  });
  return {
    view,
    calls,
    close() {
      act(() => view.unmount());
      router.dispose();
      globalThis.fetch = previous;
    },
  };
}
const owned = {
  id: "owned-sample",
  status: "draft",
  property: {
    address: "Owned Synthetic Avenue",
    city: "Sample City",
    state: "AL",
    price: 100000,
  },
};
test("real workspace uses supplied deal data and does not confuse search-empty with an empty account", async () => {
  const f = await fixture("/app/buyermatch", {
    plans: {},
    list: { deals: [owned] },
  });
  try {
    assert(text(f.view.toJSON()).includes("Owned Synthetic Avenue"));
    assert.deepEqual(f.calls, ["plans", "list"]);
    const search = f.view.root
      .findAllByType("input")
      .find((n) => n.props.type === "search");
    act(() => search.props.onChange({ target: { value: "absent property" } }));
    assert(text(f.view.toJSON()).includes("No deals match your search"));
    assert(!text(f.view.toJSON()).includes("Save your first deal"));
    assert(text(f.view.toJSON()).includes("Saved deals1"));
  } finally {
    f.close();
  }
});
test("real workspace keeps failure distinct from an empty deal list and exposes retry", async () => {
  const f = await fixture("/app/buyermatch", {
    plans: {},
    list: { error: "Service unavailable" },
  });
  try {
    assert(text(f.view.toJSON()).includes("could not be loaded"));
    assert(!text(f.view.toJSON()).includes("Your next deal starts here"));
    assert(
      f.view.root.findAllByType("button").some((n) => text(n) === "Retry"),
    );
  } finally {
    f.close();
  }
});
test("real plan screen leaves payment controls unavailable when checkout is paused", async () => {
  const f = await fixture("/app/buyermatch/plans", {
    plans: {
      checkoutEnabled: false,
      entitlements: [],
      catalog: [
        {
          product: "buyermatch",
          version: "sample-starter",
          label: "Starter",
          amount: 5900,
          currency: "usd",
          interval: "month",
          intervalCount: 1,
          allowance: 20,
        },
      ],
    },
    onboarding: { documents: [] },
  });
  try {
    assert(text(f.view.toJSON()).includes("No payment will be taken"));
    assert(
      !f.view.root
        .findAllByType("button")
        .some((n) => /checkout|Review plan change/.test(text(n))),
    );
    assert.deepEqual(f.calls, ["plans", "onboarding"]);
  } finally {
    f.close();
  }
});
test("real admin screen renders a scoped buyer table and page-local search without changing review state", async () => {
  const buyer = {
    id: "synthetic-buyer",
    identity: {
      name: "Sample Reviewer Fixture",
      email: "sample@example.invalid",
    },
    criteria: {},
    status: "inactive",
    verification_level: "unverified",
  };
  const f = await fixture("/app/buyermatch/admin", {
    plans: { isNetworkAdmin: true },
    "admin-list": { buyers: [buyer], deals: [], imports: [] },
    "admin-usage": {},
  });
  try {
    assert.equal(f.view.root.findAllByType("table").length, 1);
    assert(text(f.view.toJSON()).includes("Sample Reviewer Fixture"));
    const search = f.view.root
      .findAllByType("input")
      .find((n) => n.props.type === "search");
    act(() => search.props.onChange({ target: { value: "not on this page" } }));
    assert(
      text(f.view.toJSON()).includes(
        "No buyers match this search on the current page",
      ),
    );
    assert.deepEqual(f.calls, ["plans", "admin-list", "admin-usage"]);
    assert.equal(buyer.status, "inactive");
  } finally {
    f.close();
  }
});
test("non-admin response never fetches or displays private network records", async () => {
  const f = await fixture("/app/buyermatch/admin", {
    plans: { isNetworkAdmin: false },
    "admin-list": { buyers: [] },
  });
  try {
    assert.deepEqual(f.calls, ["plans"]);
    assert.equal(f.view.root.findAllByType("table").length, 0);
    assert(text(f.view.toJSON()).includes("Network administrator required"));
  } finally {
    f.close();
  }
});
