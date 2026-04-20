const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getEnrollmentSnapshot } = require('./crm_enrollment_contract');

const OUTCOME_FILE = path.join(__dirname, 'crm_outcome_state.json');
const OUTCOME_EVENT_FILE = path.join(__dirname, 'crm_outcome_events.jsonl');

const DEFAULT_STATE = {
  generated_at: null,
  total_contacts: 0,
  counts: {
    replied: 0,
    booked: 0,
    paid: 0,
    no_show: 0,
    rescheduled: 0,
    closed_lost: 0,
    outcome_failed: 0,
    revenue_amount: 0,
  },
  rows: [],
  revenue_by_source: {},
  revenue_by_region: {},
  revenue_by_vertical: {},
  conversion_path: {
    ready: 0,
    approved: 0,
    enrolled: 0,
    replied: 0,
    booked: 0,
    paid: 0,
  },
  refresh_status: 'stale',
};

function ensureFiles() {
  if (!fs.existsSync(OUTCOME_FILE)) fs.writeFileSync(OUTCOME_FILE, JSON.stringify(DEFAULT_STATE, null, 2) + '\n', 'utf8');
  if (!fs.existsSync(OUTCOME_EVENT_FILE)) fs.writeFileSync(OUTCOME_EVENT_FILE, '', 'utf8');
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
  fs.appendFileSync(OUTCOME_EVENT_FILE, `${JSON.stringify(event)}\n`, 'utf8');
}

function stableId(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 24);
}

function outcomeKey(row) {
  return row.enrollment?.enrollment_key || row.correlation_id || `crm-${row.canonical_id}`;
}

function baseOutcomeState(eventType) {
  const map = {
    replied: 'replied',
    booked: 'booked',
    paid: 'paid',
    no_show: 'no_show',
    rescheduled: 'rescheduled',
    closed_lost: 'closed_lost',
    outcome_failed: 'outcome_failed',
  };
  return map[eventType] || 'outcome_failed';
}

function loadOutcomeState() {
  ensureFiles();
  return readJson(OUTCOME_FILE, DEFAULT_STATE);
}

function normalizeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildOutcomeSnapshot() {
  const enrollment = getEnrollmentSnapshot();
  const rows = (enrollment.rows || []).map(row => {
    const event = (loadOutcomeState().items || {})[outcomeKey(row)] || null;
    const outcome_state = event?.outcome_state || row.last_outcome || 'none';
    const revenue_amount = normalizeAmount(event?.revenue_amount || 0);
    return {
      canonical_id: row.canonical_id,
      contact_name: row.contact_name,
      source_type: row.source_type,
      source_lineage: row.source_lineage,
      readiness_state: row.readiness_state,
      approval_state: row.approval_state,
      enrollment_state: row.enrollment_state,
      correlation_id: outcomeKey(row),
      workflow_key: row.workflow_entry_contract?.workflow_key || '',
      outcome_state,
      revenue_amount,
      region: row.region,
      vertical: row.vertical,
      last_outcome_at: event?.occurred_at || row.last_outcome_at || '',
      last_outcome: outcome_state,
      outcome_event: event || null,
    };
  });

  const counts = rows.reduce((acc, row) => {
    if (row.outcome_state === 'replied') acc.replied += 1;
    if (row.outcome_state === 'booked') acc.booked += 1;
    if (row.outcome_state === 'paid') acc.paid += 1;
    if (row.outcome_state === 'no_show') acc.no_show += 1;
    if (row.outcome_state === 'rescheduled') acc.rescheduled += 1;
    if (row.outcome_state === 'closed_lost') acc.closed_lost += 1;
    if (row.outcome_state === 'outcome_failed') acc.outcome_failed += 1;
    acc.revenue_amount += row.revenue_amount || 0;
    return acc;
  }, { replied:0, booked:0, paid:0, no_show:0, rescheduled:0, closed_lost:0, outcome_failed:0, revenue_amount:0 });

  const revenue_by_source = {};
  const revenue_by_region = {};
  const revenue_by_vertical = {};
  const conversion_path = { ready:0, approved:0, enrolled:0, replied:0, booked:0, paid:0 };
  for (const row of rows) {
    if (row.readiness_state === 'ready_now') conversion_path.ready += 1;
    if (row.approval_state === 'approved') conversion_path.approved += 1;
    if (row.enrollment_state === 'enrolled') conversion_path.enrolled += 1;
    if (row.outcome_state === 'replied') conversion_path.replied += 1;
    if (row.outcome_state === 'booked') conversion_path.booked += 1;
    if (row.outcome_state === 'paid') conversion_path.paid += 1;
    const src = row.source_type || 'unknown';
    const reg = row.region || 'unknown';
    const vert = row.vertical || 'unknown';
    revenue_by_source[src] = (revenue_by_source[src] || 0) + (row.revenue_amount || 0);
    revenue_by_region[reg] = (revenue_by_region[reg] || 0) + (row.revenue_amount || 0);
    revenue_by_vertical[vert] = (revenue_by_vertical[vert] || 0) + (row.revenue_amount || 0);
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    total_contacts: rows.length,
    counts,
    conversion_path,
    revenue_by_source,
    revenue_by_region,
    revenue_by_vertical,
    rows,
    items: loadOutcomeState().items || {},
    refresh_status: 'fresh',
  };
  writeJson(OUTCOME_FILE, snapshot);
  return snapshot;
}

function ingestOutcomeEvent(payload = {}) {
  const outcome_state = baseOutcomeState(payload.outcome_state || payload.event_type || payload.type || payload.status);
  const correlation_id = String(payload.correlation_id || payload.enrollment_key || payload.workflow_key || payload.contact_id || payload.id || '').trim();
  const key = correlation_id || stableId(JSON.stringify(payload));
  const current = loadOutcomeState();
  current.items = current.items || {};
  const now = new Date().toISOString();
  const next = {
    correlation_id: key,
    outcome_state,
    revenue_amount: normalizeAmount(payload.revenue_amount || payload.amount || 0),
    revenue_source: payload.revenue_source || payload.source_type || payload.source || 'unknown',
    region: payload.region || '',
    vertical: payload.vertical || '',
    workflow_key: payload.workflow_key || '',
    source_type: payload.source_type || 'unknown',
    source_lineage: payload.source_lineage || [],
    occurred_at: payload.occurred_at || payload.timestamp || now,
    received_at: now,
    metadata: payload.metadata || {},
    outcome_failed: outcome_state === 'outcome_failed',
  };
  current.items[key] = next;
  writeJson(OUTCOME_FILE, { ...current, items: current.items, generated_at: now, refresh_status: 'fresh' });
  appendEvent({ type: outcome_state, correlation_id: key, at: now, payload });
  return buildOutcomeSnapshot();
}

function getOutcomeSnapshot() {
  return buildOutcomeSnapshot();
}

function getOutcomeByState(state) {
  const snap = buildOutcomeSnapshot();
  return (snap.rows || []).filter(row => row.outcome_state === state);
}

module.exports = {
  OUTCOME_FILE,
  OUTCOME_EVENT_FILE,
  buildOutcomeSnapshot,
  getOutcomeSnapshot,
  getOutcomeByState,
  ingestOutcomeEvent,
  loadOutcomeState,
  outcomeKey,
};
