const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoreMailer } = require('../src/mail/store-mailer');
function fixture(env, admin = () => false) {
    const sent = [], configs = [];
    const mailer = createStoreMailer({ createTransport(config) { configs.push(config); return { verify: async () => true, sendMail: async mail => { sent.push(mail); return {}; } }; } }, env, admin);
    return { mailer, sent, configs };
}
test('all email types use the authenticated store identity despite route-level overrides', async () => {
    const f = fixture({ STORE_EMAIL: 'store.noreply@gmail.com', STORE_EMAIL_APP_PASSWORD: 'synthetic-app-password', GMAIL_USER: 'old-admin@gmail.com', GMAIL_APP_PASSWORD: 'old-password' });
    for (const subject of ['Verification code', 'Guest contact verification', 'Google sign-in', 'Password reset', 'Admin reply', 'Login notification']) {
        await f.mailer.sendMail({ from: 'admin@private.example', sender: 'admin@private.example', envelope: { from: 'admin@private.example' }, to: 'customer@example.com', subject, text: 'Test' });
    }
    assert.deepEqual(f.configs[0].auth, { user: 'store.noreply@gmail.com', pass: 'synthetic-app-password' });
    for (const mail of f.sent) { assert.deepEqual(mail.from, { name: 'HongKong Supermarket', address: 'store.noreply@gmail.com' }); assert.equal(mail.sender, 'store.noreply@gmail.com'); assert.doesNotMatch(JSON.stringify(mail), /admin@private/); }
});
test('store credentials cannot fall back to a different account and personal administrator senders are blocked', async () => {
    const missing = fixture({ STORE_EMAIL: 'store@gmail.com', GMAIL_APP_PASSWORD: 'wrong-account-password' });
    await assert.rejects(missing.mailer.verify(), { code: 'ESTORESENDER' });
    const personal = fixture({ GMAIL_USER: 'admin@gmail.com', GMAIL_APP_PASSWORD: 'synthetic-password' }, () => true);
    await assert.rejects(personal.mailer.sendMail({ to: 'customer@example.com' }), { code: 'ESTORESENDER' }); assert.equal(personal.sent.length, 0);
    const legacy = fixture({ GMAIL_USER: 'store@gmail.com', GMAIL_APP_PASSWORD: 'synthetic-password' }); await legacy.mailer.verify();
});

test('connection failures use secure STARTTLS fallback without retrying submitted messages', async () => {
    const configs = [], sent = [];
    let command = 'CONN';
    const mailer = createStoreMailer({ createTransport(config) {
        configs.push(config);
        return { verify: async () => { if (config.port === 465) throw { code: 'ESOCKET', command }; return true; },
            sendMail: async mail => { sent.push(config.port); if (config.port === 465) throw { code: 'ESOCKET', command }; return { accepted: [mail.to] }; } };
    } }, { STORE_EMAIL: 'store@gmail.com', STORE_EMAIL_APP_PASSWORD: 'synthetic-password' });
    assert.equal(await mailer.verify(), true);
    assert.equal(configs[1].port, 587); assert.equal(configs[1].requireTLS, true);
    await mailer.sendMail({ to: 'customer@example.com' }); assert.deepEqual(sent, [465, 587]);
    command = 'DATA'; sent.length = 0;
    await assert.rejects(mailer.sendMail({ to: 'customer@example.com' }), error => error.command === 'DATA');
    assert.deepEqual(sent, [465]);
});
