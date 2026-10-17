const projectRoot = require('node:path').resolve(__dirname, '..');
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('test command discovers nested suites, excludes manual scripts and propagates failures', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'easyshop-test-runner-'));
    try {
        mkdirSync(path.join(root, 'scripts')); mkdirSync(path.join(root, 'nested'));
        const runner = path.join(root, 'scripts/run-tests.cjs');
        copyFileSync(path.join(projectRoot, 'scripts/run-tests.cjs'), runner);
        writeFileSync(path.join(root, 'test-email.js'), "throw new Error('Manual email script must never run');");
        const suite = path.join(root, 'nested/example.test.js');
        const env = { ...process.env };
        delete env.NODE_TEST_CONTEXT;
        writeFileSync(suite, "require('node:test')('nested suite',()=>{});");
        let result = spawnSync(process.execPath, [runner], { encoding: 'utf8', env });
        assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /nested suite/);
        writeFileSync(suite, "require('node:test')('failed suite',()=>{throw new Error('expected failure');});");
        result = spawnSync(process.execPath, [runner], { encoding: 'utf8', env });
        assert.equal(result.status, 1); assert.match(result.stdout, /expected failure/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
