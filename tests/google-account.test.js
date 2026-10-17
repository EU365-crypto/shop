const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { resolveGoogleAccount } = require('../src/auth/google-account');
test('Google requires a verified email, creates verified customers and preserves existing credentials', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
        role TEXT, email_verified INTEGER, verification_token TEXT, verification_expires INTEGER)`);
    try {
        assert.equal(await resolveGoogleAccount(db, { emails: [{ value: 'new@example.test', verified: false }] }), null);
        const profile = { emails: [{ value: 'New@Example.test', verified: true }] };
        const created = await resolveGoogleAccount(db, profile);
        assert.equal(created.email_verified, 1);
        assert.equal(created.role, 'user');
        const existing = await resolveGoogleAccount(db, profile);
        assert.equal(existing.id, created.id);
        assert.equal(existing.password_hash, created.password_hash);
        db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(created.id);
        assert.equal((await resolveGoogleAccount(db, profile)).email_verified, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    } finally { db.close(); }
});
