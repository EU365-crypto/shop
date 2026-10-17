const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { registerEmailSecurity } = require('../src/auth/email-verification');
function setup(failMail = false) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
        role TEXT, email_verified INTEGER, verification_token TEXT, verification_expires INTEGER)`);
    const routes = new Map(), mail = [];
    const app = { use() {}, get(path, fn) { routes.set(path, fn); }, put() {}, post(path, fn) { routes.set(path, fn); } };
    registerEmailSecurity(app, db, { async sendMail(message) { if (failMail) throw Object.assign(new Error(), { code: "EAUTH" }); mail.push(message); } }, 'store@example.test');
    async function request(path, body, user, pendingGoogle) {
        const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        const session = { user, pendingGoogle, regenerate(callback) { delete this.user; delete this.pendingGoogle; callback(); } };
        await routes.get(path)({ body, session }, res);
        res.session = session;
        return res;
    }
    const code = () => mail.at(-1).text.match(/\b\d{6}\b/)[0];
    return { db, mail, request, code };
}
test('signup and reset preserve password spaces and Unicode without substitution', async () => {
    const { db, request, code } = setup();
    try {
        const original = '  Synthetic! \u00e9\u4e2d  ';
        await request('/api/email-code', { email: 'exact@example.test', purpose: 'signup' });
        assert.equal((await request('/api/signup', { email: 'exact@example.test', password: original, code: code() })).code, 200);
        let saved = db.prepare('SELECT password_hash FROM users').get().password_hash;
        assert.ok(await bcrypt.compare(original, saved));
        assert.equal(await bcrypt.compare(original.trim(), saved), false);
        assert.equal(await bcrypt.compare('HongKong Supermarket', saved), false);
        const replacement = '  Different! \u00f1\u6587  ';
        await request('/api/email-code', { email: 'exact@example.test', purpose: 'reset' });
        assert.equal((await request('/api/password-code', { email: 'exact@example.test', purpose: 'reset', password: replacement, code: code() })).code, 200);
        saved = db.prepare('SELECT password_hash FROM users').get().password_hash;
        assert.ok(await bcrypt.compare(replacement, saved));
        assert.equal(await bcrypt.compare(replacement.trim(), saved), false);
        assert.equal(await bcrypt.compare(original, saved), false);
    } finally { db.close(); }
});

test('signup requires a one-time emailed code, then sends notification', async () => {
    const { db, mail, request, code } = setup();
    try {
        assert.equal((await request('/api/signup', { email: 'new@example.test', password: 'safe-password' })).code, 400);
        await request('/api/email-code', { email: 'new@example.test', purpose: 'signup' });
        const token = code();
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
        assert.equal((await request('/api/signup', { email: 'new@example.test', password: 'safe-password', code: 'invalid' })).code, 400);
        assert.equal((await request('/api/signup', { email: 'new@example.test', password: 'safe-password', code: token })).code, 200);
        assert.equal(db.prepare('SELECT email_verified FROM users').get().email_verified, 1);
        assert.match(mail.at(-1).text, /verified/);
        assert.equal((await request('/api/verify-code', { email: 'new@example.test', code: token })).code, 400);
    } finally { db.close(); }
});
test('reset validates codes, updates password and notifies; change uses session owner', async () => {
    const { db, mail, request, code } = setup();
    try {
        await request('/api/email-code', { email: 'owner@example.test', purpose: 'signup' });
        await request('/api/signup', { email: 'owner@example.test', password: 'old-password', code: code() });
        await request('/api/email-code', { email: 'owner@example.test', purpose: 'reset' });
        const token = code();
        assert.equal((await request('/api/password-code', { purpose: 'reset', email: 'owner@example.test', code: token, password: 'old-password' })).data.message, 'Your new password must be different from your current password.');
        assert.equal((await request('/api/password-code', { purpose: 'reset', email: 'owner@example.test', code: token, password: 'new-password' })).code, 200);
        assert.ok(await bcrypt.compare('new-password', db.prepare('SELECT password_hash FROM users').get().password_hash));
        assert.match(mail.at(-1).text, /password was changed/);
        assert.equal((await request('/api/password-code', { purpose: 'reset', email: 'owner@example.test', code: token, password: 'other-password' })).code, 400);
        assert.equal((await request('/api/email-code', { email: 'owner@example.test', purpose: 'change' })).code, 401);
        await request('/api/email-code', { email: 'someone@example.test', purpose: 'change' }, { id: 1 });
        assert.equal(mail.at(-1).to, 'owner@example.test');
    } finally { db.close(); }
});
test('expired and exhausted codes fail; resend cooldown and unknown emails do not disclose accounts', async () => {
    const { db, mail, request, code } = setup();
    try {
        await request('/api/email-code', { email: 'owner@example.test', purpose: 'signup' });
        const token = code();
        await request('/api/email-code', { email: 'owner@example.test', purpose: 'signup' });
        assert.equal(mail.length, 1);
        db.prepare('UPDATE email_codes SET expires=0').run();
        assert.equal((await request('/api/signup', { email: 'owner@example.test', password: 'old-password', code: token })).code, 400);
        db.prepare('UPDATE email_codes SET expires=?, attempts=5').run(Date.now() + 10000);
        assert.equal((await request('/api/signup', { email: 'owner@example.test', password: 'old-password', code: token })).code, 400);
        const known = await request('/api/email-code', { email: 'owner@example.test', purpose: 'signup' });
        const unknown = await request('/api/email-code', { email: 'missing@example.test', purpose: 'signup' });
        assert.equal(known.code, 429);
        assert.ok(known.data.retryAfter > 0);
        assert.equal(unknown.code, 200);
        const resetKnown = await request('/api/email-code', { email: 'owner@example.test', purpose: 'reset' });
        const resetUnknown = await request('/api/email-code', { email: 'missing@example.test', purpose: 'reset' });
        assert.deepEqual(resetKnown.data, resetUnknown.data);
    } finally { db.close(); }
});

test('signup rejects existing accounts and delivery failures allow immediate retry', async () => {
    const normal = setup(), failed = setup(true);
    try {
        normal.db.prepare("INSERT INTO users(email,role,email_verified) VALUES(?,'user',1)").run('existing@example.test');
        assert.equal((await normal.request('/api/email-code', { email: 'existing@example.test', purpose: 'signup' })).code, 400);
        assert.equal(normal.mail.length, 0);
        assert.equal((await failed.request('/api/email-code', { email: 'new@example.test', purpose: 'signup' })).code, 503);
        assert.equal(failed.db.prepare('SELECT COUNT(*) AS count FROM email_codes').get().count, 0);
    } finally { normal.db.close(); failed.db.close(); }
});

test('Google code is bound to pending session and grants access only after successful verification', async () => {
    const { db, request, code, mail } = setup();
    try {
        db.prepare("INSERT INTO users(email,role,email_verified) VALUES(?,'user',1)").run('google@example.test');
        const pending = { userId: 1, nonce: 'session-one', expires: Date.now() + 600000 };
        assert.equal((await request('/api/google/email-code', {})).code, 401);
        assert.equal((await request('/api/google/email-code', {}, undefined, { ...pending, expires: 0 })).code, 401);
        const sent = await request('/api/google/email-code', { email: 'attacker@example.test' }, undefined, pending);
        assert.equal(sent.session.user, undefined);
        assert.equal(mail.at(-1).to, 'google@example.test');
        const token = code();
        assert.equal((await request('/api/google/email-code', {}, undefined, pending)).code, 429);
        assert.equal((await request('/api/google/verify-code', { code: token }, undefined, { ...pending, nonce: 'other-session' })).code, 400);
        assert.equal((await request('/api/google/verify-code', { code: '000000' }, undefined, pending)).session.user, undefined);
        const success = await request('/api/google/verify-code', { code: token }, undefined, pending);
        assert.equal(success.data.redirect, '/store.html?welcome=1');
        assert.equal(success.session.user.email, 'google@example.test');
        assert.equal(success.session.pendingGoogle, undefined);
        assert.equal((await request('/api/google/verify-code', { code: token }, undefined, pending)).code, 400);
    } finally { db.close(); }
});
