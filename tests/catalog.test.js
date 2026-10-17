const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { registerCatalog, validateRows } = require("../src/catalog/catalog");

function item(id = "item-1") {
    return { id, name: "Apples", description: "Fresh", image: "https://example.com/apple.jpg",
        price: 2.5, categoryId: "produce", cardWidth: 230, imageHeight: 220, imageZoom: 100, taxType: "general" };
}
function setup(databasePath = ':memory:') {
    const db = new DatabaseSync(databasePath);
    const routes = new Map();
    const app = Object.fromEntries(["get", "put", "post"].map(method => [method,
        (path, ...handlers) => routes.set(method + path, handlers)]));
    registerCatalog(app, db);
    function request(method, path, body = {}, role) {
        if (method !== 'get' && ['/api/catalog/draft', '/api/catalog/publish'].includes(path)) {
            const saved = db.prepare('SELECT revision,draft_categories FROM storefront_catalog WHERE id=1').get();
            body = { revision: saved.revision, categories: JSON.parse(saved.draft_categories || db.prepare('SELECT categories FROM store_categories WHERE id=1').get().categories), ...body };
        }
        let status = 200;
        let result;
        const req = { body, session: role ? { user: { role } } : {} };
        const res = { set() {}, status(value) { status = value; return res; }, json(value) { result = value; } };
        const handlers = routes.get(method + path);
        let index = 0;
        const next = () => handlers[index++](req, res, next);
        next();
        return { status, result };
    }
    return { db, request };
}
test('subcategory drafts stay private, persist after reopening SQLite, publish atomically and never delete assigned products', () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-subcategories-')), file = path.join(directory, 'catalog.sqlite');
    let s = setup(file);
    const categories = [{ id: 'produce', en: 'Produce', zh: '', vi: '', subcategories: [{ id: 'leafy', en: 'Leafy Greens', zh: '', vi: '' }, { id: 'roots', en: 'Roots', zh: '', vi: '' }] }];
    const rows = [[{ ...item(), subcategoryId: 'leafy' }]];
    try {
        assert.equal(s.request('put', '/api/catalog/draft', { categories, rows }, 'user').status, 403);
        assert.equal(s.request('put', '/api/catalog/draft', { categories, rows }, 'admin').status, 200);
        assert.equal(s.request('get', '/api/catalog').result.rows, null);
        assert.equal(s.request('get', '/api/catalog').result.categories[0].subcategories, undefined);
        s.db.close(); s = setup(file);
        const saved = s.request('get', '/api/catalog/draft', {}, 'admin').result;
        assert.equal(saved.categories[0].subcategories[0].id, 'leafy'); assert.equal(saved.rows[0][0].subcategoryId, 'leafy');
        assert.equal(s.request('post', '/api/catalog/publish', { categories, rows }, 'admin').status, 200);
        const changed = structuredClone(categories); changed[0].subcategories.reverse(); changed[0].subcategories[1].en = 'Greens';
        assert.equal(s.request('put', '/api/catalog/draft', { categories: changed, rows }, 'admin').status, 200);
        assert.equal(s.request('get', '/api/catalog').result.categories[0].subcategories[0].en, 'Leafy Greens');
        assert.equal(s.request('post', '/api/catalog/publish', { categories: changed, rows }, 'admin').status, 200);
        s.db.close(); s = setup(file);
        assert.deepEqual(s.request('get', '/api/catalog').result.categories[0].subcategories.map(sub => sub.id), ['roots', 'leafy']);
        changed[0].subcategories = changed[0].subcategories.filter(sub => sub.id !== 'leafy');
        const unassigned = [[{ ...item() }]];
        assert.equal(s.request('post', '/api/catalog/publish', { categories: changed, rows: unassigned }, 'admin').status, 200);
        assert.equal(s.request('get', '/api/catalog').result.rows.flat().length, 1);
        assert.equal(s.request('get', '/api/catalog').result.rows[0][0].id, 'item-1');
    } finally { s.db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('invalid subcategory names and cross-category assignments leave both snapshots intact', () => {
    const s = setup();
    try {
        const categories = [{ id: 'produce', en: 'Produce', zh: '', vi: '', subcategories: [{ id: 'leafy', en: 'Greens', zh: '', vi: '' }] }, { id: 'fruit', en: 'Fruit', zh: '', vi: '', subcategories: [] }];
        const rows = [[{ ...item(), subcategoryId: 'leafy' }]];
        assert.equal(s.request('post', '/api/catalog/publish', { categories, rows }, 'admin').status, 200);
        const before = s.request('get', '/api/catalog').result;
        for (const route of [['put', '/api/catalog/draft'], ['post', '/api/catalog/publish']]) {
            assert.equal(s.request(...route, { categories, rows: [[{ ...rows[0][0], categoryId: 'fruit' }]] }, 'admin').status, 400);
            const duplicate = structuredClone(categories); duplicate[0].subcategories.push({ id: 'different', en: ' greens ', zh: '', vi: '' });
            assert.equal(s.request(...route, { categories: duplicate, rows }, 'admin').status, 400);
            const blank = structuredClone(categories); blank[0].subcategories[0].en = ' ';
            assert.equal(s.request(...route, { categories: blank, rows }, 'admin').status, 400);
        }
        assert.deepEqual(s.request('get', '/api/catalog').result, before);
        assert.deepEqual(s.request('get', '/api/catalog/draft', {}, 'admin').result.rows, before.rows);
    } finally { s.db.close(); }
});

test('category creation, renaming, ordering and deletion stay private until publication', () => {
    const {db, request} = setup();
    try {
        const initial = request('get','/api/categories').result.categories;
        const categories = [{id:'fruit',en:'Fruit',zh:'',vi:''}];
        assert.equal(request('put','/api/admin/categories',{categories},'user').status,403);
        assert.equal(request('put','/api/admin/categories',{categories},'admin').status,409);
        assert.equal(request('put','/api/catalog/draft',{rows:[],categories},'admin').status,200);
        assert.deepEqual(request('get','/api/categories').result.categories,initial);
        const renamed = [{id:'drink',en:'Drink',zh:'',vi:''},{id:'fruit',en:'Fresh fruit',zh:'',vi:''}];
        request('put','/api/catalog/draft',{rows:[],categories:renamed},'admin');
        assert.deepEqual(request('get','/api/categories').result.categories,initial);
        assert.equal(request('post','/api/catalog/publish',{rows:[],categories:renamed},'admin').status,200);
        assert.deepEqual(request('get','/api/categories').result.categories.map(c=>c.id),['drink','fruit']);
        request('put','/api/catalog/draft',{rows:[],categories:[]},'admin');
        assert.equal(request('get','/api/categories').result.categories.length,2);
        request('post','/api/catalog/publish',{rows:[],categories:[]},'admin');
        assert.deepEqual(request('get','/api/categories').result.categories,[]);
    } finally {db.close();}
});

test("drafts stay private and publication replaces the complete shared catalog", () => {
    const { db, request } = setup();
    try {
        const rows = [[item()]];
        assert.equal(request("put", "/api/catalog/draft", { rows }, "admin").status, 200);
        assert.equal(request("get", "/api/catalog").result.rows, null);
        assert.deepEqual(request("get", "/api/catalog/draft", {}, "admin").result.rows, rows);
        assert.equal(request("post", "/api/catalog/publish", { rows }, "admin").status, 200);
        assert.deepEqual(request("get", "/api/catalog").result.rows, rows);
        const draft = [[{ ...item(), name: "Green apples", cardWidth: 348, imageZoom: 175 }]];
        request("put", "/api/catalog/draft", { rows: draft }, "admin");
        assert.equal(request("get", "/api/catalog").result.rows[0][0].name, "Apples");
        request("post", "/api/catalog/publish", { rows: draft }, "admin");
        assert.equal(request("get", "/api/catalog").result.rows[0][0].name, "Green apples");
        assert.equal(request("get", "/api/catalog").result.rows[0][0].cardWidth, 348);
        assert.equal(request("get", "/api/catalog").result.rows[0][0].imageZoom, 175);
        request("post", "/api/catalog/publish", { rows: [] }, "admin");
        assert.deepEqual(request("get", "/api/catalog").result.rows, []);
    } finally { db.close(); }
});

test("only admins can read drafts, save, or publish", () => {
    const { db, request } = setup();
    try {
        for (const role of [undefined, "user"]) {
            for (const [method, path] of [["get", "/api/catalog/draft"], ["put", "/api/catalog/draft"], ["post", "/api/catalog/publish"]]) {
                assert.equal(request(method, path, { rows: [[item()]] }, role).status, 403);
            }
        }
        assert.equal(request("get", "/api/catalog").status, 200);
    } finally { db.close(); }
});

test("invalid publications leave the live catalog intact", () => {
    const { db, request } = setup();
    try {
        const rows = [[item()]];
        request("post", "/api/catalog/publish", { rows }, "admin");
        for (const invalid of [
            [Array.from({ length: 5 }, (_, index) => item(String(index)))],
            [[item(), item()]], [[{ ...item(), price: -1 }]],
            [[{ ...item(), cardWidth: 349 }]], [[{ ...item(), imageHeight: 301 }]],
            [[{ ...item(), imageHeight: 900 }]], [[{ ...item(), image: "javascript:bad" }]],
            [[{ ...item(), name: "" }]], [[{ ...item(), imageZoom: 400 }]]
        ]) {
            assert.equal(request("post", "/api/catalog/publish", { rows: invalid }, "admin").status, 400);
            assert.deepEqual(request("get", "/api/catalog").result.rows, rows);
        }
        assert.doesNotThrow(() => validateRows([[{ ...item(), name: "", image: "" }]], false));
    } finally { db.close(); }
});


test('stale saves cannot overwrite newer drafts or published data', () => {
    const {db,request}=setup(); try {
        request('put','/api/catalog/draft',{rows:[[item()]],revision:0},'admin');
        assert.equal(request('post','/api/catalog/publish',{rows:[],revision:0},'admin').status,409);
        assert.equal(request('get','/api/catalog/draft',{},'admin').result.rows[0][0].name,'Apples');
        assert.equal(request('get','/api/catalog').result.rows,null);
    } finally {db.close();}
});
test('removed categories require reassignment for publication and invalid categories preserve state', () => {
    const {db,request}=setup(); try {
        assert.equal(request('post','/api/catalog/publish',{rows:[[item()]],categories:[]},'admin').status,400);
        assert.equal(request('put','/api/catalog/draft',{rows:[],categories:[{id:'bad',en:''}]},'admin').status,400);
        assert.equal(request('post','/api/catalog/publish',{rows:[[{...item(),categoryId:'uncategorized'}]],categories:[{id:'uncategorized',en:'Uncategorized',zh:'',vi:''}]},'admin').status,200);
    } finally {db.close();}
});
test('database failures roll back products, categories and revision together', () => {
    const {db,request}=setup(); try {
        const before=request('get','/api/catalog').result;
        db.exec("CREATE TRIGGER fail_categories BEFORE UPDATE ON store_categories BEGIN SELECT RAISE(ABORT,'failure'); END");
        assert.equal(request('post','/api/catalog/publish',{rows:[[item()]]},'admin').status,500);
        assert.deepEqual(request('get','/api/catalog').result,before);
        assert.equal(request('get','/api/catalog/draft',{},'admin').result.revision,0);
    } finally {db.close();}
});
test('migration preserves existing categories and published products', () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec('CREATE TABLE store_categories(id INTEGER PRIMARY KEY, categories TEXT); CREATE TABLE storefront_catalog(id INTEGER PRIMARY KEY, draft TEXT, published TEXT)');
        const categories = [{id:'produce',en:'Legacy',zh:'Legacy',vi:'Legacy'}], rows = [[item()]];
        db.prepare('INSERT INTO store_categories VALUES(1,?)').run(JSON.stringify(categories));
        db.prepare('INSERT INTO storefront_catalog VALUES(1,NULL,?)').run(JSON.stringify(rows));
        const routes = new Map(), app = Object.fromEntries(['get','put','post'].map(m=>[m,(path,...handlers)=>routes.set(m+path,handlers)]));
        registerCatalog(app,db);
        const saved=db.prepare('SELECT * FROM storefront_catalog').get();
        assert.deepEqual(JSON.parse(saved.published),rows); assert.equal(saved.revision,0);
        assert.deepEqual(JSON.parse(db.prepare('SELECT categories FROM store_categories').get().categories),categories);
    } finally {db.close();}
});
test('legacy products whose categories were not persisted recover without deleting products', () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec('CREATE TABLE store_categories(id INTEGER PRIMARY KEY, categories TEXT); CREATE TABLE storefront_catalog(id INTEGER PRIMARY KEY, draft TEXT, published TEXT)');
        const rows = [[{...item(),categoryId:'lost-category'}]];
        db.prepare('INSERT INTO store_categories VALUES(1,?)').run('[]');
        db.prepare('INSERT INTO storefront_catalog VALUES(1,?,?)').run(JSON.stringify(rows),JSON.stringify(rows));
        const app=Object.fromEntries(['get','put','post'].map(method=>[method,()=>{}])); registerCatalog(app,db);
        const categories=JSON.parse(db.prepare('SELECT categories FROM store_categories').get().categories);
        assert.equal(categories[0].id,'lost-category');
        const saved=db.prepare('SELECT * FROM storefront_catalog').get();
        assert.deepEqual(JSON.parse(saved.published),rows); assert.deepEqual(JSON.parse(saved.draft),rows);
        assert.deepEqual(JSON.parse(saved.draft_categories),categories);
        registerCatalog(app,db); assert.equal(db.prepare('SELECT revision FROM storefront_catalog').get().revision,saved.revision);
    } finally {db.close();}
});
