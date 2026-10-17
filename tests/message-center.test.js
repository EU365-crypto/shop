const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { registerMessageCenter } = require('../src/mail/message-center');
const crypto = require('node:crypto');
const { csrfProtection } = require('../src/auth/session-security');
async function fixture(t, filename = ':memory:') {
    const db = new DatabaseSync(filename);
    db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT,role TEXT,email_verified INTEGER,verification_token TEXT,verification_expires INTEGER);
        INSERT OR IGNORE INTO users VALUES(1,'one@example.com','user',1,NULL,NULL),(2,'two@example.com','user',1,NULL,NULL),(3,'admin@example.com','admin',1,NULL,NULL),(4,'unverified@example.com','user',0,NULL,NULL);`);
    const delivered = [], verification = [];
    const mailer = { verify: async () => true, sendMail: async value => { delivered.push(value); return { accepted: [value.to], messageId: 'provider-123' }; } };
    const app = express(); app.use(express.json()); app.use(csrfProtection({ origin: 'https://shop.example' }));
    app.use((req, res, next) => { const id = Number(req.get('x-test-user')); if (id) req.session = { user: { id } }; next(); });
    const center = registerMessageCenter(app, db, mailer, { sender: 'store@example.com', support: 'support@example.com', baseUrl: 'https://shop.example', startWorker: false, sendVerification: async (email, token) => verification.push({ email, token }) });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    t.after(async () => { center.stop(); await new Promise(resolve => server.close(resolve)); db.close(); });
    async function request(id, path = '', method = 'GET', body) {
        const base = id === 3 ? '/api/admin/message-center' : '/api/messages';
        const response = await fetch(`http://127.0.0.1:${server.address().port}${base}${path}`, { method, headers: { 'x-test-user': String(id), 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
    }
    const send = (id = 1, extra = {}) => request(id, '/send', 'POST', { subject: 'Question', body: 'Hello <script>unsafe()</script>', requestKey: crypto.randomUUID(), ...extra });
    return { db, request, send, center, mailer, delivered, verification, server };
}
test('message ownership, authentication and verified identity are enforced for new messages and replies', async t => {
    const f = await fixture(t);
    assert.equal((await f.request(0)).status, 401);
    assert.equal((await f.send(4)).status, 403);
    const created = await f.send(1, { sender_email: 'spoof@example.com', recipient_email: 'evil@example.com' });
    assert.equal(created.status, 202); const id = created.data.message.conversation_id;
    assert.equal(created.data.message.sender_email, 'one@example.com'); assert.equal(created.data.message.recipient_email, 'HongKong Supermarket');
    assert.equal(f.db.prepare('SELECT recipient_email FROM mc_messages').get().recipient_email, 'support@example.com');
    assert.equal((await f.request(2, '/' + id)).status, 404);
    assert.equal((await f.send(2, { conversationId: id })).status, 404);
    assert.equal((await f.request(2, `/${id}/state`, 'POST', { action: 'trash' })).status, 404);
    f.db.prepare('UPDATE users SET email_verified=0 WHERE id=1').run();
    assert.equal((await f.send(1, { conversationId: id })).status, 403);
    await f.center.processOutbox(); assert.equal(f.delivered.length, 0);
    assert.equal(f.db.prepare('SELECT delivery FROM mc_messages').get().delivery, 'failed');
});
test('read and unread filters match dot state for senders and receivers after toggling', async t => {
    const f = await fixture(t), message = (await f.send()).data.message;
    for (const user of [1, 3]) {
        for (const action of ['read', 'unread', 'read']) {
            await f.request(user, `/${message.conversation_id}/state`, 'POST', { action });
            const read = (await f.request(user, '?filter=read')).data.conversations;
            const unread = (await f.request(user, '?filter=unread')).data.conversations;
            assert.equal(read.length, action === 'read' ? 1 : 0);
            assert.equal(unread.length, action === 'unread' ? 1 : 0);
            const row = (read[0] || unread[0]);
            assert.equal(Boolean(row.unread) || row.read_through === 0, action === 'unread');
        }
    }
});
test('email list uses saved customer profile names and leaves missing names blank for email fallback', async t => {
    const f = await fixture(t);
    await f.send();
    f.db.exec("CREATE TABLE account_profiles(user_id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT); INSERT INTO account_profiles VALUES(1,'First','Last')");
    assert.equal((await f.request(3)).data.conversations[0].customer_name, 'First Last');
    f.db.prepare("UPDATE account_profiles SET first_name='',last_name='' WHERE user_id=1").run();
    const row = (await f.request(3)).data.conversations[0];
    assert.equal(row.customer_name, ''); assert.equal(row.customer_email, 'one@example.com');
});
test('email pages contain eight rows and flag unread messages beyond the current page', async t => {
    const f = await fixture(t);
    const conversation = f.db.prepare("INSERT INTO mc_conversations(customer_id,customer_email,subject,type,created,updated) VALUES(1,'one@example.com',?,'email',?,?)");
    const message = f.db.prepare("INSERT INTO mc_messages(conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery) VALUES(?,1,'user','one@example.com','support@example.com',?,'Preview',?,'accepted')");
    for (let i = 0; i < 18; i++) {
        const id = Number(conversation.run('Page ' + i, i + 1, i + 1).lastInsertRowid);
        const mid = Number(message.run(id, 'Page ' + i, i + 1).lastInsertRowid);
        if (i !== 0) f.db.prepare('INSERT INTO mc_participants(conversation_id,user_id,read_through) VALUES(?,3,?)').run(id, mid);
    }
    const first = (await f.request(3)).data, second = (await f.request(3, '?page=1')).data, last = (await f.request(3, '?page=2')).data;
    assert.equal(first.conversations.length, 8); assert.equal(second.conversations.length, 8); assert.equal(last.conversations.length, 2);
    assert.equal(first.totalPages, 3); assert.equal(second.totalPages, 3); assert.equal(last.totalPages, 3);
    assert.equal(first.conversations[0].subject, 'Page 17'); assert.equal(last.conversations.at(-1).subject, 'Page 0');
    assert.equal(first.nextUnread, true); assert.equal(second.nextUnread, true); assert.equal(last.nextUnread, false); assert.equal(last.more, false);
    await f.request(3, `/${last.conversations.at(-1).id}/state`, 'POST', { action: 'read' });
    assert.equal((await f.request(3)).data.nextUnread, false);
    assert.equal((await f.request(2)).data.nextUnread, false);
});
test('admin replies retain subjects and histories, provider IDs, unread filters and independent participant state', async t => {
    const f = await fixture(t), first = (await f.send()).data.message, id = first.conversation_id;
    assert.equal((await f.request(3, '?filter=unread')).data.unread, 1);
    assert.equal((await f.request(3, '?filter=unanswered')).data.conversations.length, 1);
    await f.request(3, `/${id}/state`, 'POST', { action: 'read', through: first.id });
    assert.equal((await f.request(3, '?filter=read')).data.conversations.length, 1);
    const reply = (await f.send(3, { conversationId: id, subject: 'ignore', body: 'Answer' })).data.message;
    assert.equal(reply.subject, 'Question'); assert.equal(reply.recipient_email, 'one@example.com');
    assert.equal((await f.request(3, '?filter=unanswered')).data.conversations.length, 0);
    assert.equal((await f.request(1)).data.unread, 1);
    assert.equal((await f.request(3, '?folder=sent')).data.conversations.length, 1);
    assert.equal((await f.request(1, `/${id}`)).data.messages.length, 2);
    await f.center.processOutbox(); await f.center.processOutbox();
    assert.equal(f.delivered[1].to, 'one@example.com'); assert.equal(f.delivered[1].text, 'Answer');
    assert.deepEqual(f.delivered[1].from, { name: 'HongKong Supermarket', address: 'store@example.com' });
    const customerHistory = JSON.stringify((await f.request(1, `/${id}`)).data);
    assert.doesNotMatch(customerHistory, /admin@example.com|support@example.com/);
    assert.match(JSON.stringify((await f.request(3, `/${id}`)).data), /admin@example.com/);
    assert.equal(f.db.prepare('SELECT provider_id FROM mc_messages WHERE id=?').get(reply.id).provider_id, 'provider-123');
    await f.request(1, `/${id}/state`, 'POST', { action: 'trash' });
    assert.equal((await f.request(1)).data.conversations.length, 0); assert.equal((await f.request(3)).data.conversations.length, 1);
    await f.request(1, `/${id}/state`, 'POST', { action: 'restore' }); assert.equal((await f.request(1)).data.conversations.length, 1);
    await f.request(1, `/${id}/state`, 'POST', { action: 'trash' }); await f.request(1, `/${id}/state`, 'POST', { action: 'delete' });
    assert.equal((await f.request(1, `/${id}`)).status, 404); assert.equal((await f.request(3, `/${id}`)).status, 200);
    await f.send(3, { conversationId: id, body: 'New message after deletion' });
    const returned = (await f.request(1, `/${id}`)).data.messages;
    assert.equal(returned.length, 1); assert.equal(returned[0].body, 'New message after deletion');
});
test('message mutations reject CSRF requests and the send limit is persistent', async t => {
    const f = await fixture(t);
    const response = await fetch(`http://127.0.0.1:${f.server.address().port}/api/messages/send`, { method: 'POST', headers: { 'x-test-user': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'Bad', body: 'Bad', requestKey: crypto.randomUUID() }) });
    assert.equal(response.status, 403);
    for (let i = 0; i < 10; i++) assert.equal((await f.send()).status, 202);
    assert.equal((await f.send()).status, 429);
});
test('SQLite conversations, drafts and queued deliveries survive reopening without duplicate messages', async t => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-message-test-')), filename = path.join(dir, 'messages.db');
    t.after(() => { fs.unlinkSync(filename); fs.rmdirSync(dir); });
    const db = new DatabaseSync(filename); db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,role TEXT,email_verified INTEGER,verification_token TEXT,verification_expires INTEGER); INSERT INTO users VALUES(1,'one@example.com','user',1,NULL,NULL)");
    const app = express(), first = registerMessageCenter(app, db, {}, { startWorker: false });
    db.exec("INSERT INTO mc_conversations VALUES(1,NULL,1,'one@example.com','Persist','email',1,1); INSERT INTO mc_messages(id,conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery,request_key) VALUES(1,1,1,'user','one@example.com','support@example.com','Persist','Persistent body',1,'queued','persistent-key-123'); INSERT INTO mc_outbox VALUES(1,'queued',0,1); INSERT INTO mc_drafts(user_id,draft_key,subject,body,request_key,updated) VALUES(1,'new','Draft','Recover this','another-draft-key',1)");
    first.stop(); db.close();
    const reopened = new DatabaseSync(filename), sent = [];
    const second = registerMessageCenter(express(), reopened, { verify: async () => true, sendMail: async value => { sent.push(value); return { accepted: [value.to], messageId: 'persist-provider' }; } }, { sender: 'store@example.com', support: 'support@example.com', baseUrl: 'https://shop.example', startWorker: false });
    await second.processOutbox(); await second.processOutbox(); assert.equal(sent.length, 1);
    assert.equal(reopened.prepare('SELECT delivery FROM mc_messages').get().delivery, 'accepted');
    assert.equal(reopened.prepare('SELECT body FROM mc_drafts').get().body, 'Recover this'); second.stop(); reopened.close();
});
test('drafts survive unverified sends and provider failures; retries and duplicate clicks share one durable message', async t => {
    const f = await fixture(t), draft = { subject: 'Draft subject', body: 'Draft body', requestKey: crypto.randomUUID() };
    assert.equal((await f.request(4, '/drafts/new', 'PUT', draft)).status, 200);
    assert.equal((await f.send(4, draft)).status, 403);
    assert.equal((await f.request(4, '/drafts/new')).data.draft.body, 'Draft body');
    f.db.prepare('UPDATE users SET email_verified=1 WHERE id=4').run();
    const [a, b] = await Promise.all([f.send(4, draft), f.send(4, draft)]); assert.equal(a.data.message.id, b.data.message.id);
    f.mailer.verify = async () => { throw Object.assign(new Error('private credentials must not escape'), { code: 'EAUTH' }); };
    await f.center.processOutbox(); assert.equal(f.db.prepare('SELECT delivery FROM mc_messages').get().delivery, 'failed');
    assert.equal((await f.request(4, '/drafts/new')).data.draft.body, draft.body);
    assert.doesNotMatch(JSON.stringify((await f.request(4, '/' + a.data.message.conversation_id)).data), /private credentials/);
    f.db.prepare('UPDATE mc_outbox SET updated=0').run(); f.mailer.verify = async () => true;
    const path = `/${a.data.message.conversation_id}/retry/${a.data.message.id}`;
    assert.equal((await f.request(4, path, 'POST', {})).status, 202); assert.equal((await f.request(4, path, 'POST', {})).status, 409);
    await f.center.processOutbox(); assert.equal(f.delivered.length, 1);
    assert.equal((await f.request(4, '/drafts/new')).data.draft, null);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mc_messages').get().n, 1);
});
test('uncertain SMTP outcomes require explicit retry acknowledgement and are never automatically resent', async t => {
    const f = await fixture(t), message = (await f.send()).data.message;
    f.mailer.sendMail = async () => { throw Object.assign(new Error('socket closed'), { code: 'ECONNECTION' }); };
    await f.center.processOutbox(); await f.center.processOutbox();
    assert.equal(f.db.prepare('SELECT delivery FROM mc_messages').get().delivery, 'unknown');
    f.db.prepare('UPDATE mc_outbox SET updated=0').run();
    assert.equal((await f.request(1, `/${message.conversation_id}/retry/${message.id}`, 'POST', {})).status, 409);
});
test('admin mail never sends from the administrator account mailbox', async t => {
    const f = await fixture(t);
    const original = (await f.send()).data.message;
    await f.center.processOutbox();
    await f.send(3, { conversationId: original.conversation_id, body: 'Private admin reply' });
    const app = express();
    const privateSender = registerMessageCenter(app, f.db, f.mailer, { sender: 'admin@example.com', support: 'support@example.com', startWorker: false });
    await privateSender.processOutbox(); privateSender.stop();
    assert.equal(f.delivered.length, 1);
    assert.equal(f.db.prepare('SELECT delivery FROM mc_messages ORDER BY id DESC LIMIT 1').get().delivery, 'failed');
});
test('verification resend is limited, expiring, account-bound and never automatically sends the draft', async t => {
    const f = await fixture(t);
    assert.equal((await f.request(4, '/verification', 'POST', {})).status, 200);
    assert.equal((await f.request(4, '/verification', 'POST', {})).status, 429);
    assert.equal(f.verification.length, 1); assert.equal(f.verification[0].email, 'unverified@example.com');
    const user = f.db.prepare('SELECT * FROM users WHERE id=4').get(); assert.equal(user.verification_token, f.verification[0].token);
    assert.ok(user.verification_expires > Date.now() && user.verification_expires <= Date.now() + 600000);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mc_outbox').get().n, 0);
});
test('legacy message migration preserves history and read state and is idempotent', async t => {
    const f = await fixture(t);
    f.db.exec("CREATE TABLE contact_messages(id INTEGER PRIMARY KEY,type TEXT,name TEXT,email TEXT,message TEXT,created TEXT,admin_read INTEGER); CREATE TABLE contact_replies(id INTEGER PRIMARY KEY,message_id INTEGER,admin_id INTEGER,body TEXT,created TEXT,user_read INTEGER); INSERT INTO contact_messages VALUES(100,'email','Old customer','one@example.com','Old original','2026-01-01 10:00:00',1); INSERT INTO contact_replies VALUES(200,100,3,'Old reply','2026-01-01 11:00:00',1)");
    f.center.importLegacy(); f.center.importLegacy();
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mc_conversations').get().n, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mc_messages').get().n, 2);
    assert.equal((await f.request(1)).data.unread, 0); assert.equal((await f.request(3)).data.unread, 0);
    assert.equal((await f.request(1, '/1')).data.messages[1].body, 'Old reply');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM contact_messages').get().n, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mc_outbox').get().n, 0);
    f.db.prepare('INSERT INTO contact_images(contact_message_id,mime,content) VALUES(?,?,?)').run(100, 'image/png', Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal((await f.request(1, '/1')).data.messages[0].images.length, 1);
    const image = user => fetch(`http://127.0.0.1:${f.server.address().port}/api/messages/1/images/1`, { headers: { 'x-test-user': String(user) } });
    assert.equal((await image(1)).status, 200); assert.equal((await image(2)).status, 404); assert.equal((await image(0)).status, 401);
    await f.request(1, '/1/state', 'POST', { action: 'trash' }); await f.request(1, '/1/state', 'POST', { action: 'delete' });
    assert.equal((await image(1)).status, 404);
});
test('list and history pagination are bounded and search preserves customer isolation', async t => {
    const f = await fixture(t), message = (await f.send()).data.message;
    const insert = f.db.prepare("INSERT INTO mc_messages(conversation_id,sender_id,sender_role,sender_email,recipient_email,subject,body,created,delivery) VALUES(?,3,'admin','admin@example.com','one@example.com','Question',?,?,'accepted')");
    for (let i = 0; i < 60; i++) insert.run(message.conversation_id, 'Reply ' + i, Date.now());
    const latest = (await f.request(1, '/' + message.conversation_id)).data;
    assert.equal(latest.messages.length, 50); assert.equal(latest.more, true);
    const earlier = (await f.request(1, `/${message.conversation_id}?before=${latest.messages[0].id}`)).data;
    assert.equal(earlier.messages.length, 11); assert.equal(earlier.more, false);
    assert.equal((await f.request(2, '?q=Reply')).data.conversations.length, 0);
    assert.equal((await f.request(1, '?q=Reply')).data.conversations.length, 1);
    const forbidden = await fetch(`http://127.0.0.1:${f.server.address().port}/api/admin/message-center`, { headers: { 'x-test-user': '1' } }); assert.equal(forbidden.status, 403);
});


test('compose and reply images stay private, retain the reply subject, and attach to mail', async t => {
    const f = await fixture(t);
    const content = await require('sharp')({ create: { width: 4, height: 4, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const image = 'data:image/png;base64,' + content.toString('base64');
    const first = await f.send(1, { image });
    assert.equal(first.status, 202);
    const id = first.data.message.conversation_id;
    const reply = await f.send(3, { conversationId: id, subject: 'Changed subject', image });
    assert.equal(reply.status, 202); assert.equal(reply.data.message.subject, 'Question');
    const thread = (await f.request(1, '/' + id)).data;
    assert.equal(thread.messages[0].images.length, 1); assert.equal(thread.messages[1].images.length, 1);
    const imagePath = '/' + id + '/images/' + thread.messages[0].images[0].id;
    assert.equal((await f.request(2, imagePath)).status, 404);
    const response = await fetch('http://127.0.0.1:' + f.server.address().port + '/api/messages' + imagePath, { headers: { 'x-test-user': '1' } });
    assert.equal(response.status, 200); assert.ok(response.headers.get('content-type').startsWith('image/'));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    await f.center.processOutbox(); await f.center.processOutbox();
    assert.equal(f.delivered.length, 2); assert.equal(f.delivered[0].attachments.length, 1); assert.equal(f.delivered[1].attachments.length, 1);
    assert.equal((await f.send(1, { image: 'data:image/png;base64,AAAA' })).status, 400);
});


test('image drafts autosave for authenticated users and admins with account isolation', async t => {
 const f = await fixture(t);
 const image = 'data:image/png;base64,' + (await require('sharp')({create:{width:2,height:2,channels:3,background:'#abc'}}).png().toBuffer()).toString('base64');
 const draft = {subject:'Photo draft',body:'',requestKey:crypto.randomUUID(),image,imageName:'photo.png'};
 assert.equal((await f.request(0, '/preview-image', 'POST', {image})).status, 401);
 const preview = await f.request(1, '/preview-image', 'POST', {image});
 assert.equal(preview.status, 200); assert.ok(preview.data.image.startsWith('data:image/'));
 assert.equal((await f.request(3, '/preview-image', 'POST', {image})).status, 200);
 assert.equal((await f.request(1, '/preview-image', 'POST', {image:'invalid'})).status, 400);
 assert.equal((await f.request(0, '/drafts/new', 'PUT', draft)).status, 401);
 assert.equal((await f.request(1, '/drafts/new', 'PUT', draft)).status, 200);
 assert.equal((await f.request(1, '/drafts/new')).data.draft.image, image);
 assert.equal((await f.request(2, '/drafts/new')).data.draft, null);
 assert.equal((await f.request(3, '/drafts/new', 'PUT', draft)).status, 200);
 assert.equal((await f.request(3, '/drafts/new')).data.draft.image_name, 'photo.png');
 assert.equal((await f.request(1, '/drafts/new', 'PUT', {...draft,image:null})).status, 200);
 assert.equal((await f.request(1, '/drafts/new')).data.draft.image, null);
 assert.equal((await f.request(3, '/drafts/new')).data.draft.image, image);
 assert.equal((await f.request(1, '/drafts/new', 'PUT', {...draft,image:'invalid'})).status, 400);
});


test('new compose and reply drafts are independent for users and admins', async t => {
 const f = await fixture(t);
 const created = await f.send(1); const id = created.data.message.conversation_id;
 for (const user of [1,3]) {
  const reply = {subject:'Question',body:'Preserved reply',requestKey:crypto.randomUUID()};
  const compose = {subject:'New subject',body:'Separate compose',recipient:'two@example.com',requestKey:crypto.randomUUID()};
  assert.equal((await f.request(user, '/drafts/' + id, 'PUT', reply)).status, 200);
  assert.equal((await f.request(user, '/drafts/new', 'PUT', compose)).status, 200);
  const sent = await f.send(user, compose);
  assert.equal(sent.status, 202); assert.notEqual(sent.data.message.conversation_id, id);
  assert.equal((await f.request(user, '/drafts/' + id)).data.draft.body, 'Preserved reply');
  assert.equal((await f.request(user, '/drafts/new')).data.draft.body, 'Separate compose');
  if (user === 3) {
   assert.equal((await f.request(2, '/' + sent.data.message.conversation_id)).status, 200);
   assert.equal((await f.request(1, '/' + sent.data.message.conversation_id)).status, 404);
  }
 }
});


test('name search matches first, last and full names without exposing other customers', async t => {
 const f = await fixture(t);
 f.db.exec("CREATE TABLE account_profiles(user_id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT); INSERT INTO account_profiles VALUES(1,'Alice','River'),(2,'Bob','Stone')");
 await f.send(1); await f.send(2);
 for (const name of ['alice','River','Alice River']) {
  const result = await f.request(3, '?q=' + encodeURIComponent(name));
  assert.equal(result.data.conversations.length, 1); assert.equal(result.data.conversations[0].customer_id, 1);
 }
 assert.equal((await f.request(2, '?q=Alice')).data.conversations.length, 0);
 assert.equal((await f.request(1, '?q=Bob')).data.conversations.length, 0);
 assert.equal((await f.request(1, '?q=HK%20Support')).data.conversations.length, 1);
 assert.equal((await f.request(3, '?q=one%40example.com')).data.conversations[0].customer_id, 1);
 assert.equal((await f.request(2, '?q=one%40example.com')).data.conversations.length, 0);
 f.db.prepare('UPDATE account_profiles SET first_name=?,last_name=? WHERE user_id=1').run(' Alice ', ' River ');
 assert.equal((await f.request(3, '?q=Alice%20River')).data.conversations.length, 1);
});
