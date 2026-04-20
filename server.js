const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { URL } = require("url");
const { EventEmitter } = require("events");
const {
  liveStatus,
  buildConfigPayload,
  buildMetrics,
  buildEvents,
  buildTasks,
  buildPendingReview,
} = require("./hermes_operator_state");
const {
  getContentEngineState,
  getContentEngineHistory,
  appendContentEngineEvent,
  verifyEventSignature,
} = require("./ghl_content_engine_state");
const { mergeReviewItems, getReviewItem, recordReviewDecision, getDecisionHistory, resetReviewItemState } = require('./review_workflow_state');
const {
  getIdeaReviewWorkspace,
  saveIdeaReviewDraft,
  duplicateIdeaReview,
  runIdeaReview,
  exportIdeaReviewMarkdown,
} = require('./idea_review_state');
const {
  ensureAuditVisibilityWorkspace,
  getAuditWorkspace,
  saveAuditDraft,
  runAudit,
} = require('./audit_visibility_state');
const { buildInventorySnapshot, getInventorySnapshot, getInventorySummary, getInventoryByBucket } = require('./crm_inventory_model');
const { buildEnrollmentSnapshot, getEnrollmentSnapshot, getEnrollmentByState, approveForEnrollment, enrollApproved, buildLiveEnrollmentCounts } = require('./crm_enrollment_contract');
const { buildOutcomeSnapshot, getOutcomeSnapshot, getOutcomeByState, ingestOutcomeEvent } = require('./crm_outcome_model');
const { buildIntelligenceSnapshot, getIntelligenceSnapshot, ingestIntelligenceEvent } = require('./intelligence_layer_model');
const { listRecentRuns, loadRun } = require('./operator/ghl/v1/persistence/run_store');
const { listEvidenceForTask } = require('./operator/ghl/v1/persistence/evidence_store');
const { loadApproval } = require('./operator/ghl/v1/persistence/approval_store');

const contentEngineEmitter = new EventEmitter();
const contentEngineClients = new Set();
const contentEngineWatchState = { stateMtime: 0, eventMtime: 0 };

const DEMO_REVIEW_SEED = {
  id: 'demo-review-stability-001',
  task_input_or_id: 'demo-review-stability-001',
  task_text: 'Demo review item for Mission Control self-demo stability closure',
  title: 'demo review stability item',
  reason: 'human review required',
  details: 'Seeded demo-safe pending review item for self-demo repeatability.',
  task_type: 'crm_cleanup',
  source: 'pending-review',
  source_id: 'demo-review-stability-001',
  human_review: true,
  required_approval: 'human_review',
  pre_router_route: { task_type: 'crm_cleanup', run_mode: 'human_review', timing: 'queued', ai_required: false, human_review: true },
  legacy_route: { task_type: 'crm_cleanup', run_mode: 'local_plus_ai', timing: 'queued', ai_required: true },
  differs: true,
  ai_required: false,
  selected_model: null,
  fallback_model: null,
  final_executor: 'pre_router',
  task_failed: false,
  canary_bucket: 42,
};

const HERMES_INTERACTION_MP3 = path.join(__dirname, "hermes-interaction-latest.mp3");
const DEFAULT_ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
let hermesInteractionState = {
  sessionId: "hermes-interaction-shell",
  turns: [],
  lastUpdated: new Date().toISOString()
};

const PORT = 8080;
const HOST = "127.0.0.1";
const PROJECT_ROOT = __dirname;
const DASHBOARD_FILES = ["index.html", "mission-control.html"];
const LEGACY_DASHBOARD_FILES = ["mission-control.html", "index.html"];
const OPERATOR_DASHBOARD_FILES = ["mission-control-operator.html"];
const DATA_FILE = path.join(PROJECT_ROOT, "mc-data.json");
const ACTIVITY_FILE = path.join(PROJECT_ROOT, "mc-activity.json");
const HVAC_MISSION_CONTROL = "/Users/lilly/.openclaw/workspace/data/mission_control";
const MAX_BODY_SIZE = 5 * 1024 * 1024;
const WEATHER_TIMEOUT_MS = 8000;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const serverStartedAt = new Date();

const DEFAULT_DASHBOARD_DATA = {
  savedAt: serverStartedAt.toISOString(),
  dashboardState: {}
};

const DEFAULT_ACTIVITY = [
  {
    id: "activity-bootstrap",
    message: "Mission Control local server initialized.",
    timestamp: serverStartedAt.toISOString(),
    source: "server"
  }
];

function resolveDashboardPath() {
  for (const fileName of DASHBOARD_FILES) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function resolveLegacyDashboardPath() {
  for (const fileName of LEGACY_DASHBOARD_FILES) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function resolveOperatorDashboardPath() {
  for (const fileName of OPERATOR_DASHBOARD_FILES) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function getKeychainSecret(serviceName) {
  const result = spawnSync("security", ["find-generic-password", "-s", serviceName, "-w"], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout || "").trim() || null;
}

function getElevenLabsApiKey() {
  return (
    process.env.ELEVENLABS_API_KEY?.trim() ||
    getKeychainSecret("LCJ.ElevenLabs.DeveloperKey") ||
    getKeychainSecret("LCJ.ElevenLabs.API") ||
    null
  );
}

function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
}

function classifyElevenLabsFailure(message) {
  const text = String(message || "");
  if (/payment_issue|failed or incomplete payment|invoice/i.test(text)) {
    return "billing_payment_issue";
  }
  if (/api key|authorization|invalid key|unauthorized|forbidden/i.test(text)) {
    return "bad_key_scope_or_auth";
  }
  if (/voice|model|voice id|model_id|not found/i.test(text)) {
    return "invalid_voice_or_model";
  }
  return "other_external_issue";
}

function getAnthropicApiKey() {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    getKeychainSecret("LCJ.Anthropic.API") ||
    null
  );
}

function getAnthropicModelName() {
  return process.env.HERMES_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
}

function getOpenAIFallbackModelName() {
  return process.env.HERMES_OPENAI_FALLBACK_MODEL?.trim() || "gpt-4o-mini";
}

function getOpenAIApiKey() {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    getKeychainSecret("LCJ.OpenAI.API") ||
    getKeychainSecret("LCJ.OpenAI.Key") ||
    null
  );
}

function normalizeComparisonText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeComparisonText(text).split(" ").filter(Boolean));
}

function jaccardSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function isNearDuplicateResponse(userTranscript, assistantResponse) {
  const transcript = normalizeComparisonText(userTranscript);
  const response = normalizeComparisonText(assistantResponse);
  if (!transcript || !response) return false;
  if (response === transcript) return true;
  if (response.includes(transcript) || transcript.includes(response)) return true;
  return jaccardSimilarity(transcript, response) >= 0.72;
}

function buildLocalHermesResponseText(inputText) {
  const cleaned = String(inputText || "").trim();
  if (!cleaned) return "Hermes is ready.";

  const text = cleaned.toLowerCase();
  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    return "Hi — I’m here and ready to help.";
  }
  if (/\b(status|update|how are you|are you there|ready)\b/.test(text)) {
    return "Status is good. The shell is live and voice playback is ready.";
  }
  if (/\b(thank|thanks)\b/.test(text)) {
    return "You’re welcome. I’m ready for the next step.";
  }
  if (/\b(help|can you|could you|please|need)\b/.test(text) || cleaned.endsWith("?")) {
    return "Sure — I can help with that. Tell me the specific target and I’ll take it from there.";
  }
  return "Understood. I’m ready for the next step.";
}

async function callAnthropicHermesResponse(inputText) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return null;
  }

  const model = getAnthropicModelName();
  const body = JSON.stringify({
    model,
    max_tokens: 220,
    temperature: 0.4,
    system: "You are Hermes in Mission Control. Reply naturally and briefly. Treat the user's text as input only. Do not echo, mirror, or restate the user's words unless explicitly asked. Never use the transcript as spoken output. Return only the assistant reply text.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: String(inputText || "")
          }
        ]
      }
    ]
  });

  const response = await new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Anthropic Hermes response failed (${res.statusCode}): ${raw.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });

  const candidate = String(
    response.content?.flatMap(item => [item?.text, item?.output_text].filter(Boolean)).join(" ") ||
    response.output_text ||
    ""
  ).trim();
  return candidate || null;
}

async function callOpenAIHermesResponse(inputText) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  const model = getOpenAIFallbackModelName();
  const body = JSON.stringify({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "You are Hermes in Mission Control. Reply naturally and briefly. Treat the user's text as input only. Do not echo, mirror, or restate the user's words unless explicitly asked. Never use the transcript as spoken output. Return only the assistant reply text."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: String(inputText || "")
          }
        ]
      }
    ],
    temperature: 0.4,
    max_output_tokens: 220
  });

  const response = await new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/responses",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`OpenAI Hermes response failed (${res.statusCode}): ${raw.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });

  const candidate = String(
    response.output_text ||
    response.output?.flatMap(item => item.content || []).map(part => part.text || part.output_text || "").join(" ") ||
    ""
  ).trim();
  return candidate || null;
}

async function generateHermesResponseText(inputText) {
  const anthropicResponse = await callAnthropicHermesResponse(inputText).catch(() => null);
  const anthropicCandidate = String(anthropicResponse || "").trim();
  if (anthropicCandidate && !isNearDuplicateResponse(inputText, anthropicCandidate)) {
    return anthropicCandidate;
  }

  const openAIResponse = await callOpenAIHermesResponse(inputText).catch(() => null);
  const openAICandidate = String(openAIResponse || "").trim();
  if (openAICandidate && !isNearDuplicateResponse(inputText, openAICandidate)) {
    return openAICandidate;
  }

  const fallback = buildLocalHermesResponseText(inputText);
  if (!fallback || isNearDuplicateResponse(inputText, fallback)) {
    throw new Error("Hermes response generation failed or produced a transcript duplicate.");
  }
  return fallback;
}

async function synthesizeElevenLabsSpeech(assistantResponseText, userTranscriptText) {
  const ttsText = String(assistantResponseText || "").trim();
  if (!ttsText) {
    throw new Error("Assistant response is empty; playback blocked.");
  }
  if (isNearDuplicateResponse(userTranscriptText, ttsText)) {
    throw new Error("Playback blocked: TTS text is too close to the user transcript.");
  }

  console.info("[hermes-interaction] tts_text=", ttsText);

  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new Error("ElevenLabs API key not found in environment or Keychain.");
  }

  const voiceId = getElevenLabsVoiceId();
  const body = JSON.stringify({
    text: ttsText,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.35,
      similarity_boost: 0.75
    }
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: `/v1/text-to-speech/${voiceId}`,
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", async () => {
          const audioBuffer = Buffer.concat(chunks);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`ElevenLabs TTS failed (${response.statusCode}): ${audioBuffer.toString("utf8").slice(0, 240)}`));
            return;
          }

          try {
            await fs.promises.writeFile(HERMES_INTERACTION_MP3, audioBuffer);
            resolve({
              triggered: true,
              source_field: "assistant_response",
              tts_text: ttsText,
              voiceId,
              audioPath: HERMES_INTERACTION_MP3,
              audioUrl: `/${path.basename(HERMES_INTERACTION_MP3)}`,
              bytesWritten: audioBuffer.length
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(payload);
}

function formatUptime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  if (minutes || parts.length) parts.push(`${minutes}m`);
  parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

async function ensureJsonFile(filePath, fallbackValue) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
  } catch {
    await writeJson(filePath, fallbackValue);
  }
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    if (!raw.trim()) {
      await writeJson(filePath, fallbackValue);
      return fallbackValue;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(filePath, fallbackValue);
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJson(filePath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.promises.writeFile(filePath, serialized, "utf8");
}

async function getLastDataRefreshTimestamp() {
  try {
    const stats = await fs.promises.stat(DATA_FILE);
    return stats.mtime.toISOString();
  } catch {
    return serverStartedAt.toISOString();
  }
}

function safeStatMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function serializeSse({ event = 'message', data, id }) {
  const lines = [];
  if (id) lines.push(`id: ${id}`);
  if (event) lines.push(`event: ${event}`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const line of payload.split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }
  return `${lines.join('\n')}\n\n`;
}

function broadcastContentEngineSnapshot(reason = 'snapshot') {
  const payload = getContentEngineState();
  const message = serializeSse({ event: reason, data: payload, id: String(Date.now()) });
  for (const res of [...contentEngineClients]) {
    try {
      res.write(message);
    } catch {
      contentEngineClients.delete(res);
    }
  }
  return payload;
}

function maybeBroadcastContentEngineChange(force = false) {
  const stateMtime = safeStatMtime(path.join(PROJECT_ROOT, 'ghl_content_engine_state.json'));
  const eventMtime = safeStatMtime(path.join(PROJECT_ROOT, 'ghl_content_engine_events.jsonl'));
  const changed = force || stateMtime !== contentEngineWatchState.stateMtime || eventMtime !== contentEngineWatchState.eventMtime;
  if (!changed) return null;
  contentEngineWatchState.stateMtime = stateMtime;
  contentEngineWatchState.eventMtime = eventMtime;
  return broadcastContentEngineSnapshot(force ? 'snapshot' : 'update');
}

function startContentEngineWatchers() {
  maybeBroadcastContentEngineChange(true);
  setInterval(() => {
    maybeBroadcastContentEngineChange(false);
    const heartbeat = serializeSse({ event: 'heartbeat', data: { ts: new Date().toISOString(), source: 'mission-control-server' } });
    for (const res of [...contentEngineClients]) {
      try {
        res.write(heartbeat);
      } catch {
        contentEngineClients.delete(res);
      }
    }
  }, 5000);
}

function serveContentEngineStream(req, res) {
  setCorsHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write(serializeSse({ event: 'snapshot', data: getContentEngineState(), id: String(Date.now()) }));
  contentEngineClients.add(res);
  req.on('close', () => contentEngineClients.delete(res));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseRequestBody(req) {
  const body = await readRequestBody(req);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function sanitizeCity(city) {
  return encodeURIComponent(String(city || "").trim());
}

function fetchWeather(city) {
  return new Promise((resolve, reject) => {
    const targetUrl = `https://wttr.in/${sanitizeCity(city)}?format=j1`;

    const request = https.get(
      targetUrl,
      {
        headers: {
          "User-Agent": "Mission-Control-Local-Server/1.0",
          Accept: "application/json"
        }
      },
      response => {
        let raw = "";

        response.on("data", chunk => {
          raw += chunk;
        });

        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Weather request failed with status ${response.statusCode}.`));
            return;
          }

          try {
            const payload = JSON.parse(raw);
            const current = payload.current_condition?.[0] || {};
            const condition = current.weatherDesc?.[0]?.value || "Unknown";
            const temperature = current.temp_F ? `${current.temp_F}°F` : `${current.temp_C || "N/A"}°C`;
            const feelsLike = current.FeelsLikeF ? `${current.FeelsLikeF}°F` : `${current.FeelsLikeC || "N/A"}°C`;

            resolve({
              city: String(city).trim(),
              temperature,
              condition,
              feels_like: feelsLike,
              source: "wttr.in",
              fetchedAt: new Date().toISOString()
            });
          } catch (error) {
            reject(new Error(`Weather response parse failed: ${error.message}`));
          }
        });
      }
    );

    request.setTimeout(WEATHER_TIMEOUT_MS, () => {
      request.destroy(new Error("Weather request timed out."));
    });

    request.on("error", reject);
  });
}

async function serveDashboard(res) {
  const dashboardPath = resolveDashboardPath();

  if (!dashboardPath) {
    sendText(
      res,
      404,
      "No premium Mission Control dashboard HTML file found. Add index.html to this folder."
    );
    return;
  }

  const html = await fs.promises.readFile(dashboardPath, "utf8");
  sendText(res, 200, html, "text/html; charset=utf-8");
}

async function serveOperatorDashboard(res) {
  const dashboardPath = resolveOperatorDashboardPath();

  if (!dashboardPath) {
    sendText(res, 404, "No Hermes operator dashboard HTML file found.");
    return;
  }

  const html = await fs.promises.readFile(dashboardPath, "utf8");
  sendText(res, 200, html, "text/html; charset=utf-8");
}

async function serveLegacyDashboard(res) {
  const dashboardPath = resolveLegacyDashboardPath();

  if (!dashboardPath) {
    sendText(res, 404, "No legacy dashboard HTML file found.");
    return;
  }

  const html = await fs.promises.readFile(dashboardPath, "utf8");
  sendText(res, 200, html, "text/html; charset=utf-8");
}

async function serveStaticAsset(res, pathname) {
  const relativePath = pathname.replace(/^\/+/, "");
  if (!relativePath) {
    return false;
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolvedPath.startsWith(PROJECT_ROOT + path.sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return true;
  }

  try {
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) {
      return false;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    const fileBuffer = await fs.promises.readFile(resolvedPath);
    setCorsHeaders(res);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(fileBuffer);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function handleApiRequest(req, res, url) {
  if (req.method === "GET" && url.pathname === "/mc/status") {
    sendJson(res, 200, {
      connectionHealth: "online",
      serverStartedAt: serverStartedAt.toISOString(),
      serverUptimeSeconds: Math.floor(process.uptime()),
      serverUptimeHuman: formatUptime(process.uptime()),
      lastDataRefresh: await getLastDataRefreshTimestamp(),
      dashboardFile: path.basename(resolveDashboardPath() || "not-found")
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/mc/data") {
    const payload = await readJson(DATA_FILE, DEFAULT_DASHBOARD_DATA);
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/mc/data") {
    const payload = await parseRequestBody(req);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      sendJson(res, 400, { error: "POST /mc/data expects a JSON object." });
      return;
    }

    await writeJson(DATA_FILE, payload);

    sendJson(res, 200, {
      ok: true,
      savedAt: await getLastDataRefreshTimestamp(),
      bytesWritten: Buffer.byteLength(JSON.stringify(payload), "utf8")
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/mc/weather") {
    const city = url.searchParams.get("city");

    if (!city || !city.trim()) {
      sendJson(res, 400, { error: "Query parameter 'city' is required." });
      return;
    }

    const weather = await fetchWeather(city);
    sendJson(res, 200, weather);
    return;
  }

  if (req.method === "GET" && url.pathname === "/mc/activity") {
    const entries = await readJson(ACTIVITY_FILE, DEFAULT_ACTIVITY);
    const normalized = Array.isArray(entries) ? entries : DEFAULT_ACTIVITY;
    sendJson(res, 200, normalized.slice(-50).reverse());
    return;
  }

  if (req.method === "POST" && url.pathname === "/mc/activity") {
    const payload = await parseRequestBody(req);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      sendJson(res, 400, { error: "POST /mc/activity expects a JSON object." });
      return;
    }

    const message = String(payload.message || "").trim();
    if (!message) {
      sendJson(res, 400, { error: "Activity entry requires a 'message' field." });
      return;
    }

    const entries = await readJson(ACTIVITY_FILE, DEFAULT_ACTIVITY);
    const normalized = Array.isArray(entries) ? entries : [];
    const entry = {
      id: `activity-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...payload,
      message
    };

    normalized.push(entry);
    await writeJson(ACTIVITY_FILE, normalized.slice(-500));

    sendJson(res, 201, {
      ok: true,
      entry
    });
    return;
  }

  if (url.pathname === "/api/hermes-interaction" || url.pathname === "/api/hermes-interaction/turn") {
    if (req.method === "GET") {
      sendJson(res, 200, hermesInteractionState);
      return;
    }

    if (req.method === "POST") {
      const payload = await parseRequestBody(req);
      const inputText = String(payload?.text || payload?.message || payload?.transcript || "").trim();
      if (!inputText) {
        sendJson(res, 400, { error: "Interaction text is required." });
        return;
      }

      const transcript = {
        text: inputText,
        receivedAt: new Date().toISOString()
      };
      const assistantResponseText = await generateHermesResponseText(inputText);
      if (!String(assistantResponseText || "").trim()) {
        sendJson(res, 502, { error: "Hermes response was empty." });
        return;
      }
      const response = {
        text: assistantResponseText,
        source_field: "assistant_response",
        emittedAt: new Date().toISOString()
      };

      let tts;
      try {
        tts = await synthesizeElevenLabsSpeech(assistantResponseText, inputText);
      } catch (error) {
        tts = {
          triggered: false,
          source_field: "assistant_response",
          tts_text: assistantResponseText,
          error: error.message,
          voiceId: getElevenLabsVoiceId()
        };
      }

      const turn = {
        id: `turn-${Date.now()}`,
        transcript,
        response,
        assistant_response: assistantResponseText,
        tts
      };

      hermesInteractionState = {
        sessionId: hermesInteractionState.sessionId,
        lastUpdated: new Date().toISOString(),
        turns: [...hermesInteractionState.turns, turn].slice(-1)
      };

      sendJson(res, 200, {
        ok: true,
        session: hermesInteractionState,
        turn
      });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  sendJson(res, 404, { error: "Route not found." });
}

// Enhanced Matrix API Handlers
async function handleEnhancedStatus(req, res) {
  try {
    sendJson(res, 200, liveStatus());
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleMatrixData(req, res) {
  try {
    const dashboardData = await readJson(DATA_FILE, DEFAULT_DASHBOARD_DATA);
    const matrixData = {
      "matrix_status": "operational",
      "threat_analysis": dashboardData.matrix || {},
      "system_integrity": (dashboardData.matrix || {}).system_integrity || 94,
      "operational_readiness": (dashboardData.matrix || {}).operational_readiness || "high",
      "threat_indicators": {
        "network_security": "secure",
        "data_integrity": "verified",
        "access_controls": "active",
        "encryption_status": "enabled"
      },
      "intelligence_feeds": {
        "market_intelligence": "active",
        "competitor_analysis": "ready",
        "lead_scoring": "operational",
        "predictive_analytics": "enabled"
      },
      "last_updated": new Date().toISOString()
    };
    sendJson(res, 200, matrixData);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleRevenueData(req, res) {
  try {
    const dashboardData = await readJson(DATA_FILE, DEFAULT_DASHBOARD_DATA);
    const revenueData = {
      "campaign_performance": dashboardData.revenueMetrics || {},
      "revenue_projections": {
        "today": 47,
        "this_week": 329,
        "this_month": 1410,
        "quarterly_target": 15000
      },
      "conversion_metrics": {
        "sms_response_rate": 0.12,
        "booking_conversion_rate": 0.20,
        "audit_to_upsell_rate": 0.35,
        "average_deal_size": 1500
      },
      "active_campaigns": [
        {
          "name": "$47 Automation Audit SMS",
          "status": "active",
          "sent": 20,
          "responses": 0,
          "bookings": 0,
          "revenue": 0
        }
      ],
      "pipeline_analysis": {
        "top_of_funnel": 826,
        "engaged_leads": 47,
        "qualified_prospects": 20,
        "active_deals": 0,
        "closed_deals": 0
      }
    };
    sendJson(res, 200, revenueData);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleSystemsData(req, res) {
  try {
    const dashboardData = await readJson(DATA_FILE, DEFAULT_DASHBOARD_DATA);
    const systemsData = {
      "systems_overview": dashboardData.systemStatus || {},
      "interconnected_systems": {
        "lead_generation": {
          "status": "active",
          "daily_leads": 200,
          "conversion_rate": 0.12,
          "pipeline_value": 1500
        },
        "revenue_optimization": {
          "status": "operational",
          "sms_campaigns": 1,
          "email_campaigns": 0,
          "automation_workflows": 8
        },
        "intelligence_layer": {
          "status": "active",
          "predictive_models": 3,
          "market_analysis": "ready",
          "competitor_monitoring": "enabled"
        }
      },
      "system_health": {
        "overall_score": 94,
        "performance_grade": "A",
        "reliability": 99.2,
        "response_time": "<100ms"
      }
    };
    sendJson(res, 200, systemsData);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleActivityData(req, res) {
  try {
    const activityData = await readJson(ACTIVITY_FILE, DEFAULT_ACTIVITY);
    const activityResponse = {
      "recent_activity": Array.isArray(activityData) ? activityData.slice(-10) : [],
      "activity_summary": {
        "total_activities": Array.isArray(activityData) ? activityData.length : 0,
        "today_activities": Array.isArray(activityData) ? activityData.filter(a => isToday(a.timestamp)).length : 0
      },
      "system_events": [
        {
          "timestamp": new Date().toISOString(),
          "event": "Matrix API integration active",
          "source": "dashboard",
          "severity": "info"
        }
      ]
    };
    sendJson(res, 200, activityResponse);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleMetricsData(req, res) {
  try {
    sendJson(res, 200, buildMetrics());
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleConfigData(req, res) {
  try {
    sendJson(res, 200, buildConfigPayload());
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleEventsData(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    sendJson(res, 200, { items: buildEvents(Number.isNaN(limit) ? 50 : limit) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleTasksData(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    sendJson(res, 200, { items: buildTasks(Number.isNaN(limit) ? 50 : limit) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handlePendingReviewData(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    const baseItems = buildPendingReview(Number.isNaN(limit) ? 50 : limit);
    const items = mergeReviewItems(baseItems).filter(item => item.review_status === 'pending');
    sendJson(res, 200, { items });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleReviewItems(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    const baseItems = buildPendingReview(Number.isNaN(limit) ? 50 : limit);
    const items = mergeReviewItems(baseItems);
    sendJson(res, 200, { items });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleReviewDetail(req, res, id) {
  try {
    const baseItems = buildPendingReview(200);
    const baseItem = baseItems.find(item => String(item.id) === String(id)) || { id };
    const item = getReviewItem(baseItem);
    sendJson(res, 200, { item, history: getDecisionHistory(50).filter(entry => String(entry.source_item?.id) === String(item.id)) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleReviewAction(req, res, id, action) {
  try {
    const payload = await parseRequestBody(req);
    const baseItems = buildPendingReview(200);
    const baseItem = baseItems.find(item => String(item.id) === String(id)) || { id };
    const reviewedBy = String(payload.reviewed_by || payload.reviewedBy || 'operator').trim() || 'operator';
    const note = String(payload.note || payload.comment || '').trim();
    const result = recordReviewDecision(baseItem, action, note, reviewedBy);
    sendJson(res, 200, {
      ok: true,
      action,
      item: getReviewItem(baseItem),
      decision: result.item,
      history: getDecisionHistory(50).filter(entry => String(entry.source_item?.id) === String(id))
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleReviewHistory(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    sendJson(res, 200, { items: getDecisionHistory(Number.isNaN(limit) ? 50 : limit) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function ensureInventorySnapshotReady() {
  const snapshot = getInventorySnapshot();
  if (!snapshot.rows || !snapshot.rows.length || snapshot.total_contacts === 0) {
    return await buildInventorySnapshot();
  }
  return snapshot;
}

async function handleInventoryData(req, res) {
  try {
    const snapshot = await ensureInventorySnapshotReady();
    sendJson(res, 200, snapshot);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleInventoryBucket(req, res, bucket) {
  try {
    await ensureInventorySnapshotReady();
    const items = getInventoryByBucket(bucket);
    sendJson(res, 200, { bucket, count: items.length, items });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleDataQualityData(req, res) {
  try {
    const snapshot = await ensureInventorySnapshotReady();
    const counts = snapshot.counts || {};
    const dataQuality = {
      generated_at: snapshot.generated_at,
      total_contacts: snapshot.total_contacts || 0,
      source_split: snapshot.source_split || {},
      counts: {
        missing_email: counts.missing_email || 0,
        missing_website: counts.missing_website || 0,
        missing_phone: counts.missing_phone || 0,
        no_contact_method: counts.no_contact_method || 0,
        duplicate_risk: counts.duplicate_risk || 0,
        suppressed_duplicate: counts.suppressed_duplicate || 0,
        suppressed_hold: counts.suppressed_hold || 0,
        enrichment_needed: counts.enrichment_needed || 0,
        no_website_opportunity: counts.no_website_opportunity || 0,
      },
      rows: snapshot.rows || [],
      buckets: snapshot.buckets || {},
      refresh_status: snapshot.refresh_status || 'fresh'
    };
    sendJson(res, 200, dataQuality);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleEnrollmentData(req, res) {
  try {
    const snapshot = await ensureInventorySnapshotReady();
    const enrollment = buildEnrollmentSnapshot();
    sendJson(res, 200, enrollment);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleEnrollmentAction(req, res, action, id) {
  try {
    const body = await readRequestBody(req);
    const payload = body ? JSON.parse(body) : {};
    const actor = payload.reviewed_by || payload.approved_by || payload.enrolled_by || 'operator';
    let result;
    if (action === 'approve') result = approveForEnrollment(id, actor);
    else if (action === 'enroll') result = enrollApproved(id, actor);
    else throw new Error(`Unsupported enrollment action: ${action}`);
    sendJson(res, 200, { ok: true, action, enrollment: result });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleOutcomeData(req, res) {
  try {
    const snapshot = await ensureInventorySnapshotReady();
    const outcome = buildOutcomeSnapshot();
    sendJson(res, 200, outcome);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleIntelligenceData(req, res) {
  try {
    await ensureInventorySnapshotReady();
    const intelligence = buildIntelligenceSnapshot();
    sendJson(res, 200, intelligence);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function normalizeOutcomeWebhookPayload(payload = {}, headers = {}) {
  const sourceLineage = payload.source_lineage || payload.sourceLineage || payload.source_attribution?.source_lineage || [];
  const sourceType = payload.source_type || payload.sourceType || payload.source_attribution?.source_type || 'gohighlevel_execution';
  const sourceName = payload.source_name || payload.sourceName || payload.source_attribution?.source_name || 'gohighlevel';
  const correlation_id = String(
    payload.correlation_id ||
    payload.enrollment_key ||
    payload.contact_id ||
    payload.contactId ||
    payload.contact?.id ||
    payload.contact?.contactId ||
    payload.external_id ||
    payload.externalId ||
    payload.workflow_key ||
    payload.workflowId ||
    payload.workflow_id ||
    headers['x-ghl-contact-id'] ||
    headers['x-contact-id'] ||
    headers['x-event-id'] ||
    ''
  ).trim();

  const rawType = String(payload.outcome_state || payload.event_type || payload.type || payload.event || payload.eventName || payload.action || payload.status || '').toLowerCase();
  const mappedType = ({
    replied: 'replied',
    reply: 'replied',
    customer_replied: 'replied',
    inbound_message: 'replied',
    message_received: 'replied',
    booked: 'booked',
    appointment_booked: 'booked',
    appointment_scheduled: 'booked',
    scheduled: 'booked',
    paid: 'paid',
    payment_received: 'paid',
    invoice_paid: 'paid',
    order_paid: 'paid',
    no_show: 'no_show',
    'no-show': 'no_show',
    rescheduled: 'rescheduled',
    reschedule: 'rescheduled',
    closed_lost: 'closed_lost',
    closedlost: 'closed_lost',
  })[rawType] || rawType || 'outcome_failed';

  const revenueAmount = payload.revenue_amount ?? payload.amount ?? payload.payment_amount ?? payload.total_amount ?? payload.value ?? 0;
  const region = payload.region || payload.contact?.region || payload.location || '';
  const vertical = payload.vertical || payload.contact?.vertical || payload.industry || '';
  const workflow_key = payload.workflow_key || payload.workflowId || payload.workflow_id || payload.workflow?.id || payload.workflow?.name || '';

  return {
    correlation_id,
    outcome_state: mappedType,
    revenue_amount: revenueAmount,
    revenue_source: payload.revenue_source || sourceType,
    region,
    vertical,
    workflow_key,
    source_type: sourceType,
    source_lineage: Array.isArray(sourceLineage) ? sourceLineage : [],
    source_name: sourceName,
    occurred_at: payload.occurred_at || payload.timestamp || payload.event_time || payload.eventTime || new Date().toISOString(),
    metadata: payload.metadata || {
      raw_event_type: rawType,
      source_event_id: payload.source_event_id || payload.sourceEventId || headers['x-event-id'] || null,
    },
  };
}

async function handleOutcomeIngest(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    if (!rawBody.trim()) {
      sendJson(res, 400, { error: 'POST body required.' });
      return;
    }
    const payload = JSON.parse(rawBody);
    const result = ingestOutcomeEvent(payload);
    sendJson(res, 200, { ok: true, outcome: result });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleContentEngineHistory(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    sendJson(res, 200, { items: getContentEngineHistory(Number.isNaN(limit) ? 50 : limit) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleContentEngineIngest(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    if (!rawBody.trim()) {
      sendJson(res, 400, { error: 'POST body required.' });
      return;
    }

    const payload = JSON.parse(rawBody);
    const signature = verifyEventSignature(rawBody, req.headers || {});
    if (signature.required && signature.valid === false) {
      sendJson(res, 401, { error: 'Invalid event signature.', authenticity_status: signature.status });
      return;
    }

    const result = appendContentEngineEvent(payload, {
      rawBody,
      headers: req.headers || {},
      source_system: payload.source_system || payload.sourceSystem || payload.source || 'gohighlevel',
      source_type: payload.source_type || payload.sourceType || 'webhook',
      source_name: payload.source_name || payload.sourceName || 'gohighlevel-upstream',
      source_event_id: payload.source_event_id || payload.sourceEventId || req.headers['x-event-id'] || null,
    });

    const outcomePayload = normalizeOutcomeWebhookPayload(payload, req.headers || {});
    const shouldProjectOutcome = Boolean(outcomePayload && outcomePayload.outcome_state && outcomePayload.correlation_id);
    let outcomeResult = null;
    if (shouldProjectOutcome) {
      outcomeResult = ingestOutcomeEvent(outcomePayload);
    }

    contentEngineEmitter.emit('update', result.projection);
    if (outcomeResult) contentEngineEmitter.emit('update', outcomeResult);
    broadcastContentEngineSnapshot('ingest');

    sendJson(res, result.duplicate ? 200 : 201, {
      ok: true,
      duplicate: result.duplicate,
      source: result.projection.source,
      source_mode: result.projection.source_mode,
      event: result.event,
      projection: result.projection,
      outcome_projected: Boolean(outcomeResult),
      outcome: outcomeResult,
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function isToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

async function requestHandler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (url.pathname === "/api/hermes-interaction" || url.pathname === "/api/hermes-interaction/turn") {
      if (req.method === "GET") {
        sendJson(res, 200, hermesInteractionState);
        return;
      }

      if (req.method === "POST") {
        const payload = await parseRequestBody(req);
        const inputText = String(payload?.text || payload?.message || payload?.transcript || "").trim();
        if (!inputText) {
          sendJson(res, 400, { error: "Interaction text is required." });
          return;
        }

        const transcript = { text: inputText, receivedAt: new Date().toISOString() };
        const assistantResponseText = await generateHermesResponseText(inputText);
        if (!String(assistantResponseText || "").trim()) {
          sendJson(res, 502, { error: "Hermes response was empty." });
          return;
        }
        const response = {
          text: assistantResponseText,
          source_field: "assistant_response",
          emittedAt: new Date().toISOString()
        };

        let tts;
        try {
          tts = await synthesizeElevenLabsSpeech(assistantResponseText, inputText);
        } catch (error) {
          tts = {
            triggered: false,
            source_field: "assistant_response",
            tts_text: assistantResponseText,
            error: error.message,
            blocker: classifyElevenLabsFailure(error.message),
            voiceId: getElevenLabsVoiceId()
          };
        }

        const turn = {
          id: `turn-${Date.now()}`,
          transcript,
          response,
          assistant_response: assistantResponseText,
          tts
        };

        hermesInteractionState = {
          sessionId: hermesInteractionState.sessionId,
          lastUpdated: new Date().toISOString(),
          turns: [...hermesInteractionState.turns, turn].slice(-1)
        };

        sendJson(res, 200, {
          ok: true,
          session: hermesInteractionState,
          turn
        });
        return;
      }

      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/mission-control.html" || url.pathname === "/review-ideas" || url.pathname === "/aeo-seo-audit" || url.pathname === "/lcj-news-production" || url.pathname === "/hermes-interaction") {
      await serveDashboard(res);
      return;
    }

    if (url.pathname === "/mission-control-operator" || url.pathname === "/mission-control-operator.html" || url.pathname === "/hermes-operator") {
      await serveOperatorDashboard(res);
      return;
    }

    if (url.pathname === "/legacy-dashboard") {
      await serveLegacyDashboard(res);
      return;
    }

    if (url.pathname.startsWith("/mc/") || url.pathname === "/api/hermes-interaction" || url.pathname === "/api/hermes-interaction/turn") {
      await handleApiRequest(req, res, url);
      return;
    }

    if (url.pathname === "/api/status") {
      await handleEnhancedStatus(req, res);
      return;
    }
    if (url.pathname === "/api/config") {
      await handleConfigData(req, res);
      return;
    }
    if (url.pathname === "/api/metrics") {
      await handleMetricsData(req, res);
      return;
    }
    if (url.pathname === "/api/events") {
      await handleEventsData(req, res);
      return;
    }
    if (url.pathname === "/api/tasks") {
      await handleTasksData(req, res);
      return;
    }
    if (url.pathname === "/api/pending-review") {
      await handlePendingReviewData(req, res);
      return;
    }
    if (url.pathname === "/api/review-items/demo-seed/reset") {
      if (req.method === 'POST') {
        sendJson(res, 200, { ok: true, item: resetReviewItemState(DEMO_REVIEW_SEED) });
        return;
      }
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }
    if (url.pathname === "/api/review-items") {
      await handleReviewItems(req, res);
      return;
    }
    if (url.pathname === "/api/review-history") {
      await handleReviewHistory(req, res);
      return;
    }
    if (url.pathname.startsWith('/api/review-items/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[2];
      const action = parts[3];
      if (!id) { sendJson(res, 400, { error: 'Review id required.' }); return; }
      if (req.method === 'GET' && !action) { await handleReviewDetail(req, res, id); return; }
      if (req.method === 'POST' && action && ['approve','request-changes','reject','note'].includes(action)) { await handleReviewAction(req, res, id, action); return; }
    }
    if (url.pathname === "/api/idea-reviews") {
      if (req.method === "GET") {
        sendJson(res, 200, await getIdeaReviewWorkspace());
        return;
      }
      if (req.method === "POST") {
        const payload = await parseRequestBody(req);
        sendJson(res, 200, { request: await saveIdeaReviewDraft(payload) });
        return;
      }
    }
    if (url.pathname.startsWith('/api/idea-reviews/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[2];
      const action = parts[3];
      if (!id) {
        sendJson(res, 400, { error: 'Idea review id required.' });
        return;
      }
      if (req.method === 'PATCH' && !action) {
        const payload = await parseRequestBody(req);
        sendJson(res, 200, { request: await saveIdeaReviewDraft(payload, id) });
        return;
      }
      if (req.method === 'POST' && action === 'run') {
        sendJson(res, 200, { request: await runIdeaReview(id) });
        return;
      }
      if (req.method === 'POST' && action === 'duplicate') {
        sendJson(res, 200, { request: await duplicateIdeaReview(id) });
        return;
      }
      if (req.method === 'GET' && action === 'export') {
        const exported = await exportIdeaReviewMarkdown(id);
        setCorsHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${exported.fileName}"`
        });
        res.end(exported.content);
        return;
      }
    }
    if (url.pathname === "/api/aeo-seo-audit/workspace") {
      if (req.method === "GET") {
        sendJson(res, 200, await getAuditWorkspace());
        return;
      }
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }
    if (url.pathname === "/api/aeo-seo-audit/draft") {
      if (req.method === "POST") {
        const payload = await parseRequestBody(req);
        sendJson(res, 200, await saveAuditDraft(payload));
        return;
      }
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }
    if (url.pathname === "/api/aeo-seo-audit/run") {
      if (req.method === "POST") {
        const payload = await parseRequestBody(req);
        sendJson(res, 200, await runAudit(payload));
        return;
      }
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }
    if (url.pathname === "/api/system/hvac-pipeline") {
      try {
        const readMc = (file) => {
          try { return JSON.parse(fs.readFileSync(path.join(HVAC_MISSION_CONTROL, file), "utf8")); }
          catch { return null; }
        };
        const summary = readMc("hvac_monitor_summary.json");
        const cycleStatus = readMc("hvac_cycle_status.json");
        const rolloutState = readMc("hvac_rollout_state.json");
        const rolloutConfig = readMc("hvac_rollout_config.json");
        const intakeVisibility = readMc("intake_visibility.json");
        sendJson(res, 200, {
          source: "live",
          summary,
          cycle_status: cycleStatus,
          rollout_state: rolloutState,
          rollout_config: rolloutConfig,
          intake_visibility: intakeVisibility,
          last_fetched: new Date().toISOString(),
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine") {
      sendJson(res, 200, getContentEngineState());
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/inventory") {
      await handleInventoryData(req, res);
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/inventory/data-quality") {
      await handleDataQualityData(req, res);
      return;
    }
    if (url.pathname.startsWith('/api/system/go-high-level-content-engine/inventory/bucket/')) {
      const bucket = url.pathname.split('/').pop();
      await handleInventoryBucket(req, res, bucket);
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/enrollments") {
      await handleEnrollmentData(req, res);
      return;
    }
    if (url.pathname.startsWith('/api/system/go-high-level-content-engine/enrollment/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const action = parts[4];
      const id = parts[5];
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required.' }); return; }
      await handleEnrollmentAction(req, res, action, id);
      return;
    }
    if (url.pathname === '/api/system/go-high-level-content-engine/outcomes') {
      await handleOutcomeData(req, res);
      return;
    }
    if (url.pathname === '/api/system/go-high-level-content-engine/intelligence') {
      await handleIntelligenceData(req, res);
      return;
    }
    if (url.pathname === '/api/operator/ghl/v1/runs') {
      sendJson(res, 200, { items: listRecentRuns(25) });
      return;
    }
    if (url.pathname === '/api/operator/ghl/v1/approvals') {
      sendJson(res, 200, { items: loadApproval(25) });
      return;
    }
    if (url.pathname === '/api/operator/ghl/v1/evidence') {
      sendJson(res, 200, { items: listEvidenceForTask(url.searchParams.get('task_id') || '') });
      return;
    }
    if (url.pathname === '/api/system/go-high-level-content-engine/intelligence/ingest') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required.' }); return; }
      const rawBody = await readRequestBody(req);
      if (!rawBody.trim()) { sendJson(res, 400, { error: 'POST body required.' }); return; }
      const payload = JSON.parse(rawBody);
      const result = ingestIntelligenceEvent(payload);
      contentEngineEmitter.emit('update', result);
      broadcastContentEngineSnapshot('intelligence-ingest');
      sendJson(res, 200, { ok: true, intelligence: result });
      return;
    }
    if (url.pathname === '/api/system/go-high-level-content-engine/outcome' || url.pathname === '/api/system/go-high-level-content-engine/outcomes/ingest') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required.' }); return; }
      await handleOutcomeIngest(req, res);
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/stream") {
      serveContentEngineStream(req, res);
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/history") {
      await handleContentEngineHistory(req, res);
      return;
    }
    if (url.pathname === "/api/system/go-high-level-content-engine/ingest" || url.pathname === "/api/system/go-high-level-content-engine/webhook") {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required.' });
        return;
      }
      await handleContentEngineIngest(req, res);
      return;
    }

    if (url.pathname === "/api/matrix") {
      await handleMatrixData(req, res);
      return;
    }
    
    if (url.pathname === "/api/revenue") {
      await handleRevenueData(req, res);
      return;
    }
    
    if (url.pathname === "/api/systems") {
      await handleSystemsData(req, res);
      return;
    }
    
    if (url.pathname === "/api/activity") {
      await handleActivityData(req, res);
      return;
    }
    

    if (await serveStaticAsset(res, url.pathname)) {
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(`[${new Date().toISOString()}]`, error);
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
}

async function bootstrap() {
  await ensureJsonFile(DATA_FILE, DEFAULT_DASHBOARD_DATA);
  await ensureJsonFile(ACTIVITY_FILE, DEFAULT_ACTIVITY);
  await ensureAuditVisibilityWorkspace();

  const server = http.createServer(requestHandler);
  startContentEngineWatchers();

  server.listen(PORT, HOST, () => {
    const dashboardFile = resolveDashboardPath();
    console.log(`Mission Control server running at http://localhost:${PORT}`);
    console.log(`Dashboard file: ${dashboardFile ? path.basename(dashboardFile) : "not found"}`);
    console.log(`Data file: ${path.basename(DATA_FILE)}`);
    console.log(`Activity file: ${path.basename(ACTIVITY_FILE)}`);
  });
}

bootstrap().catch(error => {
  console.error("Failed to start Mission Control server:", error);
  process.exit(1);
});
