const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { registerContactMail } = require('../src/mail/contact');
const { csrfProtection } = require('../src/auth/session-security');
async function fixture(t) {
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,email_verified INTEGER); INSERT INTO users VALUES(1,'verified@example.com',1),(2,'unverified@example.com',0)");
    const sessions = new Map(), mails = [], mailer = { sendMail: async mail => { mails.push(mail); return { accepted: [mail.to] }; } };
    const app = express(); app.use(express.json()); app.use(csrfProtection({ origin: 'https://shop.example' }));
    app.use((req,res,next)=>{const key=req.get('x-test-session')||'guest';if(!sessions.has(key))sessions.set(key,{});req.session=sessions.get(key);if(req.get('x-test-user'))req.session.user={id:Number(req.get('x-test-user'))};next();});
    registerContactMail(app, mailer, 'store@example.com', 'support@example.com', db);
    const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
    async function call(path, body, session='guest', user) {
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/contact${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-CSRF-Protection':'1','x-test-session':session,...(user?{'x-test-user':String(user)}:{})},body:body===undefined?undefined:JSON.stringify(body)});
        return {status:response.status,data:await response.json()};
    }
    const body = { name: 'Guest', email: 'guest@example.com', message: 'Keep my message', type: 'email' };
    const issue = async(session='guest')=>{assert.equal((await call('/code',{email:body.email},session)).status,200);return mails.at(-1).text.match(/code is (\d{6})/)[1];};
    return {db,call,body,issue,mails,mailer};
}
for(const type of ['email','request','partnership'])test(`guest ${type} requires an email-bound code before sending`,async t=>{
    const f=await fixture(t), body={...f.body,type};
    assert.equal((await f.call('',body)).status,403);assert.equal(f.mails.length,0);
    const code=await f.issue();assert.equal((await f.call('/verify',{email:body.email,code},'other')).status,400);
    assert.equal((await f.call('/verify',{email:'different@example.com',code})).status,400);
    assert.equal((await f.call('/verify',{email:body.email,code})).status,200);
    assert.equal((await f.call('/verify',{email:body.email,code})).status,400);
    assert.equal((await f.call('',{...body,email:'different@example.com'})).status,403);
    assert.equal((await f.call('',body)).status,200);assert.equal(f.mails.at(-1).to,'support@example.com');assert.equal(f.mails.at(-1).replyTo,body.email);
    assert.equal((await f.call('',body)).status,403);
});
test('verified signed-in customers bypass contact verification and cannot spoof the sender',async t=>{
    const f=await fixture(t);
    for(const type of ['email','request','partnership'])assert.equal((await f.call('',{...f.body,type,email:'spoof@example.com'},'signed',1)).status,200);
    assert.ok(f.mails.every(mail=>mail.replyTo==='verified@example.com'));
    assert.equal((await f.call('/identity',undefined,'signed',1)).data.verified,true);
    assert.equal((await f.call('',f.body,'unverified',2)).status,403);
});
test('contact name autofill uses only the signed-in account profile and leaves missing names blank',async t=>{
    const f=await fixture(t);
    f.db.exec("CREATE TABLE account_profiles(user_id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT); INSERT INTO account_profiles VALUES(1,'First','Last')");
    const saved=(await f.call('/identity',undefined,'signed',1)).data;
    assert.equal(saved.firstName,'First');assert.equal(saved.lastName,'Last');
    const missing=(await f.call('/identity',undefined,'other',2)).data;
    assert.equal(missing.firstName,'');assert.equal(missing.lastName,'');
    const guest=(await f.call('/identity')).data;
    assert.equal(guest.firstName,undefined);assert.equal(guest.lastName,undefined);
});
test('guest codes expire, limit attempts/resends and preserve verification after a failed message',async t=>{
    const f=await fixture(t), code=await f.issue();
    assert.equal((await f.call('/code',{email:f.body.email})).status,429);
    for(let i=0;i<5;i++)assert.equal((await f.call('/verify',{email:f.body.email,code:'000000'})).status,400);
    assert.equal((await f.call('/verify',{email:f.body.email,code})).status,400);
    f.db.prepare('UPDATE contact_email_codes SET sent=0').run();const next=await f.issue();
    f.db.prepare('UPDATE contact_email_codes SET expires=0').run();assert.equal((await f.call('/verify',{email:f.body.email,code:next})).status,400);
    f.db.prepare('UPDATE contact_email_codes SET sent=0').run();const last=await f.issue();assert.equal((await f.call('/verify',{email:f.body.email,code:last})).status,200);
    const good=f.mailer.sendMail;f.mailer.sendMail=async()=>{throw new Error('Provider failure');};assert.equal((await f.call('',f.body)).status,502);
    assert.equal((await f.call('/identity')).data.verified,false);assert.equal((await f.call('/identity')).data.email,'');f.mailer.sendMail=good;assert.equal((await f.call('',f.body)).status,200);
});
test('product requests persist their name and image and attach the image to store email',async t=>{
    const f=await fixture(t), content=await require('sharp')({create:{width:40,height:30,channels:3,background:'green'}}).png().toBuffer(), image='data:image/png;base64,'+content.toString('base64');
    const body={...f.body,type:'request',productName:'Wanted product',image};
    assert.equal((await f.call('',body,'signed',1)).status,200);
    assert.match(f.mails.at(-1).text,/Product name: Wanted product/);
    assert.equal(f.mails.at(-1).attachments[0].contentType,'image/png');
    assert.equal(f.db.prepare('SELECT mime FROM contact_images').get().mime,'image/png');
    assert.equal((await f.call('',{...body,image:'data:image/png;base64,PHNjcmlwdD4='},'signed',1)).status,400);
    assert.equal((await f.call('',{...body,productName:''},'signed',1)).status,200);
    assert.equal((await f.call('',{...body,productName:'',image:null},'signed',1)).status,400);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM contact_images').get().n,2);
});
for (const type of ['email', 'partnership']) test(`${type} preserves the message and supports an optional image`, async t => {
    const f = await fixture(t);
    const content = await require('sharp')({ create: { width: 40, height: 30, channels: 3, background: 'green' } }).png().toBuffer();
    const body = { ...f.body, type, message: 'Keep this message', image: 'data:image/png;base64,' + content.toString('base64') };
    assert.equal((await f.call('', body, 'signed', 1)).status, 200);
    assert.match(f.mails.at(-1).text, /Keep this message/);
    assert.equal(f.mails.at(-1).attachments[0].contentType, 'image/png');
    assert.equal(f.db.prepare('SELECT message FROM contact_messages').get().message, body.message);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM contact_images').get().n, 1);
    assert.equal((await f.call('', { ...body, message: '' }, 'signed', 1)).status, 400);
    assert.equal((await f.call('', { ...body, image: null }, 'signed', 1)).status, 200);
    assert.equal((await f.call('', { ...body, image: 'data:image/png;base64,PHNjcmlwdD4=' }, 'signed', 1)).status, 400);
});
test('admin request-limit setting controls contact messages and verification requests', async t => {
    const f = await fixture(t);
    for (let i = 0; i < 5; i++) assert.equal((await f.call('', f.body, 'signed', 1)).status, 200);
    assert.equal((await f.call('', f.body, 'signed', 1)).status, 429);
    for (let i = 0; i < 10; i++) assert.equal((await f.call('/code', { email: f.body.email }, 'limited-' + i)).status, 200);
    assert.equal((await f.call('/code', { email: f.body.email }, 'blocked')).status, 429);
    f.db.prepare('UPDATE email_security_settings SET rate_limit=0 WHERE id=1').run();
    assert.equal((await f.call('', f.body, 'signed', 1)).status, 200);
    assert.equal((await f.call('/code', { email: f.body.email }, 'unlimited')).status, 200);
    assert.equal((await f.call('/code', { email: f.body.email }, 'unlimited')).status, 429);
    assert.equal((await f.call('', f.body, 'unverified', 2)).status, 403);
    f.db.prepare('UPDATE email_security_settings SET rate_limit=1 WHERE id=1').run();
    assert.equal((await f.call('', f.body, 'signed', 1)).status, 429);
});


test('contact drafts belong to signed-in accounts and stay independent by form type', async t => {
 const f = await fixture(t);
 const photo = 'data:image/png;base64,' + (await require('sharp')({create:{width:2,height:2,channels:3,background:'#abc'}}).png().toBuffer()).toString('base64');
 const draft = {name:'Saved name',message:'Saved text',image:photo,imageName:'photo.png',productName:''};
 assert.equal((await f.call('/drafts/email', draft)).status, 401);
 for (const type of ['email','request','partnership']) {
  assert.equal((await f.call('/drafts/' + type, {...draft,message:type}, 'signed', 1)).status, 200);
  assert.equal((await f.call('/drafts/' + type, undefined, 'signed', 1)).data.draft.message, type);
  assert.equal((await f.call('/drafts/' + type, undefined, 'other', 2)).data.draft, null);
 }
 assert.equal((await f.call('/drafts/email', {...draft,image:null}, 'signed', 1)).status, 200);
 assert.equal((await f.call('/drafts/email', undefined, 'signed', 1)).data.draft.image, null);
 assert.equal((await f.call('/drafts/request', undefined, 'signed', 1)).data.draft.image, photo);
 assert.equal((await f.call('/preview-image', {image:photo})).status, 200);
 assert.equal((await f.call('/preview-image', {image:'invalid'})).status, 400);
 await f.call('', {...f.body,email:'verified@example.com'}, 'signed', 1);
 assert.equal((await f.call('/drafts/email', undefined, 'signed', 1)).data.draft, null);
 assert.equal((await f.call('/drafts/request', undefined, 'signed', 1)).data.draft.image, photo);
});

for (const type of ['email', 'request', 'partnership']) test('guest ' + type + ' can retry verification after delivery fails', async t => {
    const f = await fixture(t), deliver = f.mailer.sendMail;
    f.mailer.sendMail = async () => { throw Object.assign(new Error('Mock timeout'), { code: 'ETIMEDOUT' }); };
    assert.equal((await f.call('/code', { email: f.body.email })).status, 503);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM contact_email_codes').get().n, 0);
    f.mailer.sendMail = deliver;
    const code = await f.issue();
    assert.equal((await f.call('/verify', { email: f.body.email, code })).status, 200);
    const body = { ...f.body, type, ...(type === 'request' ? { productName: 'Requested product' } : {}) };
    assert.equal((await f.call('', body)).status, 200);
});

for (const type of ['email', 'request', 'partnership']) test('guest ' + type + ' reopening clears the previous verification cooldown', async t => {
    const f = await fixture(t);
    const previous = await f.issue();
    assert.equal((await f.call('/code', { email: f.body.email })).status, 429);
    assert.equal((await f.call('/reset-verification', {})).status, 200);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM contact_email_codes').get().n, 0);
    assert.equal((await f.call('/verify', { email: f.body.email, code: previous })).status, 400);
    const fresh = await f.issue();
    assert.equal((await f.call('/verify', { email: f.body.email, code: fresh })).status, 200);
});
