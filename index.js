/**
 * claude-to-siyuan — SiYuan Plugin
 *
 * Provides settings UI and manages the Claude Code Stop hook that
 * saves conversation turns to SiYuan notes.
 */

const { Plugin, Setting, showMessage, Menu } = require('siyuan');

const PLUGIN_NAME = 'claude-to-siyuan';
const CONFIG_KEY = 'config.json';

const DEFAULT_TEMPLATE = '## ${role} (${time})\n\n${content}\n\n---\n';
const DEFAULT_HEADER_TEMPLATE =
  '# ${projectName}\n\n- 项目: ${projectName}\n- 开始时间: ${date} ${time}\n- Session ID: ${sessionId}\n\n---\n';

const DEFAULT_CONFIG = {
  notebook: '',
  parentPath: '/Claude Code Sessions',
  siyuanPort: '6806',
  claudeConfigDir: '.claude',
  template: DEFAULT_TEMPLATE,
  headerTemplate: DEFAULT_HEADER_TEMPLATE,
};

module.exports = class ClaudeToSiYuan extends Plugin {
  config = { ...DEFAULT_CONFIG };

  async onload() {
    // Load saved config
    const saved = await this.loadData(CONFIG_KEY);
    if (saved) {
      Object.assign(this.config, saved);
    }

    // Build settings UI
    this.initSettings();

    // Add top bar button
    this.addTopBar({
      icon: 'iconCode',
      title: this.i18n.topbar.title,
      position: 'right',
      callback: (evt) => {
        const rect = evt.target.getBoundingClientRect();
        this.showTopBarMenu(rect);
      },
    });
  }

  async onunload() {
    // Nothing to clean up
  }

  async uninstall() {
    // Uninstall hook when plugin is removed
    try {
      this.doUninstallHook();
    } catch (_) {
      // Best-effort
    }
  }

  // ── Settings UI ─────────────────────────────────────────────────

  initSettings() {
    // -- Notebook selector --
    const notebookSelect = document.createElement('select');
    notebookSelect.className = 'b3-select fn__block';
    notebookSelect.innerHTML = `<option value="">${this.i18n.setting.selectNotebook}</option>`;
    this.loadNotebooks(notebookSelect);

    // -- Parent path input --
    const parentPathInput = document.createElement('input');
    parentPathInput.className = 'b3-text-field fn__block';
    parentPathInput.value = this.config.parentPath;
    parentPathInput.placeholder = '/Claude Code Sessions';

    // -- SiYuan port input --
    const portInput = document.createElement('input');
    portInput.className = 'b3-text-field fn__block';
    portInput.type = 'number';
    portInput.min = '1';
    portInput.max = '65535';
    portInput.value = this.config.siyuanPort || '6806';
    portInput.placeholder = '6806';

    // -- Claude config dir input --
    const claudeDirInput = document.createElement('input');
    claudeDirInput.className = 'b3-text-field fn__block';
    claudeDirInput.value = this.config.claudeConfigDir || '.claude';
    claudeDirInput.placeholder = '.claude';

    // -- Message template textarea --
    const templateInput = document.createElement('textarea');
    templateInput.className = 'b3-text-field fn__block';
    templateInput.style.height = '80px';
    templateInput.style.fontFamily = 'monospace';
    templateInput.value = this.config.template;

    // -- Header template textarea --
    const headerInput = document.createElement('textarea');
    headerInput.className = 'b3-text-field fn__block';
    headerInput.style.height = '100px';
    headerInput.style.fontFamily = 'monospace';
    headerInput.value = this.config.headerTemplate;

    // -- Hook status display --
    const hookStatusDiv = document.createElement('div');
    hookStatusDiv.style.display = 'flex';
    hookStatusDiv.style.gap = '10px';
    hookStatusDiv.style.alignItems = 'center';

    const hookLabel = document.createElement('span');
    hookLabel.textContent = this.i18n.setting.hookNotInstalled;
    hookLabel.id = 'hook-status-label';

    const installBtn = document.createElement('button');
    installBtn.className = 'b3-button b3-button--outline fn__size200';
    installBtn.textContent = this.i18n.setting.installHook;
    installBtn.addEventListener('click', () => {
      try {
        this.doInstallHook();
        hookLabel.textContent = this.i18n.setting.hookInstalled;
        showMessage(this.i18n.setting.hookInstalledMsg);
      } catch (e) {
        showMessage(this.i18n.setting.hookInstallFailed + e.message, 6000, 'error');
      }
    });

    const uninstallBtn = document.createElement('button');
    uninstallBtn.className = 'b3-button b3-button--outline fn__size200';
    uninstallBtn.textContent = this.i18n.setting.uninstallHook;
    uninstallBtn.addEventListener('click', () => {
      try {
        this.doUninstallHook();
        hookLabel.textContent = this.i18n.setting.hookNotInstalled;
        showMessage(this.i18n.setting.hookUninstalledMsg);
      } catch (e) {
        showMessage(this.i18n.setting.hookUninstallFailed + e.message, 6000, 'error');
      }
    });

    hookStatusDiv.appendChild(hookLabel);
    hookStatusDiv.appendChild(installBtn);
    hookStatusDiv.appendChild(uninstallBtn);

    // Check current hook status
    this.checkHookStatus().then(installed => {
      hookLabel.textContent = installed
        ? this.i18n.setting.hookInstalled
        : this.i18n.setting.hookNotInstalled;
    });

    // -- Test connection button --
    const testBtn = document.createElement('button');
    testBtn.className = 'b3-button b3-button--outline fn__size200';
    testBtn.textContent = this.i18n.setting.testConnection;
    testBtn.addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/system/version', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        if (data.code === 0) {
          showMessage(this.i18n.setting.testSuccess);
        } else {
          showMessage(this.i18n.setting.testFailed + data.msg, 6000, 'error');
        }
      } catch (e) {
        showMessage(this.i18n.setting.testFailed + e.message, 6000, 'error');
      }
    });

    // -- Reset templates button --
    const resetBtn = document.createElement('button');
    resetBtn.className = 'b3-button b3-button--outline fn__size200';
    resetBtn.textContent = this.i18n.setting.resetBtn;
    resetBtn.addEventListener('click', () => {
      templateInput.value = DEFAULT_TEMPLATE;
      headerInput.value = DEFAULT_HEADER_TEMPLATE;
      showMessage(this.i18n.setting.resetDone);
    });

    // -- Build Setting panel --
    this.setting = new Setting({
      confirmCallback: async () => {
        this.config.notebook = notebookSelect.value;
        this.config.parentPath = parentPathInput.value || '/Claude Code Sessions';
        this.config.siyuanPort = portInput.value || '6806';
        this.config.claudeConfigDir = claudeDirInput.value || '.claude';
        this.config.template = templateInput.value || DEFAULT_TEMPLATE;
        this.config.headerTemplate = headerInput.value || DEFAULT_HEADER_TEMPLATE;
        await this.saveData(CONFIG_KEY, this.config);
        // Also write config to plugin directory for hook.js to read
        this.writeHookConfig();
      },
    });

    this.setting.addItem({
      title: this.i18n.setting.hookStatus,
      direction: 'row',
      createActionElement: () => hookStatusDiv,
    });

    this.setting.addItem({
      title: this.i18n.setting.notebook,
      description: this.i18n.setting.notebookDesc,
      direction: 'row',
      createActionElement: () => notebookSelect,
    });

    this.setting.addItem({
      title: this.i18n.setting.parentPath,
      description: this.i18n.setting.parentPathDesc,
      direction: 'row',
      createActionElement: () => parentPathInput,
    });

    this.setting.addItem({
      title: this.i18n.setting.siyuanPort,
      description: this.i18n.setting.siyuanPortDesc,
      direction: 'row',
      createActionElement: () => portInput,
    });

    this.setting.addItem({
      title: this.i18n.setting.claudeConfigDir,
      description: this.i18n.setting.claudeConfigDirDesc,
      direction: 'row',
      createActionElement: () => claudeDirInput,
    });

    this.setting.addItem({
      title: this.i18n.setting.template,
      description: this.i18n.setting.templateDesc,
      direction: 'column',
      createActionElement: () => templateInput,
    });

    this.setting.addItem({
      title: this.i18n.setting.headerTemplate,
      description: this.i18n.setting.headerTemplateDesc,
      direction: 'column',
      createActionElement: () => headerInput,
    });

    this.setting.addItem({
      title: this.i18n.setting.testConnection,
      direction: 'row',
      createActionElement: () => testBtn,
    });

    this.setting.addItem({
      title: this.i18n.setting.resetTemplates,
      description: this.i18n.setting.resetTemplatesDesc,
      direction: 'row',
      createActionElement: () => resetBtn,
    });
  }

  // ── Top bar menu ────────────────────────────────────────────────

  showTopBarMenu(rect) {
    const menu = new Menu('claude-to-siyuan-menu');

    menu.addItem({
      icon: 'iconSettings',
      label: this.i18n.topbar.openSettings,
      click: () => {
        this.setting.open(this.name);
      },
    });

    menu.open({
      x: rect.right,
      y: rect.bottom,
      isLeft: true,
    });
  }

  // ── Notebook loading ────────────────────────────────────────────

  async loadNotebooks(selectEl) {
    try {
      const resp = await fetch('/api/notebook/lsNotebooks', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (data.code === 0 && data.data && data.data.notebooks) {
        for (const nb of data.data.notebooks) {
          if (nb.closed) continue;
          const opt = document.createElement('option');
          opt.value = nb.id;
          opt.textContent = nb.name;
          if (nb.id === this.config.notebook) {
            opt.selected = true;
          }
          selectEl.appendChild(opt);
        }
      }
    } catch (e) {
      console.error(`[${PLUGIN_NAME}] ${this.i18n.setting.notebookLoadFailed}:`, e);
    }
  }

  // ── Hook management ─────────────────────────────────────────────

  /**
   * Get the path to the hook.js script inside the plugin directory.
   * In SiYuan, plugin data is served from /plugins/{name}/ relative URL,
   * but on disk it's at {workspace}/data/plugins/{name}/.
   *
   * We use the SiYuan API to determine the workspace path.
   */
  async getHookScriptPath() {
    const resp = await fetch('/api/system/getWorkspaces', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await resp.json();

    // getWorkspaces returns current workspace or list
    let workspacePath = '';
    if (data.code === 0) {
      // Try to get current workspace from getConf
      const confResp = await fetch('/api/system/getConf', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const confData = await confResp.json();
      if (confData.code === 0 && confData.data && confData.data.conf) {
        workspacePath = confData.data.conf.system.workspaceDir;
      }
    }

    if (!workspacePath) {
      throw new Error('Could not determine SiYuan workspace path');
    }

    // Normalize path separators for the OS
    const sep = workspacePath.includes('\\') ? '\\' : '/';
    return workspacePath + sep + 'data' + sep + 'plugins' + sep + PLUGIN_NAME + sep + 'hook.js';
  }

  async getClaudeSettingsPath() {
    // Cross-platform home directory detection
    const confResp = await fetch('/api/system/getConf', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const confData = await confResp.json();

    let homeDir = '';
    if (confData.code === 0 && confData.data && confData.data.conf) {
      const os = confData.data.conf.system.os;
      // Use the SiYuan API to read/write the file instead
    }

    // We'll use a different approach: write via SiYuan's file API
    return null;
  }

  /**
   * Get the claude config dir name (e.g. '.claude' or '.claude-internal')
   */
  getClaudeDir() {
    return this.config.claudeConfigDir || '.claude';
  }

  /**
   * Read ~/.claude/settings.json via file system
   */
  async readClaudeSettings() {
    try {
      // Use SiYuan's /api/file/getFile — but it only works with workspace files.
      // For user home files, we'll use the hook.js approach:
      // Write a tiny script that reads and returns the settings.
      //
      // Actually, since this runs in a browser context, we need to use
      // the Node.js child_process — which we can't do directly.
      // Instead, we'll use the kernel API proxy approach.

      // Simpler: use /api/system/getConf to get homeDir, then use fetch to a local endpoint.
      // Even simpler: have the hook.js manage its own installation when run with --install flag.

      const hookPath = await this.getHookScriptPath();

      // Use the SiYuan /api/system/exec API if available, or fall back to
      // writing a helper that the user runs manually.
      // For maximum compatibility, we call node directly via fetch to a local helper.

      // Best approach: use the API endpoint we control
      // Let's try the exec approach
      const result = await this.execNode(`
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '${this.getClaudeDir()}', 'settings.json');
        try {
          const data = fs.readFileSync(settingsPath, 'utf8');
          process.stdout.write(data);
        } catch(e) {
          process.stdout.write('{}');
        }
      `);
      return JSON.parse(result || '{}');
    } catch {
      return {};
    }
  }

  /**
   * Execute a Node.js snippet and return stdout.
   * Uses SiYuan's /api/system/exec if available (SiYuan 3.x kernel).
   * Falls back to XMLHttpRequest to avoid CORS issues.
   */
  async execNode(code) {
    // Try using the /api/system/exec endpoint (available in some SiYuan builds)
    // If not available, we write a temp script and read it back
    try {
      const resp = await fetch('/api/system/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'node', args: ['-e', code], timeout: 10000 }),
      });
      const data = await resp.json();
      if (data.code === 0) {
        return data.data;
      }
    } catch (_) {
      // exec API not available
    }

    // Fallback: write script to plugin dir, invoke via another mechanism
    // For now, return null and let the UI handle it
    return null;
  }

  /**
   * Install the Claude Code Stop hook by writing to ~/.claude/settings.json
   * Uses the hook.js --install command.
   */
  async doInstallHook() {
    const hookPath = await this.getHookScriptPath();
    // Normalize to forward slashes for the JSON command
    const normalizedPath = hookPath.replace(/\\/g, '/');

    // Write the config file first so hook.js can read it
    await this.writeHookConfig();

    // Try direct Node exec for installing hook
    const installCode = `
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const settingsPath = path.join(os.homedir(), '${this.getClaudeDir()}', 'settings.json');
      const hookCommand = 'node "' + ${JSON.stringify(normalizedPath)} + '"';

      let settings = {};
      try {
        if (fs.existsSync(settingsPath)) {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
      } catch(e) { settings = {}; }

      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.Stop) settings.hooks.Stop = [];

      // Check if already registered
      const exists = settings.hooks.Stop.some(entry =>
        entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan'))
      );

      if (!exists) {
        settings.hooks.Stop.push({
          hooks: [{
            type: 'command',
            command: hookCommand,
            timeout: 30
          }]
        });

        const claudeDir = path.dirname(settingsPath);
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        process.stdout.write('installed');
      } else {
        process.stdout.write('already_installed');
      }
    `;

    const result = await this.execNode(installCode);
    if (result === null) {
      // execNode not available — write instructions for manual install
      // Try alternative: putFile approach
      await this.installHookViaFile();
    }
  }

  /**
   * Fallback: write an install script to plugin dir, then provide instructions.
   */
  async installHookViaFile() {
    const hookPath = await this.getHookScriptPath();
    const normalizedPath = hookPath.replace(/\\/g, '/');

    // Get workspace to write the install script
    const confResp = await fetch('/api/system/getConf', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const confData = await confResp.json();
    const workspaceDir = confData.data.conf.system.workspaceDir;

    const claudeDir = this.getClaudeDir();

    // Write install helper script to plugin directory via SiYuan file API
    const installScript = `
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '${claudeDir}', 'settings.json');
const hookCommand = 'node "${normalizedPath}"';

let settings = {};
try {
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
} catch(e) { settings = {}; }

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.Stop) settings.hooks.Stop = [];

const exists = settings.hooks.Stop.some(entry =>
  entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan'))
);

if (!exists) {
  settings.hooks.Stop.push({
    hooks: [{
      type: 'command',
      command: hookCommand,
      timeout: 30
    }]
  });

  const claudeDir = path.dirname(settingsPath);
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log('✅ Hook installed successfully!');
} else {
  console.log('✅ Hook already installed.');
}
`;

    const formData = new FormData();
    formData.append('path', `/data/plugins/${PLUGIN_NAME}/install-hook.js`);
    formData.append('isDir', 'false');
    formData.append('modTime', Math.floor(Date.now() / 1000).toString());
    formData.append('file', new Blob([installScript], { type: 'application/javascript' }));

    await fetch('/api/file/putFile', { method: 'POST', body: formData });

    // Also write uninstall helper
    const uninstallScript = `
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '${claudeDir}', 'settings.json');

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch(e) { process.exit(0); }

if (settings.hooks && settings.hooks.Stop) {
  settings.hooks.Stop = settings.hooks.Stop.filter(entry =>
    !(entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan')))
  );
  if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log('✅ Hook uninstalled.');
} else {
  console.log('ℹ️  No hook found to uninstall.');
}
`;

    const formData2 = new FormData();
    formData2.append('path', `/data/plugins/${PLUGIN_NAME}/uninstall-hook.js`);
    formData2.append('isDir', 'false');
    formData2.append('modTime', Math.floor(Date.now() / 1000).toString());
    formData2.append('file', new Blob([uninstallScript], { type: 'application/javascript' }));

    await fetch('/api/file/putFile', { method: 'POST', body: formData2 });

    // Now execute the install script via Node.js subprocess
    // Use the /api/system/exec or require('child_process')
    // In SiYuan desktop, we're in an Electron context with Node.js access
    try {
      const { execSync } = require('child_process');
      const pluginDir = workspaceDir + (workspaceDir.includes('\\') ? '\\' : '/') +
        'data' + (workspaceDir.includes('\\') ? '\\' : '/') +
        'plugins' + (workspaceDir.includes('\\') ? '\\' : '/') + PLUGIN_NAME;
      execSync(`node "${pluginDir + (workspaceDir.includes('\\') ? '\\' : '/') + 'install-hook.js'}"`, {
        stdio: 'pipe',
      });
    } catch (e) {
      showMessage(this.i18n.setting.hookInstallFailed + e.message, 6000, 'error');
    }
  }

  async doUninstallHook() {
    const uninstallCode = `
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const settingsPath = path.join(os.homedir(), '${this.getClaudeDir()}', 'settings.json');

      let settings = {};
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch(e) { process.exit(0); }

      if (settings.hooks && settings.hooks.Stop) {
        settings.hooks.Stop = settings.hooks.Stop.filter(entry =>
          !(entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-to-siyuan')))
        );
        if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        process.stdout.write('uninstalled');
      } else {
        process.stdout.write('not_found');
      }
    `;

    const result = await this.execNode(uninstallCode);
    if (result === null) {
      // Fallback: use child_process in Electron context
      try {
        const { execSync } = require('child_process');
        const confResp = await fetch('/api/system/getConf', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        const confData = await confResp.json();
        const workspaceDir = confData.data.conf.system.workspaceDir;
        const sep = workspaceDir.includes('\\') ? '\\' : '/';
        const scriptPath = workspaceDir + sep + 'data' + sep + 'plugins' + sep + PLUGIN_NAME + sep + 'uninstall-hook.js';

        // Ensure the script exists
        await this.installHookViaFile(); // This writes both scripts
        execSync(`node "${scriptPath}"`, { stdio: 'pipe' });
      } catch (e) {
        showMessage(this.i18n.setting.hookUninstallFailed + e.message, 6000, 'error');
      }
    }
  }

  async checkHookStatus() {
    try {
      const claudeDir = this.getClaudeDir();
      const { execSync } = require('child_process');
      const result = execSync(`node -e "
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '${claudeDir}', 'settings.json');
        try {
          const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          const found = s.hooks && s.hooks.Stop && s.hooks.Stop.some(e =>
            e.hooks && e.hooks.some(h => h.command && h.command.includes('claude-to-siyuan'))
          );
          process.stdout.write(found ? 'yes' : 'no');
        } catch(e) { process.stdout.write('no'); }
      "`, { encoding: 'utf8', stdio: 'pipe' });
      return result.trim() === 'yes';
    } catch {
      return false;
    }
  }

  // ── Hook config file ────────────────────────────────────────────

  /**
   * Write the hook configuration file to the plugin directory.
   * The hook.js reads this file at runtime.
   */
  async writeHookConfig() {
    const hookConfig = {
      notebook: this.config.notebook,
      parentPath: this.config.parentPath,
      siyuanPort: this.config.siyuanPort || '6806',
      claudeConfigDir: this.config.claudeConfigDir || '.claude',
      template: this.config.template,
      headerTemplate: this.config.headerTemplate,
    };

    const formData = new FormData();
    formData.append('path', `/data/plugins/${PLUGIN_NAME}/hook-config.json`);
    formData.append('isDir', 'false');
    formData.append('modTime', Math.floor(Date.now() / 1000).toString());
    formData.append('file', new Blob([JSON.stringify(hookConfig, null, 2)], { type: 'application/json' }));

    await fetch('/api/file/putFile', { method: 'POST', body: formData });
  }
};
