type Environment = Record<string, string | undefined>;
export const S2_BILLING_REF: 'qxhhlprentrufobpcgna';
export const S2_PRO_OWNER: '368f5f93-acf7-4cc3-9805-a4c0817506c3';
export function isS2LegacyCheckout(action: string, method: string | undefined, env?: Environment): boolean;
export function isDedicatedS2Runtime(env?: Environment): boolean;
export function requireS2BillingWindow(owner: string, operation: string, env?: Environment, now?: number): { runId: string; expiresAt: number } | undefined;
export function s2BillingWindowStatus(user: { id?: string; email_confirmed_at?: string | null }, env?: Environment): {
  schema: 1; source: string; projectId: string; deploymentId: string;
  pausedSettingsVerified: boolean; attestationRunId: string;
  registrationPaused: boolean; checkoutEnabled: boolean; liveBillingDisabled: boolean; deliveryDisabled: boolean;
  BM_S2_BILLING_OWNER_ID: string; BM_S2_BILLING_RUN_ID: string; BM_S2_BILLING_STARTED_AT: string;
  BM_S2_BILLING_EXPIRES_AT: string; BM_S2_BILLING_OPERATIONS: string;
};
