// Lossless import boundary. Claims in a file are evidence to review, never authorization.
export const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const key = value => String(value).replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  name: ['Name', 'Full Name', 'Buyer Name', 'Contact Name', 'Investor Name'],
  email: ['Email', 'Email Address', 'Buyer Email', 'Contact Email', 'Primary Email'],
  company: ['Company', 'Company Name', 'Entity', 'Business', 'Organization', 'LLC'],
  phone: ['Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Phone'],
  markets: ['Markets', 'Market', 'Target Markets', 'Locations', 'Location', 'Buying Areas', 'States', 'Target States'],
  areas: ['ZIPs / Areas', 'ZIP', 'ZIP Codes', 'Zipcodes', 'Areas', 'Target ZIPs'],
  cities: ['City', 'Cities', 'Target Cities'], states: ['State', 'Target State'],
  type: ['Buyer Type', 'Claimed Buyer Type', 'Investor Type', 'Type', 'Finance Type', 'Financing'],
  criteria: ['Property Criteria', 'Criteria', 'Buyer Criteria', 'Buy Box', 'Buy Box Summary', 'Requirements'],
  assetTypes: ['Asset Types', 'Asset Type', 'Property Types', 'Property Type', 'Asset Focus'],
  strategies: ['Strategy', 'Strategies', 'Exit Strategy', 'Investment Strategy'],
  price: ['Price / Formula', 'Price', 'Purchase Price', 'Price Range', 'Budget', 'Budget Range', 'Buy Box Price', 'Target Price'],
  budgetMin: ['Budget Min', 'Min Budget', 'Minimum Budget', 'Min Price', 'Price Min', 'Minimum Price'],
  budgetMax: ['Budget Max', 'Max Budget', 'Maximum Budget', 'Max Price', 'Price Max', 'Maximum Price'],
  allInBudget: ['All In Budget', 'All In Max', 'Total Project Budget'], arv: ['ARV', 'After Repair Value'],
  closingSpeed: ['Closing Speed', 'Close Time', 'Closing Timeline'],
  claimedVerificationStatus: ['Verification Status', 'Verified Status'],
  verificationEvidence: ['Verification Evidence', 'Proof Provided', 'Proof'],
  contactPreference: ['Contact Preference', 'Preferred Contact'], lastContact: ['Last Contact'],
  notes: ['Notes', 'Comments', 'Description'], buyingMandates: ['Buying Mandates', 'Mandates'],
  source: ['Source', 'Buyer Source', 'Lead Source'], doNotEmail: ['Do Not Email', 'Suppressed', 'Unsubscribed'],
  claimedContactConsent: ['Contact Consent', 'Outreach Consent', 'Consent'], importReview: ['Import Review'],
};
const lookup = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [key(name), field])));
const unique = xs => [...new Set(xs.filter(Boolean))];
const list = text => unique(String(text ?? '').split(/[;|\n]+/).map(x => x.trim()));
export function describeColumns(columns) {
  return columns.map(source => ({ source, destination: lookup.get(key(source)) || null }));
}
export function parseBuyerText(text) {
  // Labeled multiline blocks retain criteria lines under the same contact.
  const blocks = String(text).split(/\r?\n\s*\r?\n/).filter(block => block.trim());
  return blocks.flatMap(block => {
    const emails = unique(block.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
    if (emails.length === 1) {
      const fields = { Email: emails[0], Notes: block, 'Original Text': block };
      const labels = [...block.matchAll(/(?:^|\r?\n)([^:\r\n]+):\s*/g)].filter(match => lookup.has(key(match[1])));
      labels.forEach((match, index) => { fields[match[1]] = block.slice(match.index + match[0].length, labels[index + 1]?.index ?? block.length); });
      return [fields];
    }
    // Unlabeled address lists are line based. A line with several identities must
    // be reviewed rather than arbitrarily assigning its criteria to one email.
    return block.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const matches = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      return { Email: matches.length === 1 ? matches[0] : '', Notes: line, 'Original Text': line };
    });
  });
}
const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const stateNames = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming'.split('|');
export function parseGeography(text) {
  const canonical = String(text || '').replace(new RegExp(`\\b(${stateNames.join('|')})\\b`, 'gi'), name => states[stateNames.findIndex(x => x.toLowerCase() === name.toLowerCase())]);
  const foundStates = unique(canonical.match(new RegExp(`\\b(${states.join('|')})\\b`, 'g')) || []);
  const zips = unique(canonical.match(/\b\d{5}(?:-\d{4})?\b/g) || []).map(x => x.slice(0, 5));
  const markets = list(canonical).flatMap(part => {
    const match = part.match(new RegExp(`^\\s*([A-Za-z .'-]+?),?\\s+(${states.join('|')})(?:\\s+(\\d{5}))?\\s*$`, 'i'));
    if (match) return [{ state: match[2].toUpperCase(), city: match[1].trim(), ...(match[3] ? { zips: [match[3]] } : {}) }];
    if (states.includes(part.toUpperCase())) return [{ state: part.toUpperCase() }];
    return (part.match(new RegExp(`\\b(${states.join('|')})\\b`, 'g')) || []).map(state => ({ state }));
  });
  if (markets.length === 1 && zips.length) markets[0].zips = unique(zips);
  return { states: unique([...foundStates, ...markets.map(m => m.state)]), zips: unique(zips), cities: unique(markets.map(m => m.city)), markets };
}
const money = text => {
  const match = String(text).trim().match(/^\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?$/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, '')) * (/^(m|million)$/i.test(match[2]) ? 1e6 : /^(k|thousand)$/i.test(match[2]) ? 1e3 : 1);
  return n > 0 && n <= 500000000 ? n : null;
};
export function parsePurchaseCriteria(text) {
  const raw = String(text ?? '');
  const result = { raw, purchaseMin: null, purchaseMax: null, allInMax: null, arv: null, formula: null, needsReview: false };
  if (!raw.trim()) return result;
  if (/%|\bARV\b|after repair/i.test(raw)) {
    const ratio = raw.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?ARV/i);
    if (ratio) result.formula = { text: raw, maxArvRatio: Number(ratio[1]) / 100, subtractRepairs: /(?:minus|less|-)\s*(?:the\s+)?repairs/i.test(raw) };
    else if (!/%/.test(raw)) result.arv = money(raw.replace(/ARV|after repair value|[:=]/gi, '').trim());
    result.needsReview = true;
    return result;
  }
  const allIn = /all[ -]?in|total project/i.test(raw);
  const value = raw.replace(/all[ -]?in(?: budget)?|total project(?: budget)?|purchase(?: price)?|budget|price|maximum|max(?:imum)?|minimum|min|under|up to|below|over|at least|from|[:=]/gi, '').trim();
  const range = value.split(/\s*[–—-]\s*|\s+to\s+/i);
  if (range.length === 2 && range.every(x => money(x) !== null)) {
    result.purchaseMin = money(range[0]); result.purchaseMax = money(range[1]);
    if (result.purchaseMin > result.purchaseMax) { result.purchaseMin = result.purchaseMax = null; result.needsReview = true; }
  } else if (money(value) !== null) {
    if (/\bover\b|at least|\bmin(?:imum)?\b/i.test(raw)) result.purchaseMin = money(value);
    else result.purchaseMax = money(value);
  } else result.needsReview = true;
  if (allIn) { result.allInMax = result.purchaseMax; result.purchaseMax = result.purchaseMin = null; }
  return result;
}
const assets = [['SFH', /\bsfh\b|single[ -]family/i], ['Multifamily', /multi[ -]?family|duplex|triplex|fourplex/i], ['Land', /\bland\b|vacant lots/i], ['Commercial', /\bcommercial\b/i], ['Mobile Home Park', /\bmhp\b|mobile home park/i], ['Industrial', /\bindustrial\b/i], ['Retail', /\bretail\b/i]];
const strategies = [['Fix & Flip', /fix\s*(?:&|and)?\s*flip|\bflips?\b/i], ['Buy & Hold', /buy\s*(?:&|and)?\s*hold/i], ['BRRRR', /\bbrrrr\b/i], ['Wholesale', /wholesale/i], ['Short-Term Rental', /short[ -]term rental|airbnb|\bstr\b/i], ['Section 8', /section\s*8/i], ['Subject To', /subject[ -]to/i], ['Seller Finance', /seller financ/i]];
export function parseBuyerRecord(raw, id = '') {
  const mapped = {};
  for (const [column, value] of Object.entries(raw)) {
    const destination = lookup.get(key(column));
    if (destination && String(value ?? '').trim()) (mapped[destination] ||= []).push(String(value));
  }
  const get = field => (mapped[field] || []).join('\n');
  const geography = parseGeography([get('markets'), get('areas'), get('cities'), get('states')].filter(Boolean).join('; '));
  const pricing = parsePurchaseCriteria(get('price'));
  const min = money(get('budgetMin')), max = money(get('budgetMax'));
  const criteriaText = [get('criteria'), get('assetTypes'), get('strategies')].join('\n');
  const positiveCriteria = criteriaText.split(/[;\n]/).filter(clause => !/\b(no|not|exclude|excluding)\b/i.test(clause)).join('\n');
  const assetTypes = unique([...list(get('assetTypes')), ...assets.filter(([, re]) => re.test(positiveCriteria)).map(([name]) => name)]);
  const strategyList = unique([...list(get('strategies')), ...strategies.filter(([, re]) => re.test(criteriaText)).map(([name]) => name)]);
  const review = [];
  if (pricing.needsReview) review.push('Price/formula requires review; not treated as purchase budget');
  if (get('buyingMandates')) review.push('Review original buying mandates before matching');
  if (get('claimedVerificationStatus')) review.push('Source verification is a claim, not verified status');
  if (get('claimedContactConsent')) review.push('Source consent needs independent verification');
  for (const field of ['name', 'company', 'phone', 'markets', 'criteria']) if (!get(field)) review.push(`${field}: absent in mapped source columns`);
  const row = {
    _id: id, _valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(get('email'))),
    importVersion: 2, name: get('name').trim(), email: normalizeEmail(get('email')), company: get('company').trim(), phone: get('phone'),
    type: get('type'), buyerType: get('type'), source: get('source') || 'CSV/TXT Import',
    markets: unique([...list(get('markets')), ...geography.states]), structuredMarkets: geography.markets,
    cities: geography.cities, states: geography.states, zipCodes: geography.zips, assetTypes, strategies: strategyList, strategy: strategyList.join('; '),
    bedRequirement: positiveCriteria.match(/\b(\d+)\+?\s*(?:beds?|bedrooms?)\b/i)?.[1] ? `${positiveCriteria.match(/\b(\d+)\+?\s*(?:beds?|bedrooms?)\b/i)[1]}+` : '',
    bathRequirement: positiveCriteria.match(/\b(\d+(?:\.5)?)\+?\s*(?:baths?|bathrooms?)\b/i)?.[1] ? `${positiveCriteria.match(/\b(\d+(?:\.5)?)\+?\s*(?:baths?|bathrooms?)\b/i)[1]}+` : '',
    budgetMin: min ?? pricing.purchaseMin, budgetMax: max ?? pricing.purchaseMax,
    purchaseCriteria: { ...pricing, allInMax: money(get('allInBudget')) ?? pricing.allInMax, arv: money(get('arv')) ?? pricing.arv },
    originalCriteria: get('criteria'), criteria: get('criteria'), notes: get('notes'), originalNotes: get('notes'),
    originalMandates: get('buyingMandates'), originalFields: { ...raw }, sourceRecords: [{ ...raw }],
    closingSpeed: get('closingSpeed'), claimedVerificationStatus: get('claimedVerificationStatus'), verificationEvidence: get('verificationEvidence'),
    contactPreference: get('contactPreference'), claimedContactConsent: get('claimedContactConsent'), lastContact: get('lastContact'),
    status: 'Inactive', verificationStatus: 'Unverified', blastEligible: false, distributionEligible: false, consentStatus: 'unknown',
    doNotEmail: /^(yes|true|1|suppressed|unsubscribed)\b/i.test(get('doNotEmail').trim()) || /do not (?:email|blast|contact)|suppressed|unsubscribed/i.test(get('claimedVerificationStatus')) || /^(no|denied|revoked|opted out)\b/i.test(get('claimedContactConsent').trim()),
    importDiagnostics: { columns: describeColumns(Object.keys(raw)), review, extracted: { ...geography, assetTypes, strategies: strategyList, pricing } },
    parserConfidence: { name: get('name') ? 'Parsed' : 'Missing', company: get('company') ? 'Parsed' : 'Missing', markets: geography.states.length || get('markets') ? 'Parsed' : 'Missing', budget: min || max || pricing.purchaseMax || pricing.purchaseMin ? 'Parsed' : 'Missing', assetTypes: assetTypes.length ? 'Parsed' : 'Missing', strategy: strategyList.length ? 'Parsed' : 'Missing', buyerType: get('type') ? 'Parsed' : 'Missing' },
  };
  row.buyingMandates = [{ markets: row.structuredMarkets, assetTypes, strategies: strategyList, purchaseMin: row.budgetMin, purchaseMax: row.budgetMax, purchaseCriteria: row.purchaseCriteria, originalCriteria: row.originalCriteria, originalMandates: row.originalMandates }];
  if (get('buyingMandates').includes('Mandate:')) {
    row.buyingMandates = get('buyingMandates').split(/\s*\|\|\s*/).map((text, index) => {
      const fields = {};
      const labels = [...text.matchAll(/(?:^|;\s*)(Mandate|Relationship \/ Mandate|Markets Raw|Property Criteria Raw|Price \/ Formula Raw|Financing \/ Occupancy|Details Needed):\s*/g)];
      labels.forEach((match, i) => { fields[match[1]] = text.slice(match.index + match[0].length, labels[i + 1]?.index ?? text.length); });
      const parsed = parseBuyerRecord({ Markets: fields['Markets Raw'], 'Property Criteria': fields['Property Criteria Raw'], 'Price / Formula': fields['Price / Formula Raw'], Strategy: fields['Financing / Occupancy'] }, `${id}-mandate-${index}`);
      return { ...parsed.buyingMandates[0], label: fields.Mandate || `Mandate ${index + 1}`, originalMandates: text, requiresReview: true };
    });
    // A multi-mandate contact has no single global price range.
    row.budgetMin = row.budgetMax = null;
  }
  return row;
}
// Keep distinct mandates and exact originals; never silently take the last contact row.
export function consolidateImportRows(rows, existing = []) {
  const contacts = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const previous = contacts.get(email);
    if (!email || !previous) { contacts.set(email || row._id, row); continue; }
    const conflicts = ['name', 'company', 'phone'].filter(field => previous[field] && row[field] && previous[field] !== row[field]);
    const merged = { ...previous };
    for (const field of ['name', 'company', 'phone']) if (!merged[field]) merged[field] = row[field];
    merged.sourceRecords = [...(previous.sourceRecords || []), ...(row.sourceRecords || [])];
    merged.buyingMandates = [...(previous.buyingMandates || []), ...(row.buyingMandates || [])];
    merged.doNotEmail = previous.doNotEmail || row.doNotEmail;
    merged.importDiagnostics = { ...previous.importDiagnostics, review: [...(previous.importDiagnostics?.review || []), 'Multiple source rows preserved as separate mandates', ...conflicts.map(field => `Conflicting ${field}: review source records`)] };
    contacts.set(email, merged);
  }
  const emails = new Set(existing.map(row => normalizeEmail(row.email)));
  const phones = new Set(existing.map(row => String(row.phone || '').replace(/\D/g, '')).filter(x => x.length >= 10));
  const phoneKey = value => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  };
  const normalizedPhones = new Set([...phones].map(phoneKey));
  const incomingPhones = new Map();
  for (const row of contacts.values()) {
    const phone = phoneKey(row.phone);
    if (phone.length >= 10) incomingPhones.set(phone, (incomingPhones.get(phone) || 0) + 1);
  }
  return [...contacts.values()].map(row => ({ ...row, _dup: emails.has(normalizeEmail(row.email)), _identityConflict: !emails.has(normalizeEmail(row.email)) && (normalizedPhones.has(phoneKey(row.phone)) || incomingPhones.get(phoneKey(row.phone)) > 1) }));
}
