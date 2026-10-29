import { createHash } from 'node:crypto';
const checked = result => { if (result.error) throw new Error('Agreement verification unavailable'); return result.data; };
export async function subscriberAgreements(db, owner) {
  const documents = checked(await db.from('bm_documents').select('id,kind,version,document_hash,content')
    .eq('approved', true).eq('current', true).in('kind', ['platform_terms', 'privacy']));
  if (documents.length !== 2 || new Set(documents.map(d => d.kind)).size !== 2 ||
      documents.some(d => createHash('sha256').update(d.content).digest('hex') !== d.document_hash))
    throw Object.assign(new Error('Approved platform terms and privacy policy are required before subscribing.'), { status: 409 });
  const acceptances = checked(await db.from('bm_acceptances').select('document_id,document_hash,version')
    .eq('owner_id', owner).is('deal_id', null));
  return documents.map(d => ({ ...d, accepted: acceptances.some(a => a.document_id === d.id && a.document_hash === d.document_hash && a.version === d.version) }));
}
export async function requireSubscriberAgreements(db, owner) {
  if ((await subscriberAgreements(db, owner)).some(d => !d.accepted))
    throw Object.assign(new Error('Review and sign the current platform terms and privacy policy before checkout.'), { status: 409 });
}
