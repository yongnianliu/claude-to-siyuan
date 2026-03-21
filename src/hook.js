/**
 * Claude Code Stop hook — main entry point.
 * Reads session data from stdin, parses the transcript incrementally,
 * formats new messages as Markdown, and creates/appends to a SiYuan document.
 *
 * Always exits 0. All errors go to stderr only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseTranscript } = require('./parser');
const { formatMessages, generateDocHeader, formatDate } = require('./formatter');
const SiYuanAPI = require('./siyuan-api');
const { loadState, saveState, cleanupStaleStates } = require('./state');

// ── Stdin reading with 10s timeout guard ──────────────────────────
const STDIN_TIMEOUT_MS = 10000;

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    const timer = setTimeout(() => {
      process.stdin.destroy();
      reject(new Error('stdin timeout'));
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => input += chunk);
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(input);
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Config loading ────────────────────────────────────────────────
function loadConfig() {
  const envPath = process.env.CLAUDE_TO_SIYUAN_CONFIG;
  const defaultPath = path.join(os.homedir(), '.claude-to-siyuan', 'config.json');
  const configPath = envPath || defaultPath;

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// ── Default templates ─────────────────────────────────────────────
const DEFAULT_TEMPLATE = '## ${role} (${time})\n\n${content}\n\n---\n';
const DEFAULT_HEADER_TEMPLATE =
  '# ${projectName}\n\n- 项目: ${projectName}\n- 开始时间: ${date} ${time}\n- Session ID: ${sessionId}\n\n---\n';

// ── Main logic ────────────────────────────────────────────────────
async function main() {
  // 1. Read hook input from stdin
  const raw = await readStdin();
  const hookInput = JSON.parse(raw);

  const sessionId = hookInput.session_id;
  const transcriptPath = hookInput.transcript_path;
  const cwd = hookInput.cwd || process.cwd();

  if (!sessionId || !transcriptPath) {
    throw new Error('Missing session_id or transcript_path in hook input');
  }

  // 2. Load config
  const config = loadConfig();
  if (!config.siyuanToken || !config.notebook) {
    throw new Error('siyuanToken and notebook must be set in config');
  }

  const template = config.template || DEFAULT_TEMPLATE;
  const headerTemplate = config.headerTemplate || DEFAULT_HEADER_TEMPLATE;
  const parentPath = config.parentPath || '/Claude Code Sessions';

  // 3. Cleanup stale state files (non-blocking best-effort)
  cleanupStaleStates();

  // 4. Load or initialize session state
  let state = loadState(sessionId);
  const isFirstRun = !state;

  if (isFirstRun) {
    state = {
      sessionId,
      docId: null,
      lastByteOffset: 0,
      createdAt: new Date().toISOString(),
    };
  }

  // 5. Parse transcript from last offset
  const { messages, newByteOffset } = parseTranscript(transcriptPath, state.lastByteOffset);

  if (messages.length === 0) {
    // Nothing new — update offset and exit
    state.lastByteOffset = newByteOffset;
    saveState(sessionId, state);
    return;
  }

  // 6. Format messages
  const markdown = formatMessages(messages, template);

  // 7. Create or append to SiYuan doc
  const api = new SiYuanAPI(config.siyuanUrl || 'http://127.0.0.1:6806', config.siyuanToken);

  if (!state.docId) {
    // First run — create a new document
    const projectName = path.basename(cwd);
    const firstUserMsg = messages.find(m => m.role === 'user');
    const firstText = firstUserMsg
      ? firstUserMsg.parts.find(p => p.type === 'text')?.text || ''
      : '';

    const { title, header } = generateDocHeader({
      projectName,
      sessionId,
      headerTemplate,
      firstUserMessage: firstText,
    });

    const today = formatDate(new Date());
    const dailyPath = api.getDailyPath(parentPath, today);
    const docPath = `${dailyPath}/${title}`;

    const fullMarkdown = header + '\n' + markdown;
    const docId = await api.createDocWithMd(config.notebook, docPath, fullMarkdown);

    state.docId = docId;
  } else {
    // Subsequent run — append to existing doc
    await api.appendBlock(state.docId, markdown);
  }

  // 8. Update state
  state.lastByteOffset = newByteOffset;
  saveState(sessionId, state);
}

// ── Entry point — never throw, never block Claude ─────────────────
main().catch((err) => {
  process.stderr.write(`[claude-to-siyuan] ${err.message}\n`);
}).finally(() => {
  process.exit(0);
});
