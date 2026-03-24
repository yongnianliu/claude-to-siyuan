/**
 * claude-to-siyuan — SiYuan Plugin
 *
 * Provides settings UI and manages the Claude Code Stop hook that
 * saves conversation turns to SiYuan notes.
 */

const { Plugin, Setting, showMessage, Menu } = require('siyuan');

const PLUGIN_NAME = 'claude-to-siyuan';
const CONFIG_KEY = 'config.json';
const HOOK_CONFIG_KEY = 'hook-config.json';

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
        // Also save hook config via saveData (petal directory)
        await this.writeHookConfig();
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

  // ── Helper: run Node.js code via child_process ──────────────────

  /**
   * Get the claude config dir name (e.g. '.claude' or '.claude-internal')
   */
  getClaudeDir() {
    return this.config.claudeConfigDir || '.claude';
  }

  /**
   * Execute a Node.js one-liner and return stdout.
   * Uses require('child_process').execSync (available in SiYuan Electron).
   */
  execNodeSync(code) {
    const { execSync } = require('child_process');
    return execSync(`node -e "${code.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    }).trim();
  }

  // ── Hook management ─────────────────────────────────────────────

  /**
   * Get the path to the hook.js script inside the plugin directory.
   */
  async getHookScriptPath() {
    const confResp = await fetch('/api/system/getConf', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const confData = await confResp.json();

    let workspacePath = '';
    if (confData.code === 0 && confData.data && confData.data.conf) {
      workspacePath = confData.data.conf.system.workspaceDir;
    }

    if (!workspacePath) {
      throw new Error('Could not determine SiYuan workspace path');
    }

    const sep = workspacePath.includes('\\') ? '\\' : '/';
    return workspacePath + sep + 'data' + sep + 'plugins' + sep + PLUGIN_NAME + sep + 'hook.js';
  }

  /**
   * Install the Claude Code Stop hook into settings.json
   */
  async doInstallHook() {
    const hookPath = await this.getHookScriptPath();
    const normalizedPath = hookPath.replace(/\\/g, '/');
    const claudeDir = this.getClaudeDir();

    // Write hook config first
    await this.writeHookConfig();

    try {
      const { execSync } = require('child_process');
      // Use a temp script file to avoid escaping issues
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tmpScript = path.join(os.tmpdir(), 'claude-siyuan-install.js');

      fs.writeFileSync(tmpScript, `
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
    hooks: [{ type: 'command', command: hookCommand, timeout: 30 }]
  });
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}
`, 'utf8');

      execSync(`node "${tmpScript}"`, { stdio: 'pipe', timeout: 10000 });
      try { fs.unlinkSync(tmpScript); } catch (_) {}
    } catch (e) {
      showMessage(this.i18n.setting.hookInstallFailed + e.message, 6000, 'error');
    }
  }

  /**
   * Uninstall the Claude Code Stop hook from settings.json
   */
  async doUninstallHook() {
    const claudeDir = this.getClaudeDir();

    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tmpScript = path.join(os.tmpdir(), 'claude-siyuan-uninstall.js');

      fs.writeFileSync(tmpScript, `
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
}
`, 'utf8');

      execSync(`node "${tmpScript}"`, { stdio: 'pipe', timeout: 10000 });
      try { fs.unlinkSync(tmpScript); } catch (_) {}
    } catch (e) {
      showMessage(this.i18n.setting.hookUninstallFailed + e.message, 6000, 'error');
    }
  }

  /**
   * Check if the hook is currently installed in settings.json
   */
  async checkHookStatus() {
    try {
      const claudeDir = this.getClaudeDir();
      const { execSync } = require('child_process');
      const result = execSync(`node -e "const fs=require('fs'),path=require('path'),os=require('os');try{const s=JSON.parse(fs.readFileSync(path.join(os.homedir(),'${claudeDir}','settings.json'),'utf8'));process.stdout.write(s.hooks&&s.hooks.Stop&&s.hooks.Stop.some(e=>e.hooks&&e.hooks.some(h=>h.command&&h.command.includes('claude-to-siyuan')))?'yes':'no')}catch(e){process.stdout.write('no')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 5000,
      });
      return result.trim() === 'yes';
    } catch {
      return false;
    }
  }

  // ── Hook config file ────────────────────────────────────────────

  /**
   * Write hook config using saveData() (saves to petal directory).
   * hook.js reads this via the plugin's data storage path.
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

    await this.saveData(HOOK_CONFIG_KEY, hookConfig);
  }
};
