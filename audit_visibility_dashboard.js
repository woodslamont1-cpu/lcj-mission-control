(() => {
  if (window.__MISSION_CONTROL_AUDIT_VISIBILITY__) return;
  window.__MISSION_CONTROL_AUDIT_VISIBILITY__ = true;

  const SUBTABS = [
    { key: "newAudit", label: "New Audit" },
    { key: "findings", label: "Findings" },
    { key: "deliverable", label: "Deliverable" },
    { key: "history", label: "History" },
  ];

  const FIELD_MAP = [
    ["clientAccountName", "Client Account Name"],
    ["businessBrandName", "Business / Brand Name"],
    ["targetWebsiteUrl", "Target Website URL"],
    ["auditOwner", "Audit Owner"],
    ["primaryContact", "Primary Contact"],
    ["marketCity", "Market / City / State"],
    ["marketState", "State"],
    ["primaryServiceOffer", "Primary Service / Offer"],
    ["auditType", "Audit Type"],
    ["priorityNotesGoals", "Priority Notes / Goals"],
  ];

  const state = {
    loading: false,
    error: "",
    workspace: null,
    visibilitySnapshot: null,
    activeSubtab: "newAudit",
    selectedAuditId: "",
    form: buildBlankForm(),
    busyAction: "",
  };

  const style = document.createElement("style");
  style.textContent = `
    .audit-shell { display:grid; gap:18px; }
    .audit-card { border-radius:24px; border:1px solid rgba(255,255,255,.06); background:linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.02)); padding:24px; box-shadow:0 24px 48px rgba(0,0,0,.24); }
    .audit-hero { display:grid; gap:18px; }
    .audit-hero-top { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; align-items:flex-start; }
    .audit-kicker { margin:0 0 8px; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:rgba(216,184,104,.82); }
    .audit-title { margin:0; font-size:28px; font-weight:800; color:var(--text-primary, #f5f2ea); }
    .audit-copy { margin:10px 0 0; max-width:760px; color:rgba(245,242,234,.62); line-height:1.6; }
    .audit-status-pill { display:inline-flex; align-items:center; gap:10px; padding:10px 14px; border-radius:999px; border:1px solid rgba(216,184,104,.22); background:rgba(216,184,104,.08); color:#f4ddb0; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
    .audit-summary-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; }
    .audit-summary-card { padding:16px 18px; border-radius:18px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.025); min-height:100px; }
    .audit-summary-card--wide { grid-column:span 2; }
    .audit-label { display:block; margin-bottom:10px; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:rgba(245,242,234,.52); }
    .audit-value { color:var(--text-primary, #f5f2ea); font-size:16px; line-height:1.55; word-break:break-word; }
    .audit-value strong { font-size:30px; line-height:1; display:inline-block; letter-spacing:-.03em; }
    .audit-link-field { display:grid; gap:8px; }
    .audit-link-field input { width:100%; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(9,11,18,.72); color:rgba(245,242,234,.86); font:inherit; padding:12px 13px; }
    .audit-subtabs { display:flex; flex-wrap:wrap; gap:10px; }
    .audit-subtab { padding:10px 16px; border-radius:999px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); color:rgba(245,242,234,.72); font-size:13px; font-weight:700; }
    .audit-subtab.active { border-color:rgba(216,184,104,.32); background:rgba(216,184,104,.12); color:#f5f2ea; }
    .audit-layout { display:grid; grid-template-columns:minmax(0, 1.12fr) minmax(300px, .88fr); gap:18px; align-items:start; }
    .audit-stack { display:grid; gap:18px; }
    .audit-state { padding:18px; border-radius:18px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); color:rgba(245,242,234,.68); }
    .audit-state.error { border-color:rgba(255,120,131,.18); background:rgba(255,120,131,.08); color:#ffccd0; }
    .audit-form-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
    .audit-field { display:grid; gap:8px; }
    .audit-field.audit-field--wide { grid-column:1 / -1; }
    .audit-field label { font-size:12px; font-weight:700; color:rgba(245,242,234,.78); }
    .audit-input, .audit-select, .audit-textarea { width:100%; border-radius:16px; border:1px solid rgba(255,255,255,.08); background:rgba(9,11,18,.72); color:var(--text-primary, #f5f2ea); font:inherit; padding:13px 14px; outline:none; transition:border-color 160ms ease, box-shadow 160ms ease; }
    .audit-input:focus, .audit-select:focus, .audit-textarea:focus { border-color:rgba(216,184,104,.34); box-shadow:0 0 0 4px rgba(216,184,104,.08); }
    .audit-textarea { min-height:120px; resize:vertical; }
    .audit-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:4px; }
    .audit-meta-list { display:grid; gap:12px; }
    .audit-meta-item { padding:14px 16px; border-radius:16px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.025); }
    .audit-meta-item strong { display:block; margin-bottom:6px; color:var(--text-primary, #f5f2ea); }
    .audit-meta-item span { color:rgba(245,242,234,.62); font-size:13px; line-height:1.55; word-break:break-word; }
    .audit-score-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
    .audit-list-card ul { margin:0; padding-left:18px; display:grid; gap:8px; color:rgba(245,242,234,.74); }
    .audit-deliverable-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
    .audit-plan-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
    .audit-frame { width:100%; min-height:920px; border:none; border-radius:18px; background:#f7f3eb; box-shadow:inset 0 0 0 1px rgba(255,255,255,.05); }
    .audit-table-shell { overflow:auto; border-radius:18px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); }
    .audit-table { width:100%; border-collapse:collapse; min-width:900px; }
    .audit-table th, .audit-table td { padding:14px 16px; text-align:left; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:top; }
    .audit-table th { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:rgba(245,242,234,.5); }
    .audit-table td { color:rgba(245,242,234,.76); }
    .audit-table tr:last-child td { border-bottom:none; }
    .audit-row-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .audit-inline-note { margin-top:8px; color:rgba(245,242,234,.58); font-size:12px; line-height:1.55; }
    @media (max-width: 1180px) {
      .audit-summary-grid, .audit-score-grid, .audit-deliverable-grid, .audit-plan-grid, .audit-layout { grid-template-columns:1fr; }
      .audit-form-grid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);

  function buildBlankForm() {
    return {
      auditId: "",
      clientAccountName: "",
      businessBrandName: "",
      targetWebsiteUrl: "",
      auditOwner: "",
      primaryContact: "",
      marketCity: "",
      marketState: "",
      primaryServiceOffer: "",
      auditType: "SEO",
      priorityNotesGoals: "",
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatValue(value, fallback = "—") {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function notify(message, tone = "good") {
    const toastRoot = document.getElementById("toastRoot");
    if (!toastRoot) return;
    const node = document.createElement("div");
    node.className = `toast ${tone}`;
    node.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    toastRoot.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      node.style.transition = "opacity 180ms ease, transform 180ms ease";
      setTimeout(() => node.remove(), 180);
    }, 2600);
  }

  function getCurrentAudit() {
    return state.workspace?.current || null;
  }

  function getHeroAuditData() {
    const current = getCurrentAudit();
    if (current) {
      return {
        clientName: current.input.businessBrandName ?? current.entry.client_name,
        targetUrl: current.input.targetWebsiteUrl ?? current.entry.target_url,
        auditStatus: current.status.auditStatus ?? current.entry.audit_status,
        overallScore: current.analysis.overallScore ?? current.entry.overall_score,
        grade: current.analysis.grade ?? current.entry.grade,
        reportPath: current.status.reportPath ?? current.entry.report_path,
        shareLink: current.status.reportHtmlPath ?? current.entry.share_link,
        readyForProposal: current.handoff.readyForProposal ?? current.entry.ready_for_proposal,
        handoffState: current.handoff.handoffState ?? current.entry.handoff_state,
        auditOwner: current.input.auditOwner ?? current.entry.audit_owner,
      };
    }

    if (state.visibilitySnapshot) {
      return {
        clientName: state.visibilitySnapshot.client_name,
        targetUrl: state.visibilitySnapshot.target_url,
        auditStatus: state.visibilitySnapshot.audit_status,
        overallScore: state.visibilitySnapshot.overall_score,
        grade: state.visibilitySnapshot.grade,
        reportPath: state.visibilitySnapshot.report_path,
        shareLink: state.visibilitySnapshot.share_link,
        readyForProposal: state.visibilitySnapshot.ready_for_proposal,
        handoffState: state.visibilitySnapshot.handoff_state,
        auditOwner: state.visibilitySnapshot.audit_owner,
      };
    }

    return null;
  }

  function getDraftAudit() {
    return state.workspace?.draft || null;
  }

  function getHistoryAudits() {
    return state.workspace?.history || [];
  }

  function getSelectedAudit() {
    const current = getCurrentAudit();
    const history = getHistoryAudits();
    if (state.selectedAuditId) {
      return history.find(item => item.entry.audit_id === state.selectedAuditId) || current;
    }
    return current || history[0] || null;
  }

  function applyFormFromWorkspace() {
    const draft = getDraftAudit();
    if (draft?.input) {
      state.form = { ...buildBlankForm(), ...draft.input };
      return;
    }
    const current = getCurrentAudit();
    if (current?.input) {
      state.form = {
        ...buildBlankForm(),
        clientAccountName: current.input.clientAccountName,
        businessBrandName: current.input.businessBrandName,
        targetWebsiteUrl: current.input.targetWebsiteUrl,
        auditOwner: current.input.auditOwner,
        primaryContact: current.input.primaryContact,
        marketCity: current.input.marketCity,
        marketState: current.input.marketState,
        primaryServiceOffer: current.input.primaryServiceOffer,
        auditType: current.input.auditType || "SEO",
        priorityNotesGoals: "",
      };
    } else {
      state.form = buildBlankForm();
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : payload.error || `Request failed with ${response.status}`);
    }
    return payload;
  }

  async function loadWorkspace() {
    state.loading = true;
    state.error = "";
    render();

    if (!state.visibilitySnapshot) {
      try {
        state.visibilitySnapshot = await requestJson("/data/mission_control/audit_visibility.json");
        render();
      } catch (error) {
        console.warn("Audit visibility snapshot unavailable", error);
      }
    }

    try {
      state.workspace = await requestJson("/api/aeo-seo-audit/workspace");
      if (!state.selectedAuditId) {
        state.selectedAuditId = state.workspace.current?.entry.audit_id || state.workspace.history?.[0]?.entry.audit_id || "";
      }
      applyFormFromWorkspace();
    } catch (error) {
      state.error = error.message || "Failed to load audit workspace.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function submitAuditAction(action) {
    state.busyAction = action;
    render();
    try {
      const nextWorkspace = await requestJson(action === "draft" ? "/api/aeo-seo-audit/draft" : "/api/aeo-seo-audit/run", {
        method: "POST",
        body: JSON.stringify(state.form),
      });
      state.workspace = nextWorkspace;
      state.selectedAuditId = nextWorkspace.current?.entry.audit_id || state.form.auditId || state.selectedAuditId;
      applyFormFromWorkspace();
      if (action === "run") {
        state.activeSubtab = "findings";
        notify("Audit package generated and bound to canonical files.");
      } else {
        notify("Audit intake draft saved.");
      }
    } catch (error) {
      notify(error.message || "Audit action failed.", "warn");
    } finally {
      state.busyAction = "";
      render();
    }
  }

  function setSelectedAudit(auditId, subtab) {
    state.selectedAuditId = auditId;
    if (subtab) state.activeSubtab = subtab;
    render();
  }

  function renderSummaryCard(label, value) {
    return `
      <div class="audit-summary-card">
        <span class="audit-label">${escapeHtml(label)}</span>
        <div class="audit-value">${value}</div>
      </div>
    `;
  }

  function renderWideSummaryCard(label, value) {
    return `
      <div class="audit-summary-card audit-summary-card--wide">
        <span class="audit-label">${escapeHtml(label)}</span>
        <div class="audit-value">${value}</div>
      </div>
    `;
  }

  function renderNewAudit() {
    const current = getCurrentAudit();
    const history = getHistoryAudits();
    const latestMeta = history[0]?.entry || current?.entry || null;
    return `
      <div class="audit-layout">
        <section class="audit-card">
          <div class="audit-stack">
            <div>
              <h3 class="panel-title">New Audit Intake</h3>
              <p class="panel-copy">Create the next audit package from a canonical intake. Saving or running writes directly into the business/client-work audit structure.</p>
            </div>
            <div class="audit-form-grid">
              ${FIELD_MAP.map(([key, label]) => {
                const wide = key === "priorityNotesGoals";
                if (key === "auditType") {
                  return `
                    <div class="audit-field${wide ? " audit-field--wide" : ""}">
                      <label for="audit-${escapeHtml(key)}">${escapeHtml(label)}</label>
                      <select id="audit-${escapeHtml(key)}" class="audit-select" data-audit-field="${escapeHtml(key)}">
                        ${(state.workspace?.audit_types || []).map(type => `<option value="${escapeHtml(type)}"${state.form[key] === type ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}
                      </select>
                    </div>
                  `;
                }
                const tag = key === "priorityNotesGoals" ? "textarea" : "input";
                const classes = key === "priorityNotesGoals" ? "audit-textarea" : "audit-input";
                const attrs = key === "priorityNotesGoals"
                  ? `data-audit-field="${escapeHtml(key)}"`
                  : `type="${key === "targetWebsiteUrl" ? "url" : "text"}" value="${escapeHtml(state.form[key] || "")}" data-audit-field="${escapeHtml(key)}"`;
                const body = tag === "textarea"
                  ? `<textarea id="audit-${escapeHtml(key)}" class="${classes}" ${attrs}>${escapeHtml(state.form[key] || "")}</textarea>`
                  : `<input id="audit-${escapeHtml(key)}" class="${classes}" ${attrs} />`;
                return `
                  <div class="audit-field${wide ? " audit-field--wide" : ""}">
                    <label for="audit-${escapeHtml(key)}">${escapeHtml(label)}</label>
                    ${body}
                  </div>
                `;
              }).join("")}
            </div>
            <div class="audit-actions">
              <button class="button primary" type="button" data-audit-action="run"${state.busyAction ? " disabled" : ""}>${state.busyAction === "run" ? "Running Audit..." : "Run Audit"}</button>
              <button class="button secondary" type="button" data-audit-action="draft"${state.busyAction ? " disabled" : ""}>${state.busyAction === "draft" ? "Saving Draft..." : "Save Draft"}</button>
              <button class="button ghost" type="button" data-audit-action="open-deliverable"${current?.status?.reportHtmlPath ? "" : " disabled"}>Open Latest Deliverable</button>
            </div>
          </div>
        </section>

        <aside class="audit-stack">
          <section class="audit-card">
            <div>
              <h3 class="panel-title">Operator Metadata</h3>
              <p class="panel-copy">The raw audit id and report path now live here instead of the main hero so the surface stays focused on execution.</p>
            </div>
            <div class="audit-meta-list" style="margin-top:14px;">
              <div class="audit-meta-item">
                <strong>Latest Audit</strong>
                <span>${escapeHtml(formatValue(latestMeta?.audit_id))}</span>
              </div>
              <div class="audit-meta-item">
                <strong>Report Path</strong>
                <span>${escapeHtml(formatValue(latestMeta?.report_path))}</span>
              </div>
              <div class="audit-meta-item">
                <strong>Latest Completed</strong>
                <span>${escapeHtml(formatDateTime(latestMeta?.timestamp))}</span>
              </div>
            </div>
          </section>
          <section class="audit-card">
            <div>
              <h3 class="panel-title">Canonical Bindings</h3>
              <p class="panel-copy">This intake and the downstream tabs read and write only the approved audit files.</p>
            </div>
            <div class="audit-meta-list" style="margin-top:14px;">
              <div class="audit-meta-item"><strong>Visibility Index</strong><span>${escapeHtml(state.workspace?.canonical?.visibility_path || "—")}</span></div>
              <div class="audit-meta-item"><strong>Business Root</strong><span>${escapeHtml(state.workspace?.canonical?.business_root || "—")}</span></div>
            </div>
          </section>
        </aside>
      </div>
    `;
  }

  function renderFindings() {
    const selected = getSelectedAudit();
    if (!selected) {
      return `<div class="audit-state">No canonical audit is available yet.</div>`;
    }
    const analysis = selected.analysis;
    return `
      <div class="audit-stack">
        <section class="audit-card">
          <div>
            <h3 class="panel-title">Findings Breakdown</h3>
            <p class="panel-copy">Canonical score detail and operator-ready priorities for ${escapeHtml(selected.input.businessBrandName)}.</p>
          </div>
          <div class="audit-score-grid" style="margin-top:16px;">
            ${[
              ["Overall Score", analysis.overallScore ?? "—", analysis.grade || "—"],
              ["Visibility Score", analysis.visibilityScore ?? "—", ""],
              ["AEO Score", analysis.aeoScore ?? "—", ""],
              ["Technical SEO Score", analysis.technicalSeoScore ?? "—", ""],
              ["Local Presence Score", analysis.localPresenceScore ?? "—", ""],
              ["Content Quality Score", analysis.contentQualityScore ?? "—", ""],
              ["Competitor Gap Score", analysis.competitorGapScore ?? "—", ""],
            ].map(([label, value, grade]) => renderSummaryCard(label, `<strong>${escapeHtml(String(value))}</strong>${grade ? `<div class="audit-inline-note">Grade · ${escapeHtml(String(grade))}</div>` : ""}`)).join("")}
          </div>
        </section>
        <section class="audit-deliverable-grid">
          <div class="audit-card audit-list-card">
            <h3 class="panel-title">Top Risks</h3>
            <p class="panel-copy">What can suppress visibility, trust, or proposal momentum if it stays unresolved.</p>
            <ul style="margin-top:14px;">${analysis.topRisks.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="audit-card audit-list-card">
            <h3 class="panel-title">Top Opportunities</h3>
            <p class="panel-copy">The moves most likely to improve extractability, authority, and close quality.</p>
            <ul style="margin-top:14px;">${analysis.topOpportunities.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="audit-card audit-list-card">
            <h3 class="panel-title">Priority Fixes</h3>
            <p class="panel-copy">The work that should move first if this audit turns into scoped delivery.</p>
            <ul style="margin-top:14px;">${analysis.priorityFixes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </section>
      </div>
    `;
  }

  function renderDeliverable() {
    const selected = getSelectedAudit();
    if (!selected) {
      return `<div class="audit-state">No deliverable is available yet.</div>`;
    }
    const pricingPackagePath = (selected.status.reportHtmlPath || "").replace(/report\.html$/, "pricing_external.json");
    return `
      <div class="audit-stack">
        <section class="audit-card">
          <div class="audit-hero-top">
            <div>
              <h3 class="panel-title">Client-Facing Deliverable</h3>
              <p class="panel-copy">This view is shaped for operator review and client presentation. The narrative below is bound to the canonical report and analysis files for ${escapeHtml(selected.input.businessBrandName)}.</p>
            </div>
            <div class="audit-row-actions">
              <button class="button secondary" type="button" data-open-report="${escapeHtml(selected.status.reportHtmlPath || "")}">Open Report HTML</button>
              <button class="button ghost" type="button" data-open-report="${escapeHtml(selected.status.reportPath || "")}">Open Report Markdown</button>
              <button class="button secondary" type="button" data-open-report="${escapeHtml(pricingPackagePath)}">Open Pricing Package</button>
            </div>
          </div>
          <div class="audit-deliverable-grid" style="margin-top:16px;">
            <div class="audit-summary-card">
              <span class="audit-label">Business Impact</span>
              <div class="audit-value">${escapeHtml(selected.analysis.businessImpact)}</div>
            </div>
            <div class="audit-summary-card">
              <span class="audit-label">Missed Visibility</span>
              <div class="audit-value">${escapeHtml(selected.analysis.missedVisibility)}</div>
            </div>
            <div class="audit-summary-card">
              <span class="audit-label">Why The Fixes Matter</span>
              <div class="audit-value">${escapeHtml(selected.analysis.whyFixesMatter)}</div>
            </div>
            <div class="audit-summary-card audit-summary-card--wide">
              <span class="audit-label">Pricing Package</span>
              <div class="audit-link-field"><input type="text" readonly value="${escapeHtml(pricingPackagePath)}" /></div>
            </div>
          </div>
        </section>
        <section class="audit-card">
          <div>
            <h3 class="panel-title">30 / 60 / 90 Day Action Plan</h3>
            <p class="panel-copy">A proposal-ready execution sequence pulled from canonical analysis data.</p>
          </div>
          <div class="audit-plan-grid" style="margin-top:16px;">
            ${[
              ["30 Days", selected.analysis.plan306090.days30 || []],
              ["60 Days", selected.analysis.plan306090.days60 || []],
              ["90 Days", selected.analysis.plan306090.days90 || []],
            ].map(([label, items]) => `
              <div class="audit-summary-card audit-list-card">
                <span class="audit-label">${escapeHtml(label)}</span>
                <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="audit-card">
          <div>
            <h3 class="panel-title">Canonical Report</h3>
            <p class="panel-copy">Embedded directly from the canonical <code>report.html</code> file so the operator view matches the deliverable artifact.</p>
          </div>
          <div style="margin-top:16px;">
            <iframe class="audit-frame" src="${escapeHtml(selected.reportHtmlPath || selected.status.reportHtmlPath || "")}" title="Audit Deliverable"></iframe>
          </div>
        </section>
      </div>
    `;
  }

  function renderHistory() {
    const history = getHistoryAudits();
    const latest = history[0];
    return `
      <div class="audit-stack">
        <section class="audit-card">
          <div>
            <h3 class="panel-title">History Metadata</h3>
            <p class="panel-copy">Last audit and report path live here instead of the main audit hero.</p>
          </div>
          <div class="audit-meta-list" style="margin-top:14px;">
            <div class="audit-meta-item"><strong>Last Audit</strong><span>${escapeHtml(formatValue(latest?.entry.audit_id))}</span></div>
            <div class="audit-meta-item"><strong>Report Path</strong><span>${escapeHtml(formatValue(latest?.entry.report_path))}</span></div>
          </div>
        </section>
        <section class="audit-card">
          <div>
            <h3 class="panel-title">Audit History</h3>
            <p class="panel-copy">Latest audits with status, score, owner, timestamp, and direct report access.</p>
          </div>
          <div class="audit-table-shell" style="margin-top:16px;">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Audit</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Owner</th>
                  <th>Timestamp</th>
                  <th>Report Link / Path</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(item => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(item.entry.client_name)}</strong>
                      <div class="audit-inline-note">${escapeHtml(item.entry.audit_id)}</div>
                    </td>
                    <td>${escapeHtml(formatValue(item.entry.audit_status))}</td>
                    <td>${escapeHtml(formatValue(item.entry.overall_score))}</td>
                    <td>${escapeHtml(formatValue(item.entry.grade))}</td>
                    <td>${escapeHtml(formatValue(item.entry.audit_owner))}</td>
                    <td>${escapeHtml(formatDateTime(item.entry.timestamp))}</td>
                    <td>
                      <div>${escapeHtml(formatValue(item.entry.report_html_path))}</div>
                      <div class="audit-inline-note">${escapeHtml(formatValue(item.entry.report_path))}</div>
                    </td>
                    <td>
                      <div class="audit-row-actions">
                        <button class="button secondary" type="button" data-history-open-findings="${escapeHtml(item.entry.audit_id)}">View Findings</button>
                        <button class="button ghost" type="button" data-history-open-deliverable="${escapeHtml(item.entry.audit_id)}">Open Deliverable</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  function renderActiveSubtab() {
    if (state.activeSubtab === "findings") return renderFindings();
    if (state.activeSubtab === "deliverable") return renderDeliverable();
    if (state.activeSubtab === "history") return renderHistory();
    return renderNewAudit();
  }

  function bindEvents() {
    document.querySelectorAll("[data-audit-subtab]").forEach(button => {
      button.addEventListener("click", () => {
        state.activeSubtab = button.getAttribute("data-audit-subtab");
        render();
      });
    });

    document.querySelectorAll("[data-audit-field]").forEach(field => {
      field.addEventListener("input", event => {
        const key = event.currentTarget.getAttribute("data-audit-field");
        state.form[key] = event.currentTarget.value;
      });
      field.addEventListener("change", event => {
        const key = event.currentTarget.getAttribute("data-audit-field");
        state.form[key] = event.currentTarget.value;
      });
    });

    document.querySelectorAll("[data-audit-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-audit-action");
        if (action === "open-deliverable") {
          const current = getCurrentAudit();
          if (current?.status?.reportHtmlPath) {
            state.selectedAuditId = current.entry.audit_id;
            state.activeSubtab = "deliverable";
            render();
          }
          return;
        }
        submitAuditAction(action);
      });
    });

    document.querySelectorAll("[data-open-report]").forEach(button => {
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-open-report");
        if (url) window.open(url, "_blank", "noopener");
      });
    });

    document.querySelectorAll("[data-history-open-findings]").forEach(button => {
      button.addEventListener("click", () => setSelectedAudit(button.getAttribute("data-history-open-findings"), "findings"));
    });

    document.querySelectorAll("[data-history-open-deliverable]").forEach(button => {
      button.addEventListener("click", () => setSelectedAudit(button.getAttribute("data-history-open-deliverable"), "deliverable"));
    });
  }

  function render() {
    const root = document.getElementById("aeoSeoAuditView");
    if (!root) return;

    const hero = getHeroAuditData();

    if (state.loading && hero) {
      root.innerHTML = `
        <div class="audit-shell">
          <section class="audit-card audit-hero">
            <div class="audit-hero-top">
              <div>
                <p class="audit-kicker">System 2 Engine</p>
                <h2 class="audit-title">AEO / SEO Audit</h2>
                <p class="audit-copy">Operator-facing audit intake, findings, deliverable, and history surface. This workbench reads and writes only canonical Mission Control audit files.</p>
              </div>
              <div class="audit-status-pill">Current Audit Status · ${escapeHtml(formatValue(hero.auditStatus, "unknown"))}</div>
            </div>
            <div class="audit-summary-grid">
              ${renderSummaryCard("client name", `<span>${escapeHtml(formatValue(hero.clientName))}</span>`)}
              ${renderSummaryCard("target URL", `<span>${escapeHtml(formatValue(hero.targetUrl))}</span>`)}
              ${renderSummaryCard("audit status", `<span>${escapeHtml(formatValue(hero.auditStatus, "unknown"))}</span>`)}
              ${renderSummaryCard("overall score", `<strong>${escapeHtml(formatValue(hero.overallScore))}</strong>`)}
              ${renderSummaryCard("grade", `<strong>${escapeHtml(formatValue(hero.grade))}</strong>`)}
              ${renderSummaryCard("ready_for_proposal", `<span>${escapeHtml(formatValue(hero.readyForProposal))}</span>`)}
              ${renderSummaryCard("handoff_state", `<span>${escapeHtml(formatValue(hero.handoffState))}</span>`)}
              ${renderSummaryCard("audit owner", `<span>${escapeHtml(formatValue(hero.auditOwner))}</span>`)}
              ${renderWideSummaryCard("report path", `<div class="audit-link-field"><input type="text" readonly value="${escapeHtml(formatValue(hero.reportPath))}" /></div>`)}
              ${renderWideSummaryCard("share link field", `<div class="audit-link-field"><input type="text" readonly value="${escapeHtml(formatValue(hero.shareLink))}" /></div>`)}
            </div>
          </section>
          <section class="audit-card">
            <div class="audit-state">Loading canonical audit workspace...</div>
          </section>
        </div>
      `;
      return;
    }

    if (state.loading) {
      root.innerHTML = `<div class="audit-shell"><div class="audit-card"><div class="audit-state">Loading canonical audit workspace...</div></div></div>`;
      return;
    }

    if (state.error) {
      root.innerHTML = `<div class="audit-shell"><div class="audit-card"><div class="audit-state error">${escapeHtml(state.error)}</div></div></div>`;
      return;
    }

    const current = getCurrentAudit();
    if (!state.workspace || !current) {
      root.innerHTML = `<div class="audit-shell"><div class="audit-card"><div class="audit-state">No canonical audit workspace is available yet.</div></div></div>`;
      return;
    }

    root.innerHTML = `
      <div class="audit-shell">
        <section class="audit-card audit-hero">
          <div class="audit-hero-top">
            <div>
              <p class="audit-kicker">System 2 Engine</p>
              <h2 class="audit-title">AEO / SEO Audit</h2>
              <p class="audit-copy">Operator-facing audit intake, findings, deliverable, and history surface. This workbench reads and writes only canonical Mission Control audit files.</p>
            </div>
            <div class="audit-status-pill">Current Audit Status · ${escapeHtml(formatValue(current.status.auditStatus, "unknown"))}</div>
          </div>
          <div class="audit-summary-grid">
            ${renderSummaryCard("client name", `<span>${escapeHtml(formatValue(hero.clientName))}</span>`)}
            ${renderSummaryCard("target URL", `<span>${escapeHtml(formatValue(hero.targetUrl))}</span>`)}
            ${renderSummaryCard("audit status", `<span>${escapeHtml(formatValue(hero.auditStatus, "unknown"))}</span>`)}
            ${renderSummaryCard("overall score", `<strong>${escapeHtml(formatValue(hero.overallScore))}</strong>`)}
            ${renderSummaryCard("grade", `<strong>${escapeHtml(formatValue(hero.grade))}</strong>`)}
            ${renderSummaryCard("ready_for_proposal", `<span>${escapeHtml(formatValue(hero.readyForProposal))}</span>`)}
            ${renderSummaryCard("handoff_state", `<span>${escapeHtml(formatValue(hero.handoffState))}</span>`)}
            ${renderSummaryCard("audit owner", `<span>${escapeHtml(formatValue(hero.auditOwner))}</span>`)}
            ${renderWideSummaryCard("report path", `<div class="audit-link-field"><input type="text" readonly value="${escapeHtml(formatValue(hero.reportPath))}" /></div>`)}
            ${renderWideSummaryCard("share link field", `<div class="audit-link-field"><input type="text" readonly value="${escapeHtml(formatValue(hero.shareLink))}" /></div>`)}
          </div>
        </section>

        <section class="audit-card">
          <div class="audit-subtabs">
            ${SUBTABS.map(tab => `<button class="audit-subtab${state.activeSubtab === tab.key ? " active" : ""}" type="button" data-audit-subtab="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>`).join("")}
          </div>
        </section>

        ${renderActiveSubtab()}
      </div>
    `;

    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadWorkspace, { once: true });
  } else {
    loadWorkspace();
  }

  window.addEventListener("focus", () => {
    loadWorkspace().catch(() => {});
  });
})();
