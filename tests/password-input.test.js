const projectRoot = require('node:path').resolve(__dirname, '..');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(projectRoot, 'public', name), 'utf8');

test('shared transitions leave password input, paste, and autofill events native', () => {
    const listeners = [];
    const document = {
        readyState: 'loading', documentElement: { classList: { add() {}, remove() {} }, dataset: {} },
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener: (type, handler) => listeners.push({ type, handler }), dispatchEvent() {}
    };
    const window = {
        location: { pathname: '/user-login.html' },
        matchMedia: () => ({ matches: true, addEventListener() {} }),
        addEventListener: (type, handler) => listeners.push({ type, handler }), clearTimeout() {}
    };
    vm.runInNewContext(read('assets/js/shared/store-transition.js'), {
        window, document, location: window.location,
        fetch: async () => ({ ok: false }), CustomEvent: class {}, Event: class {},
    });
    for (const type of ['paste', 'beforeinput', 'input', 'change']) {
        assert.equal(listeners.some(listener => listener.type === type), false);
    }
});

test('password visibility toggling preserves entered or autofilled values', () => {
    for (const page of ['pages/auth/user-login.html', 'pages/auth/signup.html', 'pages/auth/verify.html']) {
        const html = read(page);
        const inputs = Object.fromEntries([...html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*type="password"[^>]*>/g)]
            .map(match => [match[1], { type: 'password', value: '  Synthetic! Unicode \u00e9\u4e2d  ' }]));
        const document = { getElementById: id => inputs[id] };
        const handler = html.match(/onchange="([^"]*this\.checked[^\"]*)"/)[1];
        const original = Object.values(inputs).map(input => input.value);
        for (const checked of [true, false, true, false]) {
            vm.runInNewContext('(function(){' + handler + '}).call({checked: checked})', { document, checked });
            assert.ok(Object.values(inputs).every(input => input.type === (checked ? 'text' : 'password')));
            assert.ok(Object.values(inputs).every((input, index) => input.value === original[index]));
        }
    }
});

test('authentication fields keep browser password-manager autocomplete hints', () => {
    for (const [page, hint] of [['pages/auth/user-login.html', 'current-password'], ['pages/auth/admin-login.html', 'current-password'], ['pages/auth/signup.html', 'new-password'], ['pages/auth/verify.html', 'new-password']]) {
        const fields = [...read(page).matchAll(/<input\b[^>]*type="password"[^>]*>/g)];
        assert.ok(fields.length > 0);
        assert.ok(fields.every(field => field[0].includes('autocomplete="' + hint + '"')));
    }
});
