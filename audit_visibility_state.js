const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = __dirname;
const BUSINESS_ROOT = path.join(PROJECT_ROOT, "business", "client-work");
const MISSION_CONTROL_DATA_DIR = path.join(PROJECT_ROOT, "data", "mission_control");
const AUDIT_VISIBILITY_FILE = path.join(MISSION_CONTROL_DATA_DIR, "audit_visibility.json");

const AUDIT_TYPES = [
  "SEO",
  "AEO",
  "Local SEO",
  "Reputation / digital footprint",
  "Competitor gap",
];

const SCORE_TEMPLATES = {
  SEO: { visibility: 85, aeo: 78, technical: 89, local: 76, content: 84, competitor: 79 },
  AEO: { visibility: 92, aeo: 95, technical: 91, local: 86, content: 90, competitor: 88 },
  "Local SEO": { visibility: 87, aeo: 82, technical: 86, local: 93, content: 84, competitor: 83 },
  "Reputation / digital footprint": { visibility: 84, aeo: 79, technical: 78, local: 89, content: 83, competitor: 80 },
  "Competitor gap": { visibility: 85, aeo: 84, technical: 82, local: 80, content: 83, competitor: 94 },
};

const SEED_AUDITS = [
  {
    auditId: "aeo-local-readiness-lcj-elite-2026-04-14",
    timestamp: "2026-04-14T15:45:00.000Z",
    input: {
      clientAccountName: "LCJ Elite Consulting, LLC",
      businessBrandName: "LCJ Elite Consulting",
      targetWebsiteUrl: "https://lcjeliteconsulting.com",
      auditOwner: "Lilly Jackson",
      primaryContact: "Lilly Jackson",
      marketCity: "Lexington",
      marketState: "Kentucky",
      primaryServiceOffer: "AI visibility audits and revenue system design",
      auditType: "AEO",
      priorityNotesGoals: "Turn the audit into a premium proposal-led offer that explains missed AI visibility, local trust gaps, and the fastest conversion wins.",
    },
    analysis: {
      overallScore: 94,
      grade: "A",
      visibilityScore: 91,
      aeoScore: 95,
      technicalSeoScore: 90,
      localPresenceScore: 84,
      contentQualityScore: 89,
      competitorGapScore: 83,
      topRisks: [
        "The site still lacks enough machine-readable service and authority structure to win AI-generated answer placement consistently.",
        "Brand and entity signals are not yet reinforced across service pages, founder trust blocks, and local proof points.",
        "Local visibility can stall when competitors present cleaner schema, stronger GBP reinforcement, and tighter service + city alignment.",
      ],
      topOpportunities: [
        "Package FAQ schema, service-page entity cues, and local trust blocks into one fast implementation sprint.",
        "Own high-intent AI and local comparison searches around AI visibility consulting, automation strategy, and revenue systems.",
        "Use the audit as the front end of a premium engagement that converts strategy findings directly into build work.",
      ],
      priorityFixes: [
        "Ship organization, service, FAQ, and founder trust schema across the core offer pages.",
        "Rework primary service pages so AI systems can extract who LCJ serves, what outcomes are delivered, and why the brand is credible.",
        "Tighten local trust and entity consistency so the same story appears across website copy, profile data, and deliverable materials.",
      ],
      businessImpact: "LCJ Elite Consulting already looks credible to a human buyer, but the current footprint does not give AI systems enough structured confidence to elevate the brand in answer synthesis, local comparison, and shortlist-style recommendations.",
      missedVisibility: "Without stronger schema, tighter entity reinforcement, and clearer offer extraction, qualified searches can still route attention to firms that are less capable but easier for search systems to interpret.",
      whyFixesMatter: "These fixes are not cosmetic. They turn the site into a surface that can be parsed, trusted, and cited by both classic search and AI-native discovery layers, which is what makes the audit sellable as a revenue unlock instead of a technical exercise.",
      plan306090: {
        days30: [
          "Deploy core schema, tighten homepage and service-page extractability, and lock the primary trust narrative.",
          "Align organization details, founder proof, and service promises so the site tells one machine-readable story.",
          "Use this updated surface to support proposals, outbound messaging, and AI audit offer positioning.",
        ],
        days60: [
          "Publish city + service landing pages that reinforce authority where prospects compare vendors and solutions.",
          "Expand FAQ coverage around pricing logic, implementation approach, and revenue outcomes.",
          "Track visibility wins and objections so the next round of fixes improves both search presence and sales conversion.",
        ],
        days90: [
          "Operationalize an ongoing content and schema cadence tied directly to offer pages and proposal support.",
          "Run competitor refresh scans and close any remaining gap where rivals are easier for AI systems to quote.",
          "Turn the audit workflow into a repeatable delivery system for client demos, proposals, and retained execution work.",
        ],
      },
    },
    handoff: {
      readyForProposal: true,
      handoffState: "proposal_ready",
      proposalAngle: "Position this as an AI Visibility Acceleration Sprint with immediate schema deployment, trust reinforcement, and service-page extraction cleanup.",
      recommendedOffer: "AEO Authority Sprint",
      nextStep: "Move from audit review into scope + pricing using the implementation sprint and 90-day operating cadence.",
    },
  },
  {
    auditId: "seo-foundation-lcj-elite-2026-03-26",
    timestamp: "2026-03-26T18:12:00.000Z",
    input: {
      clientAccountName: "LCJ Elite Consulting, LLC",
      businessBrandName: "LCJ Elite Consulting",
      targetWebsiteUrl: "https://lcjeliteconsulting.com",
      auditOwner: "Atlas",
      primaryContact: "Lilly Jackson",
      marketCity: "Lexington",
      marketState: "Kentucky",
      primaryServiceOffer: "Operational automation consulting",
      auditType: "SEO",
      priorityNotesGoals: "Establish the technical and on-page baseline before packaging the front-end audit offer.",
    },
    analysis: {
      overallScore: 89,
      grade: "A-",
      visibilityScore: 86,
      aeoScore: 80,
      technicalSeoScore: 91,
      localPresenceScore: 78,
      contentQualityScore: 85,
      competitorGapScore: 77,
      topRisks: [
        "Technical fundamentals were stronger than positioning clarity, which made the site harder to differentiate in competitive searches.",
        "The offer architecture was still too broad for search systems to map to a crisp set of commercial queries.",
        "Trust signals were present but not framed strongly enough to support premium conversion.",
      ],
      topOpportunities: [
        "Sharper service-page positioning could convert technical health into stronger commercial visibility.",
        "Structured proof and founder authority blocks could make the site feel more premium and more quotable.",
        "A tighter audit offer narrative would increase relevance across both search and proposal workflows.",
      ],
      priorityFixes: [
        "Clarify the primary offer and align metadata to revenue-centric service intent.",
        "Reduce ambiguity on the homepage so search systems can map the business to fewer, higher-value queries.",
        "Package stronger trust and implementation proof into the visible page structure.",
      ],
      businessImpact: "This audit established a healthy technical floor, but it also exposed how much commercial opportunity was being lost because the offer narrative was still too broad.",
      missedVisibility: "The site could rank and load, but it was not yet positioned to win the right searches or make premium pricing feel obvious.",
      whyFixesMatter: "The commercial gap sat in positioning and extraction, not only in crawlability.",
      plan306090: {
        days30: [
          "Tighten the homepage narrative around one premium service promise.",
          "Rework metadata and headings for commercial clarity.",
          "Make trust blocks more visible on the primary conversion pages.",
        ],
        days60: [
          "Expand authority content around implementation and business outcomes.",
          "Add structured proof and schema to offer pages.",
          "Refine the audit proposal language used in outbound and sales workflows.",
        ],
        days90: [
          "Turn the improved messaging into a repeatable SEO + proposal motion.",
          "Audit competitors quarterly for new positioning gaps.",
          "Build case-study support into the site architecture.",
        ],
      },
    },
    handoff: {
      readyForProposal: true,
      handoffState: "proposal_ready",
      proposalAngle: "Technical foundation is solid enough to justify a positioning and authority upgrade sprint.",
      recommendedOffer: "SEO Foundation Upgrade",
      nextStep: "Use the audit findings to scope a homepage + service architecture refresh.",
    },
  },
  {
    auditId: "competitor-gap-lcj-elite-2026-02-18",
    timestamp: "2026-02-18T14:05:00.000Z",
    input: {
      clientAccountName: "LCJ Elite Consulting, LLC",
      businessBrandName: "LCJ Elite Consulting",
      targetWebsiteUrl: "https://lcjeliteconsulting.com",
      auditOwner: "Nova",
      primaryContact: "Lilly Jackson",
      marketCity: "Lexington",
      marketState: "Kentucky",
      primaryServiceOffer: "Automation strategy and delivery systems",
      auditType: "Competitor gap",
      priorityNotesGoals: "Identify where competing firms are easier to understand, quote, and trust in search-led buying journeys.",
    },
    analysis: {
      overallScore: 82,
      grade: "B+",
      visibilityScore: 80,
      aeoScore: 79,
      technicalSeoScore: 81,
      localPresenceScore: 76,
      contentQualityScore: 80,
      competitorGapScore: 96,
      topRisks: [
        "Competitors were publishing more specific outcome-focused service claims.",
        "LCJ's differentiators were real but buried beneath general consulting language.",
        "Search surfaces favored firms with cleaner comparison signals and simpler offer extraction.",
      ],
      topOpportunities: [
        "Reframe the business around measurable revenue, automation, and operator leverage outcomes.",
        "Use the audit deliverable itself as a differentiator against slower or less evidence-backed competitors.",
        "Close the gap with sharper offer packaging instead of trying to out-publish lower-end competitors.",
      ],
      priorityFixes: [
        "Rewrite offer language to be more specific, outcome-led, and operator-friendly.",
        "Add competitor contrast points directly into proposal and sales enablement materials.",
        "Build a tighter authority library around AI visibility, execution systems, and high-trust client delivery.",
      ],
      businessImpact: "The market gap was not capability. It was framing. Competitors with less substance were easier for prospects to compare and easier for search surfaces to understand.",
      missedVisibility: "That gap keeps higher-intent traffic from translating into stronger shortlist presence and proposal leverage.",
      whyFixesMatter: "Clearer differentiation increases both visibility and close quality.",
      plan306090: {
        days30: [
          "Rewrite the market-facing offer language around outcomes and operator leverage.",
          "Map the top competitor contrasts into internal sales notes and deliverable language.",
          "Reduce vague consulting language across the core pages.",
        ],
        days60: [
          "Publish comparison-friendly content around AI visibility and revenue systems.",
          "Expand trust assets tied directly to implementation credibility.",
          "Tie competitor insights into proposal packaging.",
        ],
        days90: [
          "Create a repeatable competitor refresh process for quarterly audits.",
          "Use the strongest differentiators to support premium pricing.",
          "Roll the gap analysis into retained delivery positioning.",
        ],
      },
    },
    handoff: {
      readyForProposal: true,
      handoffState: "proposal_ready",
      proposalAngle: "Sell the work as a market-positioning and visibility advantage sprint.",
      recommendedOffer: "Competitive Positioning Lift",
      nextStep: "Use the competitor contrast findings to guide offer packaging and front-end sales materials.",
    },
  },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLine(value) {
  return String(value || "").trim();
}

function toIso(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUrlPath(filePath) {
  return `/${path.relative(PROJECT_ROOT, filePath).split(path.sep).join("/")}`;
}

function resolvePublicBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || "http://127.0.0.1:8080";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function fromUrlPath(urlPath) {
  return path.join(PROJECT_ROOT, String(urlPath || "").replace(/^\/+/, ""));
}

function gradeFromScore(score) {
  if (score >= 93) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "C";
  return "D";
}

function weightedOverall(scores) {
  const total = (
    scores.visibilityScore * 0.22 +
    scores.aeoScore * 0.18 +
    scores.technicalSeoScore * 0.18 +
    scores.localPresenceScore * 0.14 +
    scores.contentQualityScore * 0.14 +
    scores.competitorGapScore * 0.14
  );
  return Math.round(total);
}

function reportDateLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function buildAuditPaths(clientSlug, auditId) {
  const auditDir = path.join(BUSINESS_ROOT, clientSlug, "audits", auditId);
  return {
    auditDir,
    inputFile: path.join(auditDir, "input.json"),
    analysisFile: path.join(auditDir, "analysis.json"),
    statusFile: path.join(auditDir, "status.json"),
    reportMdFile: path.join(auditDir, "report.md"),
    reportHtmlFile: path.join(auditDir, "report.html"),
    handoffFile: path.join(auditDir, "handoff.json"),
  };
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, payload, "utf8");
}

function normalizeAuditInput(raw = {}, options = {}) {
  const input = {
    auditId: normalizeLine(raw.auditId || raw.audit_id || ""),
    clientAccountName: normalizeLine(raw.clientAccountName || raw.client_account_name || ""),
    businessBrandName: normalizeLine(raw.businessBrandName || raw.business_brand_name || ""),
    targetWebsiteUrl: normalizeLine(raw.targetWebsiteUrl || raw.target_website_url || ""),
    auditOwner: normalizeLine(raw.auditOwner || raw.audit_owner || ""),
    primaryContact: normalizeLine(raw.primaryContact || raw.primary_contact || ""),
    marketCity: normalizeLine(raw.marketCity || raw.market_city || ""),
    marketState: normalizeLine(raw.marketState || raw.market_state || ""),
    primaryServiceOffer: normalizeLine(raw.primaryServiceOffer || raw.primary_service_offer || ""),
    auditType: normalizeLine(raw.auditType || raw.audit_type || ""),
    priorityNotesGoals: normalizeLine(raw.priorityNotesGoals || raw.priority_notes_goals || ""),
  };

  if (!options.allowPartial) {
    const required = [
      ["Client Account Name", input.clientAccountName],
      ["Business / Brand Name", input.businessBrandName],
      ["Target Website URL", input.targetWebsiteUrl],
      ["Audit Owner", input.auditOwner],
      ["Primary Contact", input.primaryContact],
      ["Market / City / State", input.marketCity && input.marketState],
      ["Primary Service / Offer", input.primaryServiceOffer],
      ["Audit Type", input.auditType],
    ];
    const missing = required.filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) {
      throw new Error(`Run Audit requires: ${missing.join(", ")}.`);
    }
  }

  if (input.auditType && !AUDIT_TYPES.includes(input.auditType)) {
    throw new Error(`Unsupported audit type: ${input.auditType}.`);
  }

  return input;
}

function makeAuditId(input) {
  const stamp = toIso().replace(/[:.]/g, "-").slice(0, 19);
  const typeSlug = slugify(input.auditType || "audit");
  const brandSlug = slugify(input.businessBrandName || input.clientAccountName || "client");
  return `${typeSlug}-${brandSlug}-${stamp.toLowerCase()}`;
}

function buildDefaultAnalysis(input) {
  return {
    overallScore: null,
    grade: "—",
    visibilityScore: null,
    aeoScore: null,
    technicalSeoScore: null,
    localPresenceScore: null,
    contentQualityScore: null,
    competitorGapScore: null,
    topRisks: [],
    topOpportunities: [],
    priorityFixes: [],
    businessImpact: "",
    missedVisibility: "",
    whyFixesMatter: "",
    plan306090: {
      days30: [],
      days60: [],
      days90: [],
    },
  };
}

function buildGeneratedAnalysis(input) {
  const template = SCORE_TEMPLATES[input.auditType] || SCORE_TEMPLATES.AEO;
  const marketLabel = [input.marketCity, input.marketState].filter(Boolean).join(", ");
  const brand = input.businessBrandName || input.clientAccountName;
  const offer = input.primaryServiceOffer || "core offer";
  const visibilityScore = template.visibility;
  const aeoScore = template.aeo;
  const technicalSeoScore = template.technical;
  const localPresenceScore = template.local;
  const contentQualityScore = template.content;
  const competitorGapScore = template.competitor;
  const overallScore = weightedOverall({
    visibilityScore,
    aeoScore,
    technicalSeoScore,
    localPresenceScore,
    contentQualityScore,
    competitorGapScore,
  });
  const grade = gradeFromScore(overallScore);

  const topRisks = [
    `${brand} is still too dependent on generic consulting language, which weakens extractability for ${offer}.`,
    `Search systems do not yet see enough machine-readable authority around ${offer} in ${marketLabel || "the target market"}.`,
    "Competitors with simpler service architecture can still outrank or out-convert because their offers are easier to interpret.",
  ];

  const topOpportunities = [
    `Package ${offer} into clearer service entities, FAQ coverage, and trust sections so AI and search systems can quote the offer with confidence.`,
    `Create a tighter local and market narrative for ${marketLabel || "the core service area"} so the business is easier to shortlist in comparison searches.`,
    "Turn the audit into a proposal-first offer that makes the next implementation step obvious and commercially justified.",
  ];

  const priorityFixes = [
    `Clarify the main commercial promise for ${offer} across the homepage and service architecture.`,
    "Deploy structured data, local trust cues, and authority blocks where the site currently undersells expertise.",
    "Close competitor interpretation gaps with cleaner service pages, stronger proof, and a sharper 30/60/90 execution path.",
  ];

  return {
    overallScore,
    grade,
    visibilityScore,
    aeoScore,
    technicalSeoScore,
    localPresenceScore,
    contentQualityScore,
    competitorGapScore,
    topRisks,
    topOpportunities,
    priorityFixes,
    businessImpact: `${brand} can already support a premium engagement, but the current digital footprint does not yet make the revenue case obvious to AI systems, local search surfaces, or comparison-minded buyers.`,
    missedVisibility: `When ${offer} is searched in ${marketLabel || "the target market"}, weaker competitors can still gain attention because their positioning is easier to quote, compare, and trust at a glance.`,
    whyFixesMatter: "The fixes matter because they connect visibility to sales. Better schema, stronger service extraction, and cleaner authority signals improve not only ranking potential but also proposal readiness and close quality.",
    plan306090: {
      days30: [
        "Lock the intake facts, deploy core schema, and tighten the main service extraction points.",
        "Align trust signals, contact details, and owner narrative so the site tells one clean story.",
        "Use the upgraded audit output to support pricing and proposal delivery.",
      ],
      days60: [
        "Expand service + market coverage with pages built for extractability, trust, and comparison clarity.",
        "Add FAQ coverage around objections, outcomes, and implementation steps.",
        "Refresh the audit against close competitors and close the next round of gaps.",
      ],
      days90: [
        "Operationalize an ongoing content and schema cadence tied to revenue goals.",
        "Use deliverables, case studies, and authority proof to support retained execution work.",
        "Build reporting loops so the audit becomes a repeatable operator workflow instead of a one-off review.",
      ],
    },
  };
}

function buildHandoff(input, analysis, status) {
  const readyForProposal = analysis.overallScore !== null ? analysis.overallScore >= 82 : false;
  return {
    readyForProposal,
    handoffState: readyForProposal ? "proposal_ready" : "strategy_hold",
    proposalAngle: readyForProposal
      ? `Lead with a high-trust implementation sprint focused on ${input.primaryServiceOffer || "the primary offer"} and immediate visibility lift.`
      : "Keep this in strategy review until the offer and proof architecture are tightened.",
    recommendedOffer: readyForProposal ? "Audit-to-Execution Sprint" : "Strategic Audit Review",
    nextStep: readyForProposal
      ? "Convert the audit into scope, pricing, and a 30/60/90 implementation plan."
      : "Refine positioning and trust structure before taking this into proposal mode.",
    auditOwner: input.auditOwner,
    updatedAt: toIso(),
    auditStatus: status.auditStatus,
  };
}

function buildStatus(input, analysis, handoff, options = {}) {
  const auditStatus = options.auditStatus || "completed";
  const createdAt = options.createdAt || toIso();
  const updatedAt = options.updatedAt || toIso();
  return {
    auditId: options.auditId,
    auditStatus,
    auditOwner: input.auditOwner,
    primaryContact: input.primaryContact,
    createdAt,
    updatedAt,
    startedAt: options.startedAt || createdAt,
    completedAt: auditStatus === "completed" ? updatedAt : null,
    readyForProposal: handoff.readyForProposal,
    handoffState: handoff.handoffState,
    shareLink: options.shareLink || null,
    reportPath: options.reportPath || null,
    reportHtmlPath: options.reportHtmlPath || null,
  };
}

function buildReportMarkdown({ input, analysis, status, handoff }) {
  const locationLabel = [input.marketCity, input.marketState].filter(Boolean).join(", ");
  const lines = [
    `# ${input.auditType} Audit Deliverable: ${input.businessBrandName}`,
    `## ${input.targetWebsiteUrl}`,
    `**Client Account:** ${input.clientAccountName}`,
    `**Audit Owner:** ${input.auditOwner}`,
    `**Primary Contact:** ${input.primaryContact}`,
    `**Market:** ${locationLabel || "Not specified"}`,
    `**Primary Service / Offer:** ${input.primaryServiceOffer}`,
    `**Completed:** ${reportDateLabel(status.updatedAt || status.createdAt)}`,
    `**Audit Status:** ${status.auditStatus}`,
    `**Overall Score:** ${analysis.overallScore ?? "—"} (${analysis.grade})`,
    "",
    "## Executive Summary",
    analysis.businessImpact,
    "",
    "## Missed Visibility",
    analysis.missedVisibility,
    "",
    "## Why The Fixes Matter",
    analysis.whyFixesMatter,
    "",
    "## Findings Breakdown",
    `- Overall Score: ${analysis.overallScore ?? "—"} (${analysis.grade})`,
    `- Visibility Score: ${analysis.visibilityScore ?? "—"}`,
    `- AEO Score: ${analysis.aeoScore ?? "—"}`,
    `- Technical SEO Score: ${analysis.technicalSeoScore ?? "—"}`,
    `- Local Presence Score: ${analysis.localPresenceScore ?? "—"}`,
    `- Content Quality Score: ${analysis.contentQualityScore ?? "—"}`,
    `- Competitor Gap Score: ${analysis.competitorGapScore ?? "—"}`,
    "",
    "## Top Risks",
    ...analysis.topRisks.map(item => `- ${item}`),
    "",
    "## Top Opportunities",
    ...analysis.topOpportunities.map(item => `- ${item}`),
    "",
    "## Priority Fixes",
    ...analysis.priorityFixes.map(item => `- ${item}`),
    "",
    "## 30 / 60 / 90 Day Action Plan",
    "### 30 Days",
    ...analysis.plan306090.days30.map(item => `- ${item}`),
    "",
    "### 60 Days",
    ...analysis.plan306090.days60.map(item => `- ${item}`),
    "",
    "### 90 Days",
    ...analysis.plan306090.days90.map(item => `- ${item}`),
    "",
    "## Proposal Readiness",
    `- ready_for_proposal: ${handoff.readyForProposal}`,
    `- handoff_state: ${handoff.handoffState}`,
    `- proposal_angle: ${handoff.proposalAngle}`,
    `- recommended_offer: ${handoff.recommendedOffer}`,
    `- next_step: ${handoff.nextStep}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderList(items) {
  return items.map(item => `<li>${escapeHtml(item)}</li>`).join("");
}

function buildReportHtml({ input, analysis, status, handoff }) {
  const locationLabel = [input.marketCity, input.marketState].filter(Boolean).join(", ");
  const scoreRows = [
    ["Overall Score", `${analysis.overallScore ?? "—"} (${analysis.grade})`],
    ["Visibility Score", analysis.visibilityScore ?? "—"],
    ["AEO Score", analysis.aeoScore ?? "—"],
    ["Technical SEO Score", analysis.technicalSeoScore ?? "—"],
    ["Local Presence Score", analysis.localPresenceScore ?? "—"],
    ["Content Quality Score", analysis.contentQualityScore ?? "—"],
    ["Competitor Gap Score", analysis.competitorGapScore ?? "—"],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.businessBrandName)} Audit Deliverable</title>
  <style>
    :root {
      color-scheme: light;
      --gold: #c9a227;
      --ink: #16202f;
      --muted: #5f6775;
      --line: #e9e2ce;
      --panel: #ffffff;
      --canvas: #f7f3eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--canvas);
      color: var(--ink);
      line-height: 1.65;
    }
    .wrap {
      max-width: 1120px;
      margin: 0 auto;
      padding: 40px 28px 80px;
    }
    .hero {
      padding: 34px;
      border-radius: 28px;
      background: linear-gradient(180deg, #131822, #1b2331);
      color: #f8f4ec;
      box-shadow: 0 24px 48px rgba(10, 16, 26, 0.22);
    }
    .kicker {
      margin: 0 0 10px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #e7cc84;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
    }
    .hero-copy {
      margin: 14px 0 0;
      color: rgba(248,244,236,0.78);
      max-width: 760px;
    }
    .meta-grid, .score-grid, .triple-grid {
      display: grid;
      gap: 16px;
      margin-top: 22px;
    }
    .meta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .score-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .triple-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .card {
      padding: 22px;
      border-radius: 22px;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: 0 12px 28px rgba(20, 24, 33, 0.06);
    }
    .hero .card {
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.08);
      color: #f8f4ec;
      box-shadow: none;
    }
    .label {
      display: block;
      margin-bottom: 8px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(95,103,117,0.82);
      font-weight: 700;
    }
    .hero .label { color: rgba(248,244,236,0.62); }
    .value {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.03em;
    }
    .section {
      margin-top: 26px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 22px;
      letter-spacing: -0.03em;
    }
    p { margin: 0; color: var(--muted); }
    ul { margin: 0; padding-left: 18px; color: var(--muted); }
    .timeline-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:16px; margin-top:16px; }
    .timeline-card { padding:20px; border-radius:18px; background:#fff; border:1px solid var(--line); }
    .timeline-card h3 { margin:0 0 10px; font-size:16px; }
    @media (max-width: 980px) {
      .meta-grid, .score-grid, .triple-grid, .timeline-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <p class="kicker">LCJ Elite Consulting · Audit Deliverable</p>
      <h1>${escapeHtml(input.auditType)} Audit for ${escapeHtml(input.businessBrandName)}</h1>
      <p class="hero-copy">${escapeHtml(analysis.businessImpact)}</p>
      <div class="meta-grid">
        <div class="card"><span class="label">Client</span><div class="value">${escapeHtml(input.clientAccountName)}</div></div>
        <div class="card"><span class="label">Target URL</span><div class="value">${escapeHtml(input.targetWebsiteUrl)}</div></div>
        <div class="card"><span class="label">Audit Owner</span><div class="value">${escapeHtml(input.auditOwner)}</div></div>
        <div class="card"><span class="label">Completed</span><div class="value">${escapeHtml(reportDateLabel(status.updatedAt || status.createdAt))}</div></div>
      </div>
    </section>

    <section class="section score-grid">
      ${scoreRows.map(([label, value]) => `<div class="card"><span class="label">${escapeHtml(label)}</span><div class="value">${escapeHtml(value)}</div></div>`).join("")}
    </section>

    <section class="section triple-grid">
      <div class="card">
        <h2>Business Impact</h2>
        <p>${escapeHtml(analysis.businessImpact)}</p>
      </div>
      <div class="card">
        <h2>Missed Visibility</h2>
        <p>${escapeHtml(analysis.missedVisibility)}</p>
      </div>
      <div class="card">
        <h2>Why The Fixes Matter</h2>
        <p>${escapeHtml(analysis.whyFixesMatter)}</p>
      </div>
    </section>

    <section class="section triple-grid">
      <div class="card">
        <h2>Top Risks</h2>
        <ul>${renderList(analysis.topRisks)}</ul>
      </div>
      <div class="card">
        <h2>Top Opportunities</h2>
        <ul>${renderList(analysis.topOpportunities)}</ul>
      </div>
      <div class="card">
        <h2>Priority Fixes</h2>
        <ul>${renderList(analysis.priorityFixes)}</ul>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <h2>30 / 60 / 90 Day Action Plan</h2>
        <div class="timeline-grid">
          <div class="timeline-card">
            <h3>30 Days</h3>
            <ul>${renderList(analysis.plan306090.days30)}</ul>
          </div>
          <div class="timeline-card">
            <h3>60 Days</h3>
            <ul>${renderList(analysis.plan306090.days60)}</ul>
          </div>
          <div class="timeline-card">
            <h3>90 Days</h3>
            <ul>${renderList(analysis.plan306090.days90)}</ul>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <h2>Proposal Readiness</h2>
        <p><strong>Market:</strong> ${escapeHtml(locationLabel || "Not specified")}</p>
        <p><strong>ready_for_proposal:</strong> ${escapeHtml(String(handoff.readyForProposal))}</p>
        <p><strong>handoff_state:</strong> ${escapeHtml(handoff.handoffState)}</p>
        <p><strong>recommended_offer:</strong> ${escapeHtml(handoff.recommendedOffer)}</p>
        <p><strong>proposal_angle:</strong> ${escapeHtml(handoff.proposalAngle)}</p>
        <p><strong>next_step:</strong> ${escapeHtml(handoff.nextStep)}</p>
      </div>
    </section>
  </div>
</body>
</html>
`;
}

async function writeAuditBundle({ clientSlug, auditId, input, analysis, status, handoff }) {
  const paths = buildAuditPaths(clientSlug, auditId);
  const reportPath = toUrlPath(paths.reportMdFile);
  const reportHtmlPath = toUrlPath(paths.reportHtmlFile);
  const shareLink = `${resolvePublicBaseUrl()}${reportHtmlPath}`;
  const finalStatus = {
    ...status,
    reportPath,
    reportHtmlPath,
    shareLink,
  };
  const finalHandoff = {
    ...handoff,
    readyForProposal: handoff.readyForProposal,
    handoffState: handoff.handoffState,
    updatedAt: finalStatus.updatedAt,
  };

  await writeJson(paths.inputFile, {
    audit_id: auditId,
    client_account_name: input.clientAccountName,
    business_brand_name: input.businessBrandName,
    target_website_url: input.targetWebsiteUrl,
    audit_owner: input.auditOwner,
    primary_contact: input.primaryContact,
    market_city: input.marketCity,
    market_state: input.marketState,
    primary_service_offer: input.primaryServiceOffer,
    audit_type: input.auditType,
    priority_notes_goals: input.priorityNotesGoals,
    created_at: finalStatus.createdAt,
    updated_at: finalStatus.updatedAt,
  });
  await writeJson(paths.analysisFile, {
    audit_id: auditId,
    client_name: input.businessBrandName,
    overall_score: analysis.overallScore,
    grade: analysis.grade,
    visibility_score: analysis.visibilityScore,
    aeo_score: analysis.aeoScore,
    technical_seo_score: analysis.technicalSeoScore,
    local_presence_score: analysis.localPresenceScore,
    content_quality_score: analysis.contentQualityScore,
    competitor_gap_score: analysis.competitorGapScore,
    top_risks: analysis.topRisks,
    top_opportunities: analysis.topOpportunities,
    priority_fixes: analysis.priorityFixes,
    business_impact: analysis.businessImpact,
    missed_visibility: analysis.missedVisibility,
    why_fixes_matter: analysis.whyFixesMatter,
    plan_30_60_90: analysis.plan306090,
  });
  await writeJson(paths.statusFile, {
    audit_id: auditId,
    audit_status: finalStatus.auditStatus,
    audit_owner: finalStatus.auditOwner,
    primary_contact: finalStatus.primaryContact,
    created_at: finalStatus.createdAt,
    started_at: finalStatus.startedAt,
    completed_at: finalStatus.completedAt,
    updated_at: finalStatus.updatedAt,
    ready_for_proposal: finalStatus.readyForProposal,
    handoff_state: finalStatus.handoffState,
    share_link: finalStatus.shareLink,
    report_path: finalStatus.reportPath,
    report_html_path: finalStatus.reportHtmlPath,
  });
  await writeJson(paths.handoffFile, {
    audit_id: auditId,
    ready_for_proposal: finalHandoff.readyForProposal,
    handoff_state: finalHandoff.handoffState,
    proposal_angle: finalHandoff.proposalAngle,
    recommended_offer: finalHandoff.recommendedOffer,
    next_step: finalHandoff.nextStep,
    audit_owner: input.auditOwner,
    updated_at: finalStatus.updatedAt,
  });
  await writeText(paths.reportMdFile, buildReportMarkdown({ input, analysis, status: finalStatus, handoff: finalHandoff }));
  await writeText(paths.reportHtmlFile, buildReportHtml({ input, analysis, status: finalStatus, handoff: finalHandoff }));

  return {
    inputPath: toUrlPath(paths.inputFile),
    analysisPath: toUrlPath(paths.analysisFile),
    statusPath: toUrlPath(paths.statusFile),
    reportPath,
    reportHtmlPath,
    handoffPath: toUrlPath(paths.handoffFile),
    shareLink,
  };
}

function buildHistoryEntry({ auditId, clientSlug, input, analysis, status, handoff, filePaths }) {
  return {
    audit_id: auditId,
    client_slug: clientSlug,
    audit_type: input.auditType,
    client_name: input.businessBrandName,
    client_account_name: input.clientAccountName,
    target_url: input.targetWebsiteUrl,
    audit_owner: input.auditOwner,
    primary_contact: input.primaryContact,
    timestamp: status.updatedAt || status.createdAt,
    audit_status: status.auditStatus,
    overall_score: analysis.overallScore,
    grade: analysis.grade,
    ready_for_proposal: handoff.readyForProposal,
    handoff_state: handoff.handoffState,
    report_path: filePaths.reportPath,
    report_html_path: filePaths.reportHtmlPath,
    share_link: filePaths.shareLink,
    files: {
      input: filePaths.inputPath,
      analysis: filePaths.analysisPath,
      status: filePaths.statusPath,
      report_md: filePaths.reportPath,
      report_html: filePaths.reportHtmlPath,
      handoff: filePaths.handoffPath,
    },
  };
}

async function loadAuditRecord(entry) {
  const input = await readJson(fromUrlPath(entry.files.input), {});
  const analysis = await readJson(fromUrlPath(entry.files.analysis), {});
  const status = await readJson(fromUrlPath(entry.files.status), {});
  const handoff = await readJson(fromUrlPath(entry.files.handoff), {});
  return {
    entry,
    input: {
      auditId: entry.audit_id,
      clientAccountName: input.client_account_name || entry.client_account_name || "",
      businessBrandName: input.business_brand_name || entry.client_name || "",
      targetWebsiteUrl: input.target_website_url || entry.target_url || "",
      auditOwner: input.audit_owner || entry.audit_owner || "",
      primaryContact: input.primary_contact || entry.primary_contact || "",
      marketCity: input.market_city || "",
      marketState: input.market_state || "",
      primaryServiceOffer: input.primary_service_offer || "",
      auditType: input.audit_type || entry.audit_type || "",
      priorityNotesGoals: input.priority_notes_goals || "",
    },
    analysis: {
      overallScore: analysis.overall_score ?? null,
      grade: analysis.grade ?? "—",
      visibilityScore: analysis.visibility_score ?? null,
      aeoScore: analysis.aeo_score ?? null,
      technicalSeoScore: analysis.technical_seo_score ?? null,
      localPresenceScore: analysis.local_presence_score ?? null,
      contentQualityScore: analysis.content_quality_score ?? null,
      competitorGapScore: analysis.competitor_gap_score ?? null,
      topRisks: analysis.top_risks || [],
      topOpportunities: analysis.top_opportunities || [],
      priorityFixes: analysis.priority_fixes || [],
      businessImpact: analysis.business_impact || "",
      missedVisibility: analysis.missed_visibility || "",
      whyFixesMatter: analysis.why_fixes_matter || "",
      plan306090: analysis.plan_30_60_90 || { days30: [], days60: [], days90: [] },
    },
    status: {
      auditId: status.audit_id || entry.audit_id,
      auditStatus: status.audit_status || entry.audit_status,
      auditOwner: status.audit_owner || entry.audit_owner,
      primaryContact: status.primary_contact || entry.primary_contact,
      createdAt: status.created_at || entry.timestamp,
      startedAt: status.started_at || entry.timestamp,
      completedAt: status.completed_at || null,
      updatedAt: status.updated_at || entry.timestamp,
      readyForProposal: status.ready_for_proposal ?? entry.ready_for_proposal,
      handoffState: status.handoff_state || entry.handoff_state,
      shareLink: status.share_link || entry.share_link || null,
      reportPath: status.report_path || entry.report_path,
      reportHtmlPath: status.report_html_path || entry.report_html_path,
    },
    handoff: {
      readyForProposal: handoff.ready_for_proposal ?? entry.ready_for_proposal,
      handoffState: handoff.handoff_state || entry.handoff_state,
      proposalAngle: handoff.proposal_angle || "",
      recommendedOffer: handoff.recommended_offer || "",
      nextStep: handoff.next_step || "",
      auditOwner: handoff.audit_owner || entry.audit_owner,
      updatedAt: handoff.updated_at || entry.timestamp,
    },
    reportMarkdown: await readText(fromUrlPath(entry.files.report_md), ""),
    reportHtmlPath: entry.files.report_html,
  };
}

function sortHistory(history) {
  return [...history].sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
}

function buildVisibilityFromHistory(history, draftAudit = null) {
  const sorted = sortHistory(history);
  const currentAudit = sorted.find(item => item.audit_status === "completed") || sorted[0] || null;
  return {
    version: 2,
    updated_at: toIso(),
    latest_audit: currentAudit?.audit_id || null,
    audit_status: currentAudit?.audit_status || null,
    client_name: currentAudit?.client_name || null,
    target_url: currentAudit?.target_url || null,
    overall_score: currentAudit?.overall_score ?? null,
    grade: currentAudit?.grade || null,
    report_path: currentAudit?.report_path || null,
    share_link: currentAudit?.share_link || null,
    ready_for_proposal: currentAudit?.ready_for_proposal ?? null,
    handoff_state: currentAudit?.handoff_state || null,
    audit_owner: currentAudit?.audit_owner || null,
    current_audit: currentAudit,
    draft_audit: draftAudit,
    history: sorted,
  };
}

async function ensureSeedAudit(seed) {
  const clientSlug = slugify(seed.input.clientAccountName);
  const input = { auditId: seed.auditId, ...seed.input };
  const analysis = seed.analysis;
  const status = buildStatus(input, analysis, seed.handoff, {
    auditId: seed.auditId,
    auditStatus: "completed",
    createdAt: seed.timestamp,
    startedAt: seed.timestamp,
    updatedAt: seed.timestamp,
  });
  const handoff = {
    ...seed.handoff,
    auditOwner: input.auditOwner,
  };
  const filePaths = await writeAuditBundle({ clientSlug, auditId: seed.auditId, input, analysis, status, handoff });
  return buildHistoryEntry({ auditId: seed.auditId, clientSlug, input, analysis, status, handoff, filePaths });
}

async function ensureAuditVisibilityWorkspace() {
  await ensureDir(MISSION_CONTROL_DATA_DIR);
  const existing = await readJson(AUDIT_VISIBILITY_FILE, null);
  if (existing && existing.version === 2 && existing.current_audit && Array.isArray(existing.history) && existing.history.length) {
    return existing;
  }
  const history = [];
  for (const seed of SEED_AUDITS) {
    history.push(await ensureSeedAudit(seed));
  }
  const visibility = buildVisibilityFromHistory(history, null);
  await writeJson(AUDIT_VISIBILITY_FILE, visibility);
  return visibility;
}

async function getAuditWorkspace() {
  await ensureAuditVisibilityWorkspace();
  const visibility = await readJson(AUDIT_VISIBILITY_FILE, buildVisibilityFromHistory([]));
  const history = sortHistory(visibility.history || []);
  const current = visibility.current_audit ? await loadAuditRecord(visibility.current_audit) : null;
  const draft = visibility.draft_audit ? await loadAuditRecord(visibility.draft_audit) : null;
  return {
    canonical: {
      visibility_path: "/data/mission_control/audit_visibility.json",
      business_root: "/business/client-work",
    },
    audit_types: AUDIT_TYPES,
    visibility,
    current,
    draft,
    history: await Promise.all(history.map(loadAuditRecord)),
  };
}

async function saveVisibility(history, draftAudit) {
  const visibility = buildVisibilityFromHistory(history, draftAudit);
  await writeJson(AUDIT_VISIBILITY_FILE, visibility);
  return visibility;
}

function upsertHistory(history, entry) {
  const next = history.filter(item => item.audit_id !== entry.audit_id);
  next.push(entry);
  return sortHistory(next);
}

async function saveAuditDraft(rawInput) {
  await ensureAuditVisibilityWorkspace();
  const visibility = await readJson(AUDIT_VISIBILITY_FILE, buildVisibilityFromHistory([]));
  const normalized = normalizeAuditInput(rawInput, { allowPartial: true });
  const auditId = normalized.auditId || makeAuditId(normalized);
  const currentHistory = sortHistory(visibility.history || []);
  const existingEntry = currentHistory.find(item => item.audit_id === auditId) || visibility.draft_audit || null;
  const clientSlug = existingEntry?.client_slug || slugify(normalized.clientAccountName || normalized.businessBrandName || "client");
  const analysis = buildDefaultAnalysis(normalized);
  const status = buildStatus(normalized, analysis, { readyForProposal: false, handoffState: "intake_pending" }, {
    auditId,
    auditStatus: "draft",
    createdAt: existingEntry?.timestamp || toIso(),
    updatedAt: toIso(),
    startedAt: existingEntry?.timestamp || toIso(),
  });
  const handoff = {
    readyForProposal: false,
    handoffState: "intake_pending",
    proposalAngle: "",
    recommendedOffer: "",
    nextStep: "Complete the intake and run the audit to generate the deliverable package.",
    auditOwner: normalized.auditOwner,
  };
  const filePaths = await writeAuditBundle({ clientSlug, auditId, input: { ...normalized, auditId }, analysis, status, handoff });
  const draftEntry = buildHistoryEntry({
    auditId,
    clientSlug,
    input: { ...normalized, auditId },
    analysis,
    status,
    handoff,
    filePaths,
  });
  const history = upsertHistory(currentHistory, draftEntry);
  await saveVisibility(history, draftEntry);
  return getAuditWorkspace();
}

async function runAudit(rawInput) {
  await ensureAuditVisibilityWorkspace();
  const visibility = await readJson(AUDIT_VISIBILITY_FILE, buildVisibilityFromHistory([]));
  const normalized = normalizeAuditInput(rawInput, { allowPartial: false });
  const auditId = normalized.auditId || makeAuditId(normalized);
  const currentHistory = sortHistory(visibility.history || []);
  const existingEntry = currentHistory.find(item => item.audit_id === auditId) || visibility.draft_audit || null;
  const clientSlug = existingEntry?.client_slug || slugify(normalized.clientAccountName || normalized.businessBrandName || "client");
  const analysis = buildGeneratedAnalysis(normalized);
  const baseStatus = buildStatus(normalized, analysis, { readyForProposal: false, handoffState: "running" }, {
    auditId,
    auditStatus: "running",
    createdAt: existingEntry?.timestamp || toIso(),
    updatedAt: toIso(),
    startedAt: toIso(),
  });
  const handoff = buildHandoff(normalized, analysis, {
    ...baseStatus,
    auditStatus: "completed",
  });
  const status = buildStatus(normalized, analysis, handoff, {
    auditId,
    auditStatus: "completed",
    createdAt: existingEntry?.timestamp || toIso(),
    updatedAt: toIso(),
    startedAt: existingEntry?.timestamp || toIso(),
  });
  const filePaths = await writeAuditBundle({ clientSlug, auditId, input: { ...normalized, auditId }, analysis, status, handoff });
  const entry = buildHistoryEntry({
    auditId,
    clientSlug,
    input: { ...normalized, auditId },
    analysis,
    status,
    handoff,
    filePaths,
  });
  const history = upsertHistory(currentHistory, entry);
  await saveVisibility(history, null);
  return getAuditWorkspace();
}

module.exports = {
  ensureAuditVisibilityWorkspace,
  getAuditWorkspace,
  saveAuditDraft,
  runAudit,
  AUDIT_TYPES,
};
