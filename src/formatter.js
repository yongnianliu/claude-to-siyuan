/**
 * Markdown formatter for parsed session messages.
 * Converts structured messages into readable Markdown for SiYuan notes.
 */

/**
 * Format a list of parsed messages into Markdown.
 *
 * @param {Array} messages   - Array of {role, timestamp, parts}
 * @param {string} template  - Per-message template with ${role}, ${time}, ${content}
 * @returns {string} Formatted Markdown
 */
function formatMessages(messages, template) {
  return messages.map(msg => formatOneMessage(msg, template)).join('\n');
}

/**
 * Format a single message using the template.
 * @param {object} msg      - {role, timestamp, parts}
 * @param {string} template - Template string
 * @returns {string}
 */
function formatOneMessage(msg, template) {
  const roleLabel = msg.role === 'user' ? '🧑 User' : '🤖 Claude';
  const time = formatTime(msg.timestamp);
  const content = formatParts(msg.parts);

  return renderTemplate(template, {
    role: roleLabel,
    time,
    content,
  });
}

/**
 * Format content parts into Markdown.
 * @param {Array} parts - Array of {type, text, name, input}
 * @returns {string}
 */
function formatParts(parts) {
  const sections = [];

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        sections.push(part.text);
        break;

      case 'tool_use':
        sections.push(formatToolUse(part));
        break;

      case 'tool_result':
        sections.push(formatToolResult(part));
        break;
    }
  }

  return sections.join('\n\n');
}

/**
 * Format a tool use as a collapsible details section.
 * @param {object} part - {name, input}
 * @returns {string}
 */
function formatToolUse(part) {
  const inputBlock = part.input
    ? `\n\n\`\`\`json\n${part.input}\n\`\`\``
    : '';
  return `<details><summary>🔧 Tool: ${part.name}</summary>${inputBlock}\n\n</details>`;
}

/**
 * Format a tool result.
 * @param {object} part - {text}
 * @returns {string}
 */
function formatToolResult(part) {
  if (!part.text) return '';
  return `<details><summary>📋 Tool Result</summary>\n\n\`\`\`\n${part.text}\n\`\`\`\n\n</details>`;
}

/**
 * Generate the document header for a new session document.
 *
 * @param {object} opts
 * @param {string} opts.projectName
 * @param {string} opts.sessionId
 * @param {string} opts.headerTemplate
 * @param {string} [opts.firstUserMessage] - First user message (for title generation)
 * @returns {{title: string, header: string}}
 */
function generateDocHeader(opts) {
  const { projectName, sessionId, headerTemplate, firstUserMessage } = opts;
  const now = new Date();
  const date = formatDate(now);
  const time = formatTime(now);

  const header = renderTemplate(headerTemplate, {
    projectName,
    date,
    time,
    sessionId,
  });

  // Title: project name + first 30 chars of first user message, or date fallback
  let titleSuffix = '';
  if (firstUserMessage) {
    titleSuffix = ' - ' + firstUserMessage.slice(0, 30).replace(/[\n\r]/g, ' ').trim();
  } else {
    titleSuffix = ' - ' + date;
  }
  const title = projectName + titleSuffix;

  return { title, header };
}

/**
 * Render a template string by replacing ${key} placeholders.
 * @param {string} template
 * @param {object} data - Key-value pairs for substitution
 * @returns {string}
 */
function renderTemplate(template, data) {
  return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const trimmed = key.trim();
    return trimmed in data ? data[trimmed] : match;
  });
}

/**
 * Format a timestamp or Date into HH:MM string.
 * @param {string|number|Date|null} ts
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return '--:--';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '--:--';
  return d.toTimeString().slice(0, 5);
}

/**
 * Format a Date into YYYY-MM-DD string.
 * @param {Date} d
 * @returns {string}
 */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  formatMessages,
  formatOneMessage,
  formatParts,
  formatToolUse,
  formatToolResult,
  generateDocHeader,
  renderTemplate,
  formatTime,
  formatDate,
};
