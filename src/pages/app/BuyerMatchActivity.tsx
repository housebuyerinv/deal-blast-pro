import { useCallback, useEffect, useRef, useState } from 'react';

type Data = Record<string, any>;
type Request = (action: string, data?: Data, read?: boolean) => Promise<Data>;
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
const label = (value: string) => value === 'pass' ? 'Declined' : String(value || 'Not recorded').replace(/_/g, ' ');

function useRecords(request: Request, action: string, id?: string) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { setData(null); setError(''); setBusy(false); return invalidate; }, [id, request, action, invalidate]);
  async function load(page = 0) {
    const attempt = ++generation.current;
    setBusy(true); setError('');
    try {
      const next = await request(action, { ...(id ? { id } : {}), page }, true);
      if (attempt === generation.current) setData(next);
    } catch {
      if (attempt === generation.current) { setData(null); setError('Records could not be loaded. Try again when the service is available.'); }
    } finally { if (attempt === generation.current) setBusy(false); }
  }
  return { data, busy, error, load };
}
function Paging({ data, busy, load }: { data: Data; busy: boolean; load: (page: number) => void }) {
  return <nav aria-label="Record pages" className="flex flex-wrap items-center gap-3">
    <button type="button" className="btn btn-ghost" disabled={busy || !data.page} onClick={() => load(data.page - 1)}>Previous</button>
    <span>Page {data.page + 1}</span>
    <button type="button" className="btn btn-ghost" disabled={busy || !data.hasMore} onClick={() => load(data.page + 1)}>Next</button>
  </nav>;
}
export function DealActivity({ request, id }: { request: Request; id: string }) {
  const { data, busy, error, load } = useRecords(request, 'activity', id);
  return <section className="bm-panel space-y-4" aria-label="Distribution and response history" aria-busy={busy}>
    <h3 className="text-xl font-semibold">Distribution & buyer responses</h3>
    <p>Track this deal’s recorded invitations and responses. Reserved invitations are not proof of delivery. Current interest, offer and decline counts use each invited buyer’s latest decision.</p>
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => load(data?.page || 0)}>{busy ? 'Loading activity…' : data ? 'Refresh activity' : 'Load deal activity'}</button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Object.entries({ reserved: 'Reserved', accepted: 'Provider accepted', delivered: 'Delivered', pending: 'Pending', suppressed: 'Suppressed', interests: 'Interested', offers: 'Offers', declines: 'Declined' }).map(([key, title]) => <div className="bm-stat" key={key}><dt>{title}</dt><dd>{data.summary?.[key] ?? 'Not recorded'}</dd></div>)}</dl>
      <h4 className="font-semibold">Response history</h4>
      <p className="text-sm text-slate-400">Anonymous references protect buyer identities. Offer details and private conversations appear below.</p>
      {data.history?.length ? <ol className="space-y-2">{data.history.map((row: Data) => <li key={row.id} className="border border-slate-700 rounded-lg p-3 break-words"><strong>{row.buyerRef}</strong> · {label(row.kind)}<br /><time dateTime={row.created_at}>{date(row.created_at)}</time></li>)}</ol> : <p>No buyer responses recorded for this deal.</p>}
      <Paging data={data} busy={busy} load={load} />
    </>}
  </section>;
}
export function BuyerMatchOperations({ request }: { request: Request }) {
  const { data, busy, error, load } = useRecords(request, 'admin-operations');
  return <section className="bm-panel space-y-4" aria-label="Owner operating records" aria-busy={busy}>
    <p className="bm-eyebrow">OWNER OPERATIONS · READ ONLY</p>
    <h2 className="text-xl font-semibold">Subscriptions, delivery errors & audit</h2>
    <p>BuyerMatch subscription records and completed billing reconciliations are separate from CRM billing. This view does not activate plans, retry delivery or change records.</p>
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => load(data?.page || 0)}>{busy ? 'Loading records…' : data ? 'Refresh operating records' : 'Load operating records'}</button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      {[
        ['entitlements', 'BuyerMatch entitlements', (row: Data) => `${row.plan_version} · ${row.status} · Account ${row.owner_id} · ${row.allowance} analyses · through ${date(row.period_end)}`],
        ['reconciliations', 'Processed billing reconciliations', (row: Data) => `${row.event_id} · Account ${row.owner_id} · ${date(row.created_at)}`],
        ['deliveryErrors', 'Delivery error queue', (row: Data) => `${label(row.state)} · ${row.attempts} attempts · ${label(row.last_error_code)} · ${date(row.created_at)}`],
        ['audit', 'Immutable deal audit', (row: Data) => `${label(row.kind)} · Deal ${row.deal_id} · ${date(row.created_at)}`],
      ].map(([key, title, describe]) => <section key={String(key)} className="border-t border-slate-700 pt-3 space-y-2">
        <h3 className="font-semibold">{String(title)}</h3>
        {data[String(key)]?.length ? <ul className="space-y-2">{data[String(key)].map((row: Data) => <li key={row.id || row.event_id || `${row.owner_id}:${row.product}`} className="rounded-lg bg-black/20 p-3 break-words text-sm">{(describe as (value: Data) => string)(row)}</li>)}</ul> : <p>No records on this page.</p>}
      </section>)}
      <Paging data={data} busy={busy} load={load} />
    </>}
  </section>;
}
