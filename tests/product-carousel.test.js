const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.style = {}; this.classList = { add() {}, toggle() {} }; this.clientWidth = 500; this.scrollLeft = 0; this.isConnected = true; }
        addEventListener(type, fn, options = {}) { (this.listeners[type] ||= []).push(fn); options.signal?.addEventListener('abort', () => { this.listeners[type] = this.listeners[type].filter(x => x !== fn); }); }
        emit(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
        removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x !== fn); }
        appendChild(child) { child.parentElement = this; this.children.push(child); }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        replaceChildren() { this.children = []; }
        focus() { document.activeElement = this; }
        closest() { return this.track || null; }
        showModal() { this.open = true; }
        close() { this.open = false; this.onclose?.(); }
        reportValidity() { return Number.isInteger(Number(this.value)) && Number(this.value) >= 1 && Number(this.value) <= 99; }
        remove() { this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
        setAttribute(key, value) { this.attributes[key] = value; }
        removeAttribute(key) { delete this.attributes[key]; }
        querySelectorAll() { return []; }
        getBoundingClientRect() { return { width: 160 }; }
        contains(node) { return this.children.includes(node); }
    }
    const document = new Element(); document.hidden = false; document.createElement = () => new Element(); document.body = new Element(); document.getElementById = id => document.body.children.find(node => node.id === id);
    const media = new Element(); media.matches = false;
    const window = new Element(); const callbacks = new Map(); let id = 0, now = 0;
    const observers = [];
    const context = vm.createContext({ window, document, matchMedia: () => media, translateText: x => x, AbortController,
        getComputedStyle: () => ({ columnGap: '18px' }), performance: { now: () => now },
        requestAnimationFrame: cb => { callbacks.set(++id, cb); return id; }, cancelAnimationFrame: id => callbacks.delete(id),
        ResizeObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
    });
    window.ResizeObserver = context.ResizeObserver;
    vm.runInContext(fs.readFileSync('public/assets/js/store/product-carousel.js', 'utf8'), context);
    function row(count, nextCycle = null) {
        const track = new Element(), controls = new Element(); track.parentElement = { querySelector: () => controls };
        const items = Array.from({ length: count }, (_, i) => ({ id: i }));
        const create = item => { const card = new Element(); card.id = item.id; return card; };
        for (const item of items) track.appendChild(create(item));
        window.setupProductCarousel(track, items, create, nextCycle);
        return { track, controls, items };
    }
    function step() { now += 20; const pending = [...callbacks.values()]; callbacks.clear(); for (const cb of pending) cb(now); }
    return { row, step, window, document, media, observers, callbacks, context, Element };
}
test('continuous 50px/second loop repeats ordered visual cards without changing product data', () => {
    const s = setup(), r = s.row(2), saved = JSON.stringify(r.items);
    assert.ok(r.track.children.length >= 8);
    for (let i = 0; i < r.track.children.length; i++) assert.equal(r.track.children[i].id, i % 2);
    s.step(); const start = r.track.scrollLeft;
    for (let i = 0; i < 50; i++) s.step();
    assert.equal(r.track.scrollLeft - start, 50);
    for (let i = 0; i < 1000; i++) { s.step(); assert.ok(r.track.scrollLeft >= 356 && r.track.scrollLeft < 712); }
    assert.equal(JSON.stringify(r.items), saved);
});
test('rotating cycles prepare offscreen cards and retire passed cycles without replacing visible nodes', () => {
    const s = setup(); let cycle = 0;
    const r = s.row(2, () => [{ id: 'next-' + cycle++ }, { id: 'next-' + cycle++ }]);
    const initial = r.track.children.slice(0, 2); assert.ok(r.track.children.length >= 6); assert.equal(r.track.scrollLeft, 0);
    s.step(); for (let i = 0; i < 100; i++) s.step();
    assert.equal(r.track.children[0], initial[0]); assert.equal(r.track.scrollLeft, 100);
    const hovered = r.track.children[0]; hovered.closest = () => hovered;
    r.track.emit('pointerover', { pointerType: 'mouse', target: hovered });
    const before = [...r.track.children], position = r.track.scrollLeft;
    for (let i = 0; i < 50; i++) s.step(); assert.deepEqual(r.track.children, before); assert.equal(r.track.scrollLeft, position);
    r.track.emit('pointerleave');
    for (let i = 0; i < 2000; i++) s.step();
    assert.ok(!r.track.children.includes(initial[0])); assert.ok(r.track.children.length <= 10);
    assert.ok(r.track.children.length * 178 - r.track.scrollLeft >= r.track.clientWidth);
    s.observers[0].cb(); assert.ok(r.track.scrollLeft >= 0);
});
test('rows pause independently for mouse, touch, keyboard and explicit pause; resume without reset', () => {
    const s = setup(), a = s.row(1), b = s.row(3); s.step();
    const card = a.track.children[0]; card.closest = () => card;
    a.track.emit('pointerover', { pointerType: 'mouse', target: card }); const before = a.track.scrollLeft;
    s.step(); assert.equal(a.track.scrollLeft, before); assert.ok(b.track.scrollLeft > 534);
    a.track.emit('pointerleave'); s.step(); assert.equal(a.track.scrollLeft, before + 1);
    a.controls.children[0].emit('click'); s.step(); assert.equal(a.track.scrollLeft, before + 1);
    a.controls.children[0].emit('click'); a.track.emit('pointerdown', { target: card }); s.step(); assert.equal(a.track.scrollLeft, before + 1);
    a.track.emit('pointercancel'); for (let i = 0; i < 70; i++) s.step(); assert.ok(a.track.scrollLeft > before + 1);
    s.window.emit('keydown', { key: 'Tab' }); a.track.emit('focusin'); const focused = a.track.scrollLeft; s.step(); assert.equal(a.track.scrollLeft, focused);
    a.track.emit('focusout'); s.step(); assert.equal(a.track.scrollLeft, focused + 1);
});
test('hidden tabs, reduced motion, empty categories, responsive repetition and cleanup', () => {
    const s = setup(), r = s.row(1); s.step();
    s.document.hidden = true; s.document.emit('visibilitychange'); assert.equal(s.callbacks.size, 0);
    s.document.hidden = false; s.document.emit('visibilitychange'); assert.equal(s.callbacks.size, 1);
    r.track.clientWidth = 1600; s.observers[0].cb(); assert.ok(r.track.children.length >= 12);
    s.media.matches = true; s.media.emit('change'); assert.equal(r.track.children.length, 1); assert.equal(s.callbacks.size, 0);
    const empty = s.row(0); assert.equal(empty.track.children[0].textContent, 'No matching items found.');
    s.media.matches = false; s.media.emit('change'); assert.ok(r.track.children.length > 1);
    s.window.clearProductCarousels(); assert.equal(s.callbacks.size, 0); assert.ok(s.observers.every(o => o.disconnected));
    assert.equal(r.track.listeners.pointerover.length, 0);
});
test('background hover keeps moving, card children and copies pause, mouse-click focus does not trap motion', () => {
    const s = setup(), r = s.row(2); s.step(); const initial = r.track.scrollLeft;
    r.track.emit('pointerover', { pointerType: 'mouse', target: r.track }); s.step(); assert.equal(r.track.scrollLeft, initial + 1);
    const copy = r.track.children[3]; copy.closest = () => copy;
    const child = { closest: () => copy };
    r.track.emit('pointerover', { pointerType: 'mouse', target: child }); s.step(); assert.equal(r.track.scrollLeft, initial + 1);
    r.track.emit('pointerout', { pointerType: 'mouse', relatedTarget: copy }); s.step(); assert.equal(r.track.scrollLeft, initial + 1);
    r.track.emit('pointerout', { pointerType: 'mouse', relatedTarget: r.track });
    r.track.emit('focusin', { target: { matches: () => false } }); s.step(); assert.equal(r.track.scrollLeft, initial + 2);
    r.track.emit('pointerdown', { target: r.track }); s.step(); assert.equal(r.track.scrollLeft, initial + 3);
});
test('touch focus, vertical scrolling and page restoration do not leave carousels stopped', () => {
    const s = setup(), r = s.row(2); s.step();
    r.track.emit('wheel', { deltaX: 0, deltaY: 100 }); const initial = r.track.scrollLeft; s.step(); assert.equal(r.track.scrollLeft, initial + 1);
    const card = r.track.children[0]; card.closest = () => card;
    r.track.emit('pointerdown', { target: card, pointerType: 'touch' });
    r.track.emit('focusin', { target: { matches: () => true } });
    s.window.emit('pointercancel'); for (let i = 0; i < 70; i++) s.step(); assert.ok(r.track.scrollLeft > initial + 1);
    r.track.emit('pointerover', { pointerType: 'mouse', target: card });
    s.window.emit('pageshow'); s.step(); const restored = r.track.scrollLeft; s.step(); assert.equal(r.track.scrollLeft, restored + 1);
    r.track.emit('wheel', { deltaX: 80 }); const manual = r.track.scrollLeft; s.step(); assert.equal(r.track.scrollLeft, manual);
});
test('product modal uses published details, validates quantity, locks scrolling and pauses only its own row', async () => {
    const s = setup(), a = s.row(2), b = s.row(2), trigger = new s.Element(); trigger.track = a.track;
    s.document.body.style.overflow = 'auto';
    const calls = []; s.context.addToCart = async (...args) => { calls.push(args); return true; };
    const product = { id: 'stable-id', name: 'Fresh vegetables', description: 'Admin description', price: 4.99, priceUnit: 'lb', image: '/image.png', taxType: 'food' };
    s.window.openCustomerProduct(product, trigger);
    const dialog = s.document.getElementById('customer-product-details'), info = dialog.children[2];
    assert.equal(dialog.open, true); assert.equal(s.document.body.style.overflow, 'hidden');
    assert.deepEqual(info.children.slice(0, 4).map(node => node.textContent), ['Fresh vegetables', '$4.99 / lb', 'Admin description', 'Availability not provided']);
    assert.equal(s.document.activeElement, dialog.children[0]);
    s.step(); const initial = a.track.scrollLeft; s.step(); assert.equal(a.track.scrollLeft, initial); assert.ok(b.track.scrollLeft > initial);
    const quantity = info.children[5].children[1], add = info.children[6];
    quantity.value = '0'; await add.onclick(); assert.equal(calls.length, 0);
    quantity.value = '3'; await add.onclick(); assert.equal(calls[0][4], 'stable-id'); assert.equal(calls[0][5], 3); assert.equal(info.children[7].textContent, 'Add In Cart');
    dialog.getBoundingClientRect = () => ({ left: 10, top: 10, right: 100, bottom: 100 });
    dialog.onclick({ target: dialog, clientX: 0, clientY: 0 });
    assert.equal(dialog.open, false); assert.equal(s.document.body.style.overflow, 'auto'); assert.equal(s.document.activeElement, trigger);
    s.step(); assert.ok(a.track.scrollLeft > initial);
});
test('category navigation preserves admin order, follows scrolling, and cleans up listeners', () => {
    const s = setup(), sticky = new s.Element(), container = new s.Element();
    sticky.getBoundingClientRect = () => ({ bottom: 160, height: 160 }); s.document.querySelector = () => sticky;
    const sections = ['Fruit', 'Vegetables', 'Drinks'].map((name, i) => {
        const section = new s.Element(); section.querySelector = () => ({ textContent: name });
        section.getBoundingClientRect = () => ({ top: i * 400 }); section.scrollIntoView = options => { section.scrolled = options; }; return section;
    });
    container.querySelectorAll = () => sections; container.style.setProperty = () => {};
    s.window.setupCustomerCategoryNavigation(container);
    const nav = sticky.children[0]; assert.deepEqual(nav.children.map(button => button.textContent), ['Fruit', 'Vegetables', 'Drinks']);
    nav.children[1].onclick(); assert.equal(sections[1].scrolled.behavior, 'smooth'); assert.equal(nav.children[1].attributes['aria-current'], 'true');
    s.window.emit('scroll'); s.step(); assert.equal(nav.children[1].attributes['aria-current'], 'true', 'clicked category remains highlighted during automatic scrolling');
    sections[0].getBoundingClientRect = () => ({ top: -900 }); sections[1].getBoundingClientRect = () => ({ top: -500 }); sections[2].getBoundingClientRect = () => ({ top: 100 });
    s.window.emit('wheel'); s.window.emit('scroll'); s.step(); assert.equal(nav.children[2].attributes['aria-current'], 'true');
    s.media.matches = true; nav.children[0].onclick(); assert.equal(sections[0].scrolled.behavior, 'instant');
    s.window.clearProductCarousels(); assert.equal(sticky.children.length, 0); assert.equal(s.window.listeners.scroll.length, 0);
});
