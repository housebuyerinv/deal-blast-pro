// Local, synthetic-only execution of the installed vendor's pure route generator.
// No CLI command, provider credentials, server, deployment or network operation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const file =
  'C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/chunks/chunk-BX4IGDGM.js';
const expectedSha256 =
  '46a38068802d3fc947239d7b3c446902df0957c308830a6f51a85b683b7732f7';

export function reproducePinnedVercelRoute() {
  const source = readFileSync(file, 'utf8');
  const sha256 = createHash('sha256').update(source).digest('hex');
  if (sha256 !== expectedSha256) throw Error('Vendor routing source changed');
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const wanted = new Set([
    'getSegmentName',
    'escapeName',
    'createRouteFromPath',
  ]);
  const functions = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) {
      if (functions.has(node.name.text))
        throw Error('Ambiguous vendor function');
      functions.set(node.name.text, node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (functions.size !== wanted.size)
    throw Error('Vendor functions unavailable');
  const result = runInNewContext(
    [...functions.values()].join('\n') +
      '\n[false,true].map(flag=>createRouteFromPath("api/platform/[endpoint].ts",flag,false))',
    { import_path13: Object.freeze({ parse }) },
    { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
  );
  return {
    vendor: 'installed Vercel CLI 58.9.0',
    vendorChunkSha256: sha256,
    functionSha256: Object.fromEntries(
      [...functions].map(([k, v]) => [
        k,
        createHash('sha256').update(v).digest('hex'),
      ]),
    ),
    observation:
      'Actual pinned vendor function text executed locally; not a hosted request-envelope capture',
    routes: JSON.parse(JSON.stringify(result)),
  };
}
