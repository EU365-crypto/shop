const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { publicPages, registerPublicPages } = require('../src/web/pages');
test('organized public pages retain bookmarked URLs and serve their assets', async () => {
    const root = path.resolve(__dirname, '..');
    const app = express(); registerPublicPages(app, root);
    app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        for (const url of ['/', ...Object.keys(publicPages).map(name => '/' + name)]) {
            const response = await fetch(origin + url + '?adminView=1');
            assert.equal(response.status, 200, url);
            const html = await response.text(); assert.match(html, /<html/i);
            for (const match of html.matchAll(/(?:src|href)=["']([/]assets[/][^"']+)["']/g)) {
                assert.equal((await fetch(origin + match[1])).status, 200, match[1]);
            }
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
});
