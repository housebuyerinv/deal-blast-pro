import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { build } from "esbuild";
import { createRequire } from "node:module";

async function component(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react-router-dom"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports;
}
const Marketing = (await component("src/pages/public/BuyerMatchLanding.tsx"))
  .default;
const Demo = (await component("src/pages/public/BuyerMatchDemo.tsx")).default;
const { WorkspaceOverview } = await component(
  "src/components/buyermatch/WorkspaceOverview.tsx",
);
test('unknown demo deal cannot silently display another sample property', () => {
  const f = mount(Demo, '/buyermatch/demo/deals/not-a-sample');
  try {
    assert.match(text(f.view.toJSON()), /Sample deal not found/);
    assert(!text(f.view.toJSON()).includes('124 Sample Oak Lane'));
  } finally { f.close(); }
});
const text = (node) =>
  typeof node === "string" ? node : (node?.children || []).map(text).join("");
function mount(Page, path) {
  const previous = globalThis.document;
  globalThis.document = { title: "Synthetic test title" };
  const router = createMemoryRouter(
    [{ path: "*", element: React.createElement(Page) }],
    { initialEntries: [path] },
  );
  let view;
  act(() => {
    view = create(React.createElement(RouterProvider, { router }));
  });
  return {
    router,
    view,
    close() {
      act(() => view.unmount());
      router.dispose();
      globalThis.document = previous;
    },
  };
}
for (const [route, heading] of [
  ["/buyermatch", "The right buyer fit."],
  ["/buyermatch/features", "Every deal."],
  ["/buyermatch/how-it-works", "From property details"],
  ["/buyermatch/pricing", "A plan for your deal flow."],
  ["/buyermatch/pricing/", "A plan for your deal flow."],
  ["/buyermatch/features/", "Every deal."],
]) {
  test(`dedicated ${route} renders its product heading and connected navigation`, () => {
    const f = mount(Marketing, route);
    try {
      assert.match(
        text(f.view.root.findByType("h1")),
        new RegExp(heading.replace(/[.]/g, "\\.")),
      );
      const links = f.view.root.findAllByType("a").map((x) => x.props.href);
      for (const required of [
        "/buyermatch/features",
        "/buyermatch/pricing",
        "/buyermatch/how-it-works",
        "/buyermatch/demo",
      ])
        assert(links.includes(required));
    } finally {
      f.close();
    }
  });
}
test("pricing preserves both independent tiers, exact allowances and secure product intent", () => {
  const f = mount(Marketing, "/buyermatch/pricing");
  try {
    const cards = f.view.root.findAll(
      (n) =>
        n.type === "article" && n.props.className?.includes("bm-price-card"),
    );
    assert.equal(cards.length, 2);
    for (const [i, price, analysis, distributions, buyers, tier] of [
      [0, 59, 20, 10, 25, "starter"],
      [1, 119, 50, 25, 50, "pro"],
    ]) {
      const value = text(cards[i]);
      assert(value.includes("$" + price));
      assert(value.includes(analysis + " analyses"));
      assert(value.includes(distributions + " software distributions"));
      assert(value.includes("Up to " + buyers));
      assert.equal(
        cards[i].findByType("a").props.href,
        "/register?product=buyermatch&tier=" + tier,
      );
    }
    const value = text(f.view.toJSON());
    assert(!value.includes("LAUNCH10"));
    assert(value.includes("do not apply"));
    assert(value.includes("does not start billing"));
  } finally {
    f.close();
  }
});
test("demo creates only a local sample deal and performs no provider request", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    throw Error("Network forbidden");
  };
  const f = mount(Demo, "/buyermatch/demo");
  try {
    const fields = f.view.root.findAllByType("input");
    act(() =>
      fields[0].props.onChange({ target: { value: "16 Fictional Court" } }),
    );
    act(() => fields[1].props.onChange({ target: { value: "Sample City" } }));
    act(() => fields[2].props.onChange({ target: { value: "150000" } }));
    act(() =>
      f.view.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    assert(text(f.view.toJSON()).includes("16 Fictional Court"));
    assert.equal(calls, 0);
    assert.match(
      text(f.view.root.findByProps({ role: "status" })),
      /No account or server record/,
    );
  } finally {
    f.close();
    globalThis.fetch = original;
  }
});
test("demo analysis remains illustrative and distribution cannot be activated", () => {
  const f = mount(Demo, "/buyermatch/demo/deals/sample-oak");
  try {
    const buttons = f.view.root.findAllByType("button");
    act(() =>
      buttons
        .find((n) => text(n).includes("Preview sample analysis"))
        .props.onClick(),
    );
    assert(text(f.view.toJSON()).includes("NOT A REAL MATCH"));
    assert.equal(
      f.view.root
        .findAllByType("button")
        .find((n) => text(n).includes("Delivery disabled")).props.disabled,
      true,
    );
    assert(!text(f.view.toJSON()).includes("90%"));
  } finally {
    f.close();
  }
});
test("demo allowance selection previews Pro without starting Checkout", () => {
  const f = mount(Demo, "/buyermatch/demo/plans");
  try {
    act(() =>
      f.view.root
        .findAllByType("button")
        .find((n) => text(n).includes("Preview Pro"))
        .props.onClick(),
    );
    assert.equal(
      f.view.root
        .findAllByType("button")
        .find((n) => text(n).includes("Preview Pro")).props["aria-pressed"],
      true,
    );
    assert(text(f.view.toJSON()).includes("Pro · illustrative billing period"));
    assert(
      f.view.root
        .findAllByType("a")
        .every((n) => !/stripe\.com/.test(n.props.href || "")),
    );
  } finally {
    f.close();
  }
});
test("demo admin review requires synthetic consent and filtered empty state recovers", () => {
  const f = mount(Demo, "/buyermatch/demo/admin");
  try {
    const button = () =>
      f.view.root
        .findAllByType("button")
        .find((n) => text(n).includes("Preview reviewed status"));
    assert.equal(button().props.disabled, true);
    act(() =>
      f.view.root
        .findByType("input")
        .props.onChange({ target: { checked: true } }),
    );
    assert.equal(button().props.disabled, false);
    act(() => button().props.onClick());
    assert(text(f.view.toJSON()).includes("No server record"));
    act(() =>
      f.view.root
        .findByType("select")
        .props.onChange({ target: { value: "pending" } }),
    );
    assert(text(f.view.toJSON()).includes("No sample profiles"));
  } finally {
    f.close();
  }
});
test("demo response records only a sample status, not a server success claim", () => {
  const f = mount(Demo, "/buyermatch/demo/buyers");
  try {
    act(() =>
      f.view.root
        .findByType("select")
        .props.onChange({ target: { value: "pass" } }),
    );
    act(() =>
      f.view.root
        .findAllByType("form")[1]
        .props.onSubmit({ preventDefault() {} }),
    );
    assert.match(
      text(f.view.root.findByProps({ role: "status" })),
      /Sample response: pass.*Nothing was sent or recorded/,
    );
  } finally {
    f.close();
  }
});
test("workspace distinguishes loading/failure/empty and renders only supplied records", () => {
  let view;
  const render = (props) => {
    act(() => {
      if (view) view.unmount();
      const router = createMemoryRouter([
        {
          path: "*",
          element: React.createElement(WorkspaceOverview, {
            deals: [],
            ...props,
          }),
        },
      ]);
      view = create(React.createElement(RouterProvider, { router }));
    });
    return text(view.toJSON());
  };
  try {
    assert.match(render({ loading: true }), /Loading your deal workspace/);
    assert.match(render({ failed: true }), /could not be loaded/);
    assert.match(render({}), /Save your first deal/);
    assert.match(
      render({
        deals: [
          {
            id: "owned-synthetic",
            status: "draft",
            property: { address: "Owned Sample" },
          },
        ],
      }),
      /Owned Sample/,
    );
    assert.equal(
      view.root.findAllByType("a").find((n) => n.props.href.includes("/deals/"))
        .props.href,
      "/app/buyermatch/deals/owned-synthetic",
    );
  } finally {
    if (view) act(() => view.unmount());
  }
});
