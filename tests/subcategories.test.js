const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('subcategory selection replaces only its own complete loop, keeps stable IDs and preserves See All selection', () => {
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.value = ''; }
        appendChild(node) { this.children.push(node); }
        setAttribute() {}
        replaceChildren() { this.children = []; }
        addEventListener(type, callback) { this.listeners[type] = callback; }
        focus() { this.focused = true; }
    }
    const rows = new Map(); let destroyed = 0;
    const context = vm.createContext({ window: {}, document: { createElement: () => new Element() },
        products: [{ id: 'a', categoryId: 'vegetables', subcategoryId: 'leafy' }, { id: 'b', categoryId: 'vegetables' }, { id: 'c', categoryId: 'fruit', subcategoryId: 'citrus' }],
        categoryText: en => en, translateText: text => text, createShelfProductCard: product => ({ id: product.id }) });
    context.window.setupProductCarousel = (track, items) => { rows.set(track, items.map(item => item.id)); return { destroy() { destroyed++; } }; };
    vm.runInContext(fs.readFileSync('public/assets/js/store/subcategories.js', 'utf8'), context);
    function row(category) {
        const track = new Element(), heading = new Element(), link = {};
        context.window.setupSubcategoryCarousel(track, category, link, heading); return { track, select: heading.children[0], dropdown: heading.children[1], link };
    }
    const vegetables = { id: 'vegetables', en: 'Vegetables', subcategories: [{ id: 'leafy', en: 'Leafy Greens' }, { id: 'empty', en: 'Mushrooms' }] };
    const a = row(vegetables), b = row({ id: 'fruit', en: 'Fruit', subcategories: [{ id: 'citrus', en: 'Citrus' }] });
    assert.deepEqual(a.select.children.map(option => option.value), ['', 'leafy', 'empty']);
    assert.equal(a.select.children[0].textContent, 'All');
    assert.equal(a.select.hidden, true);
    a.dropdown.open = true; a.dropdown.children[1].children[1].listeners.click();
    assert.equal(a.dropdown.open, false); assert.equal(a.dropdown.children[0].textContent, 'Leafy Greens');
    assert.equal(a.select.value, 'leafy');
    a.select.value = ''; a.select.listeners.change(); destroyed = 0;
    assert.deepEqual(b.select.children.map(option => option.value), ['', 'citrus']);
    a.select.value = 'leafy'; a.select.listeners.change();
    assert.equal(JSON.stringify(rows.get(a.track)), '["a"]'); assert.equal(JSON.stringify(rows.get(b.track)), '["c"]');
    assert.equal(a.link.href, '/category?category=vegetables&subcategory=leafy'); assert.equal(destroyed, 1);
    a.select.value = 'empty'; a.select.listeners.change(); assert.equal(rows.get(a.track).length, 0);
    a.select.value = ''; a.select.listeners.change(); assert.equal(JSON.stringify([...rows.get(a.track)].sort()), '["a","b"]');
    a.select.value = 'leafy'; a.select.listeners.change(); const rerendered = row(vegetables); assert.equal(rerendered.select.value, 'leafy');
    assert.equal(context.products.length, 3);
});
test('All cycles cap every group at two distinct IDs, rotate all products, and spread groups apart', () => {
    const context = vm.createContext({ window: {}, document: {} });
    vm.runInContext(fs.readFileSync('public/assets/js/store/subcategories.js', 'utf8'), context);
    const products = Array.from({ length: 15 }, (_, i) => ({ id: String(i), subcategoryId: i < 5 ? 'leafy' : i < 10 ? 'roots' : undefined }));
    const original = JSON.stringify(products), seen = new Set();
    const next = context.window.createMixedCategoryCycles(products, () => .37);
    for (let i = 0; i < 12; i++) {
        const cycle = next(); assert.equal(cycle.length, 6);
        const groups = new Map();
        for (const item of cycle) { const key = item.subcategoryId || ''; groups.set(key, (groups.get(key) || 0) + 1); seen.add(item.id); }
        assert.equal(new Set(cycle.map(item => item.id)).size, 6); assert.ok([...groups.values()].every(count => count <= 2));
        for (let j = 1; j < cycle.length; j++) assert.notEqual(cycle[j].subcategoryId, cycle[j - 1].subcategoryId);
    }
    assert.equal(seen.size, 15); assert.equal(JSON.stringify(products), original);
    const small = context.window.createMixedCategoryCycles([{id:'one'}, {id:'two'}]); assert.equal(small().length, 2);
});
test('admin dropdown filters complete draft products and adds to the selected subcategory without customer animation', () => {
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.value = ''; this.attributes = {}; }
        appendChild(child) { this.children.push(child); }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        replaceChildren() { this.children = []; }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(type, handler) { this.listeners[type] = handler; }
        focus() {}
    }
    const added = [];
    const context = vm.createContext({ window: { storeEditorActive: true, addAdminStoreItem: (...args) => added.push(args) }, document: { createElement: () => new Element() },
        products: [{id:'public',categoryId:'fruit'}], catalogDraftRows: [[{id:'one',categoryId:'fruit',subcategoryId:'berries'},{id:'two',categoryId:'fruit'},{id:'three',categoryId:'fruit',subcategoryId:'berries'}]],
        categoryText: name => name, translateText: text => text, createShelfProductCard: item => ({id:item.id}), requestAnimationFrame() {} });
    context.window.setupProductCarousel = () => { throw new Error('Admin editing must not start customer animation'); };
    vm.runInContext(fs.readFileSync('public/assets/js/store/subcategories.js', 'utf8'), context);
    const category = {id:'fruit',en:'Fruit',subcategories:[{id:'berries',en:'Berries'}]}, track = new Element(), heading = new Element(), link = {};
    context.window.setupSubcategoryCarousel(track, category, link, heading);
    assert.deepEqual(track.children.slice(0,-1).map(card => card.id), ['one','two','three']);
    const select = heading.children[0]; select.value = 'berries'; select.listeners.change();
    assert.deepEqual(track.children.slice(0,-1).map(card => card.id), ['one','three']);
    track.children.at(-1).listeners.click(); assert.deepEqual(added, [['fruit','berries']]);
    assert.ok(link.href.includes('subcategory=berries')); assert.ok(link.href.includes('adminView=1'));
    const manager = context.window.createAdminSubcategoryManager(category);
    assert.equal(manager.children[0].textContent, '+'); assert.equal(manager.children[0].attributes['aria-label'], 'Manage Subcategories');
});
