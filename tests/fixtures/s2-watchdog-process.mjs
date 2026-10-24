// Actual child-process death test; all adapters are local dummies, never providers.
import { appendFileSync } from 'node:fs';
import { armS2Cleanup } from '../../scripts/buyermatch-s2-cleanup.mjs';
import { S2_RELEASE as S2 } from '../../scripts/buyermatch-s2-release.mjs';
const path = process.argv[2];
const receipt = {
  runId: '126dd0de-a2ae-499b-8f55-3cc1563e9537',
  deploymentId: 'dpl_SyntheticRun',
  source: S2.source,
  project: S2.project,
  team: S2.team,
  preexistingDeploymentIds: [S2.fallback],
  fallbackId: S2.fallback,
  alias: new URL(S2.origin).hostname,
};
appendFileSync(path, JSON.stringify({ stage: 'process-started' }) + '\n');
const denied = async () => {
  throw Error('Dummy adapter must not run before deadline');
};
armS2Cleanup(
  receipt,
  {
    verifyAuthority: denied,
    disableEndpoint: denied,
    pauseReceiver: denied,
    readSafetyState: denied,
    readAlias: denied,
    readDeployment: denied,
    restoreAlias: denied,
    removeDeployment: denied,
  },
  {
    deadlineMs: 60000,
    journal: async (e) => appendFileSync(path, JSON.stringify(e) + '\n'),
  },
);
process.stdout.write('SYNTHETIC_WATCHDOG_PROCESS_STARTED');
