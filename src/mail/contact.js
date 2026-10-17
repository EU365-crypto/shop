const crypto = require('node:crypto');
const { prepareRequestPhoto, sendPhotoPreview } = require('../media/request-photo');
function registerContactMail(app, transporter, sender, recipient, db) {
    db.exec('CREATE TABLE IF NOT EXISTS email_security_settings (id INTEGER PRIMARY KEY CHECK(id=1), rate_limit INTEGER NOT NULL DEFAULT 1); INSERT OR IGNORE INTO email_security_settings(id) VALUES(1)');
    const limitsEnabled = () => Boolean(db.prepare('SELECT rate_limit FROM email_security_settings WHERE id=1').get().rate_limit);
    db.exec('CREATE TABLE IF NOT EXISTS contact_images(id INTEGER PRIMARY KEY,contact_message_id INTEGER NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS contact_email_codes(owner TEXT PRIMARY KEY,email TEXT NOT NULL,hash TEXT NOT NULL,expires INTEGER NOT NULL,sent INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,verified INTEGER NOT NULL DEFAULT 0)');
    const codeSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
    const cleanEmail = value => typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
    const digest = (owner, email, code) => crypto.createHmac('sha256', codeSecret).update(JSON.stringify([owner, email, code])).digest('hex');
    const account = req => req.session?.user && db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.session.user.id);
    db.exec('CREATE TABLE IF NOT EXISTS contact_drafts(user_id INTEGER NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,type))');
    app.get('/api/contact/drafts/:type', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!account(req)) return res.status(401).json({ message: 'Please sign in first.' });
        if (!['email', 'request', 'partnership'].includes(req.params.type)) return res.status(400).json({ message: 'Invalid contact type.' });
        const saved = db.prepare('SELECT payload FROM contact_drafts WHERE user_id=? AND type=?').get(req.session.user.id, req.params.type);
        res.json({ draft: saved ? JSON.parse(saved.payload) : null });
    });
    app.post('/api/contact/drafts/:type', (req, res) => {
        if (!account(req)) return res.status(401).json({ message: 'Please sign in first.' });
        const type = req.params.type;
        if (!['email', 'request', 'partnership'].includes(type)) return res.status(400).json({ message: 'Invalid contact type.' });
        if (req.body?.clear === true) { db.prepare('DELETE FROM contact_drafts WHERE user_id=? AND type=?').run(req.session.user.id, type); return res.json({ saved: true }); }
        const { name = '', message = '', productName = '', image = null, imageName = '' } = req.body || {};
        if (typeof name !== 'string' || name.length > 100 || typeof message !== 'string' || message.length > 3000 || typeof productName !== 'string' || productName.length > 200 || typeof imageName !== 'string' || imageName.length > 255 || (image !== null && (typeof image !== 'string' || image.length > Math.ceil(10 * 1024 * 1024 * 4 / 3) + 100 || !/^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream)?;base64,[A-Za-z0-9+/]+={0,2}$/i.test(image)))) return res.status(400).json({ message: 'Invalid draft.' });
        db.prepare('INSERT INTO contact_drafts(user_id,type,payload) VALUES(?,?,?) ON CONFLICT(user_id,type) DO UPDATE SET payload=excluded.payload').run(req.session.user.id, type, JSON.stringify({ name, message, productName, image, imageName }));
        res.json({ saved: true });
    });
    app.post('/api/contact/preview-image', sendPhotoPreview);
    const owner = req => { if (!req.session) throw new Error('Session required'); return req.session.contactCodeOwner ||= crypto.randomBytes(32).toString('hex'); };
    const verificationRequests = new Map();
    app.get('/api/contact/identity', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const user = account(req);
        if (req.session?.user) {
            const hasProfiles = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_profiles'").get();
            const profile = user && hasProfiles ? db.prepare('SELECT first_name,last_name FROM account_profiles WHERE user_id=?').get(req.session.user.id) : null;
            return res.json({ signedIn: true, email: user?.email || '', verified: Boolean(user?.email_verified), firstName: profile?.first_name || '', lastName: profile?.last_name || '' });
        }
        // Guest verification state is used only for checking codes, never for restoring form fields.
        res.json({ signedIn: false, email: '', verified: false });
    });
    app.post('/api/contact/reset-verification', (req, res) => {
        if (!req.session?.user && req.session?.contactCodeOwner) {
            db.prepare('DELETE FROM contact_email_codes WHERE owner=? AND verified<>2').run(req.session.contactCodeOwner);
            delete req.session.contactCodeOwner;
        }
        res.json({ reset: true });
    });
    app.post('/api/contact/code', async (req, res) => {
        if (req.session?.user) {
            if (!account(req)?.email_verified) return res.status(403).json({ message: 'Verify your email before sending.' });
            return res.json({ verified: true, message: 'Your signed-in account email is already verified.' });
        }
        const email = cleanEmail(req.body?.email);
        if (!email) return res.status(400).json({ message: 'Enter a valid email.' });
        const now = Date.now();
        for (const [key, entry] of verificationRequests) if (entry.expires <= now) verificationRequests.delete(key);
        const limit = verificationRequests.get(req.ip) || { count: 0, expires: now + 900000 };
        verificationRequests.set(req.ip, limit);
        if (limitsEnabled() && ++limit.count > 10) return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        const id = owner(req), previous = db.prepare('SELECT sent FROM contact_email_codes WHERE owner=?').get(id);
        if (previous && now - previous.sent < 60000) return res.status(429).json({ message: 'Wait one minute before requesting another code.', retryAfter: Math.ceil((60000 - (now - previous.sent)) / 1000) });
        const code = String(crypto.randomInt(100000, 1000000)), hash = digest(id, email, code);
        db.prepare('DELETE FROM contact_email_codes WHERE expires<?').run(now);
        db.prepare('INSERT INTO contact_email_codes(owner,email,hash,expires,sent) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET email=excluded.email,hash=excluded.hash,expires=excluded.expires,sent=excluded.sent,attempts=0,verified=0').run(id, email, hash, now + 600000, now);
        try {
            if (!sender) throw new Error('Mail unavailable');
            const delivery = await transporter.sendMail({ from: sender, to: email, subject: 'HongKong Supermarket - Verify your contact email', text: `Your email verification code is ${code}. It expires in 10 minutes.\nReturn to the contact form, verify the code, then click Send Message.\nIf you did not request this, ignore this email.` });
            if (delivery?.rejected?.some(address => String(address).toLowerCase() === email)) throw Object.assign(new Error('Verification recipient rejected'), { code: 'EENVELOPE' });
            res.json({ message: 'Check your email for a verification code.', retryAfter: 60 });
        } catch (error) { console.error('Contact verification delivery failed:', ['EAUTH', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EENVELOPE', 'ESTORESENDER'].includes(error.code) ? error.code : 'EMAIL_ERROR'); db.prepare('DELETE FROM contact_email_codes WHERE owner=? AND hash=?').run(id, hash); res.status(503).json({ message: 'Could not send verification email. Please try again later.' }); }
    });
    app.post('/api/contact/verify', (req, res) => {
        const email = cleanEmail(req.body?.email), code = req.body?.code;
        const id = req.session?.contactCodeOwner, saved = id && db.prepare('SELECT * FROM contact_email_codes WHERE owner=?').get(id);
        if (!saved || saved.verified || saved.email !== email || saved.expires <= Date.now() || saved.attempts >= 5) return res.status(400).json({ message: 'Invalid or expired code. Request a new code.' });
        if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(saved.hash, 'hex'), Buffer.from(digest(id, email, code), 'hex'))) {
            db.prepare('UPDATE contact_email_codes SET attempts=attempts+1 WHERE owner=?').run(id);
            return res.status(400).json({ message: 'Invalid or expired code. Request a new code.' });
        }
        db.prepare("UPDATE contact_email_codes SET verified=1,hash='' WHERE owner=?").run(id);
        res.json({ verified: true, message: 'Email verified. Click Send Message to send your message.' });
    });
    if (db) db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
        message TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    if (db) db.exec(`CREATE TABLE IF NOT EXISTS contact_replies (
        id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, admin_id INTEGER NOT NULL,
        body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const subjects = { partnership: 'Partnership Inquiry', request: 'Order or Item Request', email: 'Email Us' };
    for (const [table, column] of [['contact_messages', 'admin_read'], ['contact_replies', 'user_read']]) {
        if (!db.prepare(`PRAGMA table_info(${table})`).all().some(field => field.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
        }
    }
    app.get('/api/email/unread', (req, res) => {
        if (!req.session?.user) return res.status(401).json({ message: 'Please sign in first.' });
        res.set('Cache-Control', 'no-store');
        const user = db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.session.user.id);
        if (!user || !user.email_verified) return res.status(403).json({ message: 'Please verify your email first.' });
        const count = db.prepare(`SELECT COUNT(*) AS count FROM contact_replies r JOIN contact_messages m ON m.id=r.message_id
            WHERE lower(m.email)=? AND r.user_read=0`).get(user.email.toLowerCase()).count;
        const admin = {};
        if (req.session.user.role === 'admin') {
            for (const type of ['email','request','partnership']) admin[type] = db.prepare('SELECT COUNT(*) AS count FROM contact_messages WHERE type=? AND admin_read=0').get(type).count;
        }
        res.json({ count, admin });
    });
    app.post('/api/email/read', (req, res) => {
        if (!req.session?.user) return res.status(401).json({ message: 'Please sign in first.' });
        const { scope, type, through } = req.body || {};
        if (!Number.isSafeInteger(through) || through < 0) return res.status(400).json({ message: 'Invalid setting.' });
        if (scope === 'admin') {
            if (req.session.user.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
            if (!Object.hasOwn(subjects, type)) return res.status(400).json({ message: 'Invalid setting.' });
            db.prepare('UPDATE contact_messages SET admin_read=1 WHERE type=? AND id<=?').run(type, through);
        } else {
            const user = db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.session.user.id);
            if (!user?.email_verified) return res.status(403).json({ message: 'Please verify your email first.' });
            db.prepare(`UPDATE contact_replies SET user_read=1 WHERE id<=? AND message_id IN
                (SELECT id FROM contact_messages WHERE lower(email)=?)`).run(through, user.email.toLowerCase());
        }
        res.json({ success: true });
    });
    app.get('/api/account/messages', (req, res) => {
        if (!req.session?.user) return res.status(401).json({ message: 'Please sign in first.' });
        res.set('Cache-Control', 'no-store');
        const user = db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.session.user.id);
        if (!user || !user.email_verified) return res.status(403).json({ message: 'Please verify your email first.' });
        const messages = db.prepare('SELECT id,type,message,created FROM contact_messages WHERE lower(email)=? ORDER BY id DESC LIMIT 200').all(user.email.toLowerCase());
        for (const message of messages) {
            message.subject = subjects[message.type];
            message.replies = db.prepare('SELECT id,body,created FROM contact_replies WHERE message_id=? ORDER BY id').all(message.id);
        }
        res.json({ messages, senderName: 'HongKong Supermarket' });
    });
    app.get('/api/admin/messages', (req, res) => {
        if (req.session?.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
        res.set('Cache-Control', 'no-store');
        const type = ['email', 'request', 'partnership'].includes(req.query.type) ? req.query.type : 'email';
        const messages = db.prepare('SELECT * FROM contact_messages WHERE type=? ORDER BY id DESC LIMIT 200').all(type);
        for (const message of messages) {
            message.subject = subjects[message.type];
            message.replies = db.prepare('SELECT id, body, created FROM contact_replies WHERE message_id=? ORDER BY id').all(message.id);
        }
        res.json({ messages });
    });
    app.post('/api/admin/messages/:id/reply', (req, res) => {
        if (req.session?.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
        res.status(410).json({ message: 'Reply through the updated EasyShop message center at /admin/emails.' });
    });
    const requests = new Map();
    app.post('/api/contact', async (req, res) => {
        const { name, type } = req.body || {};
        let message = req.body?.message, image, rawImage;
        if (type === 'request' && req.body.productName !== undefined) {
            const productName = req.body.productName;
            if (typeof productName !== 'string' || productName.length > 200) return res.status(400).json({ message: 'Enter a product name.' });
            if (!productName.trim() && !req.body.image) return res.status(400).json({ message: 'Add a product name or image.' });
            message = productName.trim() ? 'Product name: ' + productName.trim() : 'Product image request';
        }
        if (req.body?.image !== null && req.body?.image !== undefined) rawImage = req.body.image;
        let email = req.body?.email;
        if (req.session?.user) {
            const account = db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.session.user.id);
            if (!account?.email_verified) return res.status(403).json({ message: 'Verify your email before sending.' });
            email = account.email;
        }
        if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof message !== 'string' || !message.trim() || message.length > 3000 || !Object.hasOwn(subjects, type)) {
            return res.status(400).json({ message: 'Please fill out all contact fields correctly.' });
        }
        let guestOwner;
        if (!req.session?.user) {
            guestOwner = req.session?.contactCodeOwner;
            const verified = guestOwner && db.prepare('SELECT * FROM contact_email_codes WHERE owner=?').get(guestOwner);
            if (!verified || verified.verified !== 1 || verified.email !== cleanEmail(email) || verified.expires <= Date.now()) return res.status(403).json({ message: 'Verify your email before sending.', verificationRequired: true });
            email = verified.email;
        }
        const now = Date.now();
        for (const [key, entry] of requests) if (entry.expires <= now) requests.delete(key);
        const entry = requests.get(req.ip) || { count: 0, expires: now + 900000 };
        requests.set(req.ip, entry);
        if (limitsEnabled() && ++entry.count > 5) return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        if (guestOwner && !db.prepare('UPDATE contact_email_codes SET verified=2 WHERE owner=? AND verified=1').run(guestOwner).changes) return res.status(409).json({ message: 'A message is already being sent.' });
        try {
            if (rawImage !== undefined) image = await prepareRequestPhoto(rawImage);
            if (!sender || !recipient) throw new Error('Missing mail configuration');
            await transporter.sendMail({ from: sender, to: recipient, replyTo: email,
                subject: `HongKong Supermarket - ${subjects[type]}`, text: `Name: ${name.trim()}\nEmail: ${email}\nMessage:\n${message.trim()}`, ...(image ? { attachments: [{ filename: image.filename, content: image.content, contentType: image.mime }] } : {}) });
            db.exec('BEGIN IMMEDIATE');
            try {
                const inserted = db.prepare('INSERT INTO contact_messages(type,name,email,message) VALUES(?,?,?,?)').run(type, name.trim(), email, message.trim());
                if (image) db.prepare('INSERT INTO contact_images(contact_message_id,mime,content) VALUES(?,?,?)').run(Number(inserted.lastInsertRowid), image.mime, image.content);
                if (req.session?.user) db.prepare('DELETE FROM contact_drafts WHERE user_id=? AND type=?').run(req.session.user.id, type);
                db.exec('COMMIT');
            } catch(error) { db.exec('ROLLBACK'); throw error; }
            if (guestOwner) db.prepare('DELETE FROM contact_email_codes WHERE owner=? AND verified=2').run(guestOwner);
            res.json({ message: 'Your message has been sent. Thank you!' });
        } catch(error) { if (guestOwner) db.prepare('UPDATE contact_email_codes SET verified=1 WHERE owner=? AND verified=2').run(guestOwner); res.status(error.status || 502).json({ message: error.status ? error.message : 'Could not send your message. Please try again later.' }); }
    });
    return { resetRequestLimits: () => { verificationRequests.clear(); requests.clear(); } };
}
module.exports = { registerContactMail };
