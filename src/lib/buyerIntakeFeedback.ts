export const INTAKE_UNAVAILABLE_MESSAGE = 'Buyer intake is temporarily unavailable. No submission was confirmed. Please contact support before retrying.'
export const INTAKE_UNCONFIRMED_MESSAGE = 'We could not confirm your submission. Retry with the same details, or contact support before starting again.'

// Only known public copy can reach the page. Never reflect arbitrary provider errors.
export function buyerIntakeFeedback(error: unknown) {
  return error instanceof Error && error.message === INTAKE_UNAVAILABLE_MESSAGE
    ? INTAKE_UNAVAILABLE_MESSAGE
    : INTAKE_UNCONFIRMED_MESSAGE
}
