const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const SiYuanAPI = require('../src/siyuan-api');

/**
 * Helper: create a temporary HTTP server that returns canned responses.
 */
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe('SiYuanAPI', () => {
  describe('getDailyPath', () => {
    it('combines parent path and date', () => {
      const api = new SiYuanAPI('http://localhost:6806', 'test');
      assert.equal(
        api.getDailyPath('/Claude Code Sessions', '2026-03-21'),
        '/Claude Code Sessions/2026-03-21'
      );
    });

    it('strips trailing slash from parent path', () => {
      const api = new SiYuanAPI('http://localhost:6806', 'test');
      assert.equal(
        api.getDailyPath('/Sessions/', '2026-03-21'),
        '/Sessions/2026-03-21'
      );
    });
  });

  describe('createDocWithMd', () => {
    it('sends correct request and returns doc ID', async () => {
      let receivedBody = null;
      let receivedAuth = null;

      const { server, url } = await createMockServer((req, res) => {
        receivedAuth = req.headers['authorization'];
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', () => {
          receivedBody = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, data: 'doc-id-123', msg: '' }));
        });
      });

      try {
        const api = new SiYuanAPI(url, 'my-token');
        const docId = await api.createDocWithMd('nb1', '/test/path', '# Hello');

        assert.equal(docId, 'doc-id-123');
        assert.equal(receivedAuth, 'Token my-token');
        assert.equal(receivedBody.notebook, 'nb1');
        assert.equal(receivedBody.path, '/test/path');
        assert.equal(receivedBody.markdown, '# Hello');
      } finally {
        await closeServer(server);
      }
    });

    it('rejects on API error code', async () => {
      const { server, url } = await createMockServer((req, res) => {
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, msg: 'notebook not found' }));
        });
      });

      try {
        const api = new SiYuanAPI(url, 'token');
        await assert.rejects(
          () => api.createDocWithMd('bad', '/path', 'md'),
          /notebook not found/
        );
      } finally {
        await closeServer(server);
      }
    });
  });

  describe('appendBlock', () => {
    it('sends correct appendBlock request', async () => {
      let receivedBody = null;

      const { server, url } = await createMockServer((req, res) => {
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', () => {
          receivedBody = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, data: [{ id: 'block-1' }], msg: '' }));
        });
      });

      try {
        const api = new SiYuanAPI(url, 'token');
        const result = await api.appendBlock('parent-id', '## New block');

        assert.equal(receivedBody.dataType, 'markdown');
        assert.equal(receivedBody.data, '## New block');
        assert.equal(receivedBody.parentID, 'parent-id');
        assert.ok(result);
      } finally {
        await closeServer(server);
      }
    });
  });

  describe('searchDocs', () => {
    it('returns matching documents', async () => {
      const { server, url } = await createMockServer((req, res) => {
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, data: [{ id: 'd1', path: '/test' }], msg: '' }));
        });
      });

      try {
        const api = new SiYuanAPI(url, 'token');
        const docs = await api.searchDocs('test');
        assert.equal(docs.length, 1);
        assert.equal(docs[0].id, 'd1');
      } finally {
        await closeServer(server);
      }
    });
  });

  describe('connection error handling', () => {
    it('rejects when server is unreachable', async () => {
      const api = new SiYuanAPI('http://127.0.0.1:1', 'token');
      await assert.rejects(
        () => api.searchDocs('test'),
        /ECONNREFUSED/
      );
    });
  });
});
