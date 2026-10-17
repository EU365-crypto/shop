const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('public/assets/js/store/storefront.js', 'utf8');
function setup() {
    let rendered = 0, fetched = 0;
    const cache = new Map();
    const context = vm.createContext({
        window: {}, document: { dispatchEvent() {}, getElementById: () => null }, Event,
        console, structuredClone, localStorage: { setItem: (key, value) => cache.set(key, value), getItem: key => cache.get(key) || null },
        renderCategoryBar() {}, refreshCartCatalog() {}, displayProducts() { rendered++; },
        applyLanguage() {}, getSelectedLanguage: () => 'en',
        fetch: async () => { fetched++; return {ok:true,json:async()=>context.publication}; }
    });
    vm.runInContext('let products=[]; let publishedCatalogEnabled=false; let catalogRequestVersion=0; let latestPublishedSnapshot=null;', context);
    vm.runInContext(source.slice(source.indexOf('async function loadPublishedCatalog('), source.indexOf('document.addEventListener("DOMContentLoaded", loadPublishedCatalog)')), context);
    return {context,cache,get rendered(){return rendered;},get fetched(){return fetched;},load:()=>vm.runInContext('loadPublishedCatalog(true)',context)};
}
test('startup does not render cached categories with empty products before the published catalog arrives', () => {
    const container = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
    let cleared = false;
    const context = vm.createContext({ document: { getElementById: () => container }, window: { clearProductCarousels: () => { cleared = true; } } });
    vm.runInContext(source.slice(source.indexOf('function displayProducts()'), source.indexOf('async function addToCart(')), context);
    vm.runInContext('displayProducts()', context);
    assert.equal(container.attributes['aria-busy'], 'true');
    assert.equal(cleared, false);
});
test('new published categories and products reach the customer layout together', async () => {
    const s=setup();
    s.context.publication={rows:[],categories:[]}; await s.load();
    s.context.publication={rows:[[{id:'new-item',name:'Bok Choy',price:3.99,categoryId:'new-category'}]],categories:[{id:'new-category',en:'Vegetables',zh:'蔬菜',vi:'Rau'}]};
    await s.load();
    assert.equal(s.rendered,2);
    assert.equal(JSON.parse(s.cache.get('products'))[0].id,'new-item');
    assert.equal(JSON.parse(s.cache.get('categorySettings')).categories[0].id,'new-category');
    await s.load(); assert.equal(s.rendered,2,'unchanged polling preserves the existing carousel');
    await vm.runInContext('loadPublishedCatalog()', s.context);
    assert.equal(s.rendered, 2, 'unchanged focus or pageshow responses also preserve carousel position');
});
test('customer refresh never loads private drafts or replaces the active admin editor', async () => {
    const s=setup(); s.context.window.storeEditorActive=true; await s.load();
    assert.equal(s.fetched,0); assert.equal(s.rendered,0);
});
test('browser storage failures do not hide a valid database catalog', async () => {
    const s=setup();s.context.publication={rows:[[{id:'one',name:'Apple',categoryId:'fruit'}]],categories:[{id:'fruit',en:'Fruit'}]};
    s.context.localStorage.setItem=()=>{throw new Error('Storage unavailable');};
    await s.load();assert.equal(s.rendered,1);assert.equal(s.context.window.publishedCatalogState.products[0].id,'one');
});
test('corrupt cached products cannot stop catalog initialization', () => {
    const context=vm.createContext({localStorage:{getItem:()=>'{invalid json'},document:{getElementById:()=>null}});
    vm.runInContext(source.slice(0,source.indexOf('let currentCartUser')),context);
    assert.equal(vm.runInContext('products.length',context),0);
});
test('a stale in-flight response cannot replace a newer complete catalog', async () => {
    const s=setup();const resolvers=[];
    s.context.fetch=()=>new Promise(resolve=>resolvers.push(resolve));
    const older=s.load(),newer=s.load();
    resolvers[1]({ok:true,json:async()=>({rows:[[{id:'new'}]],categories:[{id:'new-category'}]})});await newer;
    resolvers[0]({ok:true,json:async()=>({rows:[],categories:[]})});await older;
    assert.equal(s.context.window.publishedCatalogState.products[0].id,'new');assert.equal(s.rendered,1);
});
test('customer category refresh loads a database snapshot without assigning stale cached products', async () => {
    const s=setup();s.context.document.getElementById=id=>id==='product-container'?{}:null;
    s.context.localStorage.getItem=()=>{throw new Error('Stale cache must not be read');};
    const categories=fs.readFileSync('public/assets/js/store/categories.js','utf8');
    vm.runInContext(categories.slice(categories.indexOf('function refreshPublishedProducts()'),categories.indexOf('window.addEventListener("storage"')),s.context);
    let loads=0;s.context.loadPublishedCatalog=()=>{loads++;};
    vm.runInContext('refreshPublishedProducts()',s.context);assert.equal(loads,1);
});
test('clicking the real product + handler only updates the selected cart item and leaves catalog cards intact', async () => {
    const s=setup();const nodes=[];
    class Element {
        constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={setProperty(){}};this.className='';this.classList={add:()=>{}};}
        append(...children){this.children.push(...children);} appendChild(child){this.children.push(child);return child;}
        addEventListener(type,handler){this.listeners[type]=handler;} setAttribute(){} removeAttribute(){} remove(){}
        querySelector(selector){const match=n=>selector.startsWith('.')?n.className===selector.slice(1):n.tag===selector;for(const child of this.children){if(match(child))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
        insertBefore(node,target){this.children=this.children.filter(child=>child!==node);this.children.splice(this.children.indexOf(target),0,node);}
    }
    s.context.document.createElement=tag=>new Element(tag);
    s.context.document.body={appendChild:node=>nodes.push(node)};
    s.context.window.location={pathname:'/store.html'};s.context.window.setTimeout=()=>{};
    s.context.getDisplaySettings=()=>({cardWidth:230,imageHeight:220});s.context.translateText=value=>value;s.context.updateCart=()=>{};
    vm.runInContext(source.slice(source.indexOf('let currentCartUser'),source.indexOf('function createProductCard(')),s.context);
    vm.runInContext(source.slice(source.indexOf('function createProductCard('),source.indexOf('function createAdminAddCard(')),s.context);
    vm.runInContext(source.slice(source.indexOf('async function addToCart('),source.indexOf('let storeTaxRate')),s.context);
    const publication={rows:[[{id:'new-item',name:'Bok Choy',price:3.99,categoryId:'new-category',image:'/bok.png'}]],categories:[{id:'new-category',en:'Vegetables'}]};
    s.context.fetch=async route=>({ok:true,json:async()=>route==='/api/me'?{loggedIn:true,user:{id:9}}:publication});
    await s.load();const before=JSON.stringify(s.context.window.publishedCatalogState);
    const card=vm.runInContext('createShelfProductCard(products[0])',s.context);const button=card.querySelector('button');
    const children=[...card.children];await button.listeners.click();await button.listeners.click();
    assert.equal(JSON.stringify(s.context.window.publishedCatalogState),before);assert.deepEqual(card.children,children);
    assert.equal(s.rendered,1);assert.equal(vm.runInContext('cart[0].id',s.context),'new-item');assert.equal(vm.runInContext('cart[0].quantity',s.context),2);
    assert.equal(JSON.parse(s.cache.get('cart_user_9'))[0].quantity,2);
    await vm.runInContext("addToCart('Old name', 100, 'general', null, 'new-item', 3)", s.context);
    assert.equal(vm.runInContext('cart[0].quantity', s.context), 5);
    assert.equal(vm.runInContext('cart[0].price', s.context), 3.99);
    await vm.runInContext("addToCart('Bok Choy', 3.99, 'food', null, 'new-item', 0)", s.context);
    await vm.runInContext("addToCart('Deleted', 1, 'food', null, 'deleted-item', 1)", s.context);
    assert.equal(vm.runInContext('cart.length', s.context), 1);
    assert.equal(vm.runInContext('cart[0].quantity', s.context), 5);
});
