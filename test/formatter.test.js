const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMessages,
  formatOneMessage,
  formatParts,
  formatToolUse,
  formatToolResult,
  generateDocHeader,
  renderTemplate,
  formatTime,
  formatDate,
} = require('../src/formatter');

describe('renderTemplate', () => {
  it('replaces placeholders with data values', () => {
    const result = renderTemplate('Hello ${name}!', { name: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('leaves unknown placeholders unchanged', () => {
    const result = renderTemplate('${known} ${unknown}', { known: 'yes' });
    assert.equal(result, 'yes ${unknown}');
  });

  it('handles multiple replacements', () => {
    const result = renderTemplate('${a} and ${b}', { a: '1', b: '2' });
    assert.equal(result, '1 and 2');
  });
});

describe('formatTime', () => {
  it('formats a Date object', () => {
    const d = new Date('2026-03-21T14:30:00Z');
    const result = formatTime(d);
    // Should be HH:MM in local timezone
    assert.match(result, /^\d{2}:\d{2}$/);
  });

  it('formats a timestamp string', () => {
    const result = formatTime('2026-03-21T10:00:00Z');
    assert.match(result, /^\d{2}:\d{2}$/);
  });

  it('returns --:-- for null', () => {
    assert.equal(formatTime(null), '--:--');
  });

  it('returns --:-- for invalid input', () => {
    assert.equal(formatTime('not a date'), '--:--');
  });
});

describe('formatDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    const d = new Date(2026, 2, 21); // March = month 2
    assert.equal(formatDate(d), '2026-03-21');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5); // Jan 5
    assert.equal(formatDate(d), '2026-01-05');
  });
});

describe('formatToolUse', () => {
  it('wraps tool use in collapsible details', () => {
    const result = formatToolUse({ name: 'Read', input: '{"file": "test.js"}' });
    assert.ok(result.includes('<details>'));
    assert.ok(result.includes('🔧 Tool: Read'));
    assert.ok(result.includes('test.js'));
    assert.ok(result.includes('</details>'));
  });

  it('handles empty input', () => {
    const result = formatToolUse({ name: 'Bash', input: '' });
    assert.ok(result.includes('🔧 Tool: Bash'));
  });
});

describe('formatToolResult', () => {
  it('wraps tool result in collapsible details', () => {
    const result = formatToolResult({ text: 'output here' });
    assert.ok(result.includes('<details>'));
    assert.ok(result.includes('📋 Tool Result'));
    assert.ok(result.includes('output here'));
  });

  it('returns empty for no text', () => {
    assert.equal(formatToolResult({ text: '' }), '');
  });
});

describe('formatParts', () => {
  it('joins text and tool parts', () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'tool_use', name: 'Read', input: '{}' },
    ];
    const result = formatParts(parts);
    assert.ok(result.includes('Hello'));
    assert.ok(result.includes('🔧 Tool: Read'));
  });
});

describe('formatMessages', () => {
  it('formats a list of messages with template', () => {
    const messages = [
      { role: 'user', timestamp: '2026-03-21T10:00:00Z', parts: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', timestamp: '2026-03-21T10:00:01Z', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    const template = '## ${role} (${time})\n\n${content}\n\n---\n';
    const result = formatMessages(messages, template);
    assert.ok(result.includes('🧑 User'));
    assert.ok(result.includes('🤖 Claude'));
    assert.ok(result.includes('Hi'));
    assert.ok(result.includes('Hello!'));
  });
});

describe('generateDocHeader', () => {
  it('generates title and header with project name and first message', () => {
    const { title, header } = generateDocHeader({
      projectName: 'my-project',
      sessionId: 'abc-123',
      headerTemplate: '# ${projectName}\n\nSession: ${sessionId}\n',
      firstUserMessage: 'Help me fix the login bug',
    });
    assert.ok(title.includes('my-project'));
    assert.ok(title.includes('Help me fix the login bug'));
    assert.ok(header.includes('my-project'));
    assert.ok(header.includes('abc-123'));
  });

  it('uses date fallback when no first message', () => {
    const { title } = generateDocHeader({
      projectName: 'test',
      sessionId: 'x',
      headerTemplate: '# ${projectName}\n',
      firstUserMessage: '',
    });
    assert.ok(title.includes('test'));
    assert.match(title, /\d{4}-\d{2}-\d{2}/);
  });
});
