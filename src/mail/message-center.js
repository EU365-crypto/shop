const crypto = require('node:crypto');
const { prepareRequestPhoto, sendPhotoPreview } = require('../media/request-photo');
const emailValid = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function registerMessageCenter(app, db, mailer, options = {}) {
    db.exec('CREATE TABLE IF NOT EXISTS contact_images(id INTEGER PRIMARY KEY,contact_message_id INTEGER NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL); CREATE INDEX IF NOT EXISTS contact_image_message ON contact_images(contact_message_id)');
    db.exec('CREATE TABLE IF NOT EXISTS mc_images(id INTEGER PRIMARY KEY,message_id INTEGER NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,source_hash TEXT NOT NULL); CREATE INDEX IF NOT EXISTS mc_image_message ON mc_images(message_id)');
    db.exec(`CREATE TABLE IF NOT EXISTS mc_conversations(id INTEGER PRIMARY KEY,legacy_id INTEGER UNIQUE,customer_id INTEGER,customer_email TEXT NOT NULL,subject TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'email',created INTEGER NOT NULL,updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS mc_messages(id INTEGER PRIMARY KEY,conversation_id INTEGER NOT NULL,sender_id INTEGER,sender_role TEXT NOT NULL,sender_email TEXT NOT NULL,recipient_email TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,delivery TEXT NOT NULL,provider_id TEXT,request_key TEXT,legacy_reply_id INTEGER UNIQUE,error TEXT,UNIQUE(sender_id,request_key));
        CREATE TABLE IF NOT EXISTS mc_participants(conversation_id INTEGER NOT NULL,user_id INTEGER NOT NULL,read_through INTEGER NOT NULL DEFAULT 0,trashed INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,hidden_through INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(conversation_id,user_id));
        CREATE TABLE IF NOT EXISTS mc_drafts(user_id INTEGER NOT NULL,draft_key TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,request_key TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,draft_key));
        CREATE TABLE IF NOT EXISTS mc_outbox(message_id INTEGER PRIMARY KEY,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS mc_limits(user_id INTEGER PRIMARY KEY,verification_sent INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS mc_customer ON mc_conversations(customer_id,updated DESC,id DESC);
        CREATE INDEX IF NOT EXISTS mc_updated ON mc_conversations(updated DESC,id DESC);
        CREATE INDEX IF NOT EXISTS mc_history ON mc_messages(conversation_id,id);
        CREATE INDEX IF NOT EXISTS mc_sender_time ON mc_messages(sender_id,created);
        CREATE INDEX IF NOT EXISTS mc_queue ON mc_outbox(state,updated);`);
    if (!db.prepare('PRAGMA table_info(mc_participants)').all().some(column => column.name === 'hidden_through')) db.exec('ALTER TABLE mc_participants ADD COLUMN hidden_through INTEGER NOT NULL DEFAULT 0');
    if (!db.prepare('PRAGMA table_info(mc_drafts)').all().some(column => column.name === 'image')) db.exec('ALTER TABLE mc_drafts ADD COLUMN image TEXT; ALTER TABLE mc_drafts ADD COLUMN image_name TEXT');
    if (!db.prepare('PRAGMA table_info(mc_drafts)').all().some(column => column.name === 'recipient')) db.exec('ALTER TABLE mc_drafts ADD COLUMN recipient TEXT');
    const transact = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
    const identity = req => req.session?.user && db.prepare('SELECT id,email,role,email_verified FROM users WHERE id=?').get(req.session.user.id);
    const readConversation = (id, user, includeDeleted = false) => db.prepare(`SELECT c.*,COALESCE(p.read_through,0) AS read_through,COALESCE(p.trashed,0) AS trashed,COALESCE(p.deleted,0) AS deleted,COALESCE(p.hidden_through,0) AS hidden_through FROM mc_conversations c LEFT JOIN mc_participants p ON p.conversation_id=c.id AND p.user_id=? WHERE c.id=? AND (?='admin' OR c.customer_id=?) ${includeDeleted ? '' : 'AND COALESCE(p.deleted,0)=0'}`).get(user.id, id, user.role, user.id);
    const participant = (id, user) => db.prepare('INSERT OR IGNORE INTO mc_participants(conversation_id,user_id) VALUES(?,?)').run(id, user.id);
    const presentMessage = (message, user) => {
        if (!message) return message;
        const result = { ...message, can_retry: message.sender_id === user.id };
        if (message.sender_role === 'user') {
            let name = '';
            if (message.sender_id && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_profiles'").get()) {
                const profile = db.prepare('SELECT first_name,last_name FROM account_profiles WHERE user_id=?').get(message.sender_id);
                name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
            }
            if (!name && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_messages'").get()) {
                name = db.prepare('SELECT m.name FROM contact_messages m JOIN mc_conversations c ON c.legacy_id=m.id WHERE c.id=?').get(message.conversation_id)?.name || '';
            }
            result.sender_name = name || 'Customer';
        }
        if (user.role !== 'admin') {
            if (message.sender_role === 'admin') {
                result.sender_email = 'HongKong Supermarket';
                result.sender_id = null;
                result.request_key = null;
            } else result.recipient_email = 'HongKong Supermarket';
        }
        return result;
    };
    function importLegacy() {
        if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_messages'").get()) return;
        transact(() => {
            const originals = db.prepare('SELECT m.* FROM contact_messages m LEFT JOIN mc_conversations c ON c.legacy_id=m.id WHERE c.id IS NULL ORDER BY m.id').all();
            for (const old of originals) {
                const customer = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?) AND role=?').get(old.email, 'user');
                const subject = { email: 'Email Us', request: 'Order or Item Request', partnership: 'Partnership Inquiry' }[old.type] || 'Store support';
                const created = Date.parse(old.created + 'Z') || Date.now();
                const id = Number(db.prepare('INSERT INTO mc_conversations(legacy_id,customer_id,customer_email,subject,type,created,updated) VALUES(?,?,?,?,?,?,?)').run(old.id, customer?.id ?? null, old.email, subject, old.type, created, created).lastInsertRowid);
                const inserted = db.prepare('INSERT INTO mc_messages(conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery) VALUES(?,?,?,?,?,?,?,?,?)').run(id, customer?.id ?? null, 'user', old.email, options.support || '', subject, old.message, created, 'accepted');
                if (old.admin_read) for (const admin of db.prepare("SELECT id FROM users WHERE role='admin'").all()) db.prepare('INSERT OR IGNORE INTO mc_participants(conversation_id,user_id,read_through) VALUES(?,?,?)').run(id, admin.id, Number(inserted.lastInsertRowid));
            }
            if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_replies'").get()) {
                const replies = db.prepare('SELECT r.*,c.id AS conversation_id,c.customer_email,c.subject FROM contact_replies r JOIN mc_conversations c ON c.legacy_id=r.message_id LEFT JOIN mc_messages m ON m.legacy_reply_id=r.id WHERE m.id IS NULL ORDER BY r.id').all();
                for (const reply of replies) {
                    const created = Date.parse(reply.created + 'Z') || Date.now();
                    const admin = db.prepare('SELECT email FROM users WHERE id=?').get(reply.admin_id);
                    const inserted = db.prepare('INSERT INTO mc_messages(conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery,legacy_reply_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(reply.conversation_id, reply.admin_id, 'admin', admin?.email || options.sender || '', reply.customer_email, reply.subject, reply.body, created, 'accepted', reply.id);
                    const customer = db.prepare('SELECT customer_id FROM mc_conversations WHERE id=?').get(reply.conversation_id);
                    if (reply.user_read && customer.customer_id) db.prepare('INSERT INTO mc_participants(conversation_id,user_id,read_through) VALUES(?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_through=MAX(read_through,excluded.read_through)').run(reply.conversation_id, customer.customer_id, Number(inserted.lastInsertRowid));
                    db.prepare('UPDATE mc_conversations SET updated=MAX(updated,?) WHERE id=?').run(created, reply.conversation_id);
                }
            }
        });
    }
    importLegacy();
    const bases = [['/api/messages', 'user'], ['/api/admin/message-center', 'admin']];
    const route = (method, path, role, handler) => app[method](path, async (req, res) => {
        try {
            const user = identity(req);
            if (!user) return res.status(401).json({ message: 'Please sign in first.' });
            if (user.role !== role) return res.status(403).json({ message: 'Access denied.' });
            res.set('Cache-Control', 'no-store');
            await handler(req, res, user);
        } catch { res.status(500).json({ message: 'Could not update messages. Your draft has been kept.' }); }
    });
    for (const [base, role] of bases) {
        route('post', base + '/preview-image', role, sendPhotoPreview);
        route('get', base + '/:id/images/:image', role, (req, res, user) => {
            const conversation = readConversation(Number(req.params.id), user);
            if (!conversation) return res.status(404).json({ message: 'Image not found.' });
            if (/^m[1-9]\d*$/.test(req.params.image)) {
                const image = db.prepare('SELECT i.mime,i.content FROM mc_images i JOIN mc_messages m ON m.id=i.message_id WHERE i.id=? AND m.conversation_id=? AND m.id>?').get(Number(req.params.image.slice(1)), conversation.id, conversation.hidden_through);
                if (!image) return res.status(404).json({ message: 'Image not found.' });
                res.set('X-Content-Type-Options', 'nosniff'); return res.type(image.mime).send(Buffer.from(image.content));
            }
            const first = db.prepare('SELECT MIN(id) AS id FROM mc_messages WHERE conversation_id=?').get(conversation.id).id;
            const image = first > conversation.hidden_through && db.prepare('SELECT mime,content FROM contact_images WHERE id=? AND contact_message_id=?').get(Number(req.params.image), conversation.legacy_id);
            if (!image) return res.status(404).json({ message: 'Image not found.' });
            res.set('X-Content-Type-Options', 'nosniff'); res.type(image.mime).send(Buffer.from(image.content));
        });
        route('get', base + '/request/:key', role, (req, res, user) => {
            const message = db.prepare('SELECT id,conversation_id,delivery FROM mc_messages WHERE sender_id=? AND request_key=?').get(user.id, req.params.key);
            if (message) {
                const conversation = readConversation(message.conversation_id, user);
                if (!conversation || conversation.hidden_through >= message.id) return res.json({ message: null, removed: true });
            }
            res.json({ message: message || null });
        });
        route('get', base, role, (req, res, user) => {
            importLegacy();
            const folder = ['inbox', 'sent', 'trash'].includes(req.query.folder) ? req.query.folder : 'inbox';
            const filter = ['unread', 'read', 'unanswered'].includes(req.query.filter) ? req.query.filter : 'all';
            const page = Math.min(10000, Math.max(0, Number(req.query.page) || 0)) | 0;
            const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
            const unreadSql = `(SELECT COUNT(*) FROM mc_messages m WHERE m.conversation_id=c.id AND m.sender_role!=? AND m.id>MAX(COALESCE(p.read_through,0),COALESCE(p.hidden_through,0)))`;
            const clauses = ['(?=\'admin\' OR c.customer_id=?)', 'COALESCE(p.deleted,0)=0'];
            const values = [user.role, user.id, user.role, user.id];
            if (folder === 'trash') clauses.push('COALESCE(p.trashed,0)=1'); else clauses.push('COALESCE(p.trashed,0)=0');
            if (folder === 'sent') { clauses.push('EXISTS(SELECT 1 FROM mc_messages s WHERE s.conversation_id=c.id AND s.id>COALESCE(p.hidden_through,0) AND s.sender_id=?)'); values.push(user.id); }
            if (filter === 'unread' || filter === 'read') { clauses.push(`(${unreadSql}>0 OR COALESCE(p.read_through,0)=0)=${filter === 'unread' ? 1 : 0}`); values.push(user.role); }
            if (filter === 'unanswered' && role === 'admin') clauses.push("(SELECT sender_role FROM mc_messages last WHERE last.conversation_id=c.id ORDER BY last.id DESC LIMIT 1)='user'");
            const hasProfiles = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_profiles'").get();
            const matches = ['instr(lower(c.subject),lower(?))>0', 'instr(lower(c.customer_email),lower(?))>0', 'EXISTS(SELECT 1 FROM mc_messages s WHERE s.conversation_id=c.id AND s.id>COALESCE(p.hidden_through,0) AND instr(lower(s.body),lower(?))>0)'];
            values.push(search, search, search);
            if (hasProfiles) {
                matches.push("EXISTS(SELECT 1 FROM account_profiles profile WHERE profile.user_id=c.customer_id AND instr(lower(trim(trim(COALESCE(profile.first_name,'')) || ' ' || trim(COALESCE(profile.last_name,'')))),lower(?))>0)"); values.push(search.trim());
            }
            if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contact_messages'").get()) {
                matches.push('EXISTS(SELECT 1 FROM contact_messages contact WHERE contact.id=c.legacy_id AND instr(lower(contact.name),lower(?))>0)'); values.push(search.trim());
            }
            if (role === 'user') { matches.push("instr(lower('HK Support'),lower(?))>0"); values.push(search.trim()); }
            clauses.push('(' + matches.join(' OR ') + ')');
            const conversations = db.prepare(`SELECT c.*,${unreadSql} AS unread,(SELECT m.sender_role FROM mc_messages m WHERE m.conversation_id=c.id AND m.id>COALESCE(p.hidden_through,0) ORDER BY m.id DESC LIMIT 1) AS latest_sender_role,(SELECT substr(m.body,1,240) FROM mc_messages m WHERE m.conversation_id=c.id AND m.id>COALESCE(p.hidden_through,0) ORDER BY m.id DESC LIMIT 1) AS preview,COALESCE(p.read_through,0) AS read_through,COALESCE(p.trashed,0) AS trashed FROM mc_conversations c LEFT JOIN mc_participants p ON p.conversation_id=c.id AND p.user_id=? WHERE ${clauses.join(' AND ')} ORDER BY c.updated DESC,c.id DESC LIMIT 9 OFFSET ?`).all(...values, page * 8);
            const total = db.prepare(`SELECT COUNT(*) AS count FROM mc_conversations c LEFT JOIN mc_participants p ON p.conversation_id=c.id AND p.user_id=? WHERE ${clauses.join(' AND ')}`).get(...values.slice(1)).count;
            const nextUnread = Boolean(db.prepare(`SELECT EXISTS(SELECT 1 FROM (SELECT ${unreadSql} AS unread,COALESCE(p.read_through,0) AS read_through FROM mc_conversations c LEFT JOIN mc_participants p ON p.conversation_id=c.id AND p.user_id=? WHERE ${clauses.join(' AND ')} ORDER BY c.updated DESC,c.id DESC LIMIT -1 OFFSET ?) later WHERE later.unread>0 OR later.read_through=0) AS present`).get(...values, (page + 1) * 8).present);
            const unread = db.prepare(`SELECT COUNT(*) AS count FROM mc_conversations c LEFT JOIN mc_participants p ON p.conversation_id=c.id AND p.user_id=? WHERE (?='admin' OR c.customer_id=?) AND COALESCE(p.deleted,0)=0 AND COALESCE(p.trashed,0)=0 AND ${unreadSql}>0`).get(user.id, user.role, user.id, user.role).count;
            const profile = hasProfiles ? db.prepare('SELECT first_name,last_name FROM account_profiles WHERE user_id=?') : null;
            const visible = conversations.slice(0, 8).map(conversation => {
                const saved = profile && profile.get(conversation.customer_id);
                const customer_name = saved ? [saved.first_name, saved.last_name].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ') : '';
                return { ...conversation, customer_name };
            });
            res.json({ conversations: visible, totalPages: Math.max(1, Math.ceil(total / 8)), more: conversations.length > 8, nextUnread, unread, verified: Boolean(user.email_verified), identity: user.email });
        });
        route('get', base + '/drafts/:key', role, (req, res, user) => {
            if (!/^(new|[1-9]\d{0,12})$/.test(req.params.key)) return res.status(400).json({ message: 'Invalid draft.' });
            res.json({ draft: db.prepare('SELECT * FROM mc_drafts WHERE user_id=? AND draft_key=?').get(user.id, req.params.key) || null });
        });
        route('put', base + '/drafts/:key', role, (req, res, user) => {
            const { subject, body, requestKey } = req.body || {};
            if (!/^(new|[1-9]\d{0,12})$/.test(req.params.key) || typeof subject !== 'string' || subject.length > 200 || typeof body !== 'string' || body.length > 10000 || typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) return res.status(400).json({ message: 'Invalid draft.' });
            if (req.params.key !== 'new' && !readConversation(Number(req.params.key), user)) return res.status(404).json({ message: 'Conversation not found.' });
            const image = req.body.image ?? null;
            if (image !== null && (typeof image !== 'string' || image.length > Math.ceil(10 * 1024 * 1024 * 4 / 3) + 100 || !/^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream)?;base64,[A-Za-z0-9+/]+={0,2}$/i.test(image))) return res.status(400).json({ message: 'Choose a photo up to 10 MB.' });
            const imageName = typeof req.body.imageName === 'string' ? req.body.imageName.slice(0, 255) : 'photo';
            db.prepare('INSERT INTO mc_drafts(user_id,draft_key,subject,body,request_key,updated,image,image_name) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,draft_key) DO UPDATE SET subject=excluded.subject,body=excluded.body,request_key=excluded.request_key,updated=excluded.updated,image=excluded.image,image_name=excluded.image_name').run(user.id, req.params.key, subject, body, requestKey, Date.now(), image, imageName);
            db.prepare('UPDATE mc_drafts SET recipient=? WHERE user_id=? AND draft_key=?').run(role === 'admin' && typeof req.body.recipient === 'string' ? req.body.recipient.slice(0, 254) : null, user.id, req.params.key);
            res.json({ saved: true });
        });
        route('get', base + '/:id', role, (req, res, user) => {
            const conversation = readConversation(Number(req.params.id), user);
            if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
            const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
            const messages = db.prepare('SELECT * FROM mc_messages WHERE conversation_id=? AND id<? AND id>? ORDER BY id DESC LIMIT 51').all(conversation.id, before, conversation.hidden_through);
            const first = db.prepare('SELECT MIN(id) AS id FROM mc_messages WHERE conversation_id=?').get(conversation.id).id;
            const images = conversation.legacy_id ? db.prepare('SELECT id FROM contact_images WHERE contact_message_id=?').all(conversation.legacy_id) : [];
            res.json({ conversation, messages: messages.slice(0, 50).reverse().map(message => ({ ...presentMessage(message, user), images: [...(message.id === first ? images : []), ...db.prepare('SELECT id FROM mc_images WHERE message_id=?').all(message.id).map(image => ({ id: 'm' + image.id }))] })), more: messages.length > 50 });
        });
        route('post', base + '/:id/state', role, (req, res, user) => {
            const id = Number(req.params.id), conversation = readConversation(id, user);
            if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
            const action = req.body?.action;
            if (!['read', 'unread', 'trash', 'restore', 'delete'].includes(action)) return res.status(400).json({ message: 'Invalid action.' });
            if (action === 'delete' && !conversation.trashed) return res.status(400).json({ message: 'Move to Trash before deleting permanently.' });
            participant(id, user);
            if (['read', 'unread'].includes(action)) {
                const last = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM mc_messages WHERE conversation_id=?').get(id).id;
                if (req.body.through !== undefined && (!Number.isSafeInteger(req.body.through) || req.body.through < 0)) return res.status(400).json({ message: 'Invalid read position.' });
                const through = action === 'read' ? Math.min(last, req.body.through ?? last) : 0;
                db.prepare('UPDATE mc_participants SET read_through=? WHERE conversation_id=? AND user_id=?').run(through, id, user.id);
            } else if (action === 'delete') {
                const last = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM mc_messages WHERE conversation_id=?').get(id).id;
                db.prepare('UPDATE mc_participants SET deleted=1,hidden_through=?,read_through=? WHERE conversation_id=? AND user_id=?').run(last, last, id, user.id);
                db.prepare('DELETE FROM mc_drafts WHERE user_id=? AND (draft_key=? OR request_key IN (SELECT request_key FROM mc_messages WHERE conversation_id=? AND sender_id=?))').run(user.id, String(id), id, user.id);
            } else db.prepare('UPDATE mc_participants SET trashed=? WHERE conversation_id=? AND user_id=?').run(action === 'trash' ? 1 : 0, id, user.id);
            res.json({ success: true });
        });
        route('post', base + '/send', role, async (req, res, user) => {
            if (role === 'user' && !user.email_verified) return res.status(403).json({ message: 'Verify your email before sending.', verificationRequired: true });
            const { body, subject, conversationId, requestKey } = req.body || {};
            if (typeof body !== 'string' || !body.trim() || body.length > 10000 || typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) return res.status(400).json({ message: 'Enter a message of up to 10000 characters.' });
            const existing = db.prepare('SELECT * FROM mc_messages WHERE sender_id=? AND request_key=?').get(user.id, requestKey);
            const rawImage = req.body.image;
            if (rawImage != null && typeof rawImage !== 'string') return res.status(400).json({ message: 'Choose a valid image.' });
            const imageHash = rawImage == null ? null : crypto.createHash('sha256').update(rawImage).digest('hex');
            if (existing) {
                const savedImage = db.prepare('SELECT source_hash FROM mc_images WHERE message_id=?').get(existing.id);
                if ((savedImage?.source_hash || null) !== imageHash) return res.status(409).json({ message: 'This request key already belongs to another message.' });
                if (existing.body !== body || (conversationId && existing.conversation_id !== Number(conversationId)) || (!conversationId && existing.subject !== subject?.trim())) return res.status(409).json({ message: 'This request key already belongs to another message.' });
                return res.json({ message: presentMessage(existing, user), duplicate: true });
            }
            if (!emailValid(options.sender) || !emailValid(options.support)) return res.status(503).json({ message: 'Email sending is not configured. Your draft has been kept.' });
            let conversation = conversationId && readConversation(Number(conversationId), user);
            if (conversationId && !conversation) return res.status(404).json({ message: 'Conversation not found.' });
            const newRecipient = typeof req.body.recipient === 'string' ? req.body.recipient.trim() : '';
            if (!conversation && role === 'admin' && !emailValid(newRecipient)) return res.status(400).json({ message: 'Enter a customer email address.' });
            if (!conversation && (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject))) return res.status(400).json({ message: 'Enter a subject of up to 200 characters.' });
            const count = db.prepare('SELECT COUNT(*) AS count FROM mc_messages WHERE sender_id=? AND created>?').get(user.id, Date.now() - 600000).count;
            if (count >= 10) return res.status(429).json({ message: 'Too many messages. Please try again later.' });
            let image;
            if (rawImage != null) {
                try { image = await prepareRequestPhoto(rawImage); }
                catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
            }
            const result = transact(() => {
                const now = Date.now();
                if (!conversation) {
                    const customer = role === 'admin' ? db.prepare("SELECT id,email FROM users WHERE lower(email)=lower(?) AND role='user'").get(newRecipient) : user;
                    const id = Number(db.prepare('INSERT INTO mc_conversations(customer_id,customer_email,subject,created,updated) VALUES(?,?,?,?,?)').run(customer?.id ?? null, customer?.email || newRecipient, subject.trim(), now, now).lastInsertRowid);
                    conversation = readConversation(id, user);
                }
                const recipient = role === 'admin' ? (conversation.customer_id && db.prepare('SELECT email FROM users WHERE id=?').get(conversation.customer_id)?.email) || conversation.customer_email : options.support;
                if (!emailValid(recipient)) throw new Error('Invalid recipient');
                const id = Number(db.prepare('INSERT INTO mc_messages(conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)').run(conversation.id, user.id, role, user.email, recipient, conversation.subject, body, now, 'queued', requestKey).lastInsertRowid);
                db.prepare('INSERT INTO mc_outbox(message_id,state,updated) VALUES(?,?,?)').run(id, 'queued', now);
                if (image) db.prepare('INSERT INTO mc_images(message_id,filename,mime,content,source_hash) VALUES(?,?,?,?,?)').run(id, image.filename, image.mime, image.content, imageHash);
                db.prepare('UPDATE mc_conversations SET updated=? WHERE id=?').run(now, conversation.id);
                db.prepare('UPDATE mc_participants SET trashed=0,deleted=0 WHERE conversation_id=? AND user_id!=?').run(conversation.id, user.id);
                return db.prepare('SELECT * FROM mc_messages WHERE id=?').get(id);
            });
            res.status(202).json({ message: presentMessage(result, user) });
        });
        route('post', base + '/:id/retry/:message', role, (req, res, user) => {
            if (role === 'user' && !user.email_verified) return res.status(403).json({ message: 'Verify your email before sending.', verificationRequired: true });
            const message = db.prepare('SELECT * FROM mc_messages WHERE id=? AND conversation_id=? AND sender_id=?').get(Number(req.params.message), Number(req.params.id), user.id);
            if (!message || !readConversation(message.conversation_id, user)) return res.status(404).json({ message: 'Message not found.' });
            if (!['failed', 'unknown'].includes(message.delivery)) return res.status(409).json({ message: 'This message is already queued or accepted.' });
            if (message.delivery === 'unknown' && req.body?.acknowledgeDuplicateRisk !== true) return res.status(409).json({ message: 'Delivery is uncertain. Retrying may send a duplicate email.', uncertain: true });
            const queue = db.prepare('SELECT * FROM mc_outbox WHERE message_id=?').get(message.id);
            if (queue.attempts >= 5 || Date.now() - queue.updated < 10000) return res.status(429).json({ message: 'Wait before retrying. Maximum five attempts.' });
            transact(() => { db.prepare("UPDATE mc_outbox SET state='queued',updated=? WHERE message_id=?").run(Date.now(), message.id); db.prepare("UPDATE mc_messages SET delivery='queued',error=NULL WHERE id=?").run(message.id); });
            res.status(202).json({ success: true });
        });
    }
    route('post', '/api/messages/verification', 'user', async (req, res, user) => {
        if (user.email_verified) return res.json({ verified: true });
        if (!emailValid(options.sender) || !options.sendVerification) return res.status(503).json({ message: 'Email sending is not configured.' });
        const now = Date.now(), last = db.prepare('SELECT verification_sent FROM mc_limits WHERE user_id=?').get(user.id)?.verification_sent || 0;
        if (now - last < 60000) return res.status(429).json({ message: 'Wait one minute before resending verification.' });
        const token = crypto.randomBytes(32).toString('hex');
        db.prepare('INSERT INTO mc_limits(user_id,verification_sent) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET verification_sent=excluded.verification_sent').run(user.id, now);
        db.prepare('UPDATE users SET verification_token=?,verification_expires=? WHERE id=?').run(token, now + 600000, user.id);
        try { await options.sendVerification(user.email, token); res.json({ message: 'Verification link sent. It expires in 10 minutes. Return here and click Send after verification.' }); }
        catch { db.prepare('UPDATE users SET verification_token=NULL,verification_expires=NULL WHERE id=? AND verification_token=?').run(user.id, token); res.status(503).json({ message: 'Could not send verification email. Your draft has been kept.' }); }
    });
    let running = false, verifiedAt = 0;
    async function processOutbox() {
        if (running) return; running = true;
        try {
            transact(() => {
                db.prepare("UPDATE mc_messages SET delivery='unknown',error='Delivery interrupted; email acceptance is uncertain.' WHERE id IN (SELECT message_id FROM mc_outbox WHERE state='sending' AND updated<?)").run(Date.now() - 120000);
                db.prepare("UPDATE mc_outbox SET state='unknown' WHERE state='sending' AND updated<?").run(Date.now() - 120000);
            });
            const queued = db.prepare("SELECT m.* FROM mc_messages m JOIN mc_outbox o ON o.message_id=m.id WHERE o.state='queued' ORDER BY m.id LIMIT 1").get();
            if (!queued) return;
            const claimed = db.prepare("UPDATE mc_outbox SET state='sending',attempts=attempts+1,updated=? WHERE message_id=? AND state='queued'").run(Date.now(), queued.id);
            if (!claimed.changes) return;
            db.prepare("UPDATE mc_messages SET delivery='sending' WHERE id=?").run(queued.id);
            let status = 'accepted', providerId = null, errorText = null, attempted = false;
            try {
                const account = queued.sender_id && db.prepare('SELECT email,email_verified,role FROM users WHERE id=?').get(queued.sender_id);
                if (!account || account.role !== queued.sender_role || account.email !== queued.sender_email) throw new Error('Sender account changed.');
                if (queued.sender_role === 'user' && !account?.email_verified) throw new Error('Email must be verified before sending.');
                if (!emailValid(options.sender) || !emailValid(options.support)) throw new Error('Email sending is not configured.');
                if (Date.now() - verifiedAt > 600000) { await mailer.verify(); verifiedAt = Date.now(); }
                attempted = true;
                const publicSender = options.from || options.sender;
                if (!emailValid(publicSender)) { attempted = false; throw new Error('Invalid store sender.'); }
                if (queued.sender_role === 'admin' && db.prepare("SELECT id FROM users WHERE role='admin' AND (lower(email)=lower(?) OR lower(email)=lower(?)) LIMIT 1").get(publicSender, options.sender)) {
                    attempted = false;
                    throw new Error('Use a dedicated store sender instead of an admin account mailbox.');
                }
                const info = await mailer.sendMail({ from: { name: 'HongKong Supermarket', address: publicSender }, to: queued.recipient_email, subject: queued.subject,
                    messageId: `<easyshop-${queued.id}-${queued.request_key}@${publicSender.split('@')[1]}>`,
                    text: queued.body, attachments: db.prepare('SELECT filename,mime,content FROM mc_images WHERE message_id=?').all(queued.id).map(image => ({ filename: image.filename, contentType: image.mime, content: Buffer.from(image.content) })) });
                if (Array.isArray(info.accepted) && !info.accepted.length) { attempted = false; throw new Error('Recipient was not accepted.'); }
                providerId = info.messageId || null;
            } catch (error) {
                status = attempted && !['EAUTH', 'EENVELOPE'].includes(error.code) ? 'unknown' : 'failed';
                errorText = status === 'unknown' ? 'Email acceptance is uncertain. Retrying may send a duplicate.' : 'Email sending failed. Check configuration or try again later.';
            }
            transact(() => {
                db.prepare('UPDATE mc_messages SET delivery=?,provider_id=?,error=? WHERE id=?').run(status, providerId, errorText, queued.id);
                db.prepare('UPDATE mc_outbox SET state=?,updated=? WHERE message_id=?').run(status, Date.now(), queued.id);
                if (status === 'accepted') db.prepare('DELETE FROM mc_drafts WHERE user_id=? AND request_key=?').run(queued.sender_id, queued.request_key);
            });
        } finally { running = false; }
    }
    const timer = options.startWorker === false ? null : setInterval(() => processOutbox().catch(() => console.error('Message outbox processing failed.')), 2000);
    timer?.unref();
    return { processOutbox, stop: () => clearInterval(timer), importLegacy };
}
module.exports = { registerMessageCenter };
