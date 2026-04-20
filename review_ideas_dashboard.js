(() => {
  if (window.__MISSION_CONTROL_REVIEW_IDEAS__) return;
  window.__MISSION_CONTROL_REVIEW_IDEAS__ = true;

  const ACCEPT = '.md,.txt,.json,.yaml,.yml';
  const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml'];
  const MAX_ATTACHMENTS = 8;
  const MAX_ATTACHMENT_SIZE_BYTES = 80_000;
  const MAX_TOTAL_ATTACHMENT_BYTES = 240_000;

  const state = {
    loading: false,
    error: '',
    busyAction: '',
    templates: [],
    requests: [],
    provider: null,
    selectedId: '',
    draft: null,
  };

  const style = document.createElement('style');
  style.textContent = `
    .idea-review-shell { display:grid; gap:18px; }
    .idea-review-kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; }
    .idea-review-kpi { padding:16px; border-radius:16px; border:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.025); }
    .idea-review-kpi .label { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:rgba(245,242,234,.56); }
    .idea-review-kpi .value { margin-top:8px; font-size:24px; font-weight:800; }
    .idea-review-grid { display:grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, .85fr); gap:18px; align-items:start; }
    .idea-review-card-stack { display:grid; gap:18px; }
    .idea-review-meta-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    .idea-review-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); font-size:12px; color:rgba(245,242,234,.78); }
    .idea-review-pill strong { color: var(--text-primary, #f5f2ea); }
    .idea-review-status { display:inline-flex; align-items:center; gap:8px; padding:7px 12px; border-radius:999px; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,.08); text-transform:capitalize; }
    .idea-review-status.draft { background: rgba(255,255,255,.04); color: rgba(245,242,234,.76); }
    .idea-review-status.queued, .idea-review-status.running { background: rgba(255,208,146,.12); color: #ffd092; }
    .idea-review-status.completed { background: rgba(86,215,165,.12); color: #8df0be; }
    .idea-review-status.failed { background: rgba(255,120,131,.12); color: #ffb6bd; }
    .idea-review-mode-toggle { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
    .idea-review-mode-button { width:100%; justify-content:center; }
    .idea-review-note { margin-top:10px; color: rgba(245,242,234,.58); font-size:13px; line-height:1.5; }
    .idea-review-dropzone { display:grid; gap:12px; padding:16px; border-radius:18px; border:1px dashed rgba(216,184,104,.35); background: rgba(216,184,104,.05); }
    .idea-review-dropzone input[type="file"] { width:100%; color: rgba(245,242,234,.72); }
    .idea-review-attachment-list { display:grid; gap:10px; }
    .idea-review-attachment { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 14px; border-radius:14px; border:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.025); }
    .idea-review-attachment strong { display:block; margin-bottom:4px; }
    .idea-review-attachment span { display:block; color: rgba(245,242,234,.56); font-size:12px; }
    .idea-review-empty { padding:18px; border-radius:16px; border:1px dashed rgba(255,255,255,.08); color: rgba(245,242,234,.6); background: rgba(255,255,255,.02); }
    .idea-review-result-grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:14px; }
    .idea-review-result-card { padding:14px; border-radius:14px; border:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02); }
    .idea-review-result-card h4 { margin:0 0 8px; font-size:14px; }
    .idea-review-result-card ul { margin:0; padding-left:18px; display:grid; gap:6px; color: rgba(245,242,234,.74); }
    .idea-review-result-summary { margin:0; color: rgba(245,242,234,.78); line-height:1.65; }
    .idea-review-history-list { display:grid; gap:10px; }
    .idea-review-history-item { width:100%; text-align:left; padding:14px 16px; border-radius:16px; border:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.025); transition: border-color 180ms ease, transform 180ms ease, background 180ms ease; }
    .idea-review-history-item:hover { border-color: rgba(216,184,104,.28); transform: translateY(-1px); background: rgba(255,255,255,.04); }
    .idea-review-history-item.active { border-color: rgba(216,184,104,.42); background: rgba(216,184,104,.09); }
    .idea-review-history-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .idea-review-history-title { margin:0; font-size:15px; font-weight:700; color: var(--text-primary, #f5f2ea); }
    .idea-review-history-meta { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; color: rgba(245,242,234,.56); font-size:12px; }
    .idea-review-history-copy { margin:10px 0 0; color: rgba(245,242,234,.68); font-size:13px; line-height:1.55; }
    .idea-review-actions { display:flex; flex-wrap:wrap; gap:10px; }
    .idea-review-inline-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .idea-review-divider { height:1px; background: rgba(255,255,255,.06); margin: 6px 0 2px; }
    .idea-review-error { padding:14px 16px; border-radius:16px; border:1px solid rgba(255,120,131,.18); background: rgba(255,120,131,.08); color:#ffccd0; }
    .idea-review-json { margin-top:12px; padding:14px; border-radius:14px; background: rgba(7,9,14,.78); border:1px solid rgba(255,255,255,.06); color: rgba(245,242,234,.7); white-space: pre-wrap; font-size:12px; line-height:1.55; }
    @media (max-width: 1180px) {
      .idea-review-kpi-grid, .idea-review-grid, .idea-review-result-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function defaultTemplateKeyForMode(mode) {
    return mode === 'BUILD' ? 'build_request' : 'skeptical_review';
  }

  function getTemplate(key) {
    return state.templates.find(item => item.key === key) || state.templates[0] || null;
  }

  function makeDraft(mode = 'REVIEW', templateKey = '') {
    const resolvedTemplateKey = templateKey || defaultTemplateKeyForMode(mode);
    const template = getTemplate(resolvedTemplateKey);
    return {
      requestId: '',
      title: '',
      mode,
      promptTemplate: template?.key || resolvedTemplateKey,
      promptInstructions: template?.instructions || '',
      sourceText: '',
      folderSummaryText: '',
      attachments: []
    };
  }

  function requestToDraft(request) {
    return {
      requestId: request.id,
      title: request.title || '',
      mode: request.mode || 'REVIEW',
      promptTemplate: request.promptTemplate || defaultTemplateKeyForMode(request.mode || 'REVIEW'),
      promptInstructions: request.promptInstructions || getTemplate(request.promptTemplate)?.instructions || '',
      sourceText: request.sourceText || '',
      folderSummaryText: request.folderSummaryText || '',
      attachments: clone(request.attachments || [])
    };
  }

  function getSelectedRequest() {
    return state.requests.find(item => item.id === state.selectedId) || null;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function summarizeResult(request) {
    const result = request?.resultJson || null;
    if (!result) return request?.resultText || 'No result captured yet.';
    return result.summary || result.verdict || result.goNoGoRecommendation || request.resultText || 'No result captured yet.';
  }

  function notify(message, tone = 'good') {
    const toastRoot = document.getElementById('toastRoot');
    if (!toastRoot) {
      return;
    }
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    toastRoot.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      node.style.transition = 'opacity 180ms ease, transform 180ms ease';
      setTimeout(() => node.remove(), 180);
    }, 2600);
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      cache: 'no-store',
      ...options
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload.error || `Request failed with ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function downloadMarkdown(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload || `Download failed with ${response.status}`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/i);
    const fileName = match?.[1] || 'idea-review.md';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function updateDraftField(field, value) {
    state.draft = {
      ...state.draft,
      [field]: value
    };
  }

  function buildPromptPreview() {
    const template = getTemplate(state.draft.promptTemplate);
    const sections = [
      'You are supporting LCJ Elite Consulting inside Mission Control.',
      `Mode: ${state.draft.mode}`,
      `Template: ${template?.label || state.draft.promptTemplate}`,
      '',
      template?.instructions || '',
      '',
      '## Operator Instructions',
      state.draft.promptInstructions || '',
      '',
      '## Idea / Spec',
      state.draft.sourceText || 'No direct idea text provided.',
      '',
      '## Folder Summary',
      state.draft.folderSummaryText || 'No folder summary provided.'
    ];

    if (state.draft.attachments.length) {
      sections.push('', '## Attachments');
      state.draft.attachments.forEach((attachment, index) => {
        sections.push(
          `### Attachment ${index + 1}: ${attachment.fileName} (${attachment.role || 'attachment'})`,
          attachment.content || ''
        );
      });
    }

    return sections.join('\n');
  }

  async function loadWorkspace({ preserveSelection = true } = {}) {
    state.loading = true;
    state.error = '';
    render();
    try {
      const workspace = await requestJson('/api/idea-reviews');
      state.templates = Array.isArray(workspace.templates) ? workspace.templates : [];
      state.requests = Array.isArray(workspace.requests) ? workspace.requests : [];
      state.provider = workspace.provider || null;

      const currentSelection = preserveSelection ? state.selectedId : '';
      const nextSelection = currentSelection && state.requests.some(item => item.id === currentSelection)
        ? currentSelection
        : state.requests[0]?.id || '';

      if (nextSelection) {
        state.selectedId = nextSelection;
        state.draft = requestToDraft(state.requests.find(item => item.id === nextSelection));
      } else {
        state.selectedId = '';
        state.draft = makeDraft();
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Review Ideas could not be loaded.';
      if (!state.draft) {
        state.draft = makeDraft();
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function selectRequest(requestId) {
    const request = state.requests.find(item => item.id === requestId);
    if (!request) return;
    state.selectedId = request.id;
    state.draft = requestToDraft(request);
    render();
  }

  function setMode(mode) {
    const templateKey = defaultTemplateKeyForMode(mode);
    const template = getTemplate(templateKey);
    state.draft = {
      ...state.draft,
      mode,
      promptTemplate: template?.key || templateKey,
      promptInstructions: template?.instructions || state.draft.promptInstructions,
    };
    render();
  }

  function setTemplate(templateKey) {
    const template = getTemplate(templateKey);
    if (!template) return;
    state.draft = {
      ...state.draft,
      promptTemplate: template.key,
      mode: template.mode === 'ANY' ? state.draft.mode : template.mode,
      promptInstructions: template.instructions || state.draft.promptInstructions
    };
    render();
  }

  async function upsertDraft() {
    const payload = clone(state.draft);
    const endpoint = payload.requestId ? `/api/idea-reviews/${encodeURIComponent(payload.requestId)}` : '/api/idea-reviews';
    const method = payload.requestId ? 'PATCH' : 'POST';
    const response = await requestJson(endpoint, {
      method,
      body: JSON.stringify(payload)
    });
    return response.request;
  }

  async function saveDraft() {
    state.busyAction = 'save';
    render();
    try {
      const request = await upsertDraft();
      state.selectedId = request.id;
      notify('Idea review draft saved.', 'good');
      await loadWorkspace();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Draft save failed.', 'warn');
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function runReview() {
    state.busyAction = 'run';
    render();
    try {
      const request = await upsertDraft();
      state.selectedId = request.id;
      state.requests = state.requests.map(item => item.id === request.id ? { ...item, status: 'running', updatedAt: new Date().toISOString() } : item);
      render();
      await requestJson(`/api/idea-reviews/${encodeURIComponent(request.id)}/run`, {
        method: 'POST'
      });
      notify(state.draft.mode === 'BUILD' ? 'Build request completed.' : 'Review completed.', 'good');
      await loadWorkspace();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Review run failed.', 'warn');
      await loadWorkspace();
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function duplicateSelected() {
    const request = getSelectedRequest();
    if (!request) return;
    state.busyAction = 'duplicate';
    render();
    try {
      const response = await requestJson(`/api/idea-reviews/${encodeURIComponent(request.id)}/duplicate`, {
        method: 'POST'
      });
      state.selectedId = response.request.id;
      notify('Idea review duplicated.', 'good');
      await loadWorkspace();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Duplicate failed.', 'warn');
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function exportSelected() {
    const request = getSelectedRequest();
    if (!request) return;
    state.busyAction = 'export';
    render();
    try {
      await downloadMarkdown(`/api/idea-reviews/${encodeURIComponent(request.id)}/export`);
      notify('Markdown export downloaded.', 'good');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export failed.', 'warn');
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPromptPreview());
      notify('Prompt copied.', 'good');
    } catch {
      notify('Clipboard copy failed.', 'warn');
    }
  }

  async function copyResult() {
    const request = getSelectedRequest();
    if (!request?.resultText) {
      notify('No result is available to copy yet.', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(request.resultText);
      notify('Result copied.', 'good');
    } catch {
      notify('Clipboard copy failed.', 'warn');
    }
  }

  function removeAttachment(index) {
    const nextAttachments = state.draft.attachments.filter((_, itemIndex) => itemIndex !== index);
    state.draft = {
      ...state.draft,
      attachments: nextAttachments
    };
    render();
  }

  async function handleFileSelection(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    try {
      const nextAttachments = [...state.draft.attachments];
      for (const file of incoming) {
        const extension = `.${String(file.name).split('.').pop()?.toLowerCase() || ''}`;
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
          throw new Error(`Unsupported file type for ${file.name}. Use ${ACCEPT}.`);
        }
        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
          throw new Error(`${file.name} exceeds the ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / 1000)} KB per-file limit.`);
        }
        nextAttachments.push({
          id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          content: await file.text(),
          role: 'attachment'
        });
      }

      if (nextAttachments.length > MAX_ATTACHMENTS) {
        throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per review.`);
      }

      const totalBytes = nextAttachments.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error(`Total attachment payload must stay under ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1000)} KB.`);
      }

      state.draft = {
        ...state.draft,
        attachments: nextAttachments
      };
      render();
      notify('Attachments added.', 'good');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Attachment processing failed.', 'warn');
    }
  }

  function renderStatusBadge(status) {
    return `<span class="idea-review-status ${escapeHtml(status || 'draft')}">${escapeHtml(status || 'draft')}</span>`;
  }

  function renderKpis() {
    const requests = state.requests;
    const draftCount = requests.filter(item => item.status === 'draft').length;
    const runningCount = requests.filter(item => item.status === 'queued' || item.status === 'running').length;
    const completedCount = requests.filter(item => item.status === 'completed').length;
    const cautionCount = requests.filter(item => item.resultJson?.decision === 'caution' || /caution/i.test(item.resultJson?.goNoGoRecommendation || '')).length;

    return [
      { label: 'Requests', value: requests.length, detail: 'Saved in Mission Control' },
      { label: 'In Progress', value: runningCount, detail: 'Queued or running' },
      { label: 'Completed', value: completedCount, detail: 'Ready for operator review' },
      { label: 'Caution Calls', value: cautionCount, detail: 'Reviews flagged with caution' },
    ].map(card => `
      <article class="idea-review-kpi">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${escapeHtml(card.value)}</div>
        <div class="panel-copy">${escapeHtml(card.detail)}</div>
      </article>
    `).join('');
  }

  function renderAttachments() {
    if (!state.draft.attachments.length) {
      return '<div class="idea-review-empty">No files attached yet. Add markdown, text, JSON, or YAML files, or paste a folder summary below.</div>';
    }
    return state.draft.attachments.map((attachment, index) => `
      <div class="idea-review-attachment">
        <div>
          <strong>${escapeHtml(attachment.fileName)}</strong>
          <span>${escapeHtml(attachment.role || 'attachment')} · ${escapeHtml(Math.max(1, Math.round(Number(attachment.sizeBytes || 0) / 1024)))} KB</span>
        </div>
        <button class="icon-button danger" type="button" data-idea-action="remove-attachment" data-index="${index}" aria-label="Remove attachment">×</button>
      </div>
    `).join('');
  }

  function renderHistory() {
    if (!state.requests.length) {
      return '<div class="idea-review-empty">No idea reviews saved yet. Start with a pasted idea or attach a spec file to create the first draft.</div>';
    }

    return state.requests.map(request => `
      <button class="idea-review-history-item ${request.id === state.selectedId ? 'active' : ''}" type="button" data-idea-action="select" data-id="${escapeHtml(request.id)}">
        <div class="idea-review-history-head">
          <div>
            <p class="idea-review-history-title">${escapeHtml(request.title || 'Untitled request')}</p>
            <div class="idea-review-history-meta">
              <span>${escapeHtml(request.mode)}</span>
              <span>${escapeHtml(formatDateTime(request.updatedAt || request.createdAt))}</span>
            </div>
          </div>
          ${renderStatusBadge(request.status)}
        </div>
        <p class="idea-review-history-copy">${escapeHtml(summarizeResult(request))}</p>
      </button>
    `).join('');
  }

  function renderReviewResult(request) {
    if (!request) {
      return '<div class="idea-review-empty">Save a draft or open a previous request to see structured output here.</div>';
    }

    if (request.status === 'failed') {
      return `<div class="idea-review-error">${escapeHtml(request.errorMessage || 'This review failed. Retry after correcting the request or launcher path.')}</div>`;
    }

    if (!request.resultJson && !request.resultText) {
      return '<div class="idea-review-empty">No response stored yet. Run the request to capture a Claude review or build plan.</div>';
    }

    const result = request.resultJson || {};
    if (request.mode === 'BUILD') {
      const steps = Array.isArray(result.implementationSteps) ? result.implementationSteps : [];
      const architecture = Array.isArray(result.architectureSuggestions) ? result.architectureSuggestions : [];
      const changes = Array.isArray(result.nextFileChanges) ? result.nextFileChanges : [];
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const dependencies = Array.isArray(result.dependencies) ? result.dependencies : [];

      return `
        <div class="idea-review-meta-row">
          ${renderStatusBadge(request.status)}
          <span class="idea-review-pill"><strong>Provider</strong><span>${escapeHtml(request.providerUsed || 'Pending')}</span></span>
          <span class="idea-review-pill"><strong>Completed</strong><span>${escapeHtml(formatDateTime(request.completedAt || request.updatedAt))}</span></span>
        </div>
        <div class="idea-review-divider"></div>
        <p class="idea-review-result-summary">${escapeHtml(result.summary || request.resultText || 'No summary available.')}</p>
        <div class="idea-review-result-grid">
          <div class="idea-review-result-card"><h4>Implementation Steps</h4>${steps.length ? `<ul>${steps.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No steps returned.</div>'}</div>
          <div class="idea-review-result-card"><h4>Architecture Suggestions</h4>${architecture.length ? `<ul>${architecture.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No architecture notes returned.</div>'}</div>
          <div class="idea-review-result-card"><h4>Next File Changes</h4>${changes.length ? `<ul>${changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No file changes returned.</div>'}</div>
          <div class="idea-review-result-card"><h4>Warnings & Dependencies</h4>${[...warnings, ...dependencies].length ? `<ul>${[...warnings, ...dependencies].map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No warnings returned.</div>'}</div>
        </div>
      `;
    }

    const gaps = Array.isArray(result.biggestGaps) ? result.biggestGaps : [];
    const risks = Array.isArray(result.biggestRisks) ? result.biggestRisks : [];
    const assumptions = Array.isArray(result.missingAssumptions) ? result.missingAssumptions : [];
    const actions = Array.isArray(result.priorityActions) ? result.priorityActions : [];
    const notesForBuild = Array.isArray(result.notesForBuild) ? result.notesForBuild : [];

    return `
      <div class="idea-review-meta-row">
        ${renderStatusBadge(request.status)}
        <span class="idea-review-pill"><strong>Decision</strong><span>${escapeHtml(result.decision || result.goNoGoRecommendation || 'Pending')}</span></span>
        <span class="idea-review-pill"><strong>Provider</strong><span>${escapeHtml(request.providerUsed || 'Pending')}</span></span>
      </div>
      <div class="idea-review-divider"></div>
      <p class="idea-review-result-summary"><strong>${escapeHtml(result.verdict || 'Verdict pending')}</strong><br>${escapeHtml(result.summary || request.resultText || 'No summary available.')}</p>
      <div class="idea-review-result-grid">
        <div class="idea-review-result-card"><h4>Biggest Gaps</h4>${gaps.length ? `<ul>${gaps.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No gaps returned.</div>'}</div>
        <div class="idea-review-result-card"><h4>Biggest Risks</h4>${risks.length ? `<ul>${risks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No risks returned.</div>'}</div>
        <div class="idea-review-result-card"><h4>Missing Assumptions</h4>${assumptions.length ? `<ul>${assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No assumptions returned.</div>'}</div>
        <div class="idea-review-result-card"><h4>Priority Actions</h4>${actions.length ? `<ul>${actions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="idea-review-empty">No actions returned.</div>'}</div>
      </div>
      ${notesForBuild.length ? `<div class="idea-review-result-card" style="margin-top:14px;"><h4>Notes for Build</h4><ul>${notesForBuild.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    `;
  }

  function render() {
    const panel = document.getElementById('reviewIdeasView');
    if (!panel) {
      return;
    }

    if (!state.draft) {
      state.draft = makeDraft();
    }

    const selectedRequest = getSelectedRequest();
    const providerLabel = state.provider?.label || 'Provider loading…';
    const providerMode = state.provider?.mode === 'launcher' ? 'Launcher-backed' : 'Mock fallback';
    const saveBusy = state.busyAction === 'save';
    const runBusy = state.busyAction === 'run';
    const duplicateBusy = state.busyAction === 'duplicate';
    const exportBusy = state.busyAction === 'export';

    if (state.loading && !state.requests.length) {
      panel.innerHTML = `
        <section class="section-stack idea-review-shell">
          <div class="section-header">
            <div>
              <h2 class="section-title">Review Ideas</h2>
              <p class="section-copy">Loading the internal Claude review workspace...</p>
            </div>
          </div>
          <div class="idea-review-empty">Mission Control is loading the Review Ideas workspace.</div>
        </section>
      `;
      return;
    }

    if (state.error && !state.requests.length) {
      panel.innerHTML = `
        <section class="section-stack idea-review-shell">
          <div class="section-header">
            <div>
              <h2 class="section-title">Review Ideas</h2>
              <p class="section-copy">Internal idea review, critique, and build requests live here inside Mission Control.</p>
            </div>
          </div>
          <div class="idea-review-error">${escapeHtml(state.error)}</div>
          <div class="idea-review-actions">
            <button class="button primary" type="button" data-idea-action="refresh">Retry</button>
          </div>
        </section>
      `;
      return;
    }

    panel.innerHTML = `
      <section class="section-stack idea-review-shell">
        <div class="section-header">
          <div>
            <h2 class="section-title">Review Ideas</h2>
            <p class="section-copy">Internal-only strategic critique and build packaging for Mission Control. This stays out of the customer-facing product surface.</p>
          </div>
          <div class="idea-review-inline-actions">
            <button class="button ghost" type="button" data-idea-action="refresh">Refresh</button>
            <button class="button primary" type="button" data-idea-action="new">New Request</button>
          </div>
        </div>

        <div class="idea-review-kpi-grid">${renderKpis()}</div>

        <article class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Provider & Status</h3>
              <p class="panel-copy">Launcher-backed Claude review inside Mission Control, with persisted history and exportable results.</p>
            </div>
            ${selectedRequest ? renderStatusBadge(selectedRequest.status) : renderStatusBadge('draft')}
          </div>
          <div class="idea-review-meta-row">
            <span class="idea-review-pill"><strong>Provider</strong><span>${escapeHtml(providerLabel)}</span></span>
            <span class="idea-review-pill"><strong>Mode</strong><span>${escapeHtml(providerMode)}</span></span>
            <span class="idea-review-pill"><strong>Selected</strong><span>${escapeHtml(selectedRequest?.title || 'Unsaved draft')}</span></span>
          </div>
          ${state.error ? `<div class="idea-review-error" style="margin-top:14px;">${escapeHtml(state.error)}</div>` : ''}
        </article>

        <div class="idea-review-grid">
          <div class="idea-review-card-stack">
            <article class="panel">
              <div class="panel-header">
                <div>
                  <h3 class="panel-title">Request Package</h3>
                  <p class="panel-copy">Paste the idea, attach supporting files, and choose whether Claude should review or build from it.</p>
                </div>
              </div>

              <div class="idea-review-mode-toggle">
                <button class="button ${state.draft.mode === 'REVIEW' ? 'primary' : 'secondary'} idea-review-mode-button" type="button" data-idea-action="mode" data-mode="REVIEW">Review</button>
                <button class="button ${state.draft.mode === 'BUILD' ? 'primary' : 'secondary'} idea-review-mode-button" type="button" data-idea-action="mode" data-mode="BUILD">Build</button>
              </div>

              <div class="modal-grid" style="margin-top:18px;">
                <label class="field-label">Request Title
                  <input class="glass-input" type="text" data-review-field="title" value="${escapeHtml(state.draft.title)}" placeholder="Optional title for quick history scanning">
                </label>
                <label class="field-label">Prompt Template
                  <select class="glass-input" data-review-field="promptTemplate" id="reviewIdeaTemplate">
                    ${state.templates.map(template => `<option value="${escapeHtml(template.key)}"${template.key === state.draft.promptTemplate ? ' selected' : ''}>${escapeHtml(template.label)}</option>`).join('')}
                  </select>
                </label>
                <label class="field-label" style="grid-column:1 / -1;">Prompt Instructions
                  <textarea class="glass-textarea" data-review-field="promptInstructions" placeholder="Tell Claude how to frame the response.">${escapeHtml(state.draft.promptInstructions)}</textarea>
                </label>
                <label class="field-label" style="grid-column:1 / -1;">Idea / Spec
                  <textarea class="glass-textarea" data-review-field="sourceText" placeholder="Paste the idea, spec, notes, or build request here.">${escapeHtml(state.draft.sourceText)}</textarea>
                </label>
                <label class="field-label" style="grid-column:1 / -1;">Folder Summary
                  <textarea class="glass-textarea" data-review-field="folderSummaryText" placeholder="If a full folder upload is too heavy, paste or attach one summary file here.">${escapeHtml(state.draft.folderSummaryText)}</textarea>
                </label>
              </div>

              <div class="idea-review-note">Folder upload stays summary-based for now. Attach one summary file or paste the folder notes here when a full folder handoff would be too large.</div>

              <div class="idea-review-dropzone" style="margin-top:18px;">
                <div>
                  <strong style="display:block; margin-bottom:6px;">Attachments</strong>
                  <div class="panel-copy">Accepted: ${escapeHtml(ACCEPT)} · Up to ${MAX_ATTACHMENTS} files · ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / 1000)} KB each</div>
                </div>
                <input id="reviewIdeaFiles" type="file" accept="${escapeHtml(ACCEPT)}" multiple>
                <div class="idea-review-attachment-list">${renderAttachments()}</div>
              </div>

              <div class="idea-review-actions" style="margin-top:18px;">
                <button class="button secondary" type="button" data-idea-action="save"${saveBusy ? ' disabled' : ''}>${saveBusy ? 'Saving…' : 'Save Draft'}</button>
                <button class="button primary" type="button" data-idea-action="run"${runBusy ? ' disabled' : ''}>${runBusy ? (state.draft.mode === 'BUILD' ? 'Building…' : 'Reviewing…') : (state.draft.mode === 'BUILD' ? 'Send Build Request' : 'Send Review')}</button>
                <button class="button ghost" type="button" data-idea-action="copy-prompt">Copy Prompt</button>
                <button class="button ghost" type="button" data-idea-action="duplicate"${selectedRequest ? '' : ' disabled'}>${duplicateBusy ? 'Duplicating…' : 'Duplicate'}</button>
              </div>
            </article>

            <article class="panel">
              <div class="panel-header">
                <div>
                  <h3 class="panel-title">Review History</h3>
                  <p class="panel-copy">Reopen prior requests, compare outcomes over time, and reuse the best prompts without leaving Mission Control.</p>
                </div>
              </div>
              <div class="idea-review-history-list">${renderHistory()}</div>
            </article>
          </div>

          <div class="idea-review-card-stack">
            <article class="panel">
              <div class="panel-header">
                <div>
                  <h3 class="panel-title">Structured Result</h3>
                  <p class="panel-copy">Operator-ready verdicts, risks, actions, and implementation guidance are stored here for later reference.</p>
                </div>
                <div class="idea-review-inline-actions">
                  <button class="button ghost" type="button" data-idea-action="copy-result"${selectedRequest?.resultText ? '' : ' disabled'}>Copy Result</button>
                  <button class="button ghost" type="button" data-idea-action="export"${selectedRequest ? '' : ' disabled'}>${exportBusy ? 'Exporting…' : 'Export Markdown'}</button>
                </div>
              </div>
              ${renderReviewResult(selectedRequest)}
            </article>

            <article class="panel">
              <div class="panel-header">
                <div>
                  <h3 class="panel-title">Prompt Preview</h3>
                  <p class="panel-copy">This is the package Mission Control will hand to the Claude launcher after the request is saved.</p>
                </div>
              </div>
              <pre class="idea-review-json">${escapeHtml(buildPromptPreview())}</pre>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  document.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-idea-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.ideaAction;
    const id = actionTarget.dataset.id;

    if (action === 'refresh') {
      loadWorkspace();
      return;
    }

    if (action === 'new') {
      state.selectedId = '';
      state.draft = makeDraft(state.draft?.mode || 'REVIEW');
      render();
      return;
    }

    if (action === 'select' && id) {
      selectRequest(id);
      return;
    }

    if (action === 'mode' && actionTarget.dataset.mode) {
      setMode(actionTarget.dataset.mode);
      return;
    }

    if (action === 'save') {
      saveDraft();
      return;
    }

    if (action === 'run') {
      runReview();
      return;
    }

    if (action === 'duplicate') {
      duplicateSelected();
      return;
    }

    if (action === 'export') {
      exportSelected();
      return;
    }

    if (action === 'copy-prompt') {
      copyPrompt();
      return;
    }

    if (action === 'copy-result') {
      copyResult();
      return;
    }

    if (action === 'remove-attachment') {
      removeAttachment(Number(actionTarget.dataset.index || 0));
    }
  });

  document.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('[data-review-field]')) return;
    const field = target.dataset.reviewField;
    if (!field) return;
    updateDraftField(field, target.value);
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'reviewIdeaFiles' && target.files) {
      handleFileSelection(target.files);
      target.value = '';
      return;
    }

    if (target.id === 'reviewIdeaTemplate') {
      setTemplate(target.value);
    }
  });

  loadWorkspace();
})();
