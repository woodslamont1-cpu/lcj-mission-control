const fs = require('fs');
const path = require('path');

const WORKSPACE = '/Users/lilly/.openclaw/workspace';
const DEFAULT_EVENT_LOGS = [];
if (process.env.HERMES_OPERATOR_EVENT_LOG) {
  DEFAULT_EVENT_LOGS.push(process.env.HERMES_OPERATOR_EVENT_LOG);
}
DEFAULT_EVENT_LOGS.push(
  path.join(WORKSPACE, 'benchmarks', 'live_post_promotion_window.jsonl'),
  path.join(WORKSPACE, 'benchmarks', 'crm_cleanup_canary_log.jsonl'),
  path.join(WORKSPACE, 'benchmarks', 'live_canary_sample_large.jsonl')
);

const LIVE_ALLOWLIST_DEFAULT = [
  'code_debug',
  'crm_cleanup',
  'lead_gen_scrape',
  'ghl_contact_sync',
  'email_draft',
  'followup_generation',
  'report_summary'
];
const MANUAL_CLASSES_DEFAULT = ['unknown'];
const ANTHROPIC_MODEL_DEFAULT = 'claude-sonnet-4-5';
const OPENAI_BASE_URL_DEFAULT = 'https://api.openai.com/v1';
const OPENAI_MODEL_DEFAULT = 'gpt-5.4-mini';

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function intEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readJsonl(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line)).filter(item => item && typeof item === 'object');
  } catch {
    return [];
  }
}

function pickEventRows() {
  for (const candidate of DEFAULT_EVENT_LOGS) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { rows: readJsonl(candidate), source: candidate };
    }
  }
  return { rows: [], source: '' };
}

function liveConfig() {
  const allowlist = (process.env.HERMES_PRE_ROUTING_ALLOWLIST || LIVE_ALLOWLIST_DEFAULT.join(','))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const manualClasses = (process.env.HERMES_FORCED_MANUAL_CLASSES || MANUAL_CLASSES_DEFAULT.join(','))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    use_pre_routing: boolEnv('HERMES_USE_PRE_ROUTING', true),
    pre_routing_percent: intEnv('HERMES_PRE_ROUTING_PERCENT', 100),
    pre_routing_allowlist: allowlist,
    forced_manual_classes: manualClasses,
    kill_switch: boolEnv('HERMES_PRE_ROUTING_KILL_SWITCH', false),
    crm_cleanup_canary: boolEnv('HERMES_CRM_CLEANUP_CANARY', false),
    crm_cleanup_percent: intEnv('HERMES_CRM_CLEANUP_PERCENT', 0),
    reasoning_provider: process.env.HERMES_REASONING_PROVIDER || 'anthropic',
    strategic_model: process.env.HERMES_ANTHROPIC_MODEL || ANTHROPIC_MODEL_DEFAULT,
    anthropic_model: process.env.HERMES_ANTHROPIC_MODEL || ANTHROPIC_MODEL_DEFAULT,
    openai_base_url: process.env.OPENAI_BASE_URL || OPENAI_BASE_URL_DEFAULT,
    openai_fallback_model: process.env.HERMES_OPENAI_FALLBACK_MODEL || OPENAI_MODEL_DEFAULT,
  };
}

function liveStatus() {
  const cfg = liveConfig();
  const { rows, source } = pickEventRows();
  return {
    status: 'online',
    last_updated: new Date().toISOString(),
    operator_layer: 'mission_control',
    routing_source_of_truth: 'Hermes',
    live_allowlist: cfg.pre_routing_allowlist,
    forced_manual_classes: cfg.forced_manual_classes,
    kill_switch: cfg.kill_switch,
    crm_cleanup_canary: cfg.crm_cleanup_canary,
    crm_cleanup_percent: cfg.crm_cleanup_percent,
    recent_event_source: source,
    recent_event_count: rows.length,
    latest_event: rows[0] || null,
  };
}

function buildConfigPayload() {
  const cfg = liveConfig();
  return {
    status: 'online',
    routing_mode: 'pre-routing',
    reasoning_provider: cfg.reasoning_provider,
    strategic_model: cfg.strategic_model,
    anthropic_model: cfg.anthropic_model,
    openai_base_url: cfg.openai_base_url,
    openai_fallback_model: cfg.openai_fallback_model,
    pre_routing_percent: cfg.pre_routing_percent,
    pre_routing_allowlist: cfg.pre_routing_allowlist,
    forced_manual_classes: cfg.forced_manual_classes,
    kill_switch: cfg.kill_switch,
    crm_cleanup_canary: cfg.crm_cleanup_canary,
    crm_cleanup_percent: cfg.crm_cleanup_percent,
    live_allowlist: cfg.pre_routing_allowlist,
    manual_classes: cfg.forced_manual_classes,
  };
}

function buildMetrics() {
  const { rows, source } = pickEventRows();
  const liveRows = rows.filter(r => r.event === 'live_rollout_metrics' && r.allowlisted && !r.kill_switch_active);
  const tasksByType = {};
  const tasksByExecutor = {};
  const failuresByType = {};
  let aiCallsMade = 0;
  let aiCallsAvoided = 0;
  let fallbackActivations = 0;
  let humanReviewRequiredCount = 0;
  let readOnlyLocalOnlyCount = 0;

  for (const row of liveRows) {
    const taskType = row.task_type || 'unknown';
    tasksByType[taskType] = (tasksByType[taskType] || 0) + 1;
    const executor = row.final_executor || 'unknown';
    tasksByExecutor[executor] = (tasksByExecutor[executor] || 0) + 1;
    if (row.ai_required) aiCallsMade += 1; else aiCallsAvoided += 1;
    if (row.fallback_model === 'qwen3:4b' || row.selected_model === 'qwen3:4b') fallbackActivations += 1;
    if (row.task_failed) failuresByType[taskType] = (failuresByType[taskType] || 0) + 1;
    if (row.human_review) humanReviewRequiredCount += 1;
    if (row.task_type === 'crm_cleanup' && row.run_mode === 'local_only') readOnlyLocalOnlyCount += 1;
  }

  const total = liveRows.length;
  const totalFailures = Object.values(failuresByType).reduce((a, b) => a + b, 0);
  const failureRateByTaskType = {};
  for (const [taskType, count] of Object.entries(tasksByType)) {
    failureRateByTaskType[taskType] = count ? Number(( (failuresByType[taskType] || 0) / count ).toFixed(4)) : 0;
  }

  let health = 'healthy';
  if (total === 0) health = 'watch closely';
  else if (totalFailures > Math.max(0, Math.floor(total / 10)) || fallbackActivations > Math.max(1, Math.floor(total / 5))) health = 'rollback recommended';
  else if (totalFailures > Math.max(0, Math.floor(total / 30)) || fallbackActivations > Math.max(1, Math.floor(total / 10))) health = 'watch closely';

  return {
    source,
    total_live_allowlisted_tasks: total,
    tasks_by_task_type: tasksByType,
    tasks_by_final_executor: tasksByExecutor,
    human_review_required_count: humanReviewRequiredCount,
    ai_calls_made: aiCallsMade,
    ai_calls_avoided: aiCallsAvoided,
    fallback_activations: fallbackActivations,
    task_failures: totalFailures,
    failure_rate_by_task_type: failureRateByTaskType,
    kill_switch_state: rows.some(r => r.kill_switch_active),
    health_recommendation: health,
    recent_event_count: rows.length,
    read_only_local_only_count: readOnlyLocalOnlyCount,
  };
}

function buildEvents(limit = 50) {
  const { rows } = pickEventRows();
  return rows.slice(0, limit).map(row => ({
    id: row.task_input_or_id,
    timestamp: row.timestamp || row.created_at || new Date().toISOString(),
    task_type: row.task_type,
    run_mode: row.run_mode,
    final_executor: row.final_executor,
    human_review: Boolean(row.human_review),
    selected_model: row.selected_model,
    fallback_model: row.fallback_model,
    task_failed: Boolean(row.task_failed),
    allowlisted: Boolean(row.allowlisted),
  }));
}

function buildTasks(limit = 50) {
  const { rows } = pickEventRows();
  return rows.slice(0, limit).map(row => ({
    id: row.task_input_or_id,
    task_text: row.task_text || row.task_input_or_id,
    task_type: row.task_type,
    status: row.human_review ? 'blocked' : (row.timing === 'queued' ? 'queued' : 'completed'),
    priority: row.task_type === 'crm_cleanup' ? 'high' : 'normal',
    owner: 'Hermes',
    created_at: row.timestamp || row.created_at || new Date().toISOString(),
    final_executor: row.final_executor,
    human_review: Boolean(row.human_review),
    selected_model: row.selected_model,
    fallback_model: row.fallback_model,
    task_failed: Boolean(row.task_failed),
  }));
}

function buildPendingReview(limit = 50) {
  const { rows } = pickEventRows();
  const items = [];
  for (const row of rows) {
    if (!row.human_review) continue;
    items.push({
      id: row.task_input_or_id,
      task_text: row.task_text || row.task_input_or_id,
      task_type: row.task_type,
      reason: row.output || row.task_type || 'human review required',
      requested_at: row.timestamp || row.created_at || new Date().toISOString(),
      required_approval: 'human_review',
    });
    if (items.length >= limit) break;
  }
  return items;
}

module.exports = {
  liveConfig,
  liveStatus,
  buildConfigPayload,
  buildMetrics,
  buildEvents,
  buildTasks,
  buildPendingReview,
};
