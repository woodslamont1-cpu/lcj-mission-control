const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const STORE_FILE = path.join(__dirname, 'idea_review_requests.json');
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 80_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 240_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml'];

const TEMPLATES = [
  {
    key: 'skeptical_review',
    label: 'Skeptical Review',
    mode: 'REVIEW',
    summary: 'Pressure-test the idea like a hard-nosed strategic reviewer.',
    instructions:
      'Act like a skeptical operator-investor. Stress test the idea, point out weak assumptions, identify missing pieces, and force clarity before resources are committed.'
  },
  {
    key: 'investor_review',
    label: 'Investor Review',
    mode: 'REVIEW',
    summary: 'Evaluate the idea like an investor deciding whether to back it.',
    instructions:
      'Act like an investor reviewing a proposal. Evaluate viability, leverage, defensibility, monetization, execution risk, and whether the operator should proceed now or wait.'
  },
  {
    key: 'technical_gap_analysis',
    label: 'Technical Gap Analysis',
    mode: 'REVIEW',
    summary: 'Find architecture, implementation, and delivery gaps.',
    instructions:
      'Act like a senior technical reviewer. Identify architecture gaps, implementation blind spots, hidden dependencies, integration risks, and what would break in delivery.'
  },
  {
    key: 'build_request',
    label: 'Build Request',
    mode: 'BUILD',
    summary: 'Turn the idea into an implementation-ready build plan.',
    instructions:
      'Act like a product engineer preparing to build. Convert the request into a concrete implementation plan with architecture, sequence, files, risks, and immediate next steps.'
  },
  {
    key: 'product_strategy_review',
    label: 'Product Strategy Review',
    mode: 'REVIEW',
    summary: 'Review positioning, product shape, and strategic fit.',
    instructions:
      'Act like a product strategist. Review the offer, market angle, pricing logic, user value, execution path, and where the concept needs sharper positioning.'
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  if (crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${crypto.randomBytes(10).toString('hex')}`;
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function getAnthropicApiKey() {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    (() => {
      try {
        const result = require('child_process').spawnSync('security', ['find-generic-password', '-s', 'LCJ.Anthropic.API', '-w'], { encoding: 'utf8' });
        return result.status === 0 ? String(result.stdout || '').trim() || null : null;
      } catch {
        return null;
      }
    })() ||
    null
  );
}

function getAnthropicModelName() {
  return process.env.HERMES_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5';
}

function slugify(value) {
  return String(value || 'idea-review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'idea-review';
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean);
}

function decisionFromText(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('no-go') || normalized.includes('do not proceed') || normalized.includes('reject')) {
    return 'no-go';
  }
  if (normalized.includes('caution') || normalized.includes('conditional') || normalized.includes('proceed carefully')) {
    return 'caution';
  }
  if (normalized.includes('go')) {
    return 'go';
  }
  return null;
}

function getTemplate(key) {
  return TEMPLATES.find(item => item.key === key) || TEMPLATES[0];
}

function extractJsonBlock(text) {
  const match = String(text || '').match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function escapeHeading(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(text, headings) {
  for (const heading of headings) {
    const pattern = new RegExp(`(?:^|\\n)##?\\s*${escapeHeading(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##?\\s+|$)`, 'i');
    const match = String(text || '').match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function parseStructuredResult(text, mode) {
  const rawText = String(text || '').trim();
  const jsonBlock = extractJsonBlock(rawText);
  if (jsonBlock && typeof jsonBlock === 'object') {
    return jsonBlock;
  }

  if (mode === 'BUILD') {
    return {
      mode,
      summary: extractSection(rawText, ['Summary']) || rawText.slice(0, 320),
      implementationSteps: toList(extractSection(rawText, ['Implementation Steps', 'Steps'])),
      architectureSuggestions: toList(extractSection(rawText, ['Architecture Suggestions', 'Architecture'])),
      nextFileChanges: toList(extractSection(rawText, ['Next File Changes', 'File Changes'])),
      warnings: toList(extractSection(rawText, ['Warnings', 'Risks'])),
      dependencies: toList(extractSection(rawText, ['Dependencies']))
    };
  }

  const verdict = extractSection(rawText, ['Verdict']) || extractSection(rawText, ['Go/No-Go Recommendation']);
  return {
    mode,
    verdict: verdict || 'Needs operator review.',
    summary: extractSection(rawText, ['Summary']) || rawText.slice(0, 320),
    biggestGaps: toList(extractSection(rawText, ['Biggest Gaps', 'Gaps'])),
    biggestRisks: toList(extractSection(rawText, ['Biggest Risks', 'Risks'])),
    missingAssumptions: toList(extractSection(rawText, ['Missing Assumptions', 'Assumptions'])),
    priorityActions: toList(extractSection(rawText, ['Priority Actions', 'Actions'])),
    goNoGoRecommendation:
      extractSection(rawText, ['Go/No-Go Recommendation', 'Recommendation']) || verdict || 'Caution',
    notesForBuild: toList(extractSection(rawText, ['Notes for Build', 'Build Notes'])),
    decision: decisionFromText(verdict || extractSection(rawText, ['Go/No-Go Recommendation']))
  };
}

function buildStructuredInstructions(mode) {
  if (mode === 'BUILD') {
    return [
      'Return markdown with these exact sections:',
      '## Summary',
      '## Implementation Steps',
      '## Architecture Suggestions',
      '## Next File Changes',
      '## Warnings',
      '## Dependencies',
      '',
      'After the markdown, include a ```json fenced block with this shape:',
      '{',
      '  "mode": "BUILD",',
      '  "summary": "string",',
      '  "implementationSteps": ["step"],',
      '  "architectureSuggestions": ["suggestion"],',
      '  "nextFileChanges": ["change"],',
      '  "warnings": ["warning"],',
      '  "dependencies": ["dependency"]',
      '}'
    ].join('\n');
  }

  return [
    'Return markdown with these exact sections:',
    '## Verdict',
    '## Summary',
    '## Biggest Gaps',
    '## Biggest Risks',
    '## Missing Assumptions',
    '## Priority Actions',
    '## Go/No-Go Recommendation',
    '## Notes for Build',
    '',
    'After the markdown, include a ```json fenced block with this shape:',
    '{',
    '  "mode": "REVIEW",',
    '  "verdict": "string",',
    '  "summary": "string",',
    '  "biggestGaps": ["gap"],',
    '  "biggestRisks": ["risk"],',
    '  "missingAssumptions": ["assumption"],',
    '  "priorityActions": ["action"],',
    '  "goNoGoRecommendation": "string",',
    '  "notesForBuild": ["note"],',
    '  "decision": "go | caution | no-go"',
    '}'
  ].join('\n');
}

function buildPrompt(request) {
  const template = getTemplate(request.promptTemplate);
  const sections = [
    `You are supporting LCJ Elite Consulting inside Mission Control.`,
    `Mode: ${request.mode}`,
    `Template: ${template.label}`,
    '',
    template.instructions,
    '',
    'Review the full package below and respond with structured, execution-useful output.',
    buildStructuredInstructions(request.mode),
    '',
    '## Operator Instructions',
    String(request.promptInstructions || '').trim() || 'Use the selected template framing.',
    '',
    '## Idea / Spec',
    String(request.sourceText || '').trim() || 'No direct idea text provided.',
    '',
    '## Folder Summary',
    String(request.folderSummaryText || '').trim() || 'No folder summary provided.'
  ];

  if (Array.isArray(request.attachments) && request.attachments.length) {
    sections.push('', '## Attachments');
    request.attachments.forEach((attachment, index) => {
      sections.push(
        `### Attachment ${index + 1}: ${attachment.fileName} (${attachment.role || 'attachment'})`,
        String(attachment.content || '').trim() || '[Empty attachment content]'
      );
    });
  }

  return sections.join('\n');
}

function buildMockResponse(request) {
  if (request.mode === 'BUILD') {
    const outputText = [
      '## Summary',
      `This idea is buildable, but it should be scoped around one operator outcome first: ${request.title}.`,
      '',
      '## Implementation Steps',
      '- Define the narrow MVP user flow and success event.',
      '- Split UI, service orchestration, and persistence into separate modules.',
      '- Add deterministic seed data and failure handling before extending scope.',
      '- Validate the launcher path and capture operator-visible logs.',
      '',
      '## Architecture Suggestions',
      '- Keep the launcher call server-side behind a provider boundary.',
      '- Persist requests and responses in a JSON store that can later move to a database.',
      '- Render structured sections in the UI instead of raw text only.',
      '',
      '## Next File Changes',
      '- Add a dedicated Mission Control tab and panel shell.',
      '- Add API routes for list, save, run, duplicate, and export.',
      '- Add a request store module plus launcher execution helper.',
      '',
      '## Warnings',
      '- Do not mix internal operator tooling into the customer-facing product surface.',
      '- Keep attachments text-based until a real document parsing layer is added.',
      '',
      '## Dependencies',
      '- Local launcher command (`idea` or `lcj-opus`)',
      '- Server-side request persistence',
      '- Frontend status handling',
      '',
      '```json',
      JSON.stringify(
        {
          mode: 'BUILD',
          summary: `This idea is buildable, but it should be scoped around one operator outcome first: ${request.title}.`,
          implementationSteps: [
            'Define the narrow MVP user flow and success event.',
            'Split UI, service orchestration, and persistence into separate modules.',
            'Add deterministic seed data and failure handling before extending scope.',
            'Validate the launcher path and capture operator-visible logs.'
          ],
          architectureSuggestions: [
            'Keep the launcher call server-side behind a provider boundary.',
            'Persist requests and responses in a JSON store that can later move to a database.',
            'Render structured sections in the UI instead of raw text only.'
          ],
          nextFileChanges: [
            'Add a dedicated Mission Control tab and panel shell.',
            'Add API routes for list, save, run, duplicate, and export.',
            'Add a request store module plus launcher execution helper.'
          ],
          warnings: [
            'Do not mix internal operator tooling into the customer-facing product surface.',
            'Keep attachments text-based until a real document parsing layer is added.'
          ],
          dependencies: [
            'Local launcher command (`idea` or `lcj-opus`)',
            'Server-side request persistence',
            'Frontend status handling'
          ]
        },
        null,
        2
      ),
      '```'
    ].join('\n');

    return {
      providerUsed: 'Structured mock reviewer',
      outputText,
      structuredResult: parseStructuredResult(outputText, request.mode),
      durationMs: 1200
    };
  }

  const outputText = [
    '## Verdict',
    'Proceed with caution. The concept is promising, but it is underspecified in the areas that would determine demo quality and execution speed.',
    '',
    '## Summary',
    `The idea "${request.title}" has credible upside, but it still needs sharper scoping and operator constraints before it earns a full green light.`,
    '',
    '## Biggest Gaps',
    '- Success criteria are implied more than defined.',
    '- The workflow boundary between operator actions and automation is not fully specified.',
    '- Dependencies and rollout assumptions are not explicit.',
    '',
    '## Biggest Risks',
    '- The MVP could sprawl into adjacent tooling instead of solving one sharp internal problem.',
    '- Review quality will feel inconsistent if response formatting is not enforced.',
    '- Operators may distrust the workflow if status and persistence are weak.',
    '',
    '## Missing Assumptions',
    '- Who owns review approval after Claude responds.',
    '- Which launcher should be the primary production path.',
    '- How long-running requests should be surfaced if they exceed a single HTTP round trip.',
    '',
    '## Priority Actions',
    '- Lock the request schema and status model first.',
    '- Keep the tab server-backed so history survives refreshes.',
    '- Enforce exact response sections to keep output readable and comparable.',
    '',
    '## Go/No-Go Recommendation',
    'Caution. Build it for Mission Control, but keep the first version tightly scoped and clearly internal.',
    '',
    '## Notes for Build',
    '- Keep the launcher behind a provider boundary.',
    '- Add export and duplicate on day one because operators will reuse prompts.',
    '- Seed at least one completed request so the tab feels alive immediately.',
    '',
    '```json',
    JSON.stringify(
      {
        mode: 'REVIEW',
        verdict:
          'Proceed with caution. The concept is promising, but it is underspecified in the areas that would determine demo quality and execution speed.',
        summary: `The idea "${request.title}" has credible upside, but it still needs sharper scoping and operator constraints before it earns a full green light.`,
        biggestGaps: [
          'Success criteria are implied more than defined.',
          'The workflow boundary between operator actions and automation is not fully specified.',
          'Dependencies and rollout assumptions are not explicit.'
        ],
        biggestRisks: [
          'The MVP could sprawl into adjacent tooling instead of solving one sharp internal problem.',
          'Review quality will feel inconsistent if response formatting is not enforced.',
          'Operators may distrust the workflow if status and persistence are weak.'
        ],
        missingAssumptions: [
          'Who owns review approval after Claude responds.',
          'Which launcher should be the primary production path.',
          'How long-running requests should be surfaced if they exceed a single HTTP round trip.'
        ],
        priorityActions: [
          'Lock the request schema and status model first.',
          'Keep the tab server-backed so history survives refreshes.',
          'Enforce exact response sections to keep output readable and comparable.'
        ],
        goNoGoRecommendation:
          'Caution. Build it for Mission Control, but keep the first version tightly scoped and clearly internal.',
        notesForBuild: [
          'Keep the launcher behind a provider boundary.',
          'Add export and duplicate on day one because operators will reuse prompts.',
          'Seed at least one completed request so the tab feels alive immediately.'
        ],
        decision: 'caution'
      },
      null,
      2
    ),
    '```'
  ].join('\n');

  return {
    providerUsed: 'Structured mock reviewer',
    outputText,
    structuredResult: parseStructuredResult(outputText, request.mode),
    durationMs: 1200
  };
}

function commandExists(command) {
  if (!command) {
    return Promise.resolve(false);
  }

  if (command.includes('/')) {
    return fs.promises
      .access(command, fs.constants.X_OK)
      .then(() => true)
      .catch(() => false);
  }

  return new Promise(resolve => {
    const child = spawn('which', [command], {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    child.on('close', code => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function resolveProvider() {
  if (String(process.env.MISSION_CONTROL_REVIEW_PROVIDER || '').toLowerCase() === 'mock') {
    return {
      id: 'mission-control-review-mock',
      label: 'Structured mock reviewer',
      model: 'mock-reviewer-v1',
      available: true,
      mode: 'mock',
      launcher: 'mock',
      timeoutMs: DEFAULT_TIMEOUT_MS
    };
  }

  const anthropicApiKey = getAnthropicApiKey();
  if (anthropicApiKey) {
    return {
      id: 'mission-control-review-anthropic',
      label: 'Anthropic API',
      model: getAnthropicModelName(),
      available: true,
      mode: 'anthropic',
      apiKey: anthropicApiKey,
      timeoutMs: Number(process.env.MISSION_CONTROL_REVIEW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
    };
  }

  const preferred = [
    process.env.MISSION_CONTROL_REVIEW_LAUNCHER,
    process.env.REVIEW_IDEAS_LAUNCHER,
    path.join(os.homedir(), '.local', 'bin', 'idea'),
    path.join(os.homedir(), '.local', 'bin', 'lcj-opus'),
    'idea',
    'lcj-opus'
  ].filter(Boolean);

  const seen = new Set();
  for (const candidate of preferred) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await commandExists(candidate)) {
      return {
        id: 'mission-control-review-launcher',
        label: `Claude Opus via ${candidate}`,
        model: 'claude-opus-4-6',
        available: true,
        mode: 'launcher',
        launcher: candidate,
        timeoutMs: Number(process.env.MISSION_CONTROL_REVIEW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
      };
    }
  }

  return {
    id: 'mission-control-review-mock',
    label: 'Structured mock reviewer',
    model: 'mock-reviewer-v1',
    available: true,
    mode: 'mock',
    launcher: 'mock',
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
}

function normalizeAttachments(attachments) {
  const input = Array.isArray(attachments) ? attachments : [];
  const normalized = input.map((attachment, index) => {
    const fileName = String(attachment?.fileName || attachment?.name || `attachment-${index + 1}.txt`).trim();
    const extension = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new Error(`Unsupported file type for ${fileName}. Use ${ALLOWED_EXTENSIONS.join(', ')}.`);
    }

    const content = String(attachment?.content || '').trim();
    const sizeBytes = Number(attachment?.sizeBytes || Buffer.byteLength(content, 'utf8'));
    if (!content) {
      throw new Error(`${fileName} is empty.`);
    }
    if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`${fileName} exceeds the ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / 1000)} KB per-file limit.`);
    }

    return {
      id: String(attachment?.id || makeId('attachment')),
      fileName,
      mimeType: String(attachment?.mimeType || 'text/plain'),
      sizeBytes,
      content,
      role: attachment?.role === 'folder_summary' ? 'folder_summary' : 'attachment'
    };
  });

  if (normalized.length > MAX_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per review.`);
  }

  const totalBytes = normalized.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(`Total attachment payload must stay under ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1000)} KB.`);
  }

  return normalized;
}

function deriveTitle(input) {
  const explicit = String(input.title || '').trim();
  if (explicit) return explicit;

  const firstLine = String(input.sourceText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 96);

  const attachmentName = (Array.isArray(input.attachments) ? input.attachments : [])
    .map(item => String(item.fileName || '').trim())
    .find(Boolean);
  if (attachmentName) {
    return `${input.mode === 'BUILD' ? 'Build' : 'Review'} ${attachmentName}`;
  }

  return input.mode === 'BUILD' ? 'New build request' : 'New review request';
}

function validateRequestInput(input) {
  const mode = String(input.mode || '').toUpperCase();
  if (!['REVIEW', 'BUILD'].includes(mode)) {
    throw new Error('Mode must be REVIEW or BUILD.');
  }

  const promptInstructions = String(input.promptInstructions || '').trim();
  if (promptInstructions.length < 20) {
    throw new Error('Prompt instructions must be at least 20 characters.');
  }

  const attachments = normalizeAttachments(input.attachments);
  const hasSource = Boolean(String(input.sourceText || '').trim());
  const hasSummary = Boolean(String(input.folderSummaryText || '').trim());
  if (!hasSource && !hasSummary && attachments.length === 0) {
    throw new Error('Add idea text, a folder summary, or at least one attachment before saving.');
  }

  return {
    ...input,
    mode,
    promptTemplate: getTemplate(input.promptTemplate).key,
    promptInstructions,
    sourceText: String(input.sourceText || '').trim(),
    folderSummaryText: String(input.folderSummaryText || '').trim(),
    attachments
  };
}

function seededStore() {
  const createdAt = new Date(Date.now() - 1000 * 60 * 90).toISOString();
  const secondCreatedAt = new Date(Date.now() - 1000 * 60 * 45).toISOString();

  const reviewRequest = {
    id: 'idea-review-demo-review',
    title: 'Operator triage layer for incoming build ideas',
    mode: 'REVIEW',
    promptTemplate: 'investor_review',
    promptInstructions:
      'Review this like an internal investment memo. Surface whether the idea deserves immediate build attention or should wait until the operator stack is more stable.',
    sourceText:
      'Mission Control should accept rough ideas, supporting files, and a short operator note, then return a skeptical evaluation before we commit build cycles.',
    folderSummaryText:
      'The workflow should stay internal-only, persist history, and make reuse easy for future build requests.',
    attachments: [
      {
        id: 'idea-review-demo-attachment-1',
        fileName: 'mission-control-review-notes.md',
        mimeType: 'text/markdown',
        sizeBytes: 246,
        content: [
          '# Mission Control Idea Review Notes',
          '',
          '- Keep the workflow internal to operators.',
          '- Show clear status progression.',
          '- Make export and duplication easy.'
        ].join('\n'),
        role: 'attachment'
      }
    ],
    status: 'completed',
    compiledPrompt: '',
    providerUsed: 'Structured mock reviewer',
    errorMessage: null,
    resultText: '',
    resultJson: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    durationMs: 1200
  };
  reviewRequest.compiledPrompt = buildPrompt(reviewRequest);
  const reviewResponse = buildMockResponse(reviewRequest);
  reviewRequest.resultText = reviewResponse.outputText;
  reviewRequest.resultJson = reviewResponse.structuredResult;

  const buildRequest = {
    id: 'idea-review-demo-build',
    title: 'Mission Control request packaging workflow',
    mode: 'BUILD',
    promptTemplate: 'build_request',
    promptInstructions:
      'Treat this as a build brief for a senior product engineer. Return the cleanest first-pass implementation plan and call out anything that would cause churn.',
    sourceText:
      'Add a Mission Control tab that accepts idea text, uploaded markdown files, a mode selector, and a provider-backed send action that persists results for later reference.',
    folderSummaryText:
      'Keep the product app clean. This belongs only in Mission Control and should feel like native operator tooling.',
    attachments: [
      {
        id: 'idea-review-demo-attachment-2',
        fileName: 'review-ideas-spec.txt',
        mimeType: 'text/plain',
        sizeBytes: 211,
        content:
          'Need: save draft, run launcher, persist result, show history, allow duplicate, allow export, keep it visually native to Mission Control.',
        role: 'attachment'
      }
    ],
    status: 'completed',
    compiledPrompt: '',
    providerUsed: 'Structured mock reviewer',
    errorMessage: null,
    resultText: '',
    resultJson: null,
    createdAt: secondCreatedAt,
    updatedAt: secondCreatedAt,
    completedAt: secondCreatedAt,
    durationMs: 1200
  };
  buildRequest.compiledPrompt = buildPrompt(buildRequest);
  const buildResponse = buildMockResponse(buildRequest);
  buildRequest.resultText = buildResponse.outputText;
  buildRequest.resultJson = buildResponse.structuredResult;

  return {
    templates: clone(TEMPLATES),
    requests: [buildRequest, reviewRequest]
  };
}

function ensureStore() {
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, `${JSON.stringify(seededStore(), null, 2)}\n`, 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    if (!raw.trim()) {
      return seededStore();
    }
    const parsed = JSON.parse(raw);
    return {
      templates: Array.isArray(parsed.templates) && parsed.templates.length ? parsed.templates : clone(TEMPLATES),
      requests: Array.isArray(parsed.requests) ? parsed.requests : []
    };
  } catch {
    return seededStore();
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function sortRequests(requests) {
  return clone(requests).sort((left, right) => {
    return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
  });
}

function assertRequest(store, requestId) {
  const request = store.requests.find(item => String(item.id) === String(requestId));
  if (!request) {
    throw new Error('Idea review request not found.');
  }
  return request;
}

async function runLauncher(prompt, provider) {
  return await new Promise((resolve, reject) => {
    const child = spawn(provider.launcher, [], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000);
    }, provider.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Claude launcher timed out after ${Math.round(provider.timeoutMs / 1000)} seconds.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(stripAnsi(stderr).trim() || `Claude launcher exited with code ${code}.`));
        return;
      }
      const outputText = stripAnsi(stdout).trim();
      if (!outputText) {
        reject(new Error('Claude launcher returned an empty response.'));
        return;
      }
      resolve({
        providerUsed: provider.label,
        outputText,
        structuredResult: parseStructuredResult(outputText, 'REVIEW'),
        durationMs: Date.now() - startedAt
      });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runAnthropicReview(prompt, provider) {
  const startedAt = Date.now();
  const body = JSON.stringify({
    model: provider.model,
    max_tokens: 1800,
    temperature: 0.3,
    system: 'You are the review engine inside Hermes Command Hub. Be concise, skeptical, structured, and execution-oriented. Return markdown only.',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    ]
  });

  const response = await new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Anthropic review failed (${res.statusCode}): ${raw.slice(0, 300)}`));
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
    request.on('error', reject);
    request.write(body);
    request.end();
  });

  const outputText = stripAnsi(
    String(response.content?.map(item => item?.text || '').join('\n\n') || response.output_text || '').trim()
  );
  if (!outputText) {
    throw new Error('Anthropic returned an empty response.');
  }
  return {
    providerUsed: provider.label,
    outputText,
    structuredResult: parseStructuredResult(outputText, 'REVIEW'),
    durationMs: Date.now() - startedAt
  };
}

async function getIdeaReviewWorkspace() {
  const store = readStore();
  const provider = await resolveProvider();
  return {
    templates: clone(store.templates),
    requests: sortRequests(store.requests),
    provider: {
      id: provider.id,
      label: provider.label,
      model: provider.model,
      available: provider.available,
      mode: provider.mode,
      launcher: provider.launcher
    }
  };
}

async function saveIdeaReviewDraft(input, requestIdOverride = '') {
  const payload = validateRequestInput(input || {});
  const store = readStore();
  const existingIndex = store.requests.findIndex(item => String(item.id) === String(requestIdOverride || payload.requestId || ''));
  const existing = existingIndex >= 0 ? store.requests[existingIndex] : null;
  const requestId = requestIdOverride || payload.requestId || makeId('idea-review');
  const createdAt = existing?.createdAt || nowIso();
  const request = {
    id: requestId,
    title: deriveTitle(payload),
    mode: payload.mode,
    promptTemplate: payload.promptTemplate,
    promptInstructions: payload.promptInstructions,
    sourceText: payload.sourceText,
    folderSummaryText: payload.folderSummaryText,
    attachments: payload.attachments,
    compiledPrompt: '',
    status: 'draft',
    providerUsed: null,
    errorMessage: null,
    resultText: '',
    resultJson: null,
    createdAt,
    updatedAt: nowIso(),
    completedAt: null,
    durationMs: null
  };
  request.compiledPrompt = buildPrompt(request);

  if (existingIndex >= 0) {
    store.requests[existingIndex] = request;
  } else {
    store.requests.unshift(request);
  }

  writeStore(store);
  return clone(request);
}

async function duplicateIdeaReview(requestId) {
  const store = readStore();
  const source = assertRequest(store, requestId);
  const duplicated = {
    ...clone(source),
    id: makeId('idea-review'),
    title: `${source.title} Copy`,
    status: 'draft',
    providerUsed: null,
    errorMessage: null,
    resultText: '',
    resultJson: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    durationMs: null
  };
  duplicated.compiledPrompt = buildPrompt(duplicated);
  store.requests.unshift(duplicated);
  writeStore(store);
  return clone(duplicated);
}

async function runIdeaReview(requestId) {
  const provider = await resolveProvider();
  const store = readStore();
  const request = assertRequest(store, requestId);

  request.status = 'queued';
  request.errorMessage = null;
  request.updatedAt = nowIso();
  request.compiledPrompt = buildPrompt(request);
  writeStore(store);

  request.status = 'running';
  request.updatedAt = nowIso();
  writeStore(store);

  try {
    let result;
    if (provider.mode === 'mock') {
      result = buildMockResponse(request);
    } else if (provider.mode === 'anthropic') {
      result = await runAnthropicReview(request.compiledPrompt, provider);
    } else {
      const launcherResult = await runLauncher(request.compiledPrompt, provider);
      result = {
        providerUsed: launcherResult.providerUsed,
        outputText: launcherResult.outputText,
        structuredResult: parseStructuredResult(launcherResult.outputText, request.mode),
        durationMs: launcherResult.durationMs
      };
    }

    request.status = 'completed';
    request.providerUsed = result.providerUsed;
    request.errorMessage = null;
    request.resultText = result.outputText;
    request.resultJson = result.structuredResult;
    request.completedAt = nowIso();
    request.updatedAt = request.completedAt;
    request.durationMs = result.durationMs;
    writeStore(store);
    return clone(request);
  } catch (error) {
    request.status = 'failed';
    request.providerUsed = provider.label;
    request.errorMessage = error instanceof Error ? error.message : 'Unknown review error.';
    request.updatedAt = nowIso();
    request.completedAt = null;
    writeStore(store);
    throw error;
  }
}

async function exportIdeaReviewMarkdown(requestId) {
  const store = readStore();
  const request = assertRequest(store, requestId);
  const template = getTemplate(request.promptTemplate);
  const lines = [
    `# ${request.title}`,
    '',
    `- Mode: ${request.mode}`,
    `- Template: ${template.label}`,
    `- Status: ${request.status}`,
    `- Provider: ${request.providerUsed || 'Not run yet'}`,
    `- Created: ${request.createdAt}`,
    `- Updated: ${request.updatedAt}`,
    '',
    '## Prompt Instructions',
    request.promptInstructions || 'None',
    '',
    '## Idea / Spec',
    request.sourceText || 'None',
    '',
    '## Folder Summary',
    request.folderSummaryText || 'None',
    '',
    '## Attachments'
  ];

  if (request.attachments.length) {
    request.attachments.forEach(attachment => {
      lines.push(`- ${attachment.fileName} (${attachment.role || 'attachment'})`);
    });
  } else {
    lines.push('- None');
  }

  lines.push('', '## Result', request.resultText || 'No result has been generated yet.');

  return {
    fileName: `${slugify(request.title)}.md`,
    content: lines.join('\n')
  };
}

module.exports = {
  STORE_FILE,
  getIdeaReviewWorkspace,
  saveIdeaReviewDraft,
  duplicateIdeaReview,
  runIdeaReview,
  exportIdeaReviewMarkdown
};
