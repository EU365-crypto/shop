const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/assets/js/store/storefront.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function reconcileCartCatalog('), source.indexOf('function refreshCartCatalog(')), context);
const reconcile = context.reconcileCartCatalog;
test('published names and prices update by ID, preserve quantities and recalculate subtotal', () => {
    const cart = [{ id: 'one', name: 'Apple', price: 2, quantity: 3 }];
    assert.equal(reconcile(cart, [{ id: 'one', name: 'Green Apple', price: 4, taxType: 'food', image: '/apple.png' }]), true);
    assert.equal(cart[0].name, 'Green Apple'); assert.equal(cart[0].price, 4);
    assert.equal(cart[0].quantity, 3); assert.equal(cart[0].quantity * cart[0].price, 12);
    assert.equal(cart[0].taxType, 'food'); assert.equal(cart[0].image, '/apple.png');
    assert.equal(reconcile(cart, [{ id: 'one', name: 'Green Apple', price: 4, taxType: 'food', image: '/apple.png' }]), false);
});
test('legacy cart migrates identity before publication renames the product', () => {
    const cart = [{ name: 'Apple', price: 2, quantity: 2 }];
    reconcile(cart, [{ id: 1, name: 'Apple', price: 9 }], false);
    assert.equal(cart[0].price, 2); assert.equal(cart[0].id, 1);
    reconcile(cart, [{ id: '1', name: 'Pear', price: 3 }]);
    assert.equal(cart[0].name, 'Pear'); assert.equal(cart[0].price, 3); assert.equal(cart[0].quantity, 2);
});
test('IDs distinguish duplicate names and ambiguous legacy names stay unchanged', () => {
    const catalog = [{ id: 'a', name: 'Apple', price: 3 }, { id: 'b', name: 'Apple', price: 8 }];
    const cart = [{ id: 'b', name: 'Apple', price: 2, quantity: 1 }, { name: 'Apple', price: 1, quantity: 1 }];
    reconcile(cart, catalog); assert.equal(cart[0].price, 8); assert.equal(cart[1].price, 1); assert.equal(cart[1].id, undefined);
});
test('missing products are not matched to a different product with the same name', () => {
    const cart = [{ id: 'removed', name: 'Apple', price: 2, quantity: 1 }];
    assert.equal(reconcile(cart, [{ id: 'replacement', name: 'Apple', price: 9 }]), false);
    assert.equal(cart[0].price, 2);
});
