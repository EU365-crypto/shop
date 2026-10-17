// Headless-browser verification against an isolated SQLite database and mock mailer.
// Run: node scripts/verify-message-center.cjs
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { registerMessageCenter } = require('../src/mail/message-center');
const { csrfProtection } = require('../src/auth/session-security');
async function main() {
    const browser = [process.env.EASYSHOP_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(value => value && fs.existsSync(value));
    if (!browser) throw new Error('Set EASYSHOP_TEST_BROWSER to a Chromium browser executable.');
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,role TEXT,email_verified INTEGER,verification_token TEXT,verification_expires INTEGER); INSERT INTO users VALUES(1,'customer@example.com','user',1,NULL,NULL),(2,'other@example.com','user',1,NULL,NULL),(3,'admin@example.com','admin',1,NULL,NULL)");
    const app = express(), config = { origin: '' };
    app.use(express.json()); app.use(csrfProtection(config));
    app.use((req, res, next) => { req.session = { user: { id: Number(req.get('x-test-user') || 1) } }; next(); });
    app.use(express.static(path.join(__dirname, '../public')));
    app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, '../private/account/account-emails.html')));
    app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../private/admin/admin-emails.html')));
    const mailer = { verify: async () => true, sendMail: async value => ({ accepted: [value.to], messageId: 'mock-browser-provider' }) };
    const center = registerMessageCenter(app, db, mailer, { sender: 'store@example.com', support: 'support@example.com', baseUrl: 'http://localhost', startWorker: false, sendVerification: async () => {} });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = `http://127.0.0.1:${server.address().port}`; config.origin = url;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-browser-'));
    const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let socket;
    try {
        const endpoint = await new Promise((resolve, reject) => { let output = ''; const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 20000); child.on('error', reject); child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } }); });
        const debugOrigin = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
        const targets = await (await fetch(debugOrigin + '/json/list')).json();
        socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let serial = 0; const pending = new Map();
        socket.onmessage = event => { const data = JSON.parse(event.data); if (process.env.EASYSHOP_BROWSER_DEBUG === '1') console.log('CDP received', data.id || data.method); if (pending.has(data.id)) { const { resolve, reject, timeout } = pending.get(data.id); pending.delete(data.id); clearTimeout(timeout); data.error ? reject(new Error(data.error.message)) : resolve(data.result); } };
        const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 10000); pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params })); });
        const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result?.description); return result.result.value; };
        const wait = expression => evaluate(`new Promise((resolve,reject)=>{const started=Date.now();const check=()=>{if(${expression})resolve(true);else if(Date.now()-started>6000)reject(new Error('UI condition timed out'));else setTimeout(check,50)};check()})`);
        await command('Network.enable'); await command('Network.setExtraHTTPHeaders', { headers: { 'x-test-user': '1' } });
        await command('Page.navigate', { url: url + '/customer' }); await wait("document.getElementById('list')?.textContent.includes('No conversations')");
        await evaluate("document.getElementById('compose').click()"); await wait("document.getElementById('body')");
        await evaluate("document.getElementById('subject').value='Browser subject';document.getElementById('body').value='<img src=x onerror=alert(1)> Browser body';document.getElementById('body').dispatchEvent(new Event('input',{bubbles:true}))");
        await wait("document.getElementById('draft-status')?.dataset.sendState==='sent'");
        await command('Page.reload'); await wait("document.getElementById('list')?.textContent.includes('No conversations')"); await evaluate("document.getElementById('compose').click()"); await wait("document.getElementById('body')?.value.includes('Browser body')");
        db.prepare('UPDATE users SET email_verified=0 WHERE id=1').run();
        await evaluate("document.querySelector('.mc-compose').requestSubmit()"); await wait("document.getElementById('notice').textContent.includes('Verify your email')");
        assert.equal(await evaluate("document.getElementById('body').value.includes('Browser body')"), true);
        db.prepare('UPDATE users SET email_verified=1 WHERE id=1').run();
        await evaluate("document.querySelector('.mc-compose').requestSubmit();document.querySelector('.mc-compose').requestSubmit()"); await wait("document.getElementById('history')?.textContent.includes('Browser body')");
        assert.equal(db.prepare('SELECT COUNT(*) n FROM mc_messages').get().n, 1);
        assert.equal(await evaluate("document.getElementById('history').querySelectorAll('img,script').length"), 0);
        await center.processOutbox(); await wait("!document.querySelector('#history .mc-status') || document.querySelector('#history .mc-status').hidden");
        const requestImage = await require('sharp')({create:{width:1600,height:900,channels:3,background:'green'}}).png().toBuffer();
        const firstConversation = db.prepare('SELECT id FROM mc_conversations LIMIT 1').get().id;
        db.prepare('UPDATE mc_conversations SET legacy_id=444 WHERE id=?').run(firstConversation);
        db.prepare('INSERT INTO contact_images(contact_message_id,mime,content) VALUES(?,?,?)').run(444,'image/png',requestImage);
        async function checkImageViewer() {
            await wait("document.querySelector('.mc-image-open')");
            await evaluate("document.querySelector('.mc-image-open').click()"); await wait("document.querySelector('.mc-image-viewer')?.open&&document.querySelector('.mc-image-viewer img').naturalWidth===1600");
            const original = await evaluate("({width:document.querySelector('.mc-image-viewer img').getBoundingClientRect().width,locked:document.body.style.overflow,focused:document.activeElement.classList.contains('mc-image-close')})");
            assert.equal(original.width,1600); assert.equal(original.locked,'hidden'); assert.equal(original.focused,true);
            await evaluate("document.querySelector('.mc-image-toolbar button').click()");
            assert.equal(await evaluate("document.querySelector('.mc-image-viewport').classList.contains('fit')"),true);
            await evaluate("document.querySelector('.mc-image-close').click()"); assert.equal(await evaluate("document.querySelector('.mc-image-viewer').open"),false);
            await evaluate("document.querySelector('.mc-image-open').click()");
            await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
            await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
            await wait("!document.querySelector('.mc-image-viewer').open");
            assert.equal(await evaluate("document.querySelector('.mc-message-dialog').open"),true);
        }
        await command('Network.setExtraHTTPHeaders', { headers: { 'x-test-user': '3' } }); await command('Page.navigate', { url: url + '/admin' }); await wait("document.querySelector('.mc-row')");
        await evaluate("document.querySelector('.mc-row-open').click()"); await wait("document.querySelector('.mc-message-dialog')?.open&&document.getElementById('reply')");
        await checkImageViewer();
        assert.equal(await evaluate("document.querySelector('.mc-compose')===null"), true);
        await evaluate("document.getElementById('reply').click()"); await wait("document.getElementById('body')");
        await evaluate("document.getElementById('body').value='Admin browser reply';document.getElementById('body').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.mc-compose').requestSubmit()"); await wait("document.getElementById('history')?.textContent.includes('Admin browser reply')");
        await command('Network.setExtraHTTPHeaders', { headers: { 'x-test-user': '1' } }); await command('Page.navigate', { url: url + '/customer' }); await wait("document.querySelector('.mc-row')"); await evaluate("document.querySelector('.mc-row-open').click()"); await wait("document.getElementById('history')?.textContent.includes('Admin browser reply')");
        for (const width of [390, 768, 1280]) {
            await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
            const layout = await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,list:getComputedStyle(document.querySelector('.mc-list')).display,detail:getComputedStyle(document.querySelector('.mc-detail')).display,back:getComputedStyle(document.querySelector('.mc-back')).display})");
            assert.equal(layout.overflow, false); assert.notEqual(layout.detail, 'none');
            assert.equal(await evaluate("document.querySelector('.mc-message-dialog').open"), true);
        }
        await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
        await checkImageViewer();
        await evaluate("document.querySelector('.mc-dialog-close').click()"); assert.equal(await evaluate("document.querySelector('.mc-message-dialog').open"), false);
        await evaluate("document.querySelector('.mc-row-open').click()"); await wait("document.querySelector('.mc-message-dialog')?.open&&document.getElementById('reply')");
        assert.equal(await evaluate("document.querySelector('.mc-compose')===null"), true);
        await evaluate("document.getElementById('reply').click()"); await wait("document.getElementById('body')");
        await evaluate("document.getElementById('body').value='Keep draft while polling';document.getElementById('body').dispatchEvent(new Event('input',{bubbles:true}))");
        await evaluate("document.getElementById('reply').click()"); assert.equal(await evaluate("document.querySelector('.mc-compose').hidden"), true);
        await evaluate("document.getElementById('reply').click()"); assert.equal(await evaluate("document.getElementById('body').value"), 'Keep draft while polling');
        const conversationId = db.prepare('SELECT id FROM mc_conversations').get().id;
        await fetch(url + '/api/admin/message-center/send', { method: 'POST', headers: { 'x-test-user': '3', 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' }, body: JSON.stringify({ conversationId, body: 'Live reply without refresh', requestKey: require('node:crypto').randomUUID() }) });
        await wait("document.getElementById('history')?.textContent.includes('Live reply without refresh')"); assert.equal(await evaluate("document.getElementById('body').value"), 'Keep draft while polling');
        await center.processOutbox(); await center.processOutbox();
        await evaluate("document.querySelector('.mc-compose').requestSubmit()"); await wait("document.getElementById('history')?.textContent.includes('Keep draft while polling')");
        const goodSend = mailer.sendMail; mailer.sendMail = async () => { throw Object.assign(new Error('Mock provider rejection'), { code: 'EENVELOPE' }); };
        await center.processOutbox(); await wait("document.getElementById('history')?.textContent.includes('Failed')");
        db.prepare('UPDATE mc_outbox SET updated=0 WHERE state=?').run('failed'); mailer.sendMail = goodSend;
        await evaluate("[...document.querySelectorAll('#history button')].find(button=>button.textContent==='Retry').click()");
        await wait("document.getElementById('notice').textContent==='Retry queued.'"); await center.processOutbox();
        await wait("!document.getElementById('history').textContent.includes('Failed')");
        await evaluate("document.querySelector('.mc-dialog-close').focus()");
        assert.equal(await evaluate("document.activeElement.classList.contains('mc-dialog-close')"), true);
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }); await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        await wait("!document.querySelector('.mc-message-dialog').open");
        console.log('Browser checks passed: draft refresh, verification failure recovery, duplicate Send, safe content, provider status polling, admin reply, live updates preserving draft input, failed delivery/Retry, desktop/tablet/mobile layout and keyboard Back.');
    } finally {
        if (socket) socket.close(); child.kill(); center.stop(); await new Promise(resolve => server.close(resolve)); db.close();
        // Keep the isolated browser profile rather than recursively deleting a computed Windows path.
        console.log('Isolated browser profile retained at ' + profile);
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
