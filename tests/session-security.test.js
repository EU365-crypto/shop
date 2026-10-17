const projectRoot = require('node:path').resolve(__dirname, '..');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { sessionConfig, SQLiteSessionStore, installSessions, logoutSession } = require('../src/auth/session-security');
const { registerPasswordAuthentication } = require('../src/auth/password-authentication');
const secret = crypto.randomBytes(48).toString('hex');
const callStore = (store, method, ...args) => new Promise((resolve, reject) => store[method](...args, (error, result) => error ? reject(error) : resolve(result)));

test('production configuration requires secret and HTTPS; proxy trust is explicit', () => {
    assert.throws(() => sessionConfig({ NODE_ENV: 'production', BASE_URL: 'https://shop.example' }), /SESSION_SECRET/);
    assert.throws(() => sessionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(64), BASE_URL: 'https://shop.example' }), /SESSION_SECRET/);
    assert.throws(() => sessionConfig({ NODE_ENV: 'production', SESSION_SECRET: secret }), /HTTPS/);
    for (const proxy of ['true', '1', 'not-a-proxy', '127.0.0.1/33']) assert.throws(() => sessionConfig({ SESSION_SECRET: secret, TRUST_PROXY: proxy }), /TRUST_PROXY/);
    const config = sessionConfig({ NODE_ENV: 'production', SESSION_SECRET: secret, BASE_URL: 'https://shop.example', TRUST_PROXY: '127.0.0.1,10.1.2.0/24' });
    assert.deepEqual(config.trustProxy, ['127.0.0.1', '10.1.2.0/24']);
    assert.equal(config.cookie.secure, true); assert.equal(config.cookie.httpOnly, true); assert.equal(config.cookie.sameSite, 'lax');
    assert.equal(sessionConfig({ SESSION_SECRET: secret }).cookie.secure, false);
});

test('SQLite sessions persist across reopening, isolate roles, and enforce idle/absolute expiry', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'shop-session-test-'));
    const filename = path.join(directory, 'sessions.db');
    let db = new DatabaseSync(filename), now = 10000;
    const options = { idleMs: 100, absoluteMs: 250, now: () => now };
    try {
        let store = new SQLiteSessionStore(db, 'customer', options);
        const value = { cookie: { expires: new Date(now + 1000) }, createdAt: now, lastActivity: now, user: { id: 1, role: 'user' } };
        await callStore(store, 'set', 'example-session', value);
        db.close(); db = new DatabaseSync(filename);
        store = new SQLiteSessionStore(db, 'customer', options);
        assert.equal((await callStore(store, 'get', 'example-session')).user.id, 1);
        assert.equal(await callStore(new SQLiteSessionStore(db, 'admin', options), 'get', 'example-session'), null);
        now += 90; await callStore(store, 'touch', 'example-session', value);
        now += 11; assert.equal(await callStore(store, 'get', 'example-session'), null);
        now = 11000; value.createdAt = now; value.lastActivity = now; value.cookie.expires = new Date(now + 1000);
        await callStore(store, 'set', 'absolute', value);
        now += 240; value.lastActivity = now; await callStore(store, 'set', 'absolute', value);
        now += 11; assert.equal(await callStore(store, 'get', 'absolute'), null);
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

async function fixture(production = false, trustProxy = '') {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,role TEXT,email_verified INTEGER)');
    const password = 'synthetic-test-credential';
    const hash = await bcrypt.hash(password, 4);
    for (const [id, role, verified] of [[1, 'user', 1], [2, 'admin', 1], [3, 'user', 0]]) {
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, `account${id}@example.test`, hash, role, verified);
    }
    const app = express(); app.use(express.json());
    const config = sessionConfig({ SESSION_SECRET: secret, NODE_ENV: production ? 'production' : 'test', BASE_URL: production ? 'https://shop.example' : 'http://localhost:3000', TRUST_PROXY: trustProxy });
    installSessions(app, db, req => req.path.startsWith('/api/admin') || req.query.admin === '1' ||
        (req.path === '/api/user-login' && db.prepare('SELECT role FROM users WHERE email=?').get(req.body?.email || '')?.role === 'admin'), config);
    registerPasswordAuthentication(app, db, () => {}, async () => {});
    app.get('/api/me', (req, res) => { req.session.guestId ||= 'guest'; res.json({ user: req.session.user || null }); });
    app.get('/api/admin/me', (req, res) => { req.session.guestId ||= 'admin-guest'; res.status(req.session.user?.role === 'admin' ? 200 : 403).json({ user: req.session.user || null }); });
    app.post('/api/admin/change', (req, res) => res.status(req.session.user?.role === 'admin' ? 200 : 403).json({ success: req.session.user?.role === 'admin' }));
    app.post('/api/logout', (req, res, next) => logoutSession(req, res, next, config));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = (route, options = {}) => fetch(url + route, options);
    const post = (route, body, cookie = '', extra = {}) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: config.origin, Cookie: cookie, ...extra }, body: JSON.stringify(body) });
    return { app, db, request, post, password, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const cookie = response => response.headers.get('set-cookie')?.split(';')[0] || '';

test('real password routes rotate IDs, persist login, clear logout, and isolate admin/customer sessions', async () => {
    const f = await fixture();
    try {
        const guest = await f.request('/api/me'); const before = cookie(guest);
        const login = await f.post('/api/user-login', { email: 'account1@example.test', password: f.password }, before);
        assert.equal(login.status, 200); const customer = cookie(login); assert.notEqual(customer, before);
        assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
        assert.doesNotMatch(login.headers.get('set-cookie'), /; Secure/);
        assert.equal((await (await f.request('/api/me', { headers: { Cookie: before } })).json()).user, null);
        assert.equal((await (await f.request('/api/me', { headers: { Cookie: customer } })).json()).user.id, 1);
        assert.equal((await f.post('/api/admin/change', {}, customer)).status, 403);
        assert.equal((await f.post('/api/admin-login', { email: 'account1@example.test', password: f.password })).status, 403);
        assert.equal((await f.post('/api/user-login', { email: 'account3@example.test', password: f.password })).status, 403);
        assert.equal((await f.post('/api/user-login', { email: 'account1@example.test', password: 'invalid' })).status, 401);
        const adminGuest = cookie(await f.request('/api/admin/me'));
        const adminLogin = await f.post('/api/admin-login', { email: 'account2@example.test', password: f.password }, adminGuest);
        assert.equal(adminLogin.status, 200); const admin = cookie(adminLogin); assert.notEqual(admin, adminGuest);
        assert.equal((await f.post('/api/admin/change', {}, admin + '; ' + customer)).status, 200);
        const records = f.db.prepare('SELECT data FROM auth_sessions').all();
        assert.ok(records.every(row => !row.data.includes(f.password) && !row.data.includes('password_hash')));
        const logout = await f.post('/api/logout?admin=1', {}, admin + '; ' + customer);
        assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /^admin\.sid=;/);
        assert.equal((await f.request('/api/admin/me', { headers: { Cookie: admin } })).status, 403);
        assert.equal((await (await f.request('/api/me', { headers: { Cookie: customer } })).json()).user.id, 1);
        const customerLogout = await f.post('/api/logout', {}, customer);
        assert.match(customerLogout.headers.get('set-cookie'), /^customer\.sid=;/);
        assert.equal((await (await f.request('/api/me', { headers: { Cookie: customer } })).json()).user, null);
    } finally { await f.close(); }
});

test('CSRF rejects missing headers, foreign origins, and same-site sibling requests', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.post('/api/user-login', {}, '', { 'X-CSRF-Protection': '' })).status, 403);
        assert.equal((await f.post('/api/user-login', {}, '', { Origin: 'https://attacker.example' })).status, 403);
        assert.equal((await f.post('/api/user-login', {}, '', { 'Sec-Fetch-Site': 'same-site' })).status, 403);
        assert.equal((await f.post('/api/user-login', { email: 'account1@example.test', password: f.password })).status, 200);
    } finally { await f.close(); }
});

test('production requires trusted HTTPS and sets secure cookies only behind configured proxies', async () => {
    const f = await fixture(true, '127.0.0.1');
    try {
        assert.equal((await f.request('/api/me')).status, 400);
        const result = await f.post('/api/user-login', { email: 'account1@example.test', password: f.password }, '', { 'X-Forwarded-Proto': 'https' });
        assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /; Secure/);
    } finally { await f.close(); }
    const untrusted = await fixture(true);
    try { assert.equal((await untrusted.request('/api/me', { headers: { 'X-Forwarded-Proto': 'https' } })).status, 400); }
    finally { await untrusted.close(); }
});

test('expired authenticated sessions lose authorization on HTTP requests', async () => {
    const f = await fixture();
    try {
        const result = await f.post('/api/admin-login', { email: 'account2@example.test', password: f.password });
        const admin = cookie(result);
        f.db.prepare('UPDATE auth_sessions SET expires=0').run();
        assert.equal((await f.post('/api/admin/change', {}, admin)).status, 403);
    } finally { await f.close(); }
});
test('message polling does not extend customer or administrator session idle deadlines', async () => {
    const f = await fixture();
    try {
        f.app.get('/api/messages', (req, res) => res.json({ user: req.session.user }));
        f.app.get('/api/admin/message-center/1', (req, res) => res.json({ user: req.session.user }));
        for (const [loginPath, email, poll] of [['/api/user-login', 'account1@example.test', '/api/messages'], ['/api/admin-login', 'account2@example.test', '/api/admin/message-center/1']]) {
            const login = await f.post(loginPath, { email, password: f.password });
            const sessionCookie = cookie(login), id = decodeURIComponent(sessionCookie.split('=')[1]).slice(2).split('.')[0];
            const saved = f.db.prepare('SELECT data FROM auth_sessions WHERE sid=?').get(id);
            const before = JSON.parse(saved.data).lastActivity;
            assert.equal((await f.request(poll, { headers: { Cookie: sessionCookie } })).status, 200);
            assert.equal(JSON.parse(f.db.prepare('SELECT data FROM auth_sessions WHERE sid=?').get(id).data).lastActivity, before);
        }
    } finally { await f.close(); }
});

test('Google OAuth state is session-bound and rejects a forged callback before token exchange', async () => {
    const { Passport } = require('passport');
    const { Strategy } = require('passport-google-oauth20');
    const f = await fixture();
    try {
        const passport = new Passport();
        passport.use(new Strategy({ clientID: 'synthetic-client', clientSecret: 'synthetic-secret', callbackURL: 'http://localhost:3000/auth/google/callback', state: true }, () => {}));
        f.app.use(passport.initialize());
        f.app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
        f.app.get('/auth/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/user-login.html?error=google' }));
        const start = await f.request('/auth/google', { redirect: 'manual' });
        assert.equal(start.status, 302);
        const state = new URL(start.headers.get('location')).searchParams.get('state');
        assert.ok(state && state.length > 16);
        const rejected = await f.request('/auth/google/callback?code=synthetic-code&state=forged', { redirect: 'manual', headers: { Cookie: cookie(start) } });
        assert.equal(rejected.status, 302);
        assert.equal(rejected.headers.get('location'), '/user-login.html?error=google');
    } finally { await f.close(); }
});

test('browser CSRF header covers existing forms but is never sent to another origin', async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const calls = [];
    const window = { fetch: async (input, options) => { calls.push({ input, options }); } };
    vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'public/assets/js/shared/session-security.js'), 'utf8'), {
        window, Request, Headers, URL, location: { origin: 'https://shop.example', href: 'https://shop.example/store.html' }
    });
    for (const route of ['/api/user-login', '/api/admin-login', '/api/signup', '/api/password-code', '/api/profile', '/api/catalog/draft', '/api/logout']) {
        await window.fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(calls.at(-1).options.headers.get('X-CSRF-Protection'), '1');
        assert.equal(calls.at(-1).options.body, '{}');
    }
    await window.fetch(new Request('https://shop.example/api/profile', { method: 'PUT', body: '{}' }));
    assert.equal(calls.at(-1).options.headers.get('X-CSRF-Protection'), '1');
    await window.fetch('https://other.example/api', { method: 'POST' });
    assert.equal(calls.at(-1).options.headers, undefined);
    await window.fetch('/api/me');
    assert.equal(calls.at(-1).options.headers, undefined);
    const pages = ['public/pages', 'private'].flatMap(directory => fs.readdirSync(path.join(projectRoot, directory), { recursive: true }).filter(file => file.endsWith('.html')).map(file => path.join(projectRoot, directory, file)));
    assert.ok(pages.length >= 13, 'Security coverage must include the organized page directories');
    for (const file of pages) assert.ok(fs.readFileSync(file, 'utf8').includes('/assets/js/shared/session-security.js'), file);

});
