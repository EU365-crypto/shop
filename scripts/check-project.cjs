const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { publicPages } = require('../src/web/pages');

const root = path.resolve(__dirname, '..');
const directories = ['src', 'public', 'private', 'scripts', 'tests'];
const failures = [];
let checked = 0;
function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? files(filename) : [filename];
    });
}
for (const filename of [path.join(root, 'server.js'), ...directories.flatMap(directory => files(path.join(root, directory)))]) {
    if (!/\.(js|cjs|html)$/.test(filename)) continue;
    const source = fs.readFileSync(filename, 'utf8');
    const relative = path.relative(root, filename);
    checked++;
    if (/\.(js|cjs)$/.test(filename)) {
        try { new vm.Script(source, { filename: relative }); }
        catch (error) { failures.push(`${relative}: ${error.message}`); }
        for (const match of source.matchAll(/require\((['"])(\.[^'"]+)\1\)/g)) {
            try { require.resolve(path.resolve(path.dirname(filename), match[2])); }
            catch { failures.push(`${relative}: missing module ${match[2]}`); }
        }
    } else {
        for (const [index, match] of [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
            if (/\bsrc\s*=/.test(match[1]) || /application\/(?:ld\+)?json/.test(match[1])) continue;
            try { new vm.Script(match[2], { filename: `${relative}:inline-${index + 1}` }); }
            catch (error) { failures.push(`${relative}: ${error.message}`); }
        }
        for (const match of source.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
            if (/^(?:https?:|data:|#)/.test(match[1])) continue;
            const resource = match[1].split(/[?#]/)[0];
            const target = resource.startsWith('/') ? path.join(root, 'public', resource) : path.resolve(path.dirname(filename), resource);
            if (!fs.existsSync(target)) failures.push(`${relative}: missing asset ${resource}`);
        }
    }
}
for (const file of Object.values(publicPages)) {
    if (!fs.existsSync(path.join(root, 'public', 'pages', file))) failures.push(`Missing public page: ${file}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${checked} JavaScript/HTML files: syntax, module imports, inline scripts, page routes, and asset references passed.`);
