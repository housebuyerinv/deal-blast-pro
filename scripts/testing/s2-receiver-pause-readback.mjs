/* global fetch, AbortSignal */
// No Supabase secret inventory. Actual deployed guard response, not a digest.
export async function readPausedReceiver(fetcher = fetch, signal = AbortSignal.timeout(10000)) {
  try {
    const response = await fetcher('https://qxhhlprentrufobpcgna.supabase.co/functions/v1/stripe-webhook', {
      // The deployed handler returns 405 for GET before evaluating its pause gate.
      // An empty unsigned POST has no Stripe event or valid signature and cannot
      // reach billing writes, even if processing unexpectedly becomes enabled.
      method: 'POST', body: '', redirect: 'error', cache: 'no-store', signal,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    if (text.length > 1024 || response.status !== 503 || response.redirected) throw Error();
    const body = JSON.parse(text);
    if (Object.keys(body).sort().join(',') !== 'error,ok' || body.ok !== false || body.error !== 'Staging webhook processing paused') throw Error();
    return true;
  } catch { throw Error('RECEIVER_PAUSE_UNVERIFIED'); }
}
