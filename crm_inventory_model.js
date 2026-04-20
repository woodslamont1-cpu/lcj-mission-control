const fs = require('fs');
const path = require('path');
const https = require('https');
const subprocess = require('child_process');
const crypto = require('crypto');

const INVENTORY_FILE = path.join(__dirname, 'crm_inventory_state.json');
const EVENT_FILE = path.join(__dirname, 'crm_inventory_events.jsonl');

const DEFAULT_INVENTORY = {
  generated_at: null,
  source_system: 'gohighlevel',
  total_contacts: 0,
  counts: {},
  buckets: {},
  rows: [],
  source_split: { existing_ghl_inventory: 0, hermes_discovery: 0 },
  refresh_status: 'stale',
};

function ensureFiles() {
  if (!fs.existsSync(INVENTORY_FILE)) {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(DEFAULT_INVENTORY, null, 2) + '\n', 'utf8');
  }
  if (!fs.existsSync(EVENT_FILE)) {
    fs.writeFileSync(EVENT_FILE, '', 'utf8');
  }
}

function readJson(filePath, fallback) {
  ensureFiles();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendEvent(event) {
  ensureFiles();
  fs.appendFileSync(EVENT_FILE, `${JSON.stringify(event)}\n`, 'utf8');
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9+]/g, '');
  if (!digits) return '';
  return digits;
}

function normalizeUrl(url) {
  let v = String(url || '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return v.toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function listToText(values) {
  return (values || []).map(v => String(v).trim()).filter(Boolean).join(', ');
}

function getFieldValue(contact, keyNames = []) {
  const fields = Array.isArray(contact.customFields) ? contact.customFields : [];
  for (const keyName of keyNames) {
    const key = String(keyName).toLowerCase();
    const field = fields.find(item => {
      const label = String(item.name || item.label || item.fieldName || item.key || '').toLowerCase();
      return label === key || label.includes(key);
    });
    if (field) return field.value ?? field.text ?? field.rawValue ?? '';
  }
  return '';
}

function getContactName(contact) {
  return String(contact.contactName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.companyName || contact.email || contact.phone || 'Unknown').trim();
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferRegion(contact) {
  return String(contact.state || getFieldValue(contact, ['state', 'region']) || '').trim().toUpperCase();
}

function inferVertical(contact) {
  const tags = (contact.tags || []).map(t => String(t).toLowerCase());
  const text = [contact.contactName, contact.companyName, contact.website, contact.email, listToText(tags)].join(' ').toLowerCase();
  const verticals = ['hvac', 'roofing', 'plumbing', 'electrical', 'landscaping', 'pest control', 'cleaning', 'legal', 'dental', 'chiropractor', 'auto repair', 'accounting'];
  return verticals.find(v => text.includes(v)) || 'unknown';
}

function inferReadiness(contact, derived) {
  if (derived.duplicate_risk) return 'suppressed_duplicate';
  if (contact.dnd) return 'suppressed_hold';
  if (!derived.has_email && !derived.has_phone) return 'suppressed_hold';
  return 'ready_now';
}

function inferOpportunityBucket(derived) {
  if (!derived.has_website) return 'no_website';
  if (!derived.has_email && derived.has_phone) return 'no_email';
  if (!derived.has_phone && derived.has_email) return 'no_phone';
  if (!derived.has_email && !derived.has_phone) return 'no_contact_method';
  return '';
}

function sourceLineageFor(contact, discovered = false) {
  const lineage = [];
  lineage.push({
    type: discovered ? 'hermes_discovery' : 'existing_ghl_inventory',
    at: contact.dateAdded || contact.dateUpdated || new Date().toISOString(),
    note: discovered ? 'discovered by Hermes' : 'existing GHL contact inventory'
  });
  if (contact.email || contact.phone || contact.website) {
    lineage.push({
      type: 'inventory_import',
      at: contact.dateUpdated || contact.dateAdded || new Date().toISOString(),
      note: 'backfilled from GHL contacts'
    });
  }
  return lineage;
}

function dedupeKey(contact) {
  return [normalizeEmail(contact.email), normalizePhone(contact.phone), normalizeUrl(contact.website), normalizeEmail(getFieldValue(contact, ['website'])), normalizeEmail(contact.contactName || '')].filter(Boolean).join('|');
}

function deriveContactRow(contact, index, discovered = false) {
  const emails = [contact.email, ...(contact.additionalEmails || [])].map(normalizeEmail).filter(Boolean);
  const has_email = emails.length > 0;
  const has_website = Boolean(normalizeUrl(contact.website));
  const has_phone = Boolean(normalizePhone(contact.phone));
  const has_mobile = has_phone;
  const has_landline = false;
  const duplicate_risk = false;
  const no_contact_method = !has_email && !has_phone;
  const opportunity_bucket = inferOpportunityBucket({ has_email, has_website, has_phone });
  const readiness_state = inferReadiness(contact, { has_email, has_website, has_phone, duplicate_risk });
  const enrollment_state = readiness_state === 'ready_now' ? 'eligible' : readiness_state === 'suppressed_duplicate' ? 'suppressed' : 'held';
  const source_type = discovered ? 'hermes_scrape' : 'existing_ghl_inventory';
  const vertical = inferVertical(contact);
  const region = inferRegion(contact);
  const current_tags = Array.isArray(contact.tags) ? contact.tags : [];
  return {
    canonical_id: contact.id,
    external_ids: { ghl_contact_id: contact.id },
    source_type,
    source_lineage: sourceLineageFor(contact, discovered),
    source_split: source_type,
    contact: {
      name: getContactName(contact),
      first_name: contact.firstName || '',
      last_name: contact.lastName || '',
      company_name: contact.companyName || '',
      email: contact.email || '',
      additional_emails: contact.additionalEmails || [],
      phone: contact.phone || '',
      website: contact.website || '',
      city: contact.city || '',
      state: contact.state || '',
      region,
      vertical,
      tags: current_tags,
    },
    quality: {
      has_email,
      has_website,
      has_mobile,
      has_landline,
      missing_email: !has_email,
      missing_website: !has_website,
      missing_phone: !has_phone,
      no_contact_method,
      duplicate_risk,
      enrichment_needed: readiness_state === 'needs_enrichment',
      no_website_opportunity: opportunity_bucket === 'no_website',
      opportunity_bucket,
    },
    state: {
      readiness_state,
      enrollment_state,
      workflow_state: 'not_enrolled',
      outcome_state: 'none',
      revenue_amount: 0,
      reviewed_by: '',
      reviewed_at: '',
      approved_by: '',
      approved_at: '',
      held_reason: '',
      last_outcome_at: '',
      last_outcome: '',
      last_enrolled_at: '',
      last_seen_at: contact.dateUpdated || contact.dateAdded || '',
      freshness_seconds: 0,
      duplicate_state: duplicate_risk ? 'likely_duplicate' : 'clear',
      suppression_state: readiness_state.startsWith('suppressed') ? 'suppressed' : 'active',
      source_lineage_state: source_type,
    },
    opportunity: {
      no_website_bucket: opportunity_bucket === 'no_website',
      no_email_bucket: opportunity_bucket === 'no_email',
      no_phone_bucket: opportunity_bucket === 'no_phone',
      no_contact_method_bucket: opportunity_bucket === 'no_contact_method',
      future_offer_active: opportunity_bucket === 'no_website',
      mockup_generated: false,
      website_offer_active: false,
      approved_for_outreach: readiness_state === 'ready_now'
    },
    metrics: {
      outreach_ready: readiness_state === 'ready_now',
      enrichment_first: readiness_state === 'needs_enrichment',
      suppressed: readiness_state.startsWith('suppressed'),
      duplicate: duplicate_risk,
      opportunity_bucket
    },
    lineage_key: dedupeKey(contact),
    source_index: index,
    raw: contact
  };
}

function buildBucketCounts(rows) {
  const counts = {
    total_contacts: rows.length,
    ready_now: 0,
    needs_enrichment: 0,
    suppressed_duplicate: 0,
    suppressed_hold: 0,
    opportunity_buckets: 0,
    existing_ghl_inventory: 0,
    hermes_discovery: 0,
    missing_email: 0,
    missing_website: 0,
    missing_phone: 0,
    no_contact_method: 0,
    duplicate_risk: 0,
    outreach_ready: 0,
    enrichment_needed: 0,
    no_website_opportunity: 0,
    no_email_opportunity: 0,
    no_phone_opportunity: 0,
  };
  for (const row of rows) {
    const q = row.quality;
    const s = row.state;
    counts[row.source_type] = (counts[row.source_type] || 0) + 1;
    if (s.readiness_state === 'ready_now') counts.ready_now += 1;
    if (q.enrichment_needed) counts.needs_enrichment += 1;
    if (s.readiness_state === 'suppressed_duplicate') counts.suppressed_duplicate += 1;
    if (s.readiness_state === 'suppressed_hold') counts.suppressed_hold += 1;
    if (q.opportunity_bucket) counts.opportunity_buckets += 1;
    if (q.missing_email) counts.missing_email += 1;
    if (q.missing_website) counts.missing_website += 1;
    if (q.missing_phone) counts.missing_phone += 1;
    if (q.no_contact_method) counts.no_contact_method += 1;
    if (q.duplicate_risk) counts.duplicate_risk += 1;
    if (q.has_email || q.has_phone) counts.outreach_ready += 1;
    if (q.enrichment_needed) counts.enrichment_needed += 1;
    if (q.no_website_opportunity) counts.no_website_opportunity += 1;
    if (q.opportunity_bucket === 'no_email') counts.no_email_opportunity += 1;
    if (q.opportunity_bucket === 'no_phone') counts.no_phone_opportunity += 1;
  }
  return counts;
}

function groupRows(rows) {
  const buckets = {
    ready_now: [],
    needs_enrichment: [],
    suppressed_duplicate: [],
    suppressed_hold: [],
    no_website: [],
    no_email: [],
    no_phone: [],
    no_contact_method: [],
    existing_ghl_inventory: [],
    hermes_discovery: []
  };
  for (const row of rows) {
    const key = row.state.readiness_state;
    if (key === 'ready_now') buckets.ready_now.push(row);
    else if (key === 'needs_enrichment') buckets.needs_enrichment.push(row);
    else if (key === 'suppressed_duplicate') buckets.suppressed_duplicate.push(row);
    else if (key === 'suppressed_hold') buckets.suppressed_hold.push(row);
    if (row.quality.opportunity_bucket === 'no_website') buckets.no_website.push(row);
    if (row.quality.opportunity_bucket === 'no_email') buckets.no_email.push(row);
    if (row.quality.opportunity_bucket === 'no_phone') buckets.no_phone.push(row);
    if (row.quality.opportunity_bucket === 'no_contact_method') buckets.no_contact_method.push(row);
    buckets[row.source_type].push(row);
  }
  return buckets;
}

function discoverFromHermes() {
  return [];
}

async function fetchAllContacts() {
  const getKey = service => {
    const result = subprocess.spawnSync('security', ['find-generic-password', '-a', 'LCJ Elite Consulting', '-s', service, '-w'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`missing keychain service ${service}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const api = getKey('LCJ.GHL.SubAccount.API');
  const locationId = getKey('LCJ.GHL.SubAccount.ID');
  const headers = {
    Authorization: `Bearer ${api}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28'
  };
  const base = 'https://services.leadconnectorhq.com/contacts/';
  const contacts = [];
  let page = 1;
  while (true) {
    const url = new URL(base);
    url.searchParams.set('locationId', locationId);
    url.searchParams.set('limit', '100');
    url.searchParams.set('page', String(page));
    const data = await new Promise((resolve, reject) => {
      const req = https.request(url, { method: 'GET', headers }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    contacts.push(...(data.contacts || []));
    if (!data.meta || !data.meta.nextPage) break;
    page = data.meta.nextPage;
    if (page > 20) break;
  }
  return contacts;
}

async function buildInventorySnapshot() {
  const ghlContacts = await fetchAllContacts();
  const hermesContacts = discoverFromHermes();
  const baseRows = [
    ...ghlContacts.map((c, idx) => deriveContactRow(c, idx, false)),
    ...hermesContacts.map((c, idx) => deriveContactRow(c, ghlContacts.length + idx, true)),
  ];

  const duplicateGroups = new Map();
  for (const row of baseRows) {
    const contact = row.raw || {};
    const key = normalizeName(contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`);
    if (!key) continue;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(row.canonical_id);
  }

  const duplicateIds = new Set();
  for (const ids of duplicateGroups.values()) {
    if (ids.length > 1) ids.forEach(id => duplicateIds.add(id));
  }

  const rows = baseRows.map(row => {
    const duplicate_risk = duplicateIds.has(row.canonical_id);
    const quality = { ...row.quality, duplicate_risk };
    quality.no_contact_method = !quality.has_email && !quality.has_phone;
    quality.enrichment_needed = !quality.has_email || !quality.has_website || !quality.has_phone;
    quality.no_website_opportunity = !quality.has_website;
    quality.opportunity_bucket = inferOpportunityBucket(quality);
    const readiness_state = inferReadiness(row.raw || {}, quality);
    const state = {
      ...row.state,
      readiness_state,
      enrollment_state: readiness_state === 'ready_now' ? 'eligible' : readiness_state.startsWith('suppressed') ? 'suppressed' : 'held',
      duplicate_state: duplicate_risk ? 'likely_duplicate' : 'clear',
      suppression_state: readiness_state.startsWith('suppressed') ? 'suppressed' : 'active',
    };
    const metrics = {
      ...row.metrics,
      outreach_ready: readiness_state === 'ready_now',
      enrichment_first: readiness_state === 'needs_enrichment',
      suppressed: readiness_state.startsWith('suppressed'),
      duplicate: duplicate_risk,
      opportunity_bucket: quality.opportunity_bucket,
    };
    return { ...row, quality, state, metrics };
  });

  const counts = buildBucketCounts(rows);
  const buckets = groupRows(rows);
  const snapshot = {
    generated_at: new Date().toISOString(),
    source_system: 'gohighlevel',
    total_contacts: rows.length,
    counts,
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.map(r => r.canonical_id)])),
    rows,
    source_split: {
      existing_ghl_inventory: ghlContacts.length,
      hermes_discovery: hermesContacts.length,
    },
    refresh_status: 'fresh',
  };
  writeJson(INVENTORY_FILE, snapshot);
  appendEvent({ type: 'inventory_backfill', at: snapshot.generated_at, total: rows.length, existing_ghl_inventory: ghlContacts.length, hermes_discovery: hermesContacts.length });
  return snapshot;
}

function loadInventorySnapshot() {
  ensureFiles();
  return readJson(INVENTORY_FILE, DEFAULT_INVENTORY);
}

function getInventorySnapshot() {
  const snapshot = loadInventorySnapshot();
  return snapshot && snapshot.rows && snapshot.rows.length ? snapshot : DEFAULT_INVENTORY;
}

function getInventoryRows() {
  return getInventorySnapshot().rows || [];
}

function getInventorySummary() {
  const snap = getInventorySnapshot();
  return {
    generated_at: snap.generated_at,
    source_system: snap.source_system,
    total_contacts: snap.total_contacts || 0,
    counts: snap.counts || {},
    source_split: snap.source_split || { existing_ghl_inventory: 0, hermes_discovery: 0 },
    refresh_status: snap.refresh_status || 'stale'
  };
}

function getInventoryByBucket(bucket) {
  const snap = getInventorySnapshot();
  const ids = (snap.buckets && snap.buckets[bucket]) || [];
  const rows = snap.rows || [];
  return rows.filter(row => ids.includes(row.canonical_id));
}

module.exports = {
  INVENTORY_FILE,
  EVENT_FILE,
  buildInventorySnapshot,
  loadInventorySnapshot,
  getInventorySnapshot,
  getInventoryRows,
  getInventorySummary,
  getInventoryByBucket,
  appendEvent,
};
