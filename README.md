# Claude Code Session Sync

[中文说明](README_zh_CN.md)

A SiYuan plugin that automatically saves Claude Code conversations to SiYuan notes via Stop hook.

## Features

- 🔄 **Incremental Sync** — Only appends new content after each conversation turn
- 📁 **Date-based Organization** — Auto-creates `/Claude Code Sessions/YYYY-MM-DD/` structure
- ⚙️ **Settings UI** — Configure everything through SiYuan's plugin settings panel
- 🔧 **One-click Hook Install** — Install/uninstall the Claude Code hook directly from SiYuan
- 🔒 **Zero Dependencies** — Uses only Node.js built-in modules
- 🛡️ **Non-blocking** — All errors handled silently, never interferes with Claude Code

## Installation

### From SiYuan Bazaar (Recommended)
1. Open SiYuan → Settings → Bazaar → Plugins
2. Search for "Claude Code Session Sync"
3. Click Install

### Manual Installation
1. Download the latest release
2. Extract to `{SiYuan workspace}/data/plugins/claude-to-siyuan/`
3. Restart SiYuan

## Setup

1. **Open Plugin Settings**: Click the `</>` icon in SiYuan's top bar → Settings
2. **Select Notebook**: Choose which notebook to save sessions to
3. **Install Hook**: Click "Install Hook" to register the Claude Code Stop hook
4. **Restart Claude Code**: The hook activates on next Claude Code session

## How It Works

```
Claude Code conversation
    ↓ (Stop hook triggers after each turn)
hook.js reads transcript (JSONL)
    ↓ (incremental — only new messages)
Formats as Markdown
    ↓
Creates/appends to SiYuan document
    ↓
/Claude Code Sessions/2026-03-21/project-name - first message...
```

## Configuration

All settings are available through the plugin's settings panel in SiYuan:

| Setting | Description | Default |
|---------|-------------|---------|
| Target Notebook | Which notebook to save to | (required) |
| Document Path | Parent path for session docs | `/Claude Code Sessions` |
| Message Template | Per-message format | `## ${role} (${time})\n\n${content}\n\n---\n` |
| Header Template | New document header | See settings |

### Template Variables

**Message Template**: `${role}`, `${time}`, `${content}`

**Header Template**: `${projectName}`, `${date}`, `${time}`, `${sessionId}`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SIYUAN_TOKEN` | Override SiYuan API token |
| `CLAUDE_TO_SIYUAN_CONFIG` | Custom config file path |

## Testing

```bash
node --test test/*.test.js
```

## License

MIT
