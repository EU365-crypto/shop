const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('auth validation follows selected language and preserves typed, pasted or autofilled passwords',()=>{
    let language='en';const handlers={};
    function input(type,id,value){return{type,id,value,message:'',handlers:{},setCustomValidity(message){this.message=message;},addEventListener(event,fn){this.handlers[event]=fn;},get validity(){return{valueMissing:!this.value,typeMismatch:this.type==='email'&&!/^[^@\s]+@[^@\s]+$/.test(this.value),patternMismatch:this.id==='signup-code'&&!/^\d{6}$/.test(this.value)};}};}
    const email=input('email','email','sdas'),password=input('password','password','  pässword 🔒  '),code=input('text','signup-code','12');
    vm.runInNewContext(fs.readFileSync('public/assets/js/auth/auth-validation.js','utf8'),{document:{querySelectorAll:()=>[email,password,code],addEventListener:(event,fn)=>handlers[event]=fn},translateText:text=>language+':'+text});
    assert.match(email.message,/^en:Please include an @/);
    language='zh';handlers.languagechange();assert.match(email.message,/^zh:/);assert.match(code.message,/^zh:/);
    language='vi';handlers.languagechange();assert.match(email.message,/^vi:/);
    email.value='customer@example.test';email.handlers.input();assert.equal(email.message,'');
    code.value='123456';code.handlers.change();assert.equal(code.message,'');
    assert.equal(password.value,'  pässword 🔒  ');assert.equal(password.message,'');
    password.value='';password.handlers.invalid();assert.equal(password.message,'vi:Please fill out this field.');
    password.value='autofilled-password';password.handlers.change();assert.equal(password.message,'');assert.equal(password.type,'password');
    const shortPassword={type:'password',id:'password',minLength:8,value:'abcd',validity:{tooShort:true},setCustomValidity(message){this.message=message;},addEventListener(event,fn){this[event]=fn;}};
    vm.runInNewContext(fs.readFileSync('public/assets/js/auth/auth-validation.js','utf8'),{document:{querySelectorAll:()=>[shortPassword],addEventListener(){}},translateText:text=>language+':'+text});
    assert.equal(shortPassword.message,'vi:Please use at least 8 characters.');assert.equal(shortPassword.value,'abcd');
});
