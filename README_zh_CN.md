# Claude Code 会话同步

[English](README.md)

思源笔记插件，通过 Stop Hook 自动将 Claude Code 对话保存到思源笔记。

## 功能

- 🔄 **增量同步** — 每次对话结束后只追加新内容，不重复保存
- 📁 **按日期组织** — 自动创建 `/Claude Code Sessions/YYYY-MM-DD/` 目录结构
- ⚙️ **可视化配置** — 通过思源插件设置界面配置所有参数
- 🔧 **一键安装 Hook** — 在思源中直接安装/卸载 Claude Code Hook
- 🔒 **零依赖** — 仅使用 Node.js 内置模块
- 🛡️ **安全无阻** — 所有错误静默处理，绝不影响 Claude Code 正常运行

## 安装

### 从集市安装（推荐）
1. 打开思源笔记 → 设置 → 集市 → 插件
2. 搜索「Claude Code 会话同步」
3. 点击安装

### 手动安装
1. 下载最新 Release
2. 解压到 `{思源工作空间}/data/plugins/claude-to-siyuan/`
3. 重启思源笔记

## 使用方法

1. **打开插件设置**: 点击思源顶栏的 `</>` 图标 → 设置
2. **选择笔记本**: 选择保存会话的目标笔记本
3. **安装 Hook**: 点击「安装 Hook」按钮注册 Claude Code Stop Hook
4. **重启 Claude Code**: 下次启动 Claude Code 时 Hook 自动生效

## 工作原理

```
Claude Code 对话
    ↓ (每轮对话结束触发 Stop Hook)
hook.js 读取会话记录 (JSONL)
    ↓ (增量读取 — 只处理新消息)
格式化为 Markdown
    ↓
创建/追加到思源文档
    ↓
/Claude Code Sessions/2026-03-21/项目名 - 第一条消息...
```

## 配置项

所有配置通过思源插件设置界面管理：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 目标笔记本 | 保存会话的笔记本 | （必填） |
| 文档路径 | 会话文档存放路径 | `/Claude Code Sessions` |
| 消息模板 | 每条消息的格式 | `## ${role} (${time})\n\n${content}\n\n---\n` |
| 文档头模板 | 新文档头部格式 | 见设置界面 |

### 模板变量

**消息模板**: `${role}` 角色, `${time}` 时间, `${content}` 内容

**文档头模板**: `${projectName}` 项目名, `${date}` 日期, `${time}` 时间, `${sessionId}` 会话ID

## 环境变量

| 变量 | 说明 |
|------|------|
| `SIYUAN_TOKEN` | 覆盖思源 API Token |
| `CLAUDE_TO_SIYUAN_CONFIG` | 自定义配置文件路径 |

## 测试

```bash
node --test test/*.test.js
```

## 许可证

MIT
