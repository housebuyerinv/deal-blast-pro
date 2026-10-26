import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { build } from "esbuild";
import { createRequire } from "node:module";
const auth = {
  session: null,
  callback: null,
  loginCalls: [],
  login: async () => ({ error: { message: "PRIVATE_AUTH_DETAIL" } }),
};
globalThis.__buyerAccountUI = auth;
const compiled = await build({
  entryPoints: ["src/pages/public/BuyerMatchAccount.tsx"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react-dom", "react-router-dom"],
  plugins: [
    {
      name: "isolated-ui",
      setup(b) {
        b.onResolve(
          { filter: /lib\/supabase$|layout\/PublicNav$|layout\/PublicFooter$/ },
          (a) => ({ path: a.path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents: a.path.endsWith("supabase")
            ? `export const supabase={auth:{getSession:async()=>({data:{session:globalThis.__buyerAccountUI.session}}),onAuthStateChange:cb=>{globalThis.__buyerAccountUI.callback=cb;return {data:{subscription:{unsubscribe(){}}}}},signInWithPassword:async args=>{globalThis.__buyerAccountUI.loginCalls.push(args);return globalThis.__buyerAccountUI.login()},signOut:async()=>{globalThis.__buyerAccountUI.session=null;globalThis.__buyerAccountUI.callback('SIGNED_OUT')}}};`
            : "export default function Stub(){return null}",
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
const { BuyerAccountPanel, default: Page } = module.exports;
const account = {
  linked: true,
  revision: 0,
  criteria: { markets: [{ state: "TX" }] },
  status: "inactive",
  optedOut: false,
  proofs: [],
  consent: {
    version: "buyer-maintenance-v1",
    text: "SYNTHETIC accuracy authorization",
  },
};
const text = (n) =>
  typeof n === "string" ? n : (n?.children || []).map(text).join("");
async function mountPanel(value = account, run = async () => ({})) {
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BuyerAccountPanel, { account: value, run }),
      ),
    );
  });
  return tree;
}
const html = (tree) => JSON.stringify(tree.toJSON());
test("private buyer account presents real criteria, proof replacement and personal history without paid checkout", async () => {
  const tree = await mountPanel();
  assert.match(html(tree), /Buying criteria/);
  assert.match(html(tree), /Upload private replacement/);
  assert.match(html(tree), /Your deal/);
  assert.doesNotMatch(html(tree), /Open secure checkout|Buy Pro|Stripe/);
  await act(() => tree.unmount());
});
test("unlinked buyer is never offered arbitrary buyer selection or email-only profile takeover", async () => {
  const calls = [];
  const tree = await mountPanel({ linked: false }, async (input) => {
    calls.push(input);
    return {};
  });
  assert.match(html(tree), /valid, delivered invitation/);
  const input = tree.root.findByProps({ type: "password" });
  await act(() => input.props.onChange({ target: { value: "a".repeat(43) } }));
  await act(() =>
    tree.root
      .findByProps({ "aria-label": "Connect buyer profile" })
      .props.onSubmit({ preventDefault() {} }),
  );
  assert.deepEqual(calls, [{ action: "claim", token: "a".repeat(43) }]);
  await act(() => tree.unmount());
});
test("consent controls start unchecked; save sends exact revision/version; withdrawal does not require agreement", async () => {
  const calls = [];
  const tree = await mountPanel(account, async (input) => {
    calls.push(input);
    return {};
  });
  const accuracy = tree.root
    .findAllByProps({ type: "checkbox" })
    .find((n) => n.props.required);
  assert.equal(accuracy.props.checked, false);
  await act(() => accuracy.props.onChange({ target: { checked: true } }));
  await act(() =>
    tree.root
      .findByProps({ "aria-label": "Buying criteria updates" })
      .props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(calls[0].accurate, true);
  assert.equal(calls[0].invitations, false);
  assert.equal(calls[0].revision, 0);
  assert.equal(calls[0].consentVersion, "buyer-maintenance-v1");
  const stop = tree.root
    .findAllByType("button")
    .find((n) => n.children.join("") === "Stop future invitations");
  await act(() => stop.props.onClick());
  assert.equal(calls[1].action, "withdraw");
  assert.equal(calls[1].accurate, undefined);
  await act(() => tree.unmount());
});
test("duplicate in-flight submissions are blocked and uncertain updates never claim rollback or success", async () => {
  let reject,
    calls = 0;
  const tree = await mountPanel(account, () => {
    calls++;
    return new Promise((_, r) => {
      reject = r;
    });
  });
  const form = tree.root.findByProps({
    "aria-label": "Buying criteria updates",
  });
  await act(() => {
    void form.props.onSubmit({ preventDefault() {} });
    void form.props.onSubmit({ preventDefault() {} });
  });
  assert.equal(calls, 1);
  await act(() => reject(Error("PRIVATE_ERROR")));
  assert.match(html(tree), /Result not confirmed/);
  assert.doesNotMatch(
    html(tree),
    /PRIVATE_ERROR|Criteria saved|previous information is preserved/,
  );
  await act(() => tree.unmount());
});
test("history loads personal responses and older pages, renders untrusted text without HTML injection", async () => {
  const calls = [];
  const tree = await mountPanel(account, async (input) => {
    calls.push(input);
    return {
      items: [
        {
          id: String(calls.length),
          createdAt: "2026-01-01",
          status: "closed",
          property: { address: "Synthetic invitation" },
          responses: [{ kind: "declined", createdAt: "2026-01-01" }],
          offers: [],
          messages: [
            {
              sender: "owner",
              body: "<script>not executable</script>",
              createdAt: "2026-01-01",
            },
          ],
        },
      ],
      next:
        calls.length === 1
          ? { before: "2026-01-01T00:00:00Z", beforeId: "older" }
          : null,
    };
  });
  let load = tree.root
    .findAllByType("button")
    .find((n) => n.children.join("") === "Load private history");
  await act(() => load.props.onClick());
  assert.match(html(tree), /declined/);
  assert.equal(tree.root.findAllByType("script").length, 0);
  load = tree.root
    .findAllByType("button")
    .find((n) => n.children.join("") === "Load older invitations");
  await act(() => load.props.onClick());
  assert.equal(calls[1].beforeId, "older");
  assert.equal(tree.root.findAllByType("article").length, 2);
  await act(() => tree.unmount());
});
test("login failure clears password and never renders raw credentials/provider errors", async () => {
  auth.session = null;
  auth.loginCalls = [];
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(MemoryRouter, null, React.createElement(Page)),
    );
  });
  await act(() =>
    tree.root
      .findByProps({ type: "email" })
      .props.onChange({ target: { value: "synthetic@example.invalid" } }),
  );
  await act(() =>
    tree.root
      .findByProps({ type: "password" })
      .props.onChange({ target: { value: "DUMMY_PRIVATE_PASSWORD" } }),
  );
  await act(() =>
    tree.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(auth.loginCalls.length, 1);
  assert.equal(tree.root.findByProps({ type: "password" }).props.value, "");
  assert.match(html(tree), /Sign in failed/);
  assert.doesNotMatch(html(tree), /DUMMY_PRIVATE_PASSWORD|PRIVATE_AUTH_DETAIL/);
  await act(() => tree.unmount());
});
test("account switch discards a delayed private history response before it can appear", async () => {
  const previousFetch = globalThis.fetch;
  let resolveHistory;
  const session = { access_token: "DUMMY_TOKEN", user: { id: "first" } };
  auth.session = session;
  globalThis.fetch = async (_url, request) => {
    const input = JSON.parse(request.body);
    if (input.action === "history")
      return new Promise((resolve) => {
        resolveHistory = () =>
          resolve({
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "private",
                  createdAt: "2026-01-01",
                  property: { address: "OLD ACCOUNT SECRET" },
                  responses: [],
                  offers: [],
                  messages: [],
                },
              ],
              next: null,
            }),
          });
      });
    return { ok: true, json: async () => account };
  };
  let tree;
  try {
    await act(async () => {
      tree = create(
        React.createElement(MemoryRouter, null, React.createElement(Page)),
      );
    });
    const load = tree.root
      .findAllByType("button")
      .find((n) => n.children.join("") === "Load private history");
    await act(() => {
      void load.props.onClick();
    });
    await act(async () => {
      auth.session = null;
      auth.callback("SIGNED_OUT");
      resolveHistory();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    assert.doesNotMatch(html(tree), /OLD ACCOUNT SECRET|DUMMY_TOKEN/);
    assert.match(html(tree), /Buyer account sign in/);
  } finally {
    await act(() => tree.unmount());
    globalThis.fetch = previousFetch;
    auth.session = null;
  }
});

test("new confirmed buyer form submits a create-only pending profile with a stable retry key", async () => {
  const calls = [];
  const tree = await mountPanel(
    { ...account, linked: false },
    async (input) => {
      calls.push(input);
      throw Error("UNKNOWN");
    },
  );
  await act(() =>
    tree.root
      .findByProps({ maxLength: 120 })
      .props.onChange({ target: { value: "Synthetic buyer" } }),
  );
  const accuracy = tree.root
    .findAllByProps({ type: "checkbox" })
    .find((n) => n.props.required);
  await act(() => accuracy.props.onChange({ target: { checked: true } }));
  for (let i = 0; i < 2; i++)
    await act(() =>
      tree.root
        .findByProps({ "aria-label": "New buyer profile" })
        .props.onSubmit({ preventDefault() {} }),
    );
  assert.equal(calls[0].action, "create");
  assert.equal(calls[0].operationKey, calls[1].operationKey);
  assert.equal(calls[0].invitations, false);
  assert.equal(calls[0].buyerId, undefined);
  assert.equal(calls[0].role, undefined);
  await act(() => tree.unmount());
});

test("replacement sends only selected synthetic file bytes and never marks funds verified", async () => {
  const calls = [];
  const tree = await mountPanel(account, async (input) => {
    calls.push(input);
    return {};
  });
  const bytes = new TextEncoder().encode("%PDF-synthetic");
  await act(() =>
    tree.root.findByProps({ type: "file" }).props.onChange({
      target: {
        files: [
          {
            size: bytes.length,
            type: "application/pdf",
            arrayBuffer: async () => bytes.buffer,
          },
        ],
      },
    }),
  );
  await act(() =>
    tree.root
      .findByProps({ type: "date" })
      .props.onChange({ target: { value: "2027-01-01" } }),
  );
  await act(() =>
    tree.root
      .findByProps({ "aria-label": "Private proof replacement" })
      .props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(calls[0].action, "proof");
  assert.equal(
    Buffer.from(calls[0].content, "base64").toString(),
    "%PDF-synthetic",
  );
  assert.equal(calls[0].expiresOn, "2027-01-01");
  assert.match(html(tree), /received for review/);
  assert.doesNotMatch(html(tree), /Funds verified/);
  await act(() => tree.unmount());
});

test("profile form sends only private editable fields, revision and operation key", async () => {
  const calls = [];
  const tree = await mountPanel(
    {
      ...account,
      profile: { name: "Synthetic buyer", company: "", phone: "" },
    },
    async (input) => {
      calls.push(input);
      return {};
    },
  );
  const form = tree.root.findByProps({ "aria-label": "Buyer profile updates" });
  await act(() => form.props.onSubmit({ preventDefault() {} }));
  assert.equal(calls[0].action, "profile");
  assert.equal(calls[0].name, "Synthetic buyer");
  assert.equal(calls[0].revision, 0);
  assert.equal(calls[0].email, undefined);
  assert.equal(calls[0].role, undefined);
  assert.match(html(tree), /Profile saved for review/);
  await act(() => tree.unmount());
});
