const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, 'ghl_content_engine_state.json');
const EVENT_FILE = path.join(__dirname, 'ghl_content_engine_events.jsonl');
const PROJECTION_FILE = path.join(__dirname, 'ghl_content_engine_projection.json');

const DEFAULT_STATE = {
  engine_name: 'System / GoHighLevel Content Engine',
  source: 'fallback-state-file',
  source_mode: 'fallback',
  refresh_cadence_seconds: 10,
  last_updated: new Date().toISOString(),
  overall_state: 'healthy',
  connection_status: 'connected',
  review_required: 1,
  firing: 2,
  idle: 2,
  degraded: 0,
  delayed: 1,
  missing: 0,
  backlog: 3,
  active_run_count: 0,
  missed_run_count: 0,
  heartbeat_at: new Date().toISOString(),
  last_run_at: null,
  last_event_at: null,
  freshness_seconds: null,
  freshness_state: 'unknown',
  jobs: [],
  events: []
};

const DEFAULT_EVENTS = [
  {
    event_id: 'seed-1',
    dedupe_key: 'seed-1',
    lifecycle: 'fired',
    source_system: 'seed',
    source_type: 'fallback',
    source_name: 'seed-state',
    source_event_id: 'seed-1',
    job_id: 'ghl-content-sync',
    job_name: 'GHL content sync',
    automation_job_name: 'GHL content sync',
    occurred_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    received_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    status: 'running',
    attempt: 1,
    retry_count: 0,
    dependency_status: 'connected',
    review_required: false,
    error_message: '',
    signature_valid: true,
    authenticity_status: 'fallback-seeded'
  }
];

function ensureFiles() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2) + '\n', 'utf8');
  }
  if (!fs.existsSync(EVENT_FILE)) {
    fs.writeFileSync(EVENT_FILE, DEFAULT_EVENTS.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  }
  if (!fs.existsSync(PROJECTION_FILE)) {
    fs.writeFileSync(PROJECTION_FILE, JSON.stringify(DEFAULT_STATE, null, 2) + '\n', 'utf8');
  }
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

function readEvents() {
  ensureFiles();
  try {
    return fs
      .readFileSync(EVENT_FILE, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [...DEFAULT_EVENTS];
  }
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const parsed = new Date(value || fallback);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback).toISOString() : parsed.toISOString();
}

function stableHash(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeLifecycle(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  const aliases = {
    fired: 'fired',
    fire: 'fired',
    run: 'running',
    running: 'running',
    started: 'running',
    complete: 'completed',
    completed: 'completed',
    success: 'completed',
    failed: 'failed',
    failure: 'failed',
    missed: 'missed',
    retry: 'retried',
    retried: 'retried',
    delayed: 'delayed',
    delay: 'delayed',
    'review-held': 'review-held',
    review: 'review-held',
    'needs-review': 'review-held',
    degraded: 'degraded',
    disconnected: 'disconnected',
    disconnected_source: 'disconnected'
  };
  return aliases[raw] || 'running';
}

function lifecycleToCurrentState(lifecycle) {
  switch (normalizeLifecycle(lifecycle)) {
    case 'fired':
    case 'running':
      return 'firing';
    case 'completed':
      return 'idle';
    case 'failed':
      return 'degraded';
    case 'missed':
    case 'retried':
    case 'delayed':
      return 'delayed';
    case 'review-held':
      return 'idle';
    case 'degraded':
      return 'degraded';
    case 'disconnected':
      return 'missing';
    default:
      return 'idle';
  }
}

function canonicalizeSource(meta = {}) {
  return {
    source_system: meta.source_system || meta.sourceSystem || 'unknown',
    source_type: meta.source_type || meta.sourceType || 'webhook',
    source_name: meta.source_name || meta.sourceName || 'gohighlevel',
    source_event_id: meta.source_event_id || meta.sourceEventId || null,
  };
}

function verifyEventSignature(rawBody, headers = {}) {
  const secret = process.env.GHL_CONTENT_ENGINE_WEBHOOK_SECRET || '';
  const signatureHeader = String(headers['x-ghl-signature'] || headers['x-hub-signature-256'] || headers['x-signature'] || '');
  if (!secret) {
    return { required: false, valid: null, algorithm: null, status: 'not_configured' };
  }
  if (!signatureHeader) {
    return { required: true, valid: false, algorithm: 'hmac-sha256', status: 'missing' };
  }
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);
  const valid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
  return { required: true, valid, algorithm: 'hmac-sha256', status: valid ? 'verified' : 'invalid' };
}

function normalizeIncomingEvent(payload = {}, meta = {}) {
  const receivedAt = new Date().toISOString();
  const lifecycle = normalizeLifecycle(payload.lifecycle || payload.event_type || payload.status || payload.state);
  const source = canonicalizeSource(meta);
  const eventId = payload.event_id || payload.id || source.source_event_id || stableHash(JSON.stringify({
    lifecycle,
    job_id: payload.job_id || payload.automation_job_id || payload.jobId || '',
    occurred_at: payload.occurred_at || payload.timestamp || payload.run_at || receivedAt,
    attempt: payload.attempt || 0,
    retry_count: payload.retry_count || 0,
    source_system: source.source_system,
    source_name: source.source_name
  }));
  const dedupeKey = String(payload.dedupe_key || payload.idempotency_key || payload.event_id || payload.id || source.source_event_id || eventId);
  const signature = verifyEventSignature(meta.rawBody || JSON.stringify(payload), meta.headers || {});
  const occurredAt = normalizeTimestamp(payload.occurred_at || payload.timestamp || payload.run_at || payload.expected_at || receivedAt);
  const jobId = payload.job_id || payload.automation_job_id || payload.jobId || payload.workflow_id || payload.workflowId || null;
  const jobName = payload.job_name || payload.automation_job_name || payload.jobName || payload.workflow_name || payload.workflowName || null;
  const dependencyStatus = payload.dependency_status || payload.connection_status || payload.dependencyState || 'connected';
  const reviewRequired = Boolean(payload.review_required || payload.reviewRequired || lifecycle === 'review-held');
  const retryCount = Number.isFinite(Number(payload.retry_count || payload.retryCount)) ? Number(payload.retry_count || payload.retryCount) : 0;
  const attempt = Number.isFinite(Number(payload.attempt)) ? Number(payload.attempt) : retryCount + 1;
  const nextExpectedAt = payload.next_expected_at || payload.next_run_time || payload.expected_next_run_at || null;
  const scheduleExpectedAt = payload.schedule_expected_at || payload.expected_at || null;
  const sourceSilenceSeconds = Number.isFinite(Number(payload.source_silence_seconds)) ? Number(payload.source_silence_seconds) : null;

  return {
    event_id: String(eventId),
    dedupe_key: dedupeKey,
    lifecycle,
    lifecycle_state: lifecycleToCurrentState(lifecycle),
    source_system: source.source_system,
    source_type: source.source_type,
    source_name: source.source_name,
    source_event_id: source.source_event_id,
    source_attribution: source,
    job_id: jobId,
    job_name: jobName,
    automation_job_name: jobName || jobId || 'unknown job',
    run_id: payload.run_id || payload.runId || null,
    attempt,
    retry_count: retryCount,
    status: payload.status || lifecycleToCurrentState(lifecycle),
    success_failure_state: payload.success_failure_state || (lifecycle === 'failed' ? 'failed' : lifecycle === 'completed' ? 'success' : lifecycle === 'review-held' ? 'review' : 'running'),
    occurred_at: occurredAt,
    received_at: receivedAt,
    heartbeat_at: payload.heartbeat_at || receivedAt,
    schedule_expected_at: scheduleExpectedAt,
    next_expected_at: nextExpectedAt,
    dependency_status: dependencyStatus,
    review_required: reviewRequired,
    content_generation_state: payload.content_generation_state || payload.contentState || lifecycle,
    sync_publish_send_state: payload.sync_publish_send_state || payload.syncState || lifecycle,
    error_message: payload.error_message || payload.error || payload.reason || '',
    source_silence_seconds: sourceSilenceSeconds,
    signature_algorithm: signature.algorithm,
    signature_valid: signature.valid,
    authenticity_status: signature.status,
    payload: payload,
  };
}

function dedupeKeyExists(events, dedupeKey) {
  return events.some(event => event.dedupe_key === dedupeKey || event.event_id === dedupeKey || event.source_event_id === dedupeKey);
}

function projectStateFromEvents(events, fallbackState = DEFAULT_STATE) {
  const now = Date.now();
  const jobs = new Map();
  const counts = { fired: 0, running: 0, completed: 0, failed: 0, missed: 0, retried: 0, delayed: 0, 'review-held': 0, degraded: 0, disconnected: 0 };
  let lastEventAt = 0;
  let lastRunAt = 0;
  let activeRunCount = 0;
  let missedRunCount = 0;
  let reviewRequired = 0;
  let backlog = 0;
  let disconnectedSources = 0;
  let sourceSilenceSeconds = null;

  const sorted = [...events].sort((a, b) => new Date(a.occurred_at || a.received_at) - new Date(b.occurred_at || b.received_at));

  for (const event of sorted) {
    const lifecycle = normalizeLifecycle(event.lifecycle || event.lifecycle_state || event.status || event.state);
    counts[lifecycle] = (counts[lifecycle] || 0) + 1;
    const ts = new Date(event.occurred_at || event.received_at || now).getTime();
    if (ts > lastEventAt) lastEventAt = ts;
    if (lifecycle === 'running') activeRunCount += 1;
    if (lifecycle === 'missed' || lifecycle === 'failed') missedRunCount += lifecycle === 'missed' ? 1 : 0;
    if (event.review_required || lifecycle === 'review-held') reviewRequired += 1;
    if (event.lifecycle === 'disconnected' || lifecycle === 'disconnected') disconnectedSources += 1;
    backlog += Number(event.queue_backlog_state || event.backlog || 0);
    if (event.source_silence_seconds != null) sourceSilenceSeconds = Number(event.source_silence_seconds);

    const jobKey = event.job_id || event.job_name || event.automation_job_name || 'unknown';
    const prev = jobs.get(jobKey) || {
      id: event.job_id || jobKey,
      automation_job_name: event.automation_job_name || event.job_name || jobKey,
      job_name: event.job_name || event.automation_job_name || jobKey,
      current_state: 'idle',
      last_run_time: null,
      next_run_time: null,
      success_failure_state: 'unknown',
      missed_runs: 0,
      retry_state: 'none',
      queue_backlog_state: 0,
      dependency_status: event.dependency_status || 'unknown',
      review_required_state: false,
      content_generation_state: 'unknown',
      sync_publish_send_state: 'unknown',
      error_message: '',
      lifecycle_state: lifecycle,
      source_attribution: event.source_attribution || {
        source_system: event.source_system,
        source_type: event.source_type,
        source_name: event.source_name,
        source_event_id: event.source_event_id,
      },
      active: false,
    };

    const runAt = new Date(event.occurred_at || event.received_at || now).getTime();
    if (runAt > lastRunAt && ['fired', 'running', 'completed', 'failed'].includes(lifecycle)) lastRunAt = runAt;

    const nextExpectedAt = event.next_expected_at || null;
    const scheduleExpectedAt = event.schedule_expected_at || null;
    const stateFromLifecycle = lifecycleToCurrentState(lifecycle);
    const missed = lifecycle === 'missed' || (nextExpectedAt && new Date(nextExpectedAt).getTime() < now && ['running', 'fired'].indexOf(prev.current_state) === -1 && stateFromLifecycle !== 'firing');

    prev.current_state = stateFromLifecycle;
    prev.lifecycle_state = lifecycle;
    prev.last_run_time = normalizeTimestamp(event.occurred_at || event.received_at || now);
    prev.next_run_time = nextExpectedAt || scheduleExpectedAt || prev.next_run_time || null;
    prev.success_failure_state = event.success_failure_state || (lifecycle === 'failed' ? 'failed' : lifecycle === 'completed' ? 'success' : lifecycle === 'review-held' ? 'review' : lifecycle === 'disconnected' ? 'disconnected' : 'running');
    prev.missed_runs = (prev.missed_runs || 0) + (missed ? 1 : 0) + (lifecycle === 'missed' ? 1 : 0);
    prev.retry_state = event.retry_state || (lifecycle === 'retried' ? 'retrying' : prev.retry_state || 'none');
    prev.queue_backlog_state = Number(event.queue_backlog_state || prev.queue_backlog_state || 0);
    prev.dependency_status = event.dependency_status || prev.dependency_status;
    prev.review_required_state = Boolean(event.review_required || lifecycle === 'review-held' || prev.review_required_state);
    prev.content_generation_state = event.content_generation_state || prev.content_generation_state;
    prev.sync_publish_send_state = event.sync_publish_send_state || prev.sync_publish_send_state;
    prev.error_message = event.error_message || prev.error_message || '';
    prev.active = ['fired', 'running'].includes(lifecycle);
    prev.time_since_last_run_minutes = Math.max(0, Math.round((now - new Date(prev.last_run_time).getTime()) / 60000));
    prev.time_until_next_run_minutes = prev.next_run_time ? Math.max(0, Math.round((new Date(prev.next_run_time).getTime() - now) / 60000)) : null;
    prev.is_overdue = prev.next_run_time ? new Date(prev.next_run_time).getTime() < now : false;
    prev.latency_seconds = Math.max(0, Math.round((now - new Date(prev.last_run_time).getTime()) / 1000));
    prev.freshness_seconds = Math.max(0, Math.round((now - new Date(prev.last_run_time).getTime()) / 1000));
    jobs.set(jobKey, prev);
  }

  for (const job of jobs.values()) {
    if (job.is_overdue && job.current_state !== 'firing' && job.current_state !== 'degraded') {
      job.current_state = 'delayed';
    }
    if (job.dependency_status === 'disconnected') disconnectedSources += 1;
  }

  const jobsArray = [...jobs.values()].sort((a, b) => new Date(b.last_run_time || 0) - new Date(a.last_run_time || 0));
  const freshnessSeconds = lastEventAt ? Math.max(0, Math.round((now - lastEventAt) / 1000)) : null;
  const freshnessState = freshnessSeconds == null ? 'unknown' : freshnessSeconds < 60 ? 'fresh' : freshnessSeconds < 300 ? 'warm' : 'stale';
  const overallState = freshnessState === 'stale' || disconnectedSources > 0 || counts.failed > 0 ? 'degraded' : 'healthy';
  const connectionStatus = disconnectedSources > 0 ? 'disconnected' : 'connected';

  return {
    engine_name: fallbackState.engine_name || DEFAULT_STATE.engine_name,
    source: 'ingested-events',
    source_mode: 'primary',
    source_attribution: {
      source_system: 'gohighlevel',
      source_type: 'webhook/event-stream',
      source_name: 'upstream-ingestion',
    },
    refresh_cadence_seconds: fallbackState.refresh_cadence_seconds || DEFAULT_STATE.refresh_cadence_seconds,
    last_updated: new Date().toISOString(),
    overall_state: overallState,
    connection_status: connectionStatus,
    heartbeat_at: lastEventAt ? new Date(lastEventAt).toISOString() : null,
    heartbeat_seconds: lastEventAt ? Math.max(0, Math.round((now - lastEventAt) / 1000)) : null,
    review_required: reviewRequired,
    firing: counts.fired + counts.running,
    idle: Math.max(0, jobsArray.filter(job => job.current_state === 'idle').length),
    degraded: counts.failed + counts.degraded + counts.disconnected,
    delayed: counts.delayed + counts.missed,
    missing: counts.disconnected,
    backlog,
    active_run_count: activeRunCount,
    missed_run_count: missedRunCount,
    last_run_at: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    last_event_at: lastEventAt ? new Date(lastEventAt).toISOString() : null,
    freshness_seconds: freshnessSeconds,
    freshness_state: freshnessState,
    jobs: jobsArray,
    events: [...sorted].reverse().slice(-50),
  };
}

function persistProjection(projection) {
  writeJson(PROJECTION_FILE, projection);
  return projection;
}

function getFallbackState() {
  const fallback = readJson(STATE_FILE, DEFAULT_STATE);
  return {
    ...DEFAULT_STATE,
    ...fallback,
    source: 'fallback-state-file',
    source_mode: 'fallback'
  };
}

function getContentEngineState() {
  ensureFiles();
  const projection = readJson(PROJECTION_FILE, null);
  if (projection && projection.source_mode === 'primary') {
    return projection;
  }
  const events = readEvents();
  if (events.length) {
    return persistProjection(projectStateFromEvents(events, getFallbackState()));
  }
  return getFallbackState();
}

function appendContentEngineEvent(event, meta = {}) {
  ensureFiles();
  const currentEvents = readEvents();
  const normalized = normalizeIncomingEvent(event, meta);
  if (dedupeKeyExists(currentEvents, normalized.dedupe_key)) {
    const existing = currentEvents.find(item => item.dedupe_key === normalized.dedupe_key || item.event_id === normalized.dedupe_key || item.source_event_id === normalized.dedupe_key);
    return { duplicate: true, event: existing || normalized, projection: getContentEngineState() };
  }

  currentEvents.push(normalized);
  const kept = currentEvents.slice(-5000);
  fs.writeFileSync(EVENT_FILE, kept.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  const projection = persistProjection(projectStateFromEvents(kept, getFallbackState()));
  return { duplicate: false, event: normalized, projection };
}

function touchContentEngineHeartbeat() {
  const state = getContentEngineState();
  state.transport_heartbeat_at = new Date().toISOString();
  return state;
}

function getContentEngineHistory(limit = 50) {
  return getContentEngineState().events.slice(0, Math.max(1, Number(limit) || 50));
}

module.exports = {
  getContentEngineState,
  getContentEngineHistory,
  appendContentEngineEvent,
  touchContentEngineHeartbeat,
  normalizeIncomingEvent,
  verifyEventSignature,
  projectStateFromEvents,
};
