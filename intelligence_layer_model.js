const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getInventorySnapshot } = require('./crm_inventory_model');
const { getEnrollmentSnapshot } = require('./crm_enrollment_contract');
const { getOutcomeSnapshot } = require('./crm_outcome_model');

const INTELLIGENCE_FILE = path.join(__dirname, 'intelligence_layer_state.json');
const INTELLIGENCE_EVENT_FILE = path.join(__dirname, 'intelligence_layer_events.jsonl');

const DEFAULT_STATE = {
  engine_name: 'System / GoHighLevel Content Engine / Intelligence',
  source: 'fallback-state-file',
  source_mode: 'fallback',
  last_updated: new Date().toISOString(),
  refresh_status: 'fresh',
  research: { total: 0, fresh: 0, stale: 0 },
  scoring: { total: 0, approved: 0, hold: 0 },
  normalization: { normalized: 0, deduped: 0 },
  simulation: { total: 0, advisory: 0 },
  decision: { approved: 0, hold: 0, review: 0 },
  execution: { ready: 0, blocked: 0 },
  outcomes: { replied: 0, booked: 0, paid: 0, revenue_amount: 0 },
  experiments: { hvac_pilot: 0, control: 0, variant: 0 },
  rows: []
};

function ensureFiles() {
  if (!fs.existsSync(INTELLIGENCE_FILE)) fs.writeFileSync(INTELLIGENCE_FILE, JSON.stringify(DEFAULT_STATE, null, 2) + '\n', 'utf8');
  if (!fs.existsSync(INTELLIGENCE_EVENT_FILE)) fs.writeFileSync(INTELLIGENCE_EVENT_FILE, '', 'utf8');
}

function readJson(filePath, fallbackValue) {
  ensureFiles();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallbackValue;
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendEvent(payload) {
  fs.appendFileSync(INTELLIGENCE_EVENT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
}

function stableHash(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function latestLineageAt(lineage = [], fallback = '') {
  const dates = (Array.isArray(lineage) ? lineage : []).map(item => item?.at).filter(Boolean).sort();
  return dates[dates.length - 1] || fallback || new Date().toISOString();
}

function computeScore(row) {
  let score = 20;
  if (row.readiness_state === 'ready_now') score += 25;
  if (row.approval_state === 'approved') score += 20;
  if (row.enrollment_state === 'enrolled') score += 10;
  if (row.outcome_state === 'replied') score += 8;
  if (row.outcome_state === 'booked') score += 12;
  if (row.outcome_state === 'paid') score += 20;
  if (row.revenue_amount > 0) score += 10;
  if ((row.source_lineage || []).length > 1) score += 5;
  return Math.max(0, Math.min(100, score));
}

function computeSimulation(score, row) {
  const baseReply = Math.max(0.05, Math.min(0.45, 0.08 + score / 300));
  const baseBooked = Math.max(0.02, Math.min(0.25, 0.04 + score / 420));
  const basePaid = Math.max(0.01, Math.min(0.18, 0.02 + score / 520));
  const expectedRevenue = row.revenue_amount > 0 ? row.revenue_amount : Math.round(score * 18);
  return {
    status: 'advisory',
    scenario_id: `hvac-${stableHash(`${row.correlation_id}:${row.workflow_key}`)}`.slice(0, 24),
    variant_id: row.vertical === 'hvac' ? 'control' : 'advisory',
    predicted_reply_rate: Number(baseReply.toFixed(3)),
    predicted_book_rate: Number(baseBooked.toFixed(3)),
    predicted_paid_rate: Number(basePaid.toFixed(3)),
    expected_revenue: expectedRevenue,
    lift_estimate: Number(((basePaid - 0.03) * 100).toFixed(2)),
    confidence_interval: [Number((basePaid * 0.85).toFixed(3)), Number((basePaid * 1.15).toFixed(3))],
    risk_band: score >= 75 ? 'low' : score >= 55 ? 'medium' : 'high',
    assumptions: ['bounded HVAC only', 'single-variant experiment', 'Hermes approval required'],
  };
}

function buildIntelligenceRow(row, idx) {
  const score = computeScore(row);
  const approved = row.vertical === 'hvac' && row.readiness_state === 'ready_now' && row.approval_state === 'approved';
  const researchFreshnessAt = latestLineageAt(row.source_lineage, row.last_outcome_at);
  const research = {
    status: 'ingested',
    last_run_at: researchFreshnessAt,
    freshness_at: researchFreshnessAt,
    sources: row.source_lineage || [],
    findings: [
      `Source type: ${row.source_type || 'unknown'}`,
      `Segment: ${row.vertical || 'unknown'}`,
      `Region: ${row.region || 'unknown'}`,
    ],
    hypotheses: row.vertical === 'hvac' ? ['HVAC urgency-first reply path', 'Short-form booking CTA'] : ['General enrichment only'],
    coverage_score: row.source_lineage?.length ? 0.9 : 0.5,
    confidence: row.source_lineage?.length ? 0.84 : 0.6,
  };
  const scoring = {
    status: 'scored',
    rubric_version: 'hvac-v1',
    score,
    subscores: {
      readiness: row.readiness_state === 'ready_now' ? 30 : 10,
      approval: row.approval_state === 'approved' ? 25 : 0,
      outcome: row.outcome_state === 'paid' ? 25 : row.outcome_state === 'booked' ? 15 : row.outcome_state === 'replied' ? 8 : 0,
      revenue: row.revenue_amount > 0 ? 20 : 0,
    },
    reason_codes: [row.readiness_state, row.approval_state, row.outcome_state].filter(Boolean),
    threshold_passed: score >= 70,
    rank: idx + 1,
    segment_fit: row.vertical === 'hvac' ? 'hvac-first' : 'general',
  };
  const normalization = {
    identity_confidence: row.source_type === 'existing_ghl_inventory' ? 0.92 : 0.78,
    dedupe_status: row.readiness_state?.startsWith('suppressed') ? 'suppressed' : 'clean',
    dedupe_reason: row.readiness_state?.startsWith('suppressed') ? row.readiness_state : '',
    segment_tags: [row.vertical || 'unknown', row.region || 'unknown', row.source_type || 'unknown'].filter(Boolean),
    region_normalized: row.region || 'unknown',
    vertical_normalized: row.vertical || 'unknown',
    workflow_key_normalized: row.workflow_key || '',
    source_lineage: row.source_lineage || [],
    normalization_state: 'normalized',
  };
  const simulation = computeSimulation(score, row);
  const decision = {
    status: approved ? 'approved' : 'hold',
    route: approved ? 'bounded_hvac_pilot' : 'advisory_only',
    reason: approved ? 'eligible for bounded HVAC pilot' : 'needs advisory review',
    policy_version: 'hvac-safe-first-v1',
    approval_state: approved ? 'approved' : 'pending',
    approved_by: approved ? 'Hermes' : '',
    approved_at: approved ? new Date().toISOString() : '',
    rollout_state: approved ? 'bounded-pilot' : 'advisory',
    experiment_group: row.vertical === 'hvac' ? (approved ? 'control' : 'hold') : 'advisory',
    guardrail_state: approved ? 'clear' : 'hold',
    kill_switch_state: 'armed',
  };
  const execution = {
    status: approved ? 'ready' : 'blocked',
    workflow_name: row.workflow_key || '',
    workflow_id: row.workflow_key || '',
    webhook_url: '/api/system/go-high-level-content-engine/webhook',
    last_triggered_at: row.last_outcome_at || '',
    delivery_status: approved ? 'not_triggered' : 'blocked',
    delivery_attempts: 0,
    delivery_error: '',
    sent_at: '',
    request_id: '',
  };
  const outcomes = {
    outcome_state: row.outcome_state,
    last_outcome_at: row.last_outcome_at,
    last_outcome_type: row.outcome_state,
    revenue_amount: row.revenue_amount || 0,
    revenue_source: row.outcome_event?.revenue_source || row.source_type || 'unknown',
  };
  const experiment = {
    id: `hvac-${stableHash(row.correlation_id || row.canonical_id)}`.slice(0, 20),
    name: 'HVAC bounded pilot',
    status: approved ? 'shadow' : 'advisory',
    cohort: row.vertical === 'hvac' ? 'hvac' : 'non-hvac',
    control_group: 'current_workflow',
    variant_group: 'single_variant_a',
    allocation_pct: row.vertical === 'hvac' && approved ? 10 : 0,
    start_at: approved ? new Date().toISOString() : '',
    end_at: '',
    stop_reason: '',
    promotion_state: 'not_promoted',
    rollback_state: 'armed',
    winner_variant: '',
    lift_summary: simulation.lift_estimate,
  };
  return {
    canonical_id: row.canonical_id,
    contact_name: row.contact_name,
    correlation_id: row.correlation_id,
    source_type: row.source_type,
    source_lineage: row.source_lineage,
    readiness_state: row.readiness_state,
    enrollment_state: row.enrollment_state,
    outcome_state: row.outcome_state,
    revenue_amount: row.revenue_amount || 0,
    region: row.region,
    vertical: row.vertical,
    workflow_key: row.workflow_key,
    last_outcome_at: row.last_outcome_at,
    research,
    scoring,
    normalization,
    simulation,
    decision,
    execution,
    outcomes,
    experiment,
  };
}

function buildIntelligenceSnapshot() {
  const inventory = getInventorySnapshot();
  const enrollment = getEnrollmentSnapshot();
  const outcome = getOutcomeSnapshot();
  const rows = (outcome.rows || []).map(buildIntelligenceRow).sort((a, b) => b.scoring.score - a.scoring.score);
  const summary = rows.reduce((acc, row) => {
    acc.research.total += 1;
    if (row.research.confidence >= 0.7) acc.research.fresh += 1;
    else acc.research.stale += 1;
    acc.scoring.total += 1;
    if (row.decision.status === 'approved') acc.scoring.approved += 1;
    else acc.scoring.hold += 1;
    acc.normalization.normalized += 1;
    acc.normalization.deduped += row.normalization.dedupe_status === 'suppressed' ? 1 : 0;
    acc.simulation.total += 1;
    acc.simulation.advisory += 1;
    acc.decision.approved += row.decision.status === 'approved' ? 1 : 0;
    acc.decision.hold += row.decision.status === 'hold' ? 1 : 0;
    acc.decision.review += row.decision.status === 'hold' ? 1 : 0;
    acc.execution.ready += row.execution.status === 'ready' ? 1 : 0;
    acc.execution.blocked += row.execution.status === 'blocked' ? 1 : 0;
    acc.outcomes.replied += row.outcomes.outcome_state === 'replied' ? 1 : 0;
    acc.outcomes.booked += row.outcomes.outcome_state === 'booked' ? 1 : 0;
    acc.outcomes.paid += row.outcomes.outcome_state === 'paid' ? 1 : 0;
    acc.outcomes.revenue_amount += row.outcomes.revenue_amount || 0;
    acc.experiments.hvac_pilot += row.experiment.cohort === 'hvac' ? 1 : 0;
    acc.experiments.control += row.experiment.control_group ? 1 : 0;
    acc.experiments.variant += row.experiment.variant_group ? 1 : 0;
    return acc;
  }, {
    research: { total: 0, fresh: 0, stale: 0 },
    scoring: { total: 0, approved: 0, hold: 0 },
    normalization: { normalized: 0, deduped: 0 },
    simulation: { total: 0, advisory: 0 },
    decision: { approved: 0, hold: 0, review: 0 },
    execution: { ready: 0, blocked: 0 },
    outcomes: { replied: 0, booked: 0, paid: 0, revenue_amount: 0 },
    experiments: { hvac_pilot: 0, control: 0, variant: 0 },
  });

  const snapshot = {
    engine_name: DEFAULT_STATE.engine_name,
    source: 'ingested-canonical-state',
    source_mode: 'primary',
    last_updated: new Date().toISOString(),
    refresh_status: 'fresh',
    inventory_total: inventory.total_contacts || 0,
    enrollment_total: enrollment.total_contacts || 0,
    ...summary,
    rows,
  };
  writeJson(INTELLIGENCE_FILE, snapshot);
  return snapshot;
}

function ingestIntelligenceEvent(payload = {}) {
  const now = new Date().toISOString();
  appendEvent({ at: now, payload });
  return buildIntelligenceSnapshot();
}

function getIntelligenceSnapshot() {
  ensureFiles();
  return buildIntelligenceSnapshot();
}

module.exports = {
  INTELLIGENCE_FILE,
  INTELLIGENCE_EVENT_FILE,
  buildIntelligenceSnapshot,
  getIntelligenceSnapshot,
  ingestIntelligenceEvent,
};
