const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function registerEmailSecurity(app, db, mailer, from, onGoogleSignIn = () => {}) {
    db.exec(`CREATE TABLE IF NOT EXISTS email_codes (
        user_id TEXT NOT NULL, purpose TEXT NOT NULL, hash TEXT NOT NULL,
        expires INTEGER NOT NULL, sent INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, purpose)
    )`);
    const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
    const hash = (id, purpose, code) => crypto.createHmac('sha256', secret).update(`${id}:${purpose}:${code}`).digest('hex');
    const userByEmail = email => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const cleanEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
    const send = (email, subject, text) => mailer.sendMail({ from, to: email, subject: `HongKong Supermarket — ${subject}`, text });
    const notify = async (email, text) => {
        try { await send(email, 'Account notification', text); }
        catch { console.error('Account notification email could not be delivered.'); }
    };
    async function issue(user, purpose) {
        const previous = db.prepare('SELECT sent FROM email_codes WHERE user_id = ? AND purpose = ?').get(user.id, purpose);
        if (previous && Date.now() - previous.sent < 60000) return false;
        const code = String(crypto.randomInt(100000, 1000000));
        const digest = hash(user.id, purpose, code);
        db.prepare(`INSERT INTO email_codes(user_id,purpose,hash,expires,sent,attempts) VALUES(?,?,?,?,?,0)
            ON CONFLICT(user_id,purpose) DO UPDATE SET hash=excluded.hash, expires=excluded.expires, sent=excluded.sent, attempts=0`)
            .run(user.id, purpose, digest, Date.now() + 600000, Date.now());
        try {
            await send(user.email, purpose.startsWith('google:') ? 'Google sign-in verification code' : purpose === 'signup' ? 'Verify your email' : 'Password verification code',
                `Your ${purpose.startsWith('google:') ? 'Google sign-in' : purpose === 'signup' ? 'email verification' : 'password'} code is ${code}.\nIt expires in 10 minutes.\nIf you did not request this, ignore this email. Never share your code.`);
        } catch (error) {
            db.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND hash = ?').run(user.id, purpose, digest);
            throw error;
        }
        return true;
    }
    function consume(user, purpose, code, remove = true) {
        const saved = db.prepare('SELECT * FROM email_codes WHERE user_id = ? AND purpose = ?').get(user.id, purpose);
        if (!saved || saved.expires <= Date.now() || saved.attempts >= 5) return false;
        if (typeof code !== 'string' || !/^\d{6}$/.test(code) ||
            !crypto.timingSafeEqual(Buffer.from(saved.hash, 'hex'), Buffer.from(hash(user.id, purpose, code), 'hex'))) {
            db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?').run(user.id, purpose);
            return false;
        }
        if (remove) db.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?').run(user.id, purpose);
        return true;
    }
    const guard = handler => async (req, res) => {
        try { await handler(req, res); }
        catch (error) {
            console.error('Verification email failed:', error.code || 'EMAIL_ERROR', error.responseCode || '');
            res.status(503).json({ message: 'Could not send email. Please try again later.' });
        }
    };
    const invalidCode = res => res.status(400).json({ message: 'Invalid or expired code. Request a new code.' });
    const requests = new Map();
    db.exec(`CREATE TABLE IF NOT EXISTS email_security_settings (id INTEGER PRIMARY KEY CHECK(id=1), rate_limit INTEGER NOT NULL DEFAULT 1);
        INSERT OR IGNORE INTO email_security_settings(id) VALUES(1)`);
    const enabled = () => Boolean(db.prepare('SELECT rate_limit FROM email_security_settings WHERE id=1').get().rate_limit);
    const admin = (req, res, next) => req.session?.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access only.' });
    app.get('/api/admin/email-security', admin, (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ rateLimitEnabled: enabled() });
    });
    app.put('/api/admin/email-security', admin, (req, res) => {
        if (typeof req.body?.rateLimitEnabled !== 'boolean') return res.status(400).json({ message: 'Invalid setting.' });
        db.prepare('UPDATE email_security_settings SET rate_limit=? WHERE id=1').run(Number(req.body.rateLimitEnabled));
        requests.clear();
        res.json({ rateLimitEnabled: enabled() });
    });
    app.use(['/api/signup', '/api/email-code', '/api/verify-code', '/api/password-code', '/api/google/email-code', '/api/google/verify-code'], (req, res, next) => {
        if (!enabled()) return next();
        const now = Date.now();
        for (const [key, entry] of requests) if (entry.expires <= now) requests.delete(key);
        const key = req.ip;
        const entry = requests.get(key) || { count: 0, expires: now + 900000 };
        requests.set(key, entry);
        if (++entry.count > 30) return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        next();
    });
    app.post('/api/signup', guard(async (req, res) => {
        const email = cleanEmail(req.body?.email), password = req.body?.password;
        if (!email || typeof password !== 'string' || password.length < 8 || password.length > 72) {
            return res.status(400).json({ message: 'Use a valid email and a password of 8–72 characters.' });
        }
        let user = userByEmail(email);
        if (user?.email_verified || user?.role === 'admin') return res.status(400).json({ message: 'An account already exists with this email.' });
        const passwordHash = await bcrypt.hash(password, 12);
        user = userByEmail(email);
        if (user?.email_verified || user?.role === 'admin') return res.status(400).json({ message: 'An account already exists with this email.' });
        if (!consume(user || { id: 'signup:' + email }, 'signup', req.body?.code)) return invalidCode(res);
        if (user) db.prepare('UPDATE users SET password_hash=?, email_verified=1, verification_token=NULL, verification_expires=NULL WHERE id=?').run(passwordHash, user.id);
        else db.prepare(`INSERT INTO users(email,password_hash,role,email_verified) VALUES(?,?,'user',1)`).run(email, passwordHash);
        await notify(email, 'Your email has been verified. Welcome to HongKong Supermarket!');
        res.json({ success: true, message: 'Email verified. You can now sign in.' });
    }));
    app.post('/api/email-code', guard(async (req, res) => {
        let email = cleanEmail(req.body?.email);
        const purpose = req.body?.purpose;
        if (!email || !['signup', 'reset', 'change'].includes(purpose)) return res.status(400).json({ message: 'Enter a valid email.' });
        if (purpose === 'change' && !req.session?.user) return res.status(401).json({ message: 'Please sign in first.' });
        const user = purpose === 'change'
            ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id) : userByEmail(email);
        if (purpose === 'signup' && (user?.email_verified || user?.role === 'admin')) return res.status(400).json({ message: 'An account already exists with this email.' });
        const target = user || (purpose === 'signup' ? { id: 'signup:' + email, email } : null);
        if (target && !(await issue(target, purpose)) && purpose === 'signup') {
            const saved = db.prepare('SELECT sent FROM email_codes WHERE user_id=? AND purpose=?').get(target.id, purpose);
            return res.status(429).json({ message: 'Check your email for a verification code.', retryAfter: Math.max(1, Math.ceil((saved.sent + 60000 - Date.now()) / 1000)) });
        }
        res.json({ message: 'Check your email for a verification code. You can request a new code in 60 seconds.' });
    }));
    app.post('/api/verify-code', guard(async (req, res) => {
        const user = userByEmail(cleanEmail(req.body?.email));
        if (!user || !consume(user, 'signup', req.body?.code)) return invalidCode(res);
        db.prepare('UPDATE users SET email_verified=1, verification_token=NULL, verification_expires=NULL WHERE id=?').run(user.id);
        await notify(user.email, 'Your email has been verified. Welcome to HongKong Supermarket!');
        res.json({ success: true, message: 'Email verified. You can now sign in.' });
    }));
    app.post('/api/password-code', guard(async (req, res) => {
        const purpose = req.body?.purpose;
        if (!['reset', 'change'].includes(purpose)) return invalidCode(res);
        if (purpose === 'change' && !req.session?.user) return res.status(401).json({ message: 'Please sign in first.' });
        const user = purpose === 'change' ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id) : userByEmail(cleanEmail(req.body?.email));
        const password = req.body?.password;
        if (typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ message: 'Use a valid email and a password of 8–72 characters.' });
        // Hash before consuming the code so concurrent requests cannot reuse it.
        if (!user || !consume(user, purpose, req.body?.code, false)) return invalidCode(res);
        if (await bcrypt.compare(password, user.password_hash)) {
            return res.status(400).json({ message: 'Your new password must be different from your current password.' });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        if (!user || !consume(user, purpose, req.body?.code)) return invalidCode(res);
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
        db.prepare("DELETE FROM email_codes WHERE user_id=? AND purpose IN ('reset','change')").run(user.id);
        await notify(user.email, 'Your password was changed. If this was not you, reset your password immediately.');
        res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
    }));
    const pendingUser = req => {
        const pending = req.session?.pendingGoogle;
        if (!pending || pending.expires <= Date.now()) return null;
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(pending.userId);
        return user && user.role !== 'admin' ? user : null;
    };
    app.get('/api/google/verification', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const user = pendingUser(req);
        if (!user) return res.status(401).json({ message: 'Please sign in first.' });
        res.json({ email: user.email });
    });
    app.post('/api/google/email-code', guard(async (req, res) => {
        const user = pendingUser(req);
        if (!user) return res.status(401).json({ message: 'Please sign in first.' });
        const purpose = 'google:' + req.session.pendingGoogle.nonce;
        const sent = await issue(user, purpose);
        const saved = db.prepare('SELECT sent FROM email_codes WHERE user_id=? AND purpose=?').get(user.id, purpose);
        res.status(sent ? 200 : 429).json({ message: 'Check your email for a verification code.', retryAfter: Math.max(1, Math.ceil((saved.sent + 60000 - Date.now()) / 1000)) });
    }));
    app.post('/api/google/verify-code', guard(async (req, res) => {
        const user = pendingUser(req);
        if (!user) return res.status(401).json({ message: 'Please sign in first.' });
        if (!consume(user, 'google:' + req.session.pendingGoogle.nonce, req.body?.code)) return invalidCode(res);
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.createdAt = req.session.lastActivity = Date.now();
        req.session.user = { id: user.id, email: user.email, role: user.role };
        onGoogleSignIn(req, user.id);
        if (req.session.save) await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.json({ success: true, redirect: '/store.html?welcome=1' });
    }));
    return { resetRequestLimits: () => requests.clear() };
}
module.exports = { registerEmailSecurity };
