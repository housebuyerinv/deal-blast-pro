const QA_CHECKOUT_EMAIL = 'housebuyerinv+dbp-trialcheckoutqa@gmail.com'
const QA_CHECKOUT_WORKSPACE_ID = '09a8234e-3eaa-46e9-8aed-eb6f6b62ce94'

type ProTrialCheckoutAuthorizationInput = {
  publicGateEnabled: boolean
  qaBypassEnabled: boolean
  vercelEnvironment: string
  authenticatedEmail: string
  authenticatedWorkspaceId: string
}

export function canCreateProTrialCheckout(input: ProTrialCheckoutAuthorizationInput) {
  if (input.publicGateEnabled) return true

  return input.vercelEnvironment.trim().toLowerCase() === 'preview'
    && input.qaBypassEnabled
    && input.authenticatedEmail.trim().toLowerCase() === QA_CHECKOUT_EMAIL
    && input.authenticatedWorkspaceId.trim().toLowerCase() === QA_CHECKOUT_WORKSPACE_ID
}
