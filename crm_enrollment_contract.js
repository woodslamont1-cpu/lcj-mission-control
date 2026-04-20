const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getInventorySnapshot, getInventoryRows, loadInventorySnapshot } = require('./crm_inventory_model');

const ENROLLMENT_FILE = path.join(__dirname, 'crm_enrollment_state.json');
const ENROLLMENT_EVENT_FILE = path.join(__dirname, 'crm_enrollment_events.jsonl');

const DEFAULT_STATE = {
  generated_at: null,
  total_contacts: 0,
  counts: {
    ready: 0,
    approved: 0,
    eligible_for_enrollment: 0,
    enrolled: 0,
    in_sequence: 0,
    paused: 0,
    exited: 0,
    held: 0,
    suppressed: 0,
    duplicate_blocked: 0,
    enrollment_failed: 0,
  },
  rows: [],
  refresh_status: 'stale',
};

function ensureFiles() {
  if (!fs.existsSync(ENROLLMENT_FILE)) fs.writeFileSync(ENROLLMENT_FILE, JSON.stringify(DEFAULT_STATE, null, 2) + '\n', 'utf8');
  if (!fs.existsSync(ENROLLMENT_EVENT_FILE)) fs.writeFileSync(ENROLLMENT_EVENT_FILE, '', 'utf8');
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
  fs.appendFileSync(ENROLLMENT_EVENT_FILE, `${JSON.stringify(event)}\n`, 'utf8');
}

function stableId(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 24);
}

function correlationIdFor(row) {
  return `crm-${row.external_ids?.ghl_contact_id || row.canonical_id}`;
}

function baseEnrollmentState(row) {
  if (row.state?.duplicate_state === 'likely_duplicate' || row.quality?.duplicate_risk) return 'duplicate_blocked';
  if (row.state?.suppression_state === 'suppressed' && row.state?.readiness_state === 'suppressed_hold') return 'suppressed';
  if (row.state?.readiness_state === 'suppressed_duplicate') return 'duplicate_blocked';
  if (row.state?.readiness_state === 'suppressed_hold') return 'held';
  if (row.state?.readiness_state !== 'ready_now') return 'held';
  return 'approved';
}

function buildWorkflowEntryContract(row) {
  const correlation_id = correlationIdFor(row);
  const approved_for_enrollment = row.enrollment?.approval_state === 'approved' && row.readiness_state === 'ready_now';
  const workflow_key = row.vertical === 'hvac' ? 'hvac_core_nurture' : 'core_nurture';
  return {
    correlation_id,
    workflow_key,
    source_type: row.source_type,
    source_lineage: row.source_lineage,
    readiness_state: row.state?.readiness_state || 'unknown',
    approval_state: row.enrollment?.approval_state || 'not_approved',
    enrollment_state: row.enrollment?.enrollment_state || baseEnrollmentState(row),
    region: row.contact?.region || '',
    vertical: row.contact?.vertical || '',
    contact_name: row.contact?.name || '',
    tags: [
      'hermes-source',
      `hermes-source-${row.source_type}`,
      row.contact?.region ? `hermes-region-${String(row.contact.region).toLowerCase()}` : '',
      row.contact?.vertical ? `hermes-vertical-${String(row.contact.vertical).toLowerCase()}` : '',
      row.state?.readiness_state === 'ready_now' ? 'ghl-ready-now' : '',
      approved_for_enrollment ? 'ghl-approved' : '',
      approved_for_enrollment ? 'ghl-eligible-for-enrollment' : '',
    ].filter(Boolean),
    custom_fields: {
      correlation_id,
      workflow_key,
      approval_status: row.enrollment?.approval_state || 'not_approved',
      readiness_state: row.state?.readiness_state || 'unknown',
      enrollment_state: row.enrollment?.enrollment_state || baseEnrollmentState(row),
      source_type: row.source_type,
      source_lineage: JSON.stringify(row.source_lineage || []),
      region: row.contact?.region || '',
      vertical: row.contact?.vertical || '',
      enrollment_key: row.enrollment?.enrollment_key || correlation_id,
    },
    stable_enrollment_key: stableId(`${correlation_id}:${row.state?.readiness_state || ''}:${row.source_type || ''}`),
  };
}

function deriveRow(row, enrollmentRecord) {
  const approval_state = enrollmentRecord?.approval_state || baseEnrollmentState(row);
  const enrollment_state = enrollmentRecord?.enrollment_state || (approval_state === 'approved' && row.state?.readiness_state === 'ready_now' ? 'eligible_for_enrollment' : approval_state);
  const eligible_for_enrollment = row.state?.readiness_state === 'ready_now' && approval_state === 'approved' && enrollment_state === 'eligible_for_enrollment';
  return {
    canonical_id: row.canonical_id,
    contact_name: row.contact?.name || '',
    source_type: row.source_type,
    source_lineage: row.source_lineage || [],
    readiness_state: row.state?.readiness_state || 'unknown',
    approval_state,
    enrollment_state,
    eligible_for_enrollment,
    correlation_id: correlationIdFor(row),
    enrollment_key: enrollmentRecord?.enrollment_key || correlationIdFor(row),
    region: row.contact?.region || '',
    vertical: row.contact?.vertical || '',
    last_outcome: row.state?.last_outcome || '',
    paused_reason: enrollmentRecord?.paused_reason || '',
    blocked_reason: enrollmentRecord?.blocked_reason || '',
    approved_at: enrollmentRecord?.approved_at || '',
    enrolled_at: enrollmentRecord?.enrolled_at || '',
    in_sequence: enrollment_state === 'in_sequence',
    paused: enrollment_state === 'paused',
    exited: enrollment_state === 'exited',
    held: enrollment_state === 'held',
    suppressed: enrollment_state === 'suppressed',
    duplicate_blocked: enrollment_state === 'duplicate_blocked',
    enrollment_failed: enrollment_state === 'enrollment_failed',
    enrollment: {
      approval_state,
      enrollment_state,
      enrolled_at: enrollmentRecord?.enrolled_at || '',
      approved_at: enrollmentRecord?.approved_at || '',
      enrollment_key: enrollmentRecord?.enrollment_key || correlationIdFor(row),
      blocked_reason: enrollmentRecord?.blocked_reason || '',
      paused_reason: enrollmentRecord?.paused_reason || '',
    },
    workflow_entry_contract: buildWorkflowEntryContract(row),
  };
}

function buildEnrollmentSnapshot() {
  const inventory = getInventorySnapshot();
  const store = loadEnrollmentState();
  const items = store.items || {};
  const rows = (inventory.rows || []).map(row => {
    const enrollmentState = items[row.canonical_id] || null;
    return deriveRow(row, enrollmentState);
  });
  const counts = rows.reduce((acc, row) => {
    acc.ready += row.readiness_state === 'ready_now' ? 1 : 0;
    acc.approved += row.approval_state === 'approved' ? 1 : 0;
    acc.eligible_for_enrollment += row.eligible_for_enrollment ? 1 : 0;
    acc.enrolled += row.enrollment_state === 'enrolled' ? 1 : 0;
    acc.in_sequence += row.in_sequence ? 1 : 0;
    acc.paused += row.paused ? 1 : 0;
    acc.exited += row.exited ? 1 : 0;
    acc.held += row.held ? 1 : 0;
    acc.suppressed += row.suppressed ? 1 : 0;
    acc.duplicate_blocked += row.duplicate_blocked ? 1 : 0;
    acc.enrollment_failed += row.enrollment_failed ? 1 : 0;
    return acc;
  }, { ready:0, approved:0, eligible_for_enrollment:0, enrolled:0, in_sequence:0, paused:0, exited:0, held:0, suppressed:0, duplicate_blocked:0, enrollment_failed:0 });
  const snapshot = {
    generated_at: new Date().toISOString(),
    total_contacts: rows.length,
    counts,
    rows,
    items: store.items || {},
    refresh_status: 'fresh',
  };
  writeJson(ENROLLMENT_FILE, snapshot);
  return snapshot;
}

function loadEnrollmentState() {
  ensureFiles();
  return readJson(ENROLLMENT_FILE, DEFAULT_STATE);
}

function getEnrollmentSnapshot() {
  const snapshot = loadEnrollmentState();
  if (!snapshot.rows || !snapshot.rows.length) return buildEnrollmentSnapshot();
  return snapshot;
}

function getEnrollmentByState(state) {
  const snap = getEnrollmentSnapshot();
  return (snap.rows || []).filter(row => row.enrollment_state === state || row.approval_state === state || row.readiness_state === state);
}

function approveForEnrollment(canonicalId, approvedBy = 'operator') {
  const snapshot = getEnrollmentSnapshot();
  const row = (snapshot.rows || []).find(item => String(item.canonical_id) === String(canonicalId));
  if (!row) throw new Error('Canonical contact not found');
  const store = readJson(ENROLLMENT_FILE, DEFAULT_STATE);
  store.items = store.items || {};
  const current = store.items[canonicalId] || {};
  const next = {
    ...current,
    approval_state: row.readiness_state === 'ready_now' ? 'approved' : 'blocked',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    blocked_reason: row.readiness_state === 'ready_now' ? '' : `readiness_state:${row.readiness_state}`,
    enrollment_state: row.readiness_state === 'ready_now' ? 'eligible_for_enrollment' : (row.readiness_state === 'suppressed_duplicate' ? 'duplicate_blocked' : row.readiness_state === 'suppressed_hold' ? 'held' : 'held'),
    enrollment_key: correlationIdFor(row),
  };
  store.items[canonicalId] = next;
  writeJson(ENROLLMENT_FILE, { ...store, items: store.items, rows: snapshot.rows, counts: snapshot.counts, generated_at: new Date().toISOString(), total_contacts: snapshot.total_contacts, refresh_status: 'fresh' });
  appendEvent({ type: 'approved', canonical_id: canonicalId, approved_by: approvedBy, at: next.approved_at });
  return buildEnrollmentSnapshot();
}

function enrollApproved(canonicalId, enrolledBy = 'operator') {
  const snapshot = getEnrollmentSnapshot();
  const row = (snapshot.rows || []).find(item => String(item.canonical_id) === String(canonicalId));
  if (!row) throw new Error('Canonical contact not found');
  const store = readJson(ENROLLMENT_FILE, DEFAULT_STATE);
  store.items = store.items || {};
  const current = store.items[canonicalId] || {};
  const currentApproval = current.approval_state || row.approval_state;
  if (currentApproval !== 'approved' || row.readiness_state !== 'ready_now') {
    throw new Error(`Enrollment blocked: readiness=${row.readiness_state}, approval=${currentApproval}`);
  }
  const enrollment_key = current.enrollment_key || correlationIdFor(row);
  if (current.enrollment_state === 'enrolled') return buildEnrollmentSnapshot();
  const next = {
    ...current,
    approval_state: 'approved',
    approved_by: current.approved_by || enrolledBy,
    approved_at: current.approved_at || new Date().toISOString(),
    enrollment_state: 'enrolled',
    enrolled_by: enrolledBy,
    enrolled_at: new Date().toISOString(),
    enrollment_key,
    paused_reason: '',
    blocked_reason: '',
  };
  store.items[canonicalId] = next;
  writeJson(ENROLLMENT_FILE, { ...store, items: store.items, rows: snapshot.rows, counts: snapshot.counts, generated_at: new Date().toISOString(), total_contacts: snapshot.total_contacts, refresh_status: 'fresh' });
  appendEvent({ type: 'enrolled', canonical_id: canonicalId, enrolled_by: enrolledBy, at: next.enrolled_at, enrollment_key });
  return buildEnrollmentSnapshot();
}

function buildLiveEnrollmentCounts() {
  const snapshot = getEnrollmentSnapshot();
  return snapshot.counts || DEFAULT_STATE.counts;
}

module.exports = {
  ENROLLMENT_FILE,
  ENROLLMENT_EVENT_FILE,
  buildEnrollmentSnapshot,
  getEnrollmentSnapshot,
  getEnrollmentByState,
  buildLiveEnrollmentCounts,
  approveForEnrollment,
  enrollApproved,
  buildWorkflowEntryContract,
  correlationIdFor,
};
