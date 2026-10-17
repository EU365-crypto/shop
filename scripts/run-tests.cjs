const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules', '.git', '.backups', '.codex', '.agents', '.aws']);
function findTests(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) return excluded.has(entry.name) ? [] : findTests(filename);
        return entry.isFile() && entry.name.endsWith('.test.js') ? [filename] : [];
    });
}
const tests = findTests(root).sort();
if (!tests.length) { console.error('No *.test.js files found.'); process.exit(1); }
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
