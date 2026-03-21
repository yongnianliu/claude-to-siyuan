const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseTranscript, parseMessage, truncate } = require('../src/parser');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });

  it('truncates long strings with ellipsis', () => {
    assert.equal(truncate('hello world', 5), 'hello…');
  });

  it('handles exact length', () => {
    assert.equal(truncate('12345', 5), '12345');
  });
});

describe('parseMessage', () => {
  it('parses a simple user text message', () => {
    const entry = {
      type: 'user',
      timestamp: '2026-03-21T10:00:00Z',
      message: { content: 'Hello Claude' },
    };
    const msg = parseMessage(entry);
    assert.equal(msg.role, 'user');
    assert.equal(msg.parts.length, 1);
    assert.equal(msg.parts[0].type, 'text');
    assert.equal(msg.parts[0].text, 'Hello Claude');
  });

  it('parses an assistant message with multi-part content', () => {
    const entry = {
      type: 'assistant',
      timestamp: '2026-03-21T10:01:00Z',
      message: {
        content: [
          { type: 'text', text: 'Let me check that.' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/test.js' } },
        ],
      },
    };
    const msg = parseMessage(entry);
    assert.equal(msg.role, 'assistant');
    assert.equal(msg.parts.length, 2);
    assert.equal(msg.parts[0].type, 'text');
    assert.equal(msg.parts[1].type, 'tool_use');
    assert.equal(msg.parts[1].name, 'Read');
  });

  it('returns null for empty content', () => {
    const entry = { type: 'user', message: { content: '' } };
    assert.equal(parseMessage(entry), null);
  });

  it('returns null for missing content', () => {
    const entry = { type: 'user', message: {} };
    assert.equal(parseMessage(entry), null);
  });

  it('handles tool_result blocks', () => {
    const entry = {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', content: 'file contents here' },
        ],
      },
    };
    const msg = parseMessage(entry);
    assert.equal(msg.parts.length, 1);
    assert.equal(msg.parts[0].type, 'tool_result');
    assert.ok(msg.parts[0].text.includes('file contents'));
  });
});

describe('parseTranscript', () => {
  it('parses a JSONL file with mixed entry types', () => {
    const tmpFile = path.join(os.tmpdir(), `parser-test-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: 'system', message: { content: 'init' } }),
      JSON.stringify({ type: 'user', timestamp: '2026-03-21T10:00:00Z', message: { content: 'Hi' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-03-21T10:00:01Z', message: { content: 'Hello!' } }),
      JSON.stringify({ type: 'metadata', data: {} }),
    ];
    fs.writeFileSync(tmpFile, lines.join('\n'), 'utf8');

    try {
      const { messages, newByteOffset } = parseTranscript(tmpFile, 0);
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, 'user');
      assert.equal(messages[1].role, 'assistant');
      assert.ok(newByteOffset > 0);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('supports incremental parsing via byte offset', () => {
    const tmpFile = path.join(os.tmpdir(), `parser-incr-${Date.now()}.jsonl`);
    const line1 = JSON.stringify({ type: 'user', message: { content: 'First' } });
    const line2 = JSON.stringify({ type: 'assistant', message: { content: 'Reply' } });
    fs.writeFileSync(tmpFile, line1 + '\n', 'utf8');

    try {
      const first = parseTranscript(tmpFile, 0);
      assert.equal(first.messages.length, 1);
      assert.equal(first.messages[0].parts[0].text, 'First');

      // Append second line
      fs.appendFileSync(tmpFile, line2 + '\n', 'utf8');

      const second = parseTranscript(tmpFile, first.newByteOffset);
      assert.equal(second.messages.length, 1);
      assert.equal(second.messages[0].parts[0].text, 'Reply');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('handles malformed lines gracefully', () => {
    const tmpFile = path.join(os.tmpdir(), `parser-bad-${Date.now()}.jsonl`);
    const lines = [
      '{ not valid json',
      JSON.stringify({ type: 'user', message: { content: 'Valid' } }),
      '',
    ];
    fs.writeFileSync(tmpFile, lines.join('\n'), 'utf8');

    try {
      const { messages } = parseTranscript(tmpFile, 0);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].parts[0].text, 'Valid');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
