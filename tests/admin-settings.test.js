const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { registerAdminSettings } = require('../src/admin/settings');
test('combined settings require admin access and save changed or unchanged values together', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE store_tax_settings(id INTEGER PRIMARY KEY, rate REAL); INSERT INTO store_tax_settings VALUES(1,7); CREATE TABLE email_security_settings(id INTEGER PRIMARY KEY, rate_limit INTEGER); INSERT INTO email_security_settings VALUES(1,1)');
    const routes = new Map(); let resets = 0;
    const app = { get(path, ...handlers) { routes.set('GET', handlers); }, put(path, ...handlers) { routes.set('PUT', handlers); } };
    registerAdminSettings(app, db, () => resets++);
    function request(method, body, role = 'admin') {
        const req = { body, session: { user: { role } } };
        const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        const handlers = routes.get(method);
        handlers[0](req, res, () => handlers[1](req, res));
        return res;
    }
    try {
        assert.equal(request('GET', {}, 'user').code, 403);
        assert.equal(request('PUT', { taxRate: 4, rateLimitEnabled: false }, 'user').code, 403);
        assert.equal(request('PUT', { taxRate: 8, rateLimitEnabled: 'false' }).code, 400);
        assert.equal(request('GET').data.taxRate, 7);
        assert.equal(request('PUT', { taxRate: 101, rateLimitEnabled: false }).code, 400);
        assert.equal(request('GET').data.rateLimitEnabled, true);
        assert.equal(request('PUT', { taxRate: 8, rateLimitEnabled: false }).code, 200);
        assert.deepEqual(request('GET').data, { taxRate: 8, rateLimitEnabled: false });
        assert.equal(resets, 1);
        assert.equal(request('PUT', { taxRate: 8, rateLimitEnabled: false }).code, 200);
        assert.equal(resets, 1);
        db.exec("CREATE TRIGGER fail_limit BEFORE UPDATE ON email_security_settings BEGIN SELECT RAISE(ABORT, 'test'); END");
        assert.equal(request('PUT', { taxRate: 9, rateLimitEnabled: true }).code, 500);
        assert.deepEqual(request('GET').data, { taxRate: 8, rateLimitEnabled: false });
    } finally { db.close(); }
});
