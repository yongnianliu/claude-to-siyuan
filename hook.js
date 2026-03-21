/**
 * Claude Code Stop hook — main entry point.
 * Reads session data from stdin, parses the transcript incrementally,
 * formats new messages as Markdown, and creates/appends to a SiYuan document.
 *
 * Config is read from the plugin directory (hook-config.json) or
 * from ~/.claude-to-siyuan/config.json as fallback.
 *
 * Always exits 0. All errors go to stderr only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseTranscript } = require('./src/parser');
const { formatMessages, generateDocHeader, formatDate } = require('./src/formatter');
const SiYuanAPI = require('./src/siyuan-api');
const { loadState, saveState, cleanupStaleStates } = require('./src/state');

// ── Symlink-safe path resolution ──────────────────────────────────
// __dirname resolves symlinks to the real path, which breaks workspace
// detection when the plugin is symlinked into SiYuan's plugins directory.
// process.argv[1] preserves the original (symlink) path as invoked.
const SCRIPT_DIR = path.dirname(process.argv[1] || __filename);

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
  // Priority 1: Environment variable
  const envPath = process.env.CLAUDE_TO_SIYUAN_CONFIG;
  if (envPath && fs.existsSync(envPath)) {
    return JSON.parse(fs.readFileSync(envPath, 'utf8'));
  }

  // Priority 2: Plugin directory hook-config.json (written by SiYuan plugin settings UI)
  const pluginConfig = path.join(SCRIPT_DIR, 'hook-config.json');
  if (fs.existsSync(pluginConfig)) {
    return JSON.parse(fs.readFileSync(pluginConfig, 'utf8'));
  }

  // Priority 3: Legacy standalone config location
  const legacyConfig = path.join(os.homedir(), '.claude-to-siyuan', 'config.json');
  if (fs.existsSync(legacyConfig)) {
    return JSON.parse(fs.readFileSync(legacyConfig, 'utf8'));
  }

  throw new Error('Config not found. Please configure the plugin in SiYuan settings.');
}

// ── Default templates ─────────────────────────────────────────────
const DEFAULT_TEMPLATE = '## ${role} (${time})\n\n${content}\n\n---\n';
const DEFAULT_HEADER_TEMPLATE =
  '# ${projectName}\n\n- 项目: ${projectName}\n- 开始时间: ${date} ${time}\n- Session ID: ${sessionId}\n\n---\n';

// ── SiYuan API token loading ──────────────────────────────────────

/**
 * Get the SiYuan API token. The plugin config doesn't store the token
 * (it's already available via local API). For local connections,
 * we read the token from SiYuan's conf.json or use empty string.
 */
function getSiYuanToken() {
  // Priority 1: Environment variable
  if (process.env.SIYUAN_TOKEN) {
    return process.env.SIYUAN_TOKEN;
  }

  // Priority 2: Legacy config file (which has siyuanToken field)
  const legacyConfig = path.join(os.homedir(), '.claude-to-siyuan', 'config.json');
  if (fs.existsSync(legacyConfig)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(legacyConfig, 'utf8'));
      if (cfg.siyuanToken) return cfg.siyuanToken;
    } catch { /* ignore */ }
  }

  // Priority 3: Read from SiYuan conf.json
  // Try common SiYuan workspace locations
  const possibleConfs = [];

  // Check SIYUAN_WORKSPACE env
  if (process.env.SIYUAN_WORKSPACE) {
    possibleConfs.push(path.join(process.env.SIYUAN_WORKSPACE, 'conf', 'conf.json'));
  }

  // Detect workspace from plugin path: {workspace}/data/plugins/claude-to-siyuan/hook.js
  // Use SCRIPT_DIR (symlink-safe) instead of __dirname (resolves symlinks)
  const pluginDir = SCRIPT_DIR;
  const pluginsDir = path.dirname(pluginDir);   // .../data/plugins
  const dataDir = path.dirname(pluginsDir);      // .../data
  const workspaceDir = path.dirname(dataDir);    // .../{workspace}
  possibleConfs.push(path.join(workspaceDir, 'conf', 'conf.json'));

  for (const confPath of possibleConfs) {
    try {
      if (fs.existsSync(confPath)) {
        const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
        if (conf.api && conf.api.token) {
          return conf.api.token;
        }
      }
    } catch { /* ignore */ }
  }

  // Priority 4: Empty token (works for local connections without auth)
  return '';
}

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
  if (!config.notebook) {
    throw new Error('notebook must be set in config. Please configure in SiYuan plugin settings.');
  }

  const template = config.template || DEFAULT_TEMPLATE;
  const headerTemplate = config.headerTemplate || DEFAULT_HEADER_TEMPLATE;
  const parentPath = config.parentPath || '/Claude Code Sessions';
  const siyuanUrl = config.siyuanUrl || 'http://127.0.0.1:6806';
  const token = config.siyuanToken || getSiYuanToken();

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
  const api = new SiYuanAPI(siyuanUrl, token);

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
