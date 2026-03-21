/**
 * Uninstaller: removes the Stop hook from ~/.claude/settings.json
 * and optionally removes the config directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CONFIG_DIR = path.join(os.homedir(), '.claude-to-siyuan');

function main() {
  const removeConfig = process.argv.includes('--remove-config');

  // ── 1. Remove Stop hook from settings.json ──────────────────────
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log('ℹ️  No settings.json found — nothing to remove.');
  } else {
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (e) {
      console.error(`⚠️  Could not parse ${SETTINGS_PATH}: ${e.message}`);
      return;
    }

    if (settings.hooks && settings.hooks.Stop) {
      const before = settings.hooks.Stop.length;
      settings.hooks.Stop = settings.hooks.Stop.filter(entry => {
        if (!entry.hooks) return true;
        return !entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan'));
      });
      const after = settings.hooks.Stop.length;

      // Clean up empty arrays
      if (settings.hooks.Stop.length === 0) {
        delete settings.hooks.Stop;
      }
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }

      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');

      if (before !== after) {
        console.log('✅ Stop hook removed from', SETTINGS_PATH);
      } else {
        console.log('ℹ️  No claude-to-siyuan hook found in settings.json');
      }
    } else {
      console.log('ℹ️  No Stop hooks found in settings.json');
    }
  }

  // ── 2. Optionally remove config directory ───────────────────────
  if (removeConfig) {
    if (fs.existsSync(CONFIG_DIR)) {
      fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      console.log('✅ Config directory removed:', CONFIG_DIR);
    } else {
      console.log('ℹ️  Config directory not found:', CONFIG_DIR);
    }
  } else {
    console.log('ℹ️  Config preserved at', CONFIG_DIR);
    console.log('   (use --remove-config to delete it)');
  }
}

main();
