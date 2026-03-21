/**
 * Auto-installer: registers the Stop hook in ~/.claude/settings.json
 * and creates the config file from template if it doesn't exist.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CONFIG_DIR = path.join(os.homedir(), '.claude-to-siyuan');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const HOOK_SCRIPT = path.resolve(__dirname, 'src', 'hook.js');

function main() {
  // ── 1. Register Stop hook in settings.json ──────────────────────
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (e) {
      console.error(`⚠️  Could not parse ${SETTINGS_PATH}: ${e.message}`);
      console.error('   Creating backup and starting fresh.');
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_PATH + '.backup');
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.Stop) settings.hooks.Stop = [];

  // Build the hook command
  const command = `node "${HOOK_SCRIPT.replace(/\\/g, '/')}"`;

  // Check if hook is already registered
  const alreadyRegistered = settings.hooks.Stop.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan'))
  );

  if (alreadyRegistered) {
    console.log('✅ Stop hook is already registered in settings.json');
  } else {
    settings.hooks.Stop.push({
      hooks: [{
        type: 'command',
        command,
        timeout: 30,
      }],
    });

    // Ensure ~/.claude directory exists
    const claudeDir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    console.log('✅ Stop hook registered in', SETTINGS_PATH);
  }

  // ── 2. Create config file from template if needed ───────────────
  if (!fs.existsSync(CONFIG_PATH)) {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const templatePath = path.resolve(__dirname, 'config.example.json');
    const template = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(CONFIG_PATH, template, 'utf8');
    console.log('✅ Config created at', CONFIG_PATH);
  } else {
    console.log('✅ Config already exists at', CONFIG_PATH);
  }

  // ── 3. Print setup instructions ─────────────────────────────────
  console.log('\n📋 Setup Instructions / 设置说明:');
  console.log('─'.repeat(50));
  console.log(`1. Edit config: ${CONFIG_PATH}`);
  console.log('2. Set your SiYuan API token (思源 API Token):');
  console.log('   "siyuanToken": "your-token-here"');
  console.log('3. Set your notebook ID (笔记本 ID):');
  console.log('   "notebook": "your-notebook-id"');
  console.log('   (Find it in SiYuan: Settings → About → Notebook ID)');
  console.log('4. Restart Claude Code to activate the hook');
  console.log('5. Verify with /hooks command in Claude Code');
  console.log('─'.repeat(50));
}

main();
