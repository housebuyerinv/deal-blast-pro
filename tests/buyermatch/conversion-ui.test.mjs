import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { conversionReport } from "../../server/buyermatch/conversion-report.js";
import { randomUUID } from "node:crypto";
await mkdir("node_modules/.cache/conversion-ui", { recursive: true });
const outfile = path.resolve(
  await mkdtemp("node_modules/.cache/conversion-ui/component-"),
  "screen.mjs",
);
await build({
  entryPoints: ["src/pages/app/BuyerMatchConversion.tsx"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-router-dom"],
  plugins: [
    {
      name: "local-fixtures",
      setup(b) {
        b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({
          path: "supabase",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /\/store\/useAppStore$/ }, () => ({
          path: "store",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents:
            a.path === "supabase"
              ? "export const supabase={};"
              : "export const useAppStore={getState:()=>({})};",
        }));
      },
    },
  ],
});
const { ConversionScreen } = await import(pathToFileURL(outfile));
const deal = randomUUID(),
  snapshot = {
    deals: [
      {
        id: deal,
        property: {
          address: "123 Synthetic",
          city: "Austin",
          state: "TX",
          zip: "78701",
        },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
  };
test("screen loads actual report shape, filters, zero-data denominators and preserved deal navigation", async () => {
  let view;
  const calls = [];
  const transport = async (action, values) => {
    calls.push({ action, values });
    return conversionReport(snapshot, values, Date.parse("2026-04-01"));
  };
  try {
    await act(async () => {
      view = renderer.create(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(ConversionScreen, {
            owner: "fixture",
            transport,
          }),
        ),
      );
    });
    assert.doesNotMatch(JSON.stringify(view.toJSON()), /Generate Demo/);
    await act(async () => {
      await view.root
        .findByProps({ "aria-label": "Conversion filters" })
        .props.onSubmit({ preventDefault() {} });
    });
    assert.match(JSON.stringify(view.toJSON()), /Insufficient data/);
    assert.ok(
      view.root
        .findAllByType("a")
        .some((a) => a.props.href === `/app/buyermatch/deals/${deal}`),
    );
    await act(async () =>
      view.root
        .findByProps({ "aria-label": "market" })
        .props.onChange({ target: { value: "Austin, TX" } }),
    );
    await act(async () => {
      await view.root
        .findByProps({ "aria-label": "Conversion filters" })
        .props.onSubmit({ preventDefault() {} });
    });
    assert.equal(calls.at(-1).values.market, "Austin, TX");
  } finally {
    view?.unmount();
  }
});
test("evidence form requires confirmation and sends real cent amounts with stable operation identity", async () => {
  let view;
  const writes = [];
  const transport = async (action, values) => {
    if (action === "conversion-record") writes.push(values);
    return action === "conversion-report"
      ? conversionReport(snapshot, {}, Date.parse("2026-04-01"))
      : { id: randomUUID() };
  };
  try {
    await act(async () => {
      view = renderer.create(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(ConversionScreen, {
            owner: "fixture",
            transport,
          }),
        ),
      );
    });
    await act(async () => {
      await view.root
        .findByProps({ "aria-label": "Conversion filters" })
        .props.onSubmit({ preventDefault() {} });
    });
    const eventSelect = () =>
      view.root
        .findAllByType("select")
        .find((s) => s.props.value === "inventory_verified");
    await act(async () =>
      eventSelect().props.onChange({ target: { value: "written_offer" } }),
    );
    async function fill(title, value) {
      const input = view.root
        .findAllByType("input")
        .find((i) => i.parent?.children[0] === title);
      assert.ok(input, title);
      await act(async () => input.props.onChange({ target: { value } }));
    }
    await fill("Actual occurrence date/time", "2026-01-02T12:00");
    await fill("Opaque evidence reference", "offer-document-1");
    await fill("Offer reference", "offer-1");
    await fill("Opaque buyer/counterparty reference", "B-fixture");
    await fill("Amount (USD)", "123456.78");
    assert.equal(
      view.root
        .findAllByType("button")
        .find((b) => b.children.includes("Append evidence")).props.disabled,
      true,
    );
    await act(async () =>
      view.root
        .findAllByType("input")
        .find((i) => i.props.type === "checkbox")
        .props.onChange({ target: { checked: true } }),
    );
    await act(async () => {
      await view.root
        .findAllByType("form")[1]
        .props.onSubmit({ preventDefault() {} });
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].payload.amountCents, 12345678);
    assert.equal(writes[0].payload.confirmed, true);
    assert.equal(writes[0].dealId, deal);
    assert.match(writes[0].operationKey, /^[a-f0-9-]{36}$/);
  } finally {
    view?.unmount();
  }
});
