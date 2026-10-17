const projectRoot = require('node:path').resolve(__dirname, '..');
const test=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
function start(filename) {
    return new Promise((resolve,reject)=>{
        const child=fork(path.join(projectRoot,'tests/support/catalog-server.js'),[filename],{stdio:['ignore','ignore','pipe','ipc']});
        child.once('error',reject); child.once('exit',code=>{if(code)reject(new Error('Catalog fixture exited: '+code));});
        child.once('message',({url})=>resolve({child,url,close:()=>new Promise(done=>{child.once('exit',done);child.send('close');})}));
    });
}
const cookie=response=>response.headers.get('set-cookie')?.split(';')[0]||'';
test('SQLite publication survives admin refresh, customer access, logout/login and a new Node process', async () => {
    const directory=mkdtempSync(path.join(tmpdir(),'easyshop-catalog-')); const filename=path.join(directory,'shop.db');
    let server=await start(filename);
    let adminCookie='';
    const call=(route,method='GET',body,session=adminCookie)=>fetch(server.url+route,{method,headers:{'Content-Type':'application/json','X-CSRF-Protection':'1',Origin:'http://localhost:3000',Cookie:session},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const login=async()=>{const response=await call('/api/admin-login','POST',{email:'admin@example.test',password:'catalog-test-password'},'');assert.equal(response.status,200);adminCookie=cookie(response);};
    const publicCatalog=async()=>await(await call('/api/catalog')).json();
    try {
        await login();
        const loaded=await(await call('/api/catalog/draft')).json();
        const categories=[...loaded.categories,{id:'new-category',en:'Vegetables',zh:'Vegetables',vi:'Vegetables'}];
        const item={id:'new-product',name:'Bok Choy',description:'Fresh',price:3.99,image:'/bok-choy.png',categoryId:'new-category',cardWidth:230,imageHeight:220,imageZoom:100,taxType:'food'};
        let state={rows:[[item]],categories,revision:loaded.revision};
        let response=await call('/api/catalog/draft','PUT',state);assert.equal(response.status,200);state=await response.json();
        assert.equal((await publicCatalog()).rows,null,'draft remains private');
        response=await call('/api/catalog/publish','POST',state);assert.equal(response.status,200);state=await response.json();
        let live=await publicCatalog(); assert.equal(live.rows[0][0].id,item.id);assert.equal(live.categories.at(-1).id,'new-category');
        assert.equal((await call('/api/catalog/publish','POST',{rows:[]})).status,400,'incomplete legacy writes cannot erase the published catalog');
        assert.deepEqual(await publicCatalog(),live);
        assert.deepEqual(await(await call('/api/catalog/draft')).json(),state,'admin refresh loads saved categories and products');
        const customerLogin=await call('/api/user-login','POST',{email:'user@example.test',password:'catalog-test-password'},''); assert.equal(customerLogin.status,200);
        const customerCookie=cookie(customerLogin);
        assert.equal((await call('/api/catalog/publish','POST',state,customerCookie)).status,403);
        await call('/api/me','GET',undefined,customerCookie); assert.deepEqual(await publicCatalog(),live,'cart account reads cannot modify catalog');
        await call('/api/logout?admin=1','POST',{}); await login(); assert.deepEqual(await publicCatalog(),live);
        state.categories.at(-1).en='Fresh Vegetables'; state.rows[0][0].price=4.99;
        response=await call('/api/catalog/draft','PUT',state);state=await response.json();assert.deepEqual(await publicCatalog(),live);
        response=await call('/api/catalog/publish','POST',state);assert.equal(response.status,200);state=await response.json();live=await publicCatalog();
        assert.equal(live.categories.at(-1).en,'Fresh Vegetables');assert.equal(live.rows[0][0].price,4.99);
        await server.close();server=await start(filename);
        assert.deepEqual(await publicCatalog(),live,'publication survives an actual Node process restart');
        await login();assert.deepEqual(await(await call('/api/catalog/draft')).json(),state);
        const archive={id:'removed-category',category:state.categories.at(-1),rows:state.rows,index:state.categories.length-1,removedAt:new Date().toISOString()};
        response=await call('/api/catalog/draft','PUT',{...state,rows:[],categories:state.categories.slice(0,-1),history:[archive]});
        assert.equal(response.status,200);state=await response.json();assert.deepEqual(await publicCatalog(),live,'history remains private until publication');
        response=await call('/api/catalog/publish','POST',state);assert.equal(response.status,200);state=await response.json();
        assert.deepEqual((await publicCatalog()).rows,[]);assert.equal(Object.hasOwn(await publicCatalog(),'history'),false);
        await server.close();server=await start(filename);await login();
        assert.deepEqual(await(await call('/api/catalog/draft')).json(),state,'removed category and products remain in private history after restart');
    } finally {await server.close();rmSync(directory,{recursive:true,force:true});}
});
