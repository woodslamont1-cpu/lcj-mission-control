const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REVIEW_FILE = path.join(__dirname, 'review_decisions.json');

const DEFAULT_STORE = {
  items: {},
  history: []
};

function ensureStore() {
  if (!fs.existsSync(REVIEW_FILE)) {
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(DEFAULT_STORE, null, 2) + '\n', 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(REVIEW_FILE, 'utf8');
    if (!raw.trim()) return { ...DEFAULT_STORE };
    const parsed = JSON.parse(raw);
    return {
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

function writeStore(store) {
  fs.writeFileSync(REVIEW_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function stableId(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 20);
}

function normalizeId(item) {
  return String(item?.id || item?.task_id || item?.review_id || stableId(JSON.stringify(item || {})));
}

function summarizeBaseItem(baseItem = {}) {
  return {
    id: normalizeId(baseItem),
    title: baseItem.title || baseItem.name || baseItem.task_type || baseItem.automation_job_name || 'Review item',
    reason: baseItem.reason || baseItem.required_approval || baseItem.description || baseItem.summary || 'Review required',
    details: baseItem.details || baseItem.notes || baseItem.message || '',
    task_type: baseItem.task_type || baseItem.class || baseItem.category || 'unknown',
    source: baseItem.source || 'pending-review',
    source_id: baseItem.source_id || baseItem.id || null,
    raw: baseItem,
  };
}

function currentDecision(record = {}) {
  return {
    status: record.status || 'pending',
    reviewed_by: record.reviewed_by || '',
    reviewed_at: record.reviewed_at || '',
    note: record.note || '',
    notes: Array.isArray(record.notes) ? record.notes : [],
    decision_history: Array.isArray(record.decision_history) ? record.decision_history : [],
  };
}

function mergeReviewItem(baseItem = {}, store = readStore()) {
  const normalized = summarizeBaseItem(baseItem);
  const record = store.items[normalized.id] || {};
  const decision = currentDecision(record);
  return {
    ...normalized,
    review_status: decision.status,
    reviewed_by: decision.reviewed_by,
    reviewed_at: decision.reviewed_at,
    review_note: decision.note,
    review_notes: decision.notes,
    decision_history: decision.decision_history,
    is_pending: decision.status === 'pending',
    is_reviewed: decision.status !== 'pending',
    is_approved: decision.status === 'approved',
    is_changes_requested: decision.status === 'changes_requested',
    is_rejected: decision.status === 'rejected',
  };
}

function mergeReviewItems(baseItems = []) {
  const store = readStore();
  return baseItems.map(item => mergeReviewItem(item, store));
}

function getReviewItem(baseItem = {}, store = readStore()) {
  return mergeReviewItem(baseItem, store);
}

function recordReviewDecision(baseItem = {}, action, note = '', reviewedBy = 'operator') {
  const store = readStore();
  const normalized = summarizeBaseItem(baseItem);
  const previous = store.items[normalized.id] || { notes: [], decision_history: [] };
  const statusMap = {
    approve: 'approved',
    'request-changes': 'changes_requested',
    reject: 'rejected',
    note: previous.status || 'pending'
  };
  const status = statusMap[action] || action || 'pending';
  const now = new Date().toISOString();
  const historyEntry = {
    id: `review-action-${Date.now()}`,
    action,
    note: String(note || '').trim(),
    reviewed_by: reviewedBy,
    reviewed_at: now,
    status,
    source_item: normalized,
  };

  const nextRecord = {
    ...normalized,
    status,
    reviewed_by: reviewedBy,
    reviewed_at: now,
    note: String(note || '').trim(),
    notes: [...(previous.notes || []), ...(note ? [String(note).trim()] : [])],
    decision_history: [...(previous.decision_history || []), historyEntry],
  };

  store.items[normalized.id] = nextRecord;
  store.history.push(historyEntry);
  writeStore({ items: store.items, history: store.history.slice(-500) });

  return {
    item: nextRecord,
    historyEntry,
  };
}

function getDecisionHistory(limit = 50) {
  const store = readStore();
  return store.history.slice(-Math.max(1, Number(limit) || 50)).reverse();
}

function resetReviewItemState(baseItem = {}) {
  const store = readStore();
  const normalized = summarizeBaseItem(baseItem);
  const existing = store.items[normalized.id] || {};
  const resetRecord = {
    ...normalized,
    status: 'pending',
    reviewed_by: '',
    reviewed_at: '',
    note: '',
    notes: [],
    decision_history: Array.isArray(existing.decision_history) ? existing.decision_history : [],
  };
  store.items[normalized.id] = resetRecord;
  writeStore({ items: store.items, history: store.history.slice(-500) });
  return resetRecord;
}

module.exports = {
  REVIEW_FILE,
  mergeReviewItems,
  mergeReviewItem,
  getReviewItem,
  recordReviewDecision,
  getDecisionHistory,
  resetReviewItemState,
};
