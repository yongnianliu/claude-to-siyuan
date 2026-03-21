/**
 * JSONL session transcript parser.
 * Extracts user & assistant messages from a Claude Code session file.
 */

const fs = require('fs');

/**
 * Parse a JSONL transcript file starting from a given byte offset.
 *
 * @param {string} filePath    - Path to the .jsonl transcript file
 * @param {number} [byteOffset=0] - Byte offset to start reading from (for incremental processing)
 * @returns {{messages: Array, newByteOffset: number}}
 */
function parseTranscript(filePath, byteOffset = 0) {
  const content = fs.readFileSync(filePath, 'utf8');
  const bytes = Buffer.from(content, 'utf8');

  // If we have a byte offset, skip to that position
  const startContent = byteOffset > 0
    ? Buffer.from(bytes.subarray(byteOffset)).toString('utf8')
    : content;

  const lines = startContent.split('\n').filter(line => line.trim());
  const messages = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Only process user and assistant message types
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;

      const msg = parseMessage(entry);
      if (msg) messages.push(msg);
    } catch {
      // Skip malformed lines silently
    }
  }

  // New byte offset = total file size
  const newByteOffset = bytes.length;

  return { messages, newByteOffset };
}

/**
 * Parse a single JSONL entry into a structured message.
 * @param {object} entry - Parsed JSON line
 * @returns {object|null} Structured message or null
 */
function parseMessage(entry) {
  const role = entry.type; // 'user' or 'assistant'
  const timestamp = entry.timestamp || null;

  // Handle different message content formats
  const message = entry.message || {};
  const rawContent = message.content;

  if (!rawContent) return null;

  const parts = [];

  if (typeof rawContent === 'string') {
    parts.push({ type: 'text', text: rawContent });
  } else if (Array.isArray(rawContent)) {
    for (const block of rawContent) {
      if (block.type === 'text' && block.text) {
        parts.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          type: 'tool_use',
          name: block.name || 'unknown',
          input: summarizeToolInput(block.input),
        });
      } else if (block.type === 'tool_result') {
        // Include tool results with a brief summary
        const resultText = extractToolResultText(block);
        if (resultText) {
          parts.push({ type: 'tool_result', text: resultText });
        }
      }
    }
  }

  if (parts.length === 0) return null;

  return { role, timestamp, parts };
}

/**
 * Summarize tool input for display (truncate large inputs).
 * @param {*} input
 * @returns {string}
 */
function summarizeToolInput(input) {
  if (!input) return '';
  if (typeof input === 'string') return truncate(input, 500);

  try {
    const str = JSON.stringify(input, null, 2);
    return truncate(str, 500);
  } catch {
    return '[complex input]';
  }
}

/**
 * Extract readable text from a tool_result block.
 * @param {object} block
 * @returns {string}
 */
function extractToolResultText(block) {
  if (!block.content) return '';

  if (typeof block.content === 'string') return truncate(block.content, 300);

  if (Array.isArray(block.content)) {
    const texts = block.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text);
    return truncate(texts.join('\n'), 300);
  }

  return '';
}

/**
 * Truncate a string to a max length, appending "…" if truncated.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

module.exports = { parseTranscript, parseMessage, truncate };
