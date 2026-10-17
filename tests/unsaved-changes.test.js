const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createUnsavedChangesGuard } = require('../public/assets/js/shared/unsaved-changes');
function setup(answer = false) {
    const handlers = new Map(); let confirmations = 0;
    const win = { location: { href: 'http://localhost/store.html?adminView=1', origin: 'http://localhost', pathname: '/store.html', search: '?adminView=1' }, addEventListener(type, fn) { handlers.set(type, fn); } };
    const guard = createUnsavedChangesGuard(win, { addEventListener(type, fn) { handlers.set(type, fn); } }, () => {}, async () => { confirmations++; return answer; });
    return { guard, handlers, get confirmations() { return confirmations; } };
}
const rows = () => [[{ id: 'one', name: 'Apple', description: 'Fresh', price: 2, categoryId: 'fruit', image: '/apple.png', imageZoom: 100, imageOffsetX: 0, imageOffsetY: 0, cardWidth: 230, imageHeight: 220, priceUnit: 'item', taxType: 'general' }]];
test('product properties, additions and removals become dirty; reverted edits are clean', () => {
    const { guard } = setup(); const original = rows(); guard.saved(original);
    for (const [key, value] of Object.entries({ name: 'Pear', description: 'Other', price: 3, categoryId: 'other', image: '/pear.png', imageZoom: 110, imageOffsetX: 5, imageOffsetY: 5, cardWidth: 240, imageHeight: 230, priceUnit: 'lb', taxType: 'food' })) {
        const changed = rows(); changed[0][0][key] = value; guard.changed(changed); assert.equal(guard.dirty, true, key);
        guard.changed(original); assert.equal(guard.dirty, false, key);
    }
    guard.changed([...original, []]); assert.equal(guard.dirty, true);
    guard.changed([]); assert.equal(guard.dirty, true);
});
test('clean navigation skips dialogs; Stay blocks and Discard permits navigation', async () => {
    let actions = 0; const s = setup(false); s.guard.saved(rows());
    await s.guard.navigate(() => actions++); assert.equal(actions, 1); assert.equal(s.confirmations, 0);
    s.guard.changed([]); await s.guard.navigate(() => actions++); assert.equal(actions, 1); assert.equal(s.guard.dirty, true);
    const discard = setup(true); discard.guard.saved(rows()); discard.guard.changed([]);
    await discard.guard.navigate(() => actions++); assert.equal(actions, 2); assert.equal(discard.guard.dirty, true);
});
test('refresh warnings track dirty state and restore after cancelled logout or page return', async () => {
    const s = setup(true); s.guard.saved(rows());
    const warned = () => { let warned = false; const event = { preventDefault() { warned = true; } }; s.handlers.get('beforeunload')(event); return warned; };
    assert.equal(warned(), false); s.guard.changed([]); assert.equal(warned(), true);
    await s.guard.navigate(() => {}); assert.equal(warned(), false);
    s.guard.cancelNavigation(); assert.equal(warned(), true);
    await s.guard.navigate(() => {}); s.handlers.get('pageshow')(); assert.equal(warned(), true);
    s.guard.saved([]); assert.equal(warned(), false);
});
test('in-app links are protected while external, hash and new-tab links retain native behavior', async () => {
    const s = setup(); s.guard.saved(rows()); s.guard.changed([]);
    function click(href, target = '') {
        const link = { href, target, hasAttribute: () => false };
        const event = { button: 0, target: { closest: selector => selector === 'a[href]' ? link : null }, prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
        s.handlers.get('click')(event); return event.prevented;
    }
    assert.equal(click('http://localhost/admin/settings'), true);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(s.confirmations, 1);
    assert.equal(click('http://localhost/admin/settings', '_blank'), false);
    assert.equal(click('https://external.example/'), false);
    assert.equal(click('http://localhost/store.html?adminView=1#fruit'), false);
});
test('actual draft and publish workflows clear dirty only after successful responses', async () => {
    const s = setup(); const original = rows(), changed = rows(); changed[0][0].price = 5; s.guard.saved(original);
    const context = { window: { location: { search: '' }, addEventListener() {}, adminUnsavedChanges: s.guard, confirm: () => true }, document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => ({}) },
        structuredClone, Event, getCategorySettings: () => ({ categories: [] }), renderCategoryBar() {}, URLSearchParams, Date, setTimeout, translateText: value => value, setLocalizedMessage() {}, products: [], localStorage: { setItem() {} }, original, changed,
        fetch: async () => ({ ok: false, json: async () => ({ message: 'Save failed' }) }) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('public/assets/js/admin/catalog-editor.js', 'utf8'), context);
    vm.runInContext('catalogReady=true; catalogDraftRows=changed; renderCatalogEditor=()=>{}; catalogStatus("Unsaved changes.");', context);
    await vm.runInContext('saveCatalogDraft()', context); assert.equal(s.guard.dirty, true);
    context.fetch = async () => ({ ok: true, json: async () => ({ rows: changed }) });
    await vm.runInContext('saveCatalogDraft()', context); assert.equal(s.guard.dirty, false);
    vm.runInContext('catalogDraftRows=original; catalogStatus("Unsaved changes.");', context);
    context.window.confirm = () => false; await vm.runInContext('publishCatalogDraft()', context); assert.equal(s.guard.dirty, true);
    context.window.confirm = () => true; context.fetch = async () => ({ ok: true, json: async () => ({ rows: original }) });
    await vm.runInContext('publishCatalogDraft()', context); assert.equal(s.guard.dirty, false);
});
