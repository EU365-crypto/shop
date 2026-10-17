const session = require('express-session');
const crypto = require('node:crypto');
const net = require('node:net');

function sessionConfig(env = process.env) {
    const production = env.NODE_ENV === 'production';
    let secret = env.SESSION_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32 || new Set(secret).size < 12) {
        if (production) throw new Error('Production requires a randomly generated SESSION_SECRET of at least 32 bytes.');
        secret = crypto.randomBytes(48).toString('hex');
        console.warn('Using an ephemeral development session secret. Configure SESSION_SECRET to preserve sessions across restarts.');
    }
    const origin = new URL(env.BASE_URL || `http://localhost:${env.PORT || 3000}`).origin;
    if (production && !origin.startsWith('https://')) throw new Error('Production BASE_URL must use HTTPS.');
    const proxies = (env.TRUST_PROXY || '').split(',').map(value => value.trim()).filter(Boolean);
    for (const proxy of proxies) {
        const [address, prefix, extra] = proxy.split('/');
        const family = net.isIP(address);
        if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
            throw new Error('TRUST_PROXY must contain explicit trusted proxy IP addresses or CIDR ranges.');
        }
    }
    return { secret, production, origin, trustProxy: proxies.length ? proxies : false,
        cookie: { path: '/', httpOnly: true, secure: production, sameSite: 'lax' } };
}

// SQLite matches the application's existing single-host persistent architecture.
class SQLiteSessionStore extends session.Store {
    constructor(db, scope, { idleMs, absoluteMs, now = Date.now }) {
        super(); Object.assign(this, { db, scope, idleMs, absoluteMs, now });
        db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS auth_sessions (
            scope TEXT NOT NULL, sid TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL,
            PRIMARY KEY(scope,sid)); CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires)`);
        this.nextCleanup = 0;
    }
    expiry(value) {
        const now = this.now();
        return Math.min(value.cookie?.expires ? new Date(value.cookie.expires).getTime() : now + this.idleMs,
            (value.lastActivity || now) + this.idleMs, (value.createdAt || now) + this.absoluteMs);
    }
    cleanup() {
        if (this.now() >= this.nextCleanup) {
            this.db.prepare('DELETE FROM auth_sessions WHERE expires<=?').run(this.now());
            this.nextCleanup = this.now() + 60000;
        }
    }
    get(sid, callback) {
        try {
            this.cleanup();
            const row = this.db.prepare('SELECT data,expires FROM auth_sessions WHERE scope=? AND sid=?').get(this.scope, sid);
            if (!row || row.expires <= this.now()) {
                if (row) this.db.prepare('DELETE FROM auth_sessions WHERE scope=? AND sid=?').run(this.scope, sid);
                return callback(null, null);
            }
            callback(null, JSON.parse(row.data));
        } catch (error) { callback(error); }
    }
    set(sid, value, callback = () => {}) {
        try {
            this.cleanup();
            this.db.prepare(`INSERT INTO auth_sessions(scope,sid,data,expires) VALUES(?,?,?,?)
                ON CONFLICT(scope,sid) DO UPDATE SET data=excluded.data,expires=excluded.expires`)
                .run(this.scope, sid, JSON.stringify(value), this.expiry(value));
            callback();
        } catch (error) { callback(error); }
    }
    touch(sid, value, callback = () => {}) {
        try {
            this.db.prepare('UPDATE auth_sessions SET expires=? WHERE scope=? AND sid=?').run(this.expiry(value), this.scope, sid);
            callback();
        } catch (error) { callback(error); }
    }
    destroy(sid, callback = () => {}) {
        try { this.db.prepare('DELETE FROM auth_sessions WHERE scope=? AND sid=?').run(this.scope, sid); callback(); }
        catch (error) { callback(error); }
    }
}

function csrfProtection(config) {
    return (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        // Custom headers cannot be sent by cross-origin forms. Do not enable credentialed CORS.
        if (req.get('X-CSRF-Protection') !== '1' ||
            (req.get('Origin') && req.get('Origin') !== config.origin) ||
            ['cross-site', 'same-site'].includes(req.get('Sec-Fetch-Site'))) {
            return res.status(403).json({ message: 'Request rejected. Reload this page and try again.' });
        }
        next();
    };
}
function installSessions(app, db, chooseAdmin, config = sessionConfig()) {
    app.set('trust proxy', config.trustProxy);
    app.use((req, res, next) => {
        if (config.production && !req.secure) return res.status(400).json({ message: 'HTTPS is required.' });
        next();
    });
    app.use(csrfProtection(config));
    const middleware = {};
    for (const scope of ['customer', 'admin']) {
        const idleMs = scope === 'admin' ? 15 * 60000 : 30 * 60000;
        const absoluteMs = scope === 'admin' ? 4 * 3600000 : 8 * 3600000;
        middleware[scope] = session({ secret: config.secret, name: scope + '.sid',
            store: new SQLiteSessionStore(db, scope, { idleMs, absoluteMs }),
            resave: false, saveUninitialized: false, rolling: true,
            cookie: { ...config.cookie, maxAge: idleMs } });
    }
    app.use((req, res, next) => {
        req.sessionScope = chooseAdmin(req) ? 'admin' : 'customer';
        middleware[req.sessionScope](req, res, next);
    });
    app.use((req, res, next) => {
        req.session.createdAt ||= Date.now();
        const background = ['/api/me', '/api/admin/me', '/api/profile', '/api/email/unread', '/api/catalog', '/api/categories', '/api/tax', '/api/sign-in-greeting'];
        const messagePoll = req.method === 'GET' && /^\/api\/(?:messages|admin\/message-center)(?:\/\d+)?$/.test(req.path);
        if (!req.session.lastActivity || (!background.includes(req.path) && !messagePoll)) req.session.lastActivity = Date.now();
        const idleMs = req.sessionScope === 'admin' ? 15 * 60000 : 30 * 60000;
        const absoluteMs = req.sessionScope === 'admin' ? 4 * 3600000 : 8 * 3600000;
        req.session.cookie.maxAge = Math.max(0, Math.min(req.session.lastActivity + idleMs, req.session.createdAt + absoluteMs) - Date.now());
        next();
    });
    return config;
}
async function establishSession(req, user) {
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.createdAt = req.session.lastActivity = Date.now();
    req.session.user = { id: user.id, email: user.email, role: user.role };
}
function saveSession(req) {
    return new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}
function logoutSession(req, res, next, config) {
    req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie(req.sessionScope + '.sid', config.cookie);
        res.json({ success: true });
    });
}
module.exports = { sessionConfig, SQLiteSessionStore, csrfProtection, installSessions, establishSession, saveSession, logoutSession };
