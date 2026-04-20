(() => {
  if (window.__HERMES_MISSION_CONTROL_INTEGRATED__) return;
  window.__HERMES_MISSION_CONTROL_INTEGRATED__ = true;

  const API_BASE = '';
  const REFRESH_MS = 15000;

  const state = {
    status: null,
    config: null,
    metrics: null,
    events: [],
    tasks: [],
    review: [],
    reviewHistory: [],
    activeReviewItem: null,
    activeIntelItem: null,
    ghlEngine: null,
    ghlInventory: null,
    ghlDataQuality: null,
    ghlEnrollments: null,
    ghlOutcomes: null,
    ghlIntelligence: null,
    ghlEngineLivePulseAt: null,
    ghlEngineSource: 'polling',
    ghlEngineTransport: 'polling',
    ghlEngineHeartbeatSeenAt: null,
    ghlEngineSection: 'overview',
  };
  let engineStream = null;
  let engineReconnectTimer = null;

  const style = document.createElement('style');
  style.textContent = `
    .hermes-live-shell { display:grid; gap:16px; margin: 0 0 20px; }
    .hermes-live-card { border: 1px solid rgba(255,255,255,.08); background: linear-gradient(180deg, rgba(17,19,26,.94), rgba(11,13,18,.96)); border-radius: 18px; padding: 18px; box-shadow: 0 18px 40px rgba(0,0,0,.24); }
    .hermes-live-card h3 { margin:0 0 8px; font-size: 18px; }
    .hermes-live-card p { margin: 0; color: rgba(245,242,234,.66); }
    .hermes-kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; }
    .hermes-kpi { padding: 14px; border-radius: 14px; background: rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); }
    .hermes-kpi .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: rgba(245,242,234,.54); }
    .hermes-kpi .value { margin-top: 8px; font-size: 28px; font-weight: 800; }
    .hermes-kpi .sub { margin-top: 4px; font-size: 12px; color: rgba(245,242,234,.55); }
    .hermes-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); font-size: 12px; }
    .hermes-pill .dot { width:8px; height:8px; border-radius:999px; background: var(--good, #56d7a5); box-shadow: 0 0 0 4px rgba(86,215,165,.12); }
    .hermes-table { width:100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    .hermes-table th, .hermes-table td { text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align: top; }
    .hermes-table th { color: rgba(245,242,234,.78); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    .hermes-grid-two { display:grid; grid-template-columns: 1.25fr .95fr; gap:16px; }
    .hermes-list { display:grid; gap:10px; margin-top:10px; }
    .hermes-list-item { padding:12px; border:1px solid rgba(255,255,255,.06); border-radius: 14px; background: rgba(255,255,255,.03); }
    .hermes-list-item strong { display:block; margin-bottom:4px; }
    .hermes-muted { color: rgba(245,242,234,.58); }
    .ghl-engine-shell { display:grid; gap: 16px; }
    .ghl-engine-grid { display:grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
    .ghl-engine-metric { padding: 14px; border:1px solid rgba(255,255,255,.06); border-radius: 14px; background: rgba(255,255,255,.03); }
    .ghl-engine-metric .label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: rgba(245,242,234,.55); }
    .ghl-engine-metric .value { margin-top: 8px; font-size: 26px; font-weight: 800; }
    .ghl-engine-metric .sub { margin-top: 4px; font-size: 12px; color: rgba(245,242,234,.58); }
    .ghl-engine-table { width:100%; border-collapse: collapse; font-size: 13px; }
    .ghl-engine-table th, .ghl-engine-table td { text-align:left; padding: 10px 8px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align: top; }
    .ghl-engine-table th { color: rgba(245,242,234,.76); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    .ghl-engine-badge { display:inline-flex; align-items:center; gap:6px; padding: 5px 9px; border-radius: 999px; border:1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); font-size: 12px; }
    .ghl-engine-badge.good { color: #8df0be; }
    .ghl-engine-badge.warn { color: #ffd092; }
    .ghl-engine-badge.bad { color: #ffb6bd; }
    @media (max-width: 1100px) { .ghl-engine-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 780px) { .ghl-engine-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 1100px) {
      .hermes-kpi-grid, .hermes-grid-two { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 780px) {
      .hermes-kpi-grid, .hermes-grid-two { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function getJSON(path) {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return await res.json();
  }

  async function refreshHermesCore() {
    const [status, config, metrics, events, tasks, review, reviewHistory] = await Promise.all([
      getJSON('/api/status'),
      getJSON('/api/config'),
      getJSON('/api/metrics'),
      getJSON('/api/events?limit=8'),
      getJSON('/api/tasks?limit=8'),
      getJSON('/api/review-items?limit=8'),
      getJSON('/api/review-history?limit=20'),
    ]);

    state.status = status;
    state.config = config;
    state.metrics = metrics;
    state.events = events.items || [];
    state.tasks = tasks.items || [];
    state.review = review.items || [];
    state.reviewHistory = reviewHistory.items || [];
  }

  async function refreshContentEngine() {
    const [ghlEngine, ghlInventory, ghlDataQuality, ghlEnrollments, ghlOutcomes, ghlIntelligence] = await Promise.all([
      getJSON('/api/system/go-high-level-content-engine'),
      getJSON('/api/system/go-high-level-content-engine/inventory'),
      getJSON('/api/system/go-high-level-content-engine/inventory/data-quality'),
      getJSON('/api/system/go-high-level-content-engine/enrollments'),
      getJSON('/api/system/go-high-level-content-engine/outcomes'),
      getJSON('/api/system/go-high-level-content-engine/intelligence'),
    ]);
    state.ghlEngine = ghlEngine;
    state.ghlInventory = ghlInventory;
    state.ghlDataQuality = ghlDataQuality;
    state.ghlEnrollments = ghlEnrollments;
    state.ghlOutcomes = ghlOutcomes;
    state.ghlIntelligence = ghlIntelligence;
    state.ghlEngineLivePulseAt = new Date().toISOString();
    state.ghlEngineSource = ghlEngine.source_mode || ghlEngine.source || 'fallback';
    state.ghlEngineTransport = 'polling';
    ensureSystemView();
    render();
  }

  async function refresh() {
    await Promise.all([refreshHermesCore(), refreshContentEngine()]);
  }

  function openReviewItem(id) {
    state.ui.modal = { type: 'review-item', id };
    renderModal();
  }

  async function submitReviewDecision(reviewId, decision) {
    const modalRoot = document.getElementById('modalRoot');
    const noteField = modalRoot ? modalRoot.querySelector('[name="reviewNote"]') : null;
    const reviewerField = modalRoot ? modalRoot.querySelector('[name="reviewedBy"]') : null;
    const note = noteField ? String(noteField.value || '').trim() : '';
    const reviewedBy = reviewerField ? String(reviewerField.value || '').trim() : 'operator';
    const endpoint = `/api/review-items/${encodeURIComponent(reviewId)}/${decision}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, reviewed_by: reviewedBy })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Review action failed: ${response.status}`);
    state.activeReviewItem = null;
    await refreshHermesCore();
    render();
    return payload;
  }

  function getReviewItemById(id) {
    return state.review.find(item => String(item.id) === String(id)) || null;
  }

  function getIntelItemById(id) {
    const rows = Array.isArray(state.ghlIntelligence?.rows) ? state.ghlIntelligence.rows : [];
    return rows.find(item => String(item.canonical_id) === String(id)) || null;
  }

  function renderReviewModal(item) {
    const modalRoot = document.getElementById('modalRoot');
    if (!modalRoot) return;
    if (!item) {
      modalRoot.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }

    const history = (state.reviewHistory || []).filter(entry => String(entry.source_item?.id) === String(item.id));
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-action="close-review-modal">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
          <div class="section-header">
            <div>
              <p class="brand-kicker">Review Decision</p>
              <h2 id="reviewModalTitle" class="modal-headline">${escapeHtml(item.title || item.id || 'Review item')}</h2>
              <p class="modal-subtitle">Inspect the item context, add a note, and decide whether to approve or request changes.</p>
            </div>
            <button class="icon-button" data-action="close-review-modal" aria-label="Close dialog">×</button>
          </div>
          <div class="modal-grid" style="margin-top:18px;">
            <div class="panel" style="padding:18px; grid-column:1 / -1;">
              <div class="hermes-grid-two">
                <div>
                  <p class="panel-copy"><strong>Status:</strong> ${escapeHtml(item.review_status || 'pending')}</p>
                  <p class="panel-copy"><strong>Reason:</strong> ${escapeHtml(item.reason || 'Review required')}</p>
                  <p class="panel-copy"><strong>Task type:</strong> ${escapeHtml(item.task_type || 'unknown')}</p>
                  <p class="panel-copy"><strong>Reviewed by:</strong> ${escapeHtml(item.reviewed_by || '—')}</p>
                  <p class="panel-copy"><strong>Reviewed at:</strong> ${escapeHtml(item.reviewed_at || '—')}</p>
                </div>
                <div>
                  <p class="panel-copy"><strong>Context</strong></p>
                  <pre style="white-space: pre-wrap; margin:0; color: var(--text-muted); font-family: inherit;">${escapeHtml(item.details || item.description || JSON.stringify(item.raw || item, null, 2))}</pre>
                </div>
              </div>
            </div>
            <label class="field-label" style="grid-column:1 / -1;">Operator Name<input class="glass-input" type="text" name="reviewedBy" value="operator" /></label>
            <label class="field-label" style="grid-column:1 / -1;">Notes / Change Request<textarea class="glass-textarea" name="reviewNote" placeholder="Leave the exact changes, context, or approval note here..."></textarea></label>
          </div>
          <div class="panel" style="margin-top:16px; padding:18px;">
            <div class="panel-header"><div><h3 class="panel-title">Review History</h3><p class="panel-copy">Most recent decisions and notes attached to this item.</p></div></div>
            <div class="hermes-list">
              ${history.length ? history.map(entry => `
                <div class="hermes-list-item">
                  <strong>${escapeHtml(entry.action || entry.status || 'decision')} · ${escapeHtml(entry.reviewed_by || 'operator')}</strong>
                  <div class="hermes-muted">${escapeHtml(entry.reviewed_at || '')}</div>
                  ${entry.note ? `<div class="hermes-muted">${escapeHtml(entry.note)}</div>` : ''}
                </div>
              `).join('') : '<div class="hermes-muted">No previous decisions.</div>'}
            </div>
          </div>
          <div class="modal-actions">
            <div class="button-group">
              <button class="button ghost" type="button" data-action="close-review-modal">Cancel</button>
            </div>
            <div class="button-group">
              <button class="button secondary" type="button" data-action="review-decision" data-decision="request-changes">Request Changes</button>
              <button class="button danger" type="button" data-action="review-decision" data-decision="reject">Reject</button>
              <button class="button primary" type="button" data-action="review-decision" data-decision="approve">Approve</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.classList.add('modal-open');
  }

  function renderIntelModal(item) {
    const modalRoot = document.getElementById('modalRoot');
    if (!modalRoot) return;
    if (!item) {
      modalRoot.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-action="close-intel-modal">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="intelModalTitle">
          <div class="section-header">
            <div>
              <p class="brand-kicker">Intelligence Drill-Down</p>
              <h2 id="intelModalTitle" class="modal-headline">${escapeHtml(item.contact_name || item.canonical_id || 'Intelligence item')}</h2>
              <p class="modal-subtitle">Research, scoring, normalization, simulation, decision, execution, outcomes, and experiment state.</p>
            </div>
            <button class="icon-button" data-action="close-intel-modal" aria-label="Close dialog">×</button>
          </div>
          <div class="panel" style="margin-top:16px; padding:18px;">
            <div class="hermes-grid-two">
              <div>
                <p class="panel-copy"><strong>Correlation ID:</strong> ${escapeHtml(item.correlation_id || '—')}</p>
                <p class="panel-copy"><strong>Workflow key:</strong> ${escapeHtml(item.workflow_key || '—')}</p>
                <p class="panel-copy"><strong>Region / Vertical:</strong> ${escapeHtml(item.region || '—')} / ${escapeHtml(item.vertical || '—')}</p>
                <p class="panel-copy"><strong>Hermes decision:</strong> ${escapeHtml(item.decision?.status || '—')}</p>
                <p class="panel-copy"><strong>Experiment:</strong> ${escapeHtml(item.experiment?.status || '—')} · ${escapeHtml(item.experiment?.cohort || '—')}</p>
              </div>
              <div>
                <p class="panel-copy"><strong>Research findings</strong></p>
                <pre style="white-space: pre-wrap; margin:0; color: var(--text-muted); font-family: inherit;">${escapeHtml(JSON.stringify(item.research || {}, null, 2))}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.classList.add('modal-open');
  }

  function connectContentEngineStream() {
    if (engineStream) {
      try { engineStream.close(); } catch {}
      engineStream = null;
    }
    if (engineReconnectTimer) {
      clearTimeout(engineReconnectTimer);
      engineReconnectTimer = null;
    }

    if (!('EventSource' in window)) {
      state.ghlEngineSource = 'polling-only';
      return;
    }

    const stream = new EventSource('/api/system/go-high-level-content-engine/stream');
    engineStream = stream;
    state.ghlEngineSource = 'sse-connecting';

    const handlePayload = payload => {
      if (payload && typeof payload === 'object') {
        state.ghlEngine = payload;
        state.ghlEngineLivePulseAt = new Date().toISOString();
        state.ghlEngineSource = payload.source_mode || payload.source || 'primary';
        state.ghlEngineTransport = 'sse';
        if (payload.last_event_at) state.ghlEngineHeartbeatSeenAt = payload.last_event_at;
        ensureSystemView();
        render();
      }
    };

    stream.addEventListener('snapshot', event => {
      try { handlePayload(JSON.parse(event.data)); } catch (error) { console.error('snapshot parse failed', error); }
    });

    stream.addEventListener('update', event => {
      try { handlePayload(JSON.parse(event.data)); } catch (error) { console.error('update parse failed', error); }
    });

    stream.addEventListener('heartbeat', event => {
      state.ghlEngineHeartbeatSeenAt = new Date().toISOString();
      state.ghlEngineSource = 'sse';
      render();
    });

    stream.onerror = () => {
      state.ghlEngineSource = 'polling-fallback';
      try { stream.close(); } catch {}
      engineStream = null;
      if (!engineReconnectTimer) {
        engineReconnectTimer = setTimeout(() => {
          engineReconnectTimer = null;
          connectContentEngineStream();
        }, 5000);
      }
    };
  }

  function render() {
    const dashboardView = $('#dashboardView');
    const operationsView = $('#operationsView');
    const commandView = $('#commandCenterView');
    const timelineView = $('#timelineView');
    const notesView = $('#notesView');
    const revenueView = $('#revenueView');
    const statusPill = $('.status-pill');

    if (statusPill && state.status) {
      const dot = statusPill.querySelector('.status-dot');
      const text = statusPill.querySelector('.status-text');
      if (dot) dot.style.background = state.status.kill_switch ? 'var(--warn, #f0a75e)' : 'var(--good, #56d7a5)';
      if (text) {
        text.innerHTML = `<strong>Hermes ${escapeHtml(String(state.status.status || 'online').toUpperCase())}</strong><span>${escapeHtml(`Live allowlist: ${state.status.live_allowlist?.length || 0} • Review: ${state.metrics?.human_review_required_count ?? 0}`)}</span>`;
      }
    }

    if (dashboardView && !$('#hermesDashboardShell', dashboardView)) {
      dashboardView.insertAdjacentHTML('afterbegin', `
        <section id="hermesDashboardShell" class="hermes-live-shell">
          <div class="hermes-live-card">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <h3>Hermes Live Baseline</h3>
                <p>Production policy is frozen. This view renders Hermes-backed status, config, and metrics without replacing the premium Mission Control interface.</p>
              </div>
              <div class="hermes-pill"><span class="dot"></span><span>${escapeHtml(state.status?.status || 'online')}</span></div>
            </div>
            <div class="hermes-kpi-grid" style="margin-top:14px;">
              <div class="hermes-kpi"><div class="label">Live allowlisted tasks</div><div class="value">${escapeHtml(state.metrics?.total_live_allowlisted_tasks ?? '—')}</div><div class="sub">Current live window</div></div>
              <div class="hermes-kpi"><div class="label">Human review</div><div class="value">${escapeHtml(state.metrics?.human_review_required_count ?? '—')}</div><div class="sub">Destructive cleanup guardrail</div></div>
              <div class="hermes-kpi"><div class="label">AI calls made</div><div class="value">${escapeHtml(state.metrics?.ai_calls_made ?? '—')}</div><div class="sub">Pre-routing live traffic</div></div>
              <div class="hermes-kpi"><div class="label">Fallback activations</div><div class="value">${escapeHtml(state.metrics?.fallback_activations ?? '—')}</div><div class="sub">Fallbacks observed</div></div>
            </div>
          </div>
        </section>
      `);
    }

    if (operationsView && !$('#hermesOperationsCard', operationsView)) {
      operationsView.insertAdjacentHTML('afterbegin', `
        <section id="hermesOperationsCard" class="hermes-live-card">
          <h3>Hermes Operations</h3>
          <p>Executive summary of live routing, final executor balance, and task failures.</p>
          <div class="hermes-grid-two" style="margin-top:12px;">
            <div>
              <table class="hermes-table">
                <thead><tr><th>Task Type</th><th>Count</th><th>Failures</th></tr></thead>
                <tbody>
                  ${Object.entries(state.metrics?.tasks_by_task_type || {}).map(([type,count]) => `<tr><td>${escapeHtml(type)}</td><td>${escapeHtml(count)}</td><td>${escapeHtml(state.metrics?.failure_rate_by_task_type?.[type] ?? 0)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
            <div>
              <div class="hermes-list">
                <div class="hermes-list-item"><strong>Kill switch</strong><span class="hermes-muted">${escapeHtml(state.metrics?.kill_switch_state ? 'on' : 'off')}</span></div>
                <div class="hermes-list-item"><strong>AI calls avoided</strong><span class="hermes-muted">${escapeHtml(state.metrics?.ai_calls_avoided ?? '—')}</span></div>
                <div class="hermes-list-item"><strong>Read-only local_only</strong><span class="hermes-muted">${escapeHtml(state.metrics?.read_only_local_only_count ?? '—')}</span></div>
              </div>
            </div>
          </div>
        </section>
      `);
    }

    if (commandView && !$('#hermesCommandCard', commandView)) {
      commandView.insertAdjacentHTML('afterbegin', `
        <section id="hermesCommandCard" class="hermes-live-card">
          <h3>Hermes Command Center Contract</h3>
          <p>Live config and control boundaries rendered as a premium operator summary.</p>
          <table class="hermes-table">
            <thead><tr><th>Field</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>Strategic model</td><td>${escapeHtml(state.config?.strategic_model || 'gpt-5.4-mini')}</td></tr>
              <tr><td>OpenAI base URL</td><td>${escapeHtml(state.config?.openai_base_url || 'https://api.openai.com/v1')}</td></tr>
              <tr><td>Live allowlist</td><td>${escapeHtml((state.config?.live_allowlist || []).join(', '))}</td></tr>
              <tr><td>Forced manual</td><td>${escapeHtml((state.config?.forced_manual_classes || []).join(', '))}</td></tr>
              <tr><td>CRM cleanup canary</td><td>${escapeHtml(state.config?.crm_cleanup_canary ? 'active' : 'off')}</td></tr>
            </tbody>
          </table>
        </section>
      `);
    }

    if (timelineView && !$('#hermesTimelineCard', timelineView)) {
      timelineView.insertAdjacentHTML('afterbegin', `
        <section id="hermesTimelineCard" class="hermes-live-card">
          <h3>Hermes Recent Events</h3>
          <p>Recent live events flowing through the operator layer.</p>
          <div class="hermes-list">
            ${state.events.map(event => `
              <div class="hermes-list-item">
                <strong>${escapeHtml(event.id || event.task_type || 'event')}</strong>
                <div class="hermes-muted">${escapeHtml(event.task_type || 'unknown')} • ${escapeHtml(event.final_executor || 'unknown')} • human_review=${escapeHtml(String(!!event.human_review))}</div>
              </div>
            `).join('') || '<div class="hermes-muted">No recent events</div>'}
          </div>
        </section>
      `);
    }

    if (notesView && !$('#hermesReviewCard', notesView)) {
      notesView.insertAdjacentHTML('afterbegin', `
        <section id="hermesReviewCard" class="hermes-live-card">
          <div class="panel-header">
            <div>
              <h3>Pending Human Review</h3>
              <p>Tasks requiring explicit approval remain visible here. Click an item to inspect and decide.</p>
            </div>
            <span class="count-pill">${state.review.length} active</span>
          </div>
          <div class="hermes-list">
            ${state.review.map(item => `
              <button class="hermes-list-item" type="button" data-action="open-review-item" data-review-id="${escapeHtml(item.id)}" style="width:100%; text-align:left; cursor:pointer;">
                <strong>${escapeHtml(item.title || item.id || item.task_type || 'review item')}</strong>
                <div class="hermes-muted">${escapeHtml(item.reason || 'human review required')} · ${escapeHtml(item.review_status || 'pending')}</div>
                ${item.reviewed_by ? `<div class="hermes-muted">Reviewed by ${escapeHtml(item.reviewed_by)} at ${escapeHtml(item.reviewed_at || '')}</div>` : ''}
              </button>
            `).join('') || '<div class="hermes-muted">No pending review items</div>'}
          </div>
          <div class="panel" style="margin-top:16px; padding:18px;">
            <div class="panel-header"><div><h3 class="panel-title">Recent Review Decisions</h3><p class="panel-copy">Latest approved, rejected, or change-requested items.</p></div></div>
            <div class="hermes-list">
              ${(state.reviewHistory || []).slice(0, 5).map(entry => `
                <div class="hermes-list-item">
                  <strong>${escapeHtml(entry.action || entry.status || 'decision')} · ${escapeHtml(entry.source_item?.title || entry.source_item?.id || 'review item')}</strong>
                  <div class="hermes-muted">${escapeHtml(entry.reviewed_at || '')} · ${escapeHtml(entry.reviewed_by || 'operator')}</div>
                  ${entry.note ? `<div class="hermes-muted">${escapeHtml(entry.note)}</div>` : ''}
                </div>
              `).join('') || '<div class="hermes-muted">No review decisions yet.</div>'}
            </div>
          </div>
        </section>
      `);
    }

    if (revenueView && !$('#hermesTasksCard', revenueView)) {
      revenueView.insertAdjacentHTML('afterbegin', `
        <section id="hermesTasksCard" class="hermes-live-card">
          <h3>Hermes Recent Tasks</h3>
          <p>Recent tasks and their final executor routing results.</p>
          <div class="hermes-list">
            ${state.tasks.map(task => `
              <div class="hermes-list-item">
                <strong>${escapeHtml(task.id || task.task_type || 'task')}</strong>
                <div class="hermes-muted">${escapeHtml(task.task_type || 'unknown')} • ${escapeHtml(task.status || 'queued')} • ${escapeHtml(task.final_executor || 'pre_router')}</div>
              </div>
            `).join('') || '<div class="hermes-muted">No recent tasks</div>'}
          </div>
        </section>
      `);
    }

    renderGhlEngine();
  }

  function ensureSystemView() {
    const nav = document.querySelector('.topbar__nav');
    if (nav && !nav.querySelector('[data-tab="ghl-engine"]')) {
      const systemButton = document.createElement('button');
      systemButton.className = 'nav-tab';
      systemButton.dataset.action = 'switch-tab';
      systemButton.dataset.tab = 'ghl-engine';
      systemButton.setAttribute('role', 'tab');
      systemButton.setAttribute('aria-selected', 'false');
      systemButton.textContent = 'System / GoHighLevel Content Engine';
      const afterButton = nav.querySelector('[data-tab="operations"]');
      if (afterButton && afterButton.nextSibling) afterButton.parentNode.insertBefore(systemButton, afterButton.nextSibling);
      else nav.appendChild(systemButton);
    }

    const workspace = document.querySelector('.workspace');
    if (workspace && !workspace.querySelector('[data-panel="ghl-engine"]')) {
      const panel = document.createElement('section');
      panel.className = 'tab-panel';
      panel.dataset.panel = 'ghl-engine';
      panel.innerHTML = `
        <div id="ghlEngineView" class="ghl-engine-view"></div>
      `;
      const afterPanel = workspace.querySelector('[data-panel="operations"]');
      if (afterPanel && afterPanel.nextSibling) afterPanel.parentNode.insertBefore(panel, afterPanel.nextSibling);
      else workspace.appendChild(panel);
    }
  }

  function renderGhlEngine() {
    const view = document.getElementById('ghlEngineView');
    if (!view || !state.ghlEngine) return;
    const engine = state.ghlEngine;
    const inventory = state.ghlInventory || {};
    const dataQuality = state.ghlDataQuality || {};
    const lastUpdated = engine.last_updated ? new Date(engine.last_updated).toLocaleString() : '—';
    const jobs = Array.isArray(engine.jobs) ? engine.jobs : [];
    const events = Array.isArray(engine.events) ? engine.events : [];
    const rows = Array.isArray(inventory.rows) ? inventory.rows : [];
    const dqRows = Array.isArray(dataQuality.rows) ? dataQuality.rows : [];
    const enrRows = Array.isArray((state.ghlEnrollments || {}).rows) ? state.ghlEnrollments.rows : [];
    const outRows = Array.isArray((state.ghlOutcomes || {}).rows) ? state.ghlOutcomes.rows : [];
    const section = state.ghlEngineSection || 'overview';
    const invCounts = inventory.counts || {};
    const dqCounts = dataQuality.counts || {};
    const enrCounts = (state.ghlEnrollments || {}).counts || {};
    const outCounts = (state.ghlOutcomes || {}).counts || {};
    const conv = (state.ghlOutcomes || {}).conversion_path || {};

    const nav = [
      ['overview', 'Overview'],
      ['inventory', 'Inventory'],
      ['data-quality', 'Data Quality'],
      ['enrollments', 'Enrollments'],
      ['revenue', 'Revenue'],
      ['intelligence', 'Intelligence'],
    ];

    const bucketRows = {
      ready_now: rows.filter(r => r.state?.readiness_state === 'ready_now'),
      needs_enrichment: rows.filter(r => r.state?.readiness_state === 'needs_enrichment'),
      suppressed_duplicate: rows.filter(r => r.state?.readiness_state === 'suppressed_duplicate'),
      suppressed_hold: rows.filter(r => r.state?.readiness_state === 'suppressed_hold'),
      no_website: rows.filter(r => r.quality?.opportunity_bucket === 'no_website'),
      no_email: rows.filter(r => r.quality?.opportunity_bucket === 'no_email'),
      no_phone: rows.filter(r => r.quality?.opportunity_bucket === 'no_phone'),
      no_contact_method: rows.filter(r => r.quality?.opportunity_bucket === 'no_contact_method'),
    };

    const renderRows = (list, limit = 20) => list.slice(0, limit).map(row => `
      <tr>
        <td><strong>${escapeHtml(row.contact?.name || 'Unknown')}</strong><div class="hermes-muted">${escapeHtml(row.external_ids?.ghl_contact_id || '')}</div></td>
        <td><div>${escapeHtml((row.source_lineage || []).map(s => s.type).join(' → '))}</div><div class="hermes-muted">${escapeHtml(row.source_type || '')}</div></td>
        <td>${escapeHtml(row.state?.readiness_state || '—')}</td>
        <td>${escapeHtml(row.state?.enrollment_state || '—')}</td>
        <td>${escapeHtml(row.contact?.region || '—')}</td>
        <td>${escapeHtml(row.contact?.vertical || '—')}</td>
        <td>${escapeHtml(row.state?.last_outcome || '—')}</td>
      </tr>
    `).join('');

    const summaryCards = `
      <section class="ghl-engine-grid">
        ${[
          ['Total contacts', inventory.total_contacts ?? 0, 'Canonical CRM inventory'],
          ['Ready now', invCounts.ready_now ?? 0, 'Eligible for workflow entry'],
          ['Needs enrichment', invCounts.needs_enrichment ?? 0, 'One-step-away records'],
          ['Suppressed / duplicate', (invCounts.suppressed_duplicate ?? 0) + (invCounts.suppressed_hold ?? 0), 'Hold until resolved'],
          ['Opportunity buckets', invCounts.opportunity_buckets ?? 0, 'Future offer lanes'],
          ['Existing vs discovery', `${inventory.source_split?.existing_ghl_inventory || 0} / ${inventory.source_split?.hermes_discovery || 0}`, 'CRM inventory vs Hermes'],
        ].map(([label, value, sub]) => `
          <div class="ghl-engine-metric">
            <div class="label">${escapeHtml(label)}</div>
            <div class="value">${escapeHtml(value)}</div>
            <div class="sub">${escapeHtml(sub)}</div>
          </div>
        `).join('')}
      </section>
    `;

    const inventoryView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Inventory Buckets</h3>
            <p class="panel-copy">Real backfilled GHL inventory turned into operational buckets.</p>
          </div>
          <span class="count-pill">${rows.length} records</span>
        </div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Ready Now', invCounts.ready_now ?? 0, 'approved entry candidates'],
            ['Needs Enrichment', invCounts.needs_enrichment ?? 0, 'fill before enroll'],
            ['Suppressed / Duplicate', (invCounts.suppressed_duplicate ?? 0) + (invCounts.suppressed_hold ?? 0), 'suppressed or held'],
            ['No Website', invCounts.no_website_opportunity ?? 0, 'future website offer lane'],
            ['No Email', invCounts.missing_email ?? 0, 'contact gap'],
            ['No Phone', invCounts.missing_phone ?? 0, 'contact gap'],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
        <table class="ghl-engine-table" style="margin-top:14px;">
          <thead><tr><th>Contact</th><th>Source lineage</th><th>Readiness</th><th>Enrollment</th><th>Region</th><th>Vertical</th><th>Last outcome</th></tr></thead>
          <tbody>${renderRows(rows, 25)}</tbody>
        </table>
      </article>
    `;

    const dataQualityView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Data Quality</h3>
            <p class="panel-copy">Missing fields, duplicate risk, and no-contact-method inventory.</p>
          </div>
          <span class="count-pill">${dqRows.length} records</span>
        </div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Missing email', dqCounts.missing_email ?? 0, ''],
            ['Missing website', dqCounts.missing_website ?? 0, ''],
            ['Missing phone', dqCounts.missing_phone ?? 0, ''],
            ['No contact method', dqCounts.no_contact_method ?? 0, 'dead-end records'],
            ['Duplicate / likely duplicate', dqCounts.duplicate_risk ?? 0, 'cleanup queue'],
            ['Suppressed / hold', (dqCounts.suppressed_duplicate ?? 0) + (dqCounts.suppressed_hold ?? 0), 'do not enroll'],
            ['Enrichment needed', dqCounts.enrichment_needed ?? 0, 'one-step-away'],
            ['No website opportunity', dqCounts.no_website_opportunity ?? 0, 'future offer lane'],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
        <table class="ghl-engine-table" style="margin-top:14px;">
          <thead><tr><th>Contact</th><th>Source lineage</th><th>Readiness</th><th>Enrollment</th><th>Region</th><th>Vertical</th><th>Last outcome</th></tr></thead>
          <tbody>${renderRows(dqRows.filter(r => r.quality?.missing_email || r.quality?.missing_website || r.quality?.missing_phone || r.quality?.duplicate_risk || r.state?.readiness_state?.startsWith('suppressed') || r.quality?.no_contact_method), 25)}</tbody>
        </table>
      </article>
    `;

    const enrollmentsView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Enrollments</h3>
            <p class="panel-copy">Strict Ready / Approved enrollment contract and idempotent workflow entry states.</p>
          </div>
          <span class="count-pill">${enrCounts.approved ?? 0} approved</span>
        </div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Ready', enrCounts.ready ?? 0, 'canonical ready records'],
            ['Approved', enrCounts.approved ?? 0, 'approved by Hermes or Mission Control'],
            ['Eligible', enrCounts.eligible_for_enrollment ?? 0, 'ready + approved'],
            ['Enrolled', enrCounts.enrolled ?? 0, 'entered GHL workflow'],
            ['In sequence', enrCounts.in_sequence ?? 0, 'currently active'],
            ['Paused', enrCounts.paused ?? 0, 'paused in journey'],
            ['Held', enrCounts.held ?? 0, 'not eligible yet'],
            ['Suppressed', enrCounts.suppressed ?? 0, 'blocked from entry'],
            ['Duplicate blocked', enrCounts.duplicate_blocked ?? 0, 'dedupe guard'],
            ['Failed', enrCounts.enrollment_failed ?? 0, 'entry failed'],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
        <table class="ghl-engine-table" style="margin-top:14px;">
          <thead><tr><th>Contact</th><th>Source lineage</th><th>Readiness</th><th>Approval</th><th>Enrollment</th><th>Correlation ID</th><th>Region</th><th>Vertical</th></tr></thead>
          <tbody>${enrRows.slice(0, 25).map(row => `
            <tr>
              <td><strong>${escapeHtml(row.contact_name || 'Unknown')}</strong></td>
              <td><div>${escapeHtml((row.source_lineage || []).map(s => s.type).join(' → '))}</div><div class="hermes-muted">${escapeHtml(row.source_type || '')}</div></td>
              <td>${escapeHtml(row.readiness_state || '—')}</td>
              <td>${escapeHtml(row.approval_state || '—')}</td>
              <td>${escapeHtml(row.enrollment_state || '—')}</td>
              <td>${escapeHtml(row.correlation_id || '—')}</td>
              <td>${escapeHtml(row.region || '—')}</td>
              <td>${escapeHtml(row.vertical || '—')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </article>
    `;

    const revenueView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Revenue & Outcomes</h3>
            <p class="panel-copy">Outcome ingestion, revenue attribution, and conversion-path tracking.</p>
          </div>
          <span class="count-pill">$${escapeHtml(outCounts.revenue_amount ?? 0)}</span>
        </div>
        <div class="hero-pill" style="margin-top:12px;"><span class="dot" aria-hidden="true"></span><span>GHL live delivery endpoint <strong>/api/system/go-high-level-content-engine/webhook</strong></span></div>
        <div class="hero-pill" style="margin-top:8px;"><span class="dot" aria-hidden="true"></span><span>Accepted outcome types <strong>replied, booked, paid, no_show, rescheduled, closed_lost</strong></span></div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Replied', outCounts.replied ?? 0, 'response captured'],
            ['Booked', outCounts.booked ?? 0, 'calendar booked'],
            ['Paid', outCounts.paid ?? 0, 'revenue realized'],
            ['Revenue', `$${Number(outCounts.revenue_amount || 0).toLocaleString()}`, 'total realized revenue'],
            ['No show', outCounts.no_show ?? 0, 'appointment failed'],
            ['Rescheduled', outCounts.rescheduled ?? 0, 'future booking'],
            ['Closed lost', outCounts.closed_lost ?? 0, 'lost opportunity'],
            ['Outcome failed', outCounts.outcome_failed ?? 0, 'unreconciled outcome'],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
        <div class="hermes-grid-two" style="margin-top:14px;">
          <article class="panel">
            <h3 class="panel-title">Conversion Path</h3>
            <div class="ghl-engine-grid" style="margin-top:12px; grid-template-columns: repeat(6, minmax(0, 1fr));">
              ${[
                ['Ready', conv.ready ?? 0],
                ['Approved', conv.approved ?? 0],
                ['Enrolled', conv.enrolled ?? 0],
                ['Replied', conv.replied ?? 0],
                ['Booked', conv.booked ?? 0],
                ['Paid', conv.paid ?? 0],
              ].map(([label, value]) => `<div class="ghl-engine-metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`).join('')}
            </div>
          </article>
          <article class="panel">
            <h3 class="panel-title">Attribution</h3>
            <table class="ghl-engine-table">
              <thead><tr><th>Type</th><th>Revenue</th></tr></thead>
              <tbody>
                ${Object.entries((state.ghlOutcomes || {}).revenue_by_source || {}).map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>$${Number(v || 0).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="2">No source revenue yet</td></tr>'}
              </tbody>
            </table>
            <table class="ghl-engine-table" style="margin-top:12px;">
              <thead><tr><th>Region</th><th>Revenue</th></tr></thead>
              <tbody>
                ${Object.entries((state.ghlOutcomes || {}).revenue_by_region || {}).map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>$${Number(v || 0).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="2">No region revenue yet</td></tr>'}
              </tbody>
            </table>
            <table class="ghl-engine-table" style="margin-top:12px;">
              <thead><tr><th>Vertical</th><th>Revenue</th></tr></thead>
              <tbody>
                ${Object.entries((state.ghlOutcomes || {}).revenue_by_vertical || {}).map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>$${Number(v || 0).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="2">No vertical revenue yet</td></tr>'}
              </tbody>
            </table>
          </article>
        </div>
        <table class="ghl-engine-table" style="margin-top:14px;">
          <thead><tr><th>Contact</th><th>Source lineage</th><th>Readiness</th><th>Enrollment</th><th>Outcome</th><th>Revenue</th><th>Region</th><th>Vertical</th><th>Last outcome</th></tr></thead>
          <tbody>${outRows.slice(0, 25).map(row => `
            <tr>
              <td><strong>${escapeHtml(row.contact_name || 'Unknown')}</strong></td>
              <td><div>${escapeHtml((row.source_lineage || []).map(s => s.type).join(' → '))}</div><div class="hermes-muted">${escapeHtml(row.source_type || '')}</div></td>
              <td>${escapeHtml(row.readiness_state || '—')}</td>
              <td>${escapeHtml(row.enrollment_state || '—')}</td>
              <td>${escapeHtml(row.outcome_state || '—')}</td>
              <td>$${Number(row.revenue_amount || 0).toLocaleString()}</td>
              <td>${escapeHtml(row.region || '—')}</td>
              <td>${escapeHtml(row.vertical || '—')}</td>
              <td>${escapeHtml(row.last_outcome_at || '—')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </article>
    `;

    const enrollmentsViewLegacy = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Enrollments</h3>
            <p class="panel-copy">Strict Ready / Approved enrollment contract and idempotent workflow entry states.</p>
          </div>
          <span class="count-pill">${enrCounts.approved ?? 0} approved</span>
        </div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Ready', enrCounts.ready ?? 0, 'canonical ready records'],
            ['Approved', enrCounts.approved ?? 0, 'approved by Hermes or Mission Control'],
            ['Eligible', enrCounts.eligible_for_enrollment ?? 0, 'ready + approved'],
            ['Enrolled', enrCounts.enrolled ?? 0, 'entered GHL workflow'],
            ['In sequence', enrCounts.in_sequence ?? 0, 'currently active'],
            ['Paused', enrCounts.paused ?? 0, 'paused in journey'],
            ['Held', enrCounts.held ?? 0, 'not eligible yet'],
            ['Suppressed', enrCounts.suppressed ?? 0, 'blocked from entry'],
            ['Duplicate blocked', enrCounts.duplicate_blocked ?? 0, 'dedupe guard'],
            ['Failed', enrCounts.enrollment_failed ?? 0, 'entry failed'],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
        <table class="ghl-engine-table" style="margin-top:14px;">
          <thead><tr><th>Contact</th><th>Source lineage</th><th>Readiness</th><th>Approval</th><th>Enrollment</th><th>Correlation ID</th><th>Region</th><th>Vertical</th></tr></thead>
          <tbody>${enrRows.slice(0, 25).map(row => `
            <tr>
              <td><strong>${escapeHtml(row.contact_name || 'Unknown')}</strong></td>
              <td><div>${escapeHtml((row.source_lineage || []).map(s => s.type).join(' → '))}</div><div class="hermes-muted">${escapeHtml(row.source_type || '')}</div></td>
              <td>${escapeHtml(row.readiness_state || '—')}</td>
              <td>${escapeHtml(row.approval_state || '—')}</td>
              <td>${escapeHtml(row.enrollment_state || '—')}</td>
              <td>${escapeHtml(row.correlation_id || '—')}</td>
              <td>${escapeHtml(row.region || '—')}</td>
              <td>${escapeHtml(row.vertical || '—')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </article>
    `;

    const intelligence = state.ghlIntelligence || {};
    const intelRows = Array.isArray(intelligence.rows) ? intelligence.rows : [];
    const intelSummary = intelligence;
    const intelligenceView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Intelligence Layer</h3>
            <p class="panel-copy">NAIN normalization, Auto Research, Kirkpatrick scoring, MiroFish simulation, Hermes gating, and HVAC experiment bookkeeping.</p>
          </div>
          <span class="count-pill">${escapeHtml(intelRows.length)} records</span>
        </div>
        <div class="ghl-engine-grid" style="margin-top:12px;">
          ${[
            ['Research', `fresh ${intelSummary.research?.fresh ?? 0}`, 'Auto Research ingested'],
            ['Scoring', `approved ${intelSummary.scoring?.approved ?? 0}`, 'Kirkpatrick rubric'],
            ['Normalization', `normalized ${intelSummary.normalization?.normalized ?? 0}`, 'NAIN canonicalization'],
            ['Simulation', `advisory ${intelSummary.simulation?.advisory ?? 0}`, 'MiroFish only advisory'],
            ['Decisions', `approved ${intelSummary.decision?.approved ?? 0}`, 'Hermes gated'],
            ['Experiments', `hvac ${intelSummary.experiments?.hvac_pilot ?? 0}`, 'bounded pilot bookkeeping'],
            ['Execution', `ready ${intelSummary.execution?.ready ?? 0}`, 'GHL workflow handoff'],
            ['Outcomes', `paid ${intelSummary.outcomes?.paid ?? 0}`, `revenue $${Number(intelSummary.outcomes?.revenue_amount || 0).toLocaleString()}`],
          ].map(([label, value, sub]) => `
            <div class="ghl-engine-metric">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
          `).join('')}
        </div>
      </article>
      ${[
        ['Research', 'auto_research', intelRows, r => r.research, 'Research freshness and source lineage'],
        ['Scoring', 'kirkpatrick', intelRows, r => r.scoring, 'Rubric score and thresholds'],
        ['Normalization', 'nain', intelRows, r => r.normalization, 'Canonical identity and dedupe'],
        ['Simulation', 'mirofish', intelRows, r => r.simulation, 'Bounded scenario output'],
        ['Decisions', 'hermes', intelRows, r => r.decision, 'Approval and guardrails'],
        ['Experiments', 'experiments', intelRows, r => r.experiment, 'Bounded HVAC pilot bookkeeping'],
        ['Execution', 'ghl-execution', intelRows, r => r.execution, 'Workflow handoff and delivery'],
        ['Outcomes', 'outcomes', intelRows, r => r.outcomes, 'Reply / booking / paid feedback'],
      ].map(([title, key, rows, picker, copy]) => `
        <article class="panel" data-intel-panel="${key}">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${title}</h3>
              <p class="panel-copy">${copy}</p>
            </div>
            <span class="count-pill">${escapeHtml(rows.length)} rows</span>
          </div>
          <table class="ghl-engine-table" style="margin-top:14px;">
            <thead><tr><th>Contact</th><th>Status</th><th>Key metric</th><th>Region</th><th>Vertical</th></tr></thead>
            <tbody>${rows.slice(0, 8).map(row => {
              const data = picker(row) || {};
              const metric = title === 'Research' ? `${escapeHtml(data.freshness_at || '—')}` :
                title === 'Scoring' ? `${escapeHtml(data.score ?? '—')}` :
                title === 'Normalization' ? `${escapeHtml(data.dedupe_status || '—')}` :
                title === 'Simulation' ? `$${Number(data.expected_revenue || 0).toLocaleString()}` :
                title === 'Decisions' ? `${escapeHtml(data.status || '—')}` :
                title === 'Experiments' ? `${escapeHtml(data.status || '—')}` :
                title === 'Execution' ? `${escapeHtml(data.status || '—')}` :
                `${escapeHtml(data.revenue_amount || 0)}`;
              const status = title === 'Research' ? data.status : title === 'Scoring' ? data.threshold_passed ? 'pass' : 'hold' : title === 'Normalization' ? data.normalization_state : title === 'Simulation' ? data.risk_band : title === 'Decisions' ? data.status : title === 'Experiments' ? data.status : title === 'Execution' ? data.status : row.outcomes?.outcome_state;
              return `
                <tr data-action="open-intel-item" data-intel-id="${escapeHtml(row.canonical_id)}" style="cursor:pointer;">
                  <td><strong>${escapeHtml(row.contact_name || 'Unknown')}</strong><div class="hermes-muted">${escapeHtml(row.correlation_id || '')}</div></td>
                  <td>${escapeHtml(status || '—')}</td>
                  <td>${metric}</td>
                  <td>${escapeHtml(row.region || '—')}</td>
                  <td>${escapeHtml(row.vertical || '—')}</td>
                </tr>
              `;
            }).join('')}</tbody>
          </table>
        </article>
      `).join('')}
    `;

    const overviewView = `
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Overview</h3>
            <p class="panel-copy">Live automation health, inventory health, and recent events.</p>
          </div>
          <span class="count-pill">${escapeHtml(engine.overall_state || 'healthy')}</span>
        </div>
        <div class="hero-metrics" style="margin-top:12px;">
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Last updated <strong>${escapeHtml(lastUpdated)}</strong></span></div>
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Source of truth <strong>${escapeHtml(engine.source_mode || engine.source || state.ghlEngineSource || 'fallback')}</strong></span></div>
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Transport <strong>${escapeHtml(state.ghlEngineTransport || 'polling')}</strong></span></div>
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Heartbeat <strong>${escapeHtml(engine.heartbeat_seconds)}s ago</strong></span></div>
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Freshness <strong>${escapeHtml(engine.freshness_state || 'unknown')}</strong></span></div>
          <div class="hero-pill"><span class="dot" aria-hidden="true"></span><span>Connection <strong>${escapeHtml(engine.connection_status)}</strong></span></div>
        </div>
      </article>
      <section class="ghl-engine-grid">
        ${[
          ['Firing', engine.firing, 'Actively running now'],
          ['Active runs', engine.active_run_count, 'Currently in flight'],
          ['Idle', engine.idle, 'Waiting for the next trigger'],
          ['Delayed', engine.delayed, 'Late or overdue'],
          ['Missed runs', engine.missed_run_count, 'Trigger windows missed'],
          ['Needs review', engine.review_required, 'Awaiting explicit approval'],
          ['Backlog', engine.backlog, 'Queued work in the lane'],
          ['Degraded', engine.degraded, 'Needs attention'],
        ].map(([label, value, sub]) => `
          <div class="ghl-engine-metric">
            <div class="label">${escapeHtml(label)}</div>
            <div class="value">${escapeHtml(value)}</div>
            <div class="sub">${escapeHtml(sub)}</div>
          </div>
        `).join('')}
      </section>
      <div class="hermes-grid-two">
        <article class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Automation Jobs</h3><p class="panel-copy">Current state, timing, retries, backlog, and dependency health.</p></div><span class="count-pill">${jobs.length} jobs</span></div>
          <table class="ghl-engine-table"><thead><tr><th>Job</th><th>State</th><th>Last run</th><th>Next run</th><th>Runs</th><th>Connection</th><th>Review</th></tr></thead><tbody>${jobs.map(job => `
            <tr>
              <td><strong>${escapeHtml(job.automation_job_name)}</strong><div class="hermes-muted">${escapeHtml(job.content_generation_state)} • ${escapeHtml(job.sync_publish_send_state)}</div></td>
              <td><span class="ghl-engine-badge ${job.current_state === 'firing' ? 'good' : job.current_state === 'delayed' ? 'warn' : ''}">${escapeHtml(job.current_state)}</span></td>
              <td>${escapeHtml(job.last_run_time)}</td>
              <td>${escapeHtml(job.next_run_time)}${job.is_overdue ? ' <span class="ghl-engine-badge warn">late</span>' : ''}</td>
              <td><div>${escapeHtml(job.missed_runs)} missed</div><div class="hermes-muted">retry ${escapeHtml(job.retry_state)}</div></td>
              <td>${escapeHtml(job.dependency_status)}</td>
              <td>${escapeHtml(job.review_required_state ? 'required' : 'clear')}</td>
            </tr>`).join('')}</tbody></table>
        </article>
        <article class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Live Event / History Feed</h3><p class="panel-copy">Recent state changes from the content engine.</p></div><span class="count-pill">${events.length} events</span></div>
          <div class="hermes-list">${events.map(event => `
            <div class="hermes-list-item"><strong>${escapeHtml(event.title)}</strong><div class="hermes-muted">${escapeHtml(event.timestamp)} • ${escapeHtml(event.state || 'n/a')}</div></div>`).join('')}</div>
        </article>
      </div>
    `;

    const navHtml = nav.map(([key,label]) => `<button class="nav-tab" type="button" data-action="switch-ghl-section" data-section="${key}" aria-selected="${section === key ? 'true' : 'false'}">${label}</button>`).join('');
    const body = section === 'inventory' ? inventoryView : section === 'data-quality' ? dataQualityView : section === 'enrollments' ? enrollmentsView : section === 'revenue' ? revenueView : section === 'intelligence' ? intelligenceView : overviewView;

    view.innerHTML = `
      <section class="ghl-engine-shell">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h2 class="section-title">System / GoHighLevel Content Engine</h2>
              <p class="section-copy">Operating inventory + automation control for the CRM machine.</p>
            </div>
            <span class="count-pill">${escapeHtml(engine.overall_state || 'healthy')}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;">${navHtml}</div>
        </article>
        ${section === 'overview' ? body : ''}
        ${section === 'inventory' ? summaryCards + body : ''}
        ${section === 'data-quality' ? summaryCards + body : ''}
        ${section === 'enrollments' ? summaryCards + body : ''}
        ${section === 'revenue' ? summaryCards + body : ''}
        ${section === 'intelligence' ? body : ''}
      </section>
    `;
  }

  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    const { action, reviewId, decision } = target.dataset;

    if (action === 'open-review-item' && reviewId) {
      const item = getReviewItemById(reviewId);
      if (item) {
        state.activeReviewItem = item;
        renderReviewModal(item);
      }
      return;
    }

    if (action === 'close-review-modal') {
      state.activeReviewItem = null;
      renderReviewModal(null);
      return;
    }

    if (action === 'open-intel-item' && target.dataset.intelId) {
      const item = getIntelItemById(target.dataset.intelId);
      if (item) {
        state.activeIntelItem = item;
        renderIntelModal(item);
      }
      return;
    }

    if (action === 'close-intel-modal') {
      state.activeIntelItem = null;
      renderIntelModal(null);
      return;
    }

    if (action === 'switch-ghl-section' && target.dataset.section) {
      state.ghlEngineSection = target.dataset.section;
      render();
      return;
    }

    if (action === 'review-decision' && decision && state.activeReviewItem) {
      try {
        await submitReviewDecision(state.activeReviewItem.id, decision);
      } catch (error) {
        console.error('Review decision failed:', error);
      }
    }
  });

  connectContentEngineStream();
  refresh().catch(err => {
    console.error('Hermes Mission Control integration failed:', err);
  });
  setInterval(() => refreshHermesCore().catch(err => console.error('Hermes core refresh failed:', err)), REFRESH_MS);
  setInterval(() => {
    if (!engineStream) {
      refreshContentEngine().catch(err => console.error('GHL content engine fallback refresh failed:', err));
    }
  }, 60000);
})();
