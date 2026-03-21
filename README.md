# claude-to-siyuan

Claude Code Stop Hook → SiYuan Notes / Claude Code 会话自动保存到思源笔记

## 功能 / Features

自动将 Claude Code 的每次对话保存到思源笔记中，支持增量追加。

Automatically saves each Claude Code conversation turn to SiYuan notes with incremental appending.

- 🔄 **增量保存** — 每次对话结束后只追加新内容
- 📁 **按日期组织** — 自动创建 `/Claude Code Sessions/YYYY-MM-DD/` 目录结构
- 🔧 **零依赖** — 仅使用 Node.js 内置模块
- 🛡️ **安全无阻** — 所有错误静默处理，绝不影响 Claude Code 正常运行

## 安装 / Installation

```bash
cd claude-to-siyuan
node install.js
```

安装脚本会自动:
1. 在 `~/.claude/settings.json` 中注册 Stop hook
2. 创建配置文件 `~/.claude-to-siyuan/config.json`

## 配置 / Configuration

编辑 `~/.claude-to-siyuan/config.json`:

```json
{
  "siyuanUrl": "http://127.0.0.1:6806",
  "siyuanToken": "your-api-token",
  "notebook": "your-notebook-id",
  "parentPath": "/Claude Code Sessions",
  "template": "## ${role} (${time})\n\n${content}\n\n---\n",
  "headerTemplate": "# ${projectName}\n\n- 项目: ${projectName}\n- 开始时间: ${date} ${time}\n- Session ID: ${sessionId}\n\n---\n"
}
```

### 获取 API Token / Getting API Token

1. 打开思源笔记 → 设置 → 关于
2. 找到 **API Token**，复制填入配置

### 获取 Notebook ID / Getting Notebook ID

1. 打开思源笔记 → 设置 → 关于
2. 找到 **笔记本 ID**，复制填入配置

### 配置项说明 / Config Options

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `siyuanUrl` | 思源 API 地址 | `http://127.0.0.1:6806` |
| `siyuanToken` | API Token | (必填) |
| `notebook` | 笔记本 ID | (必填) |
| `parentPath` | 文档存放路径 | `/Claude Code Sessions` |
| `template` | 消息模板 | 见上方示例 |
| `headerTemplate` | 文档头模板 | 见上方示例 |

### 模板变量 / Template Variables

**消息模板 (`template`):**
- `${role}` — 角色 (🧑 User / 🤖 Claude)
- `${time}` — 时间 (HH:MM)
- `${content}` — 消息内容

**文档头模板 (`headerTemplate`):**
- `${projectName}` — 项目名称 (取自工作目录)
- `${date}` — 日期 (YYYY-MM-DD)
- `${time}` — 时间 (HH:MM)
- `${sessionId}` — 会话 ID

## 卸载 / Uninstallation

```bash
# 仅移除 hook / Remove hook only
node uninstall.js

# 同时移除配置 / Also remove config
node uninstall.js --remove-config
```

## 测试 / Testing

```bash
node --test test/
```

## 环境变量 / Environment Variables

| 变量 | 说明 |
|------|------|
| `CLAUDE_TO_SIYUAN_CONFIG` | 自定义配置文件路径 |

## 工作原理 / How It Works

1. Claude Code 每次对话结束时触发 Stop hook
2. Hook 从 stdin 接收会话信息 (`session_id`, `transcript_path`)
3. 增量读取 JSONL 格式的会话记录
4. 将新消息格式化为 Markdown
5. 首次运行时创建新文档，后续运行追加内容到同一文档
6. 会话状态保存在临时目录中，24小时后自动清理

## License

MIT
