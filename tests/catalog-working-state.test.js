const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createUnsavedChangesGuard } = require('../public/assets/js/shared/unsaved-changes');
function setup() {
    let writes = 0, conflict = false;
    const win = { location: { search: '' }, addEventListener() {}, confirm: () => true,
        adminWorkingCategories: [{ id: 'fruit', en: 'Fruit', zh: 'Fruit', vi: 'Fruit' }], showCatalogConflict() { conflict = true; } };
    win.adminUnsavedChanges = createUnsavedChangesGuard(win, { addEventListener() {} }, () => {});
    const ctx = { window: win, document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => ({}) },
        crypto: require("node:crypto"), URLSearchParams, Event, structuredClone, Date, setTimeout, selectedCategory: '', products: [],
        translateText: v => v, setLocalizedMessage() {}, renderCategoryBar() {}, localStorage: { setItem() {} },
        getCategorySettings: () => ({ categories: win.adminWorkingCategories }),
        fetch: async (_url, options) => { writes++; const body = JSON.parse(options.body); return { ok: true, json: async () => ({ ...body, revision: body.revision + 1 }) }; } };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/assets/js/admin/catalog-editor.js', 'utf8'), ctx);
    vm.runInContext("catalogReady=true; catalogDraftRows=[[{id:'one',name:'Apple',categoryId:'fruit'}]]; renderCatalogEditor=()=>{}; rememberCatalogState();", ctx);
    return { ctx, win, run: code => vm.runInContext(code, ctx), get writes() { return writes; }, get conflict() { return conflict; } };
}
test('local category creation, renaming and ordering become dirty without server requests', () => {
    const s = setup(); s.run("changeCatalogCategories([{id:'drink',en:'Drink',zh:'',vi:''},{id:'fruit',en:'Fresh fruit',zh:'',vi:''}])");
    assert.equal(s.writes, 0); assert.equal(s.win.adminUnsavedChanges.dirty, true);
    assert.equal(s.win.adminWorkingCategories[0].id, 'drink');
});
test('subcategory edits are local and dirty; removal unassigns products without deleting them and discard restores assignments', async () => {
    const s = setup();
    s.run("changeCatalogSubcategories('fruit', [{id:'berries',en:'Berries',zh:'Berries',vi:'Berries'}]); catalogDraftRows[0][0].subcategoryId='berries'; catalogStatus('Unsaved changes.');");
    assert.equal(s.writes, 0); assert.equal(s.win.adminUnsavedChanges.dirty, true); assert.equal(s.run("catalogCategoryHasChanges('fruit')"), true);
    await s.run('saveCatalogDraft()'); assert.equal(s.win.adminUnsavedChanges.dirty, false);
    s.run("changeCatalogSubcategories('fruit', [], 'berries')");
    assert.equal(s.run('catalogDraftRows.flat().length'), 1); assert.equal(s.run('catalogDraftRows[0][0].subcategoryId'), undefined);
    assert.equal(s.win.adminUnsavedChanges.dirty, true);
    s.run('discardCatalogChanges(false)'); assert.equal(s.run('catalogDraftRows[0][0].subcategoryId'), 'berries');
    assert.throws(() => s.run("changeCatalogSubcategories('fruit',[{id:'a',en:' Berries '},{id:'b',en:'berries'}])"));
});
test('an older backend stripping subcategories cannot clear unsaved work', async () => {
    const s = setup(); s.run("changeCatalogSubcategories('fruit',[{id:'berries',en:'Berries',zh:'Berries',vi:'Berries'}])");
    s.ctx.fetch = async () => ({ ok: true, json: async () => ({ rows: [[{id:'one',name:'Apple',categoryId:'fruit'}]], categories: [{id:'fruit',en:'Fruit',zh:'Fruit',vi:'Fruit'}], revision: 1 }) });
    await s.run('saveCatalogDraft()'); assert.equal(s.win.adminUnsavedChanges.dirty, true);
    assert.equal(s.win.adminWorkingCategories[0].subcategories[0].id, 'berries');
});
test('category removal archives products and discard restores both', () => {
    const s = setup(); s.run("removeCatalogCategory('fruit')");
    assert.equal(s.run('catalogDraftRows.length'), 0); assert.equal(s.run('catalogWorkingState().history[0].rows[0][0].categoryId'), 'fruit'); assert.equal(s.writes, 0);
    s.run('discardCatalogChanges(false)');
    assert.equal(s.run('catalogDraftRows[0][0].categoryId'), 'fruit'); assert.equal(s.win.adminUnsavedChanges.dirty, false);
});
test('failed saves preserve working categories, products and saved baseline', async () => {
    const s = setup(); s.run("removeCatalogCategory('fruit')");
    s.ctx.fetch = async () => { throw new Error('Offline'); };
    await s.run('saveCatalogDraft()'); assert.equal(s.win.adminUnsavedChanges.dirty, true);
    assert.equal(s.run('catalogDraftRows.length'), 0); assert.equal(s.run('catalogWorkingState().history[0].rows[0][0].categoryId'), 'fruit');
    s.run('discardCatalogChanges(false)'); assert.equal(s.run('catalogDraftRows[0][0].categoryId'), 'fruit');
});
test('discard restores the latest successful draft rather than the initial state', async () => {
    const s = setup(); s.run("removeCatalogCategory('fruit')"); await s.run('saveCatalogDraft()');
    assert.equal(s.win.adminUnsavedChanges.dirty, false);
    s.run("restoreCatalogCategory(catalogWorkingState().history[0].id); discardCatalogChanges(false)");
    assert.equal(s.run('catalogDraftRows.length'), 0); assert.equal(s.run('catalogWorkingState().history[0].rows[0][0].name'), 'Apple');
});
test('conflicts retain edits and revision and expose recovery controls', async () => {
    const s = setup(); s.run("removeCatalogCategory('fruit')");
    s.ctx.fetch = async () => ({ ok: false, status: 409, json: async () => ({ message: 'Conflict', revision: 10 }) });
    await s.run('saveCatalogDraft()'); assert.equal(s.conflict, true); assert.equal(s.run('catalogRevision'), 0);
    assert.equal(s.win.adminUnsavedChanges.dirty, true); assert.equal(s.run('catalogDraftRows.length'), 0); assert.equal(s.run('catalogWorkingState().history[0].rows[0][0].categoryId'), 'fruit');
});
test('admin publication requires saving edits first and becomes available after a successful save', async () => {
    const s = setup(); const feedback = [];
    s.win.storeEditorActive = true; s.win.setAdminSaveFeedback = state => feedback.push(state);
    s.run("removeCatalogCategory('fruit')");
    await s.run('publishCatalogDraft()');
    assert.equal(s.writes, 0); assert.equal(feedback.at(-1), 'blocked'); assert.equal(s.win.adminUnsavedChanges.dirty, true);
    await s.run('saveCatalogDraft()'); assert.equal(s.win.adminUnsavedChanges.dirty, false);
    await s.run('publishCatalogDraft()'); assert.equal(s.writes, 2); assert.equal(feedback.at(-1), 'saved');
});
test('product and category change indicators track individual edits and clear on save or discard', async () => {
    const s = setup();
    assert.equal(s.run("catalogItemHasChanges('one')"), false);
    assert.equal(s.run("catalogCategoryHasChanges('fruit')"), false);
    s.run("catalogDraftRows[0][0].name='Pear'; catalogStatus('Unsaved changes.');");
    assert.equal(s.run("catalogItemHasChanges('one')"), true);
    assert.equal(s.run("catalogCategoryHasChanges('fruit')"), false);
    s.run("changeCatalogCategories([{id:'fruit',en:'Fresh fruit',zh:'Fruit',vi:'Fruit'}])");
    assert.equal(s.run("catalogCategoryHasChanges('fruit')"), true);
    s.ctx.fetch = async () => { throw new Error('Offline'); };
    await s.run('saveCatalogDraft()');
    assert.equal(s.run("catalogItemHasChanges('one')"), true);
    assert.equal(s.run("catalogCategoryHasChanges('fruit')"), true);
    s.run('discardCatalogChanges(false)');
    assert.equal(s.run("catalogItemHasChanges('one')"), false);
    assert.equal(s.run("catalogCategoryHasChanges('fruit')"), false);
    s.run("catalogDraftRows[0][0].price=4; catalogStatus('Unsaved changes.');");
    s.ctx.fetch = async (_url, options) => ({ok:true,json:async()=>({...JSON.parse(options.body),revision:1})});
    await s.run('saveCatalogDraft()');
    assert.equal(s.run("catalogItemHasChanges('one')"), false);
});
test('an older server response cannot report category changes saved successfully', async () => {
    const s=setup(); s.win.storeEditorActive=true;
    s.run("removeCatalogCategory('fruit')");
    s.ctx.fetch=async()=>({ok:true,json:async()=>({rows:[]})});
    await s.run('saveCatalogDraft()');
    assert.equal(s.win.adminUnsavedChanges.dirty,true);
    assert.equal(s.run('catalogDraftRows.length'),0); assert.equal(s.run('catalogWorkingState().history.length'),1);
});
test('history restore retains category and product IDs and marks the draft unsaved', async () => {
    const s=setup();s.run("removeCatalogCategory('fruit')");await s.run('saveCatalogDraft()');
    s.run('restoreCatalogCategory(catalogWorkingState().history[0].id)');
    assert.equal(s.run('catalogDraftRows[0][0].id'),'one');assert.equal(s.run('catalogWorkingState().categories[0].id'),'fruit');
    assert.equal(s.run('catalogWorkingState().history.length'),0);assert.equal(s.win.adminUnsavedChanges.dirty,true);
});
