(() => {
 const popupFrame = window.frameElement;
 if (popupFrame?.classList.contains('contact-popup-frame')) {
  document.body.classList.add('contact-popup-content');
  const close = async () => {
   if (!signedIn) { window.cleanupContactForm(); window.parent.closeContactPopup(); return; }
   try { await window.contactDrafts.flush(); popupFrame.closest('dialog')?.close(); } catch { }
  };
  document.querySelector('.user-return-icon').addEventListener('click', event => { event.preventDefault(); close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('.mc-image-viewer[open]')) { event.preventDefault(); close(); } });
 }
 const requested = new URLSearchParams(location.search).get('type');
 const type = ['partnership', 'request'].includes(requested) ? requested : 'email';
 setLocalizedMessage(document.getElementById('contact-title'), {partnership:'Partnership',request:'Order or Item Request',email:'Email Us'}[type]);
 const form=document.getElementById('contact-form'), button=document.getElementById('contact-compose'), status=document.getElementById('contact-status');
 const sendIcon = button.innerHTML;
 function sendState(state) {
  button.dataset.sendState = state;
  button.setAttribute('aria-busy', String(state === 'sending'));
  if (state === 'idle') { button.innerHTML = sendIcon; button.setAttribute('aria-label', translateText('Send Message')); return; }
  button.innerHTML = '<span class="contact-send-circle" aria-hidden="true"></span><span class="contact-send-label"></span>';
  const label = state === 'sending' ? 'Sending your message...' : 'Sent';
  setLocalizedMessage(button.querySelector('.contact-send-label'), label);
  button.setAttribute('aria-label', translateText(label));
 }
 form.addEventListener('input', () => { if (button.dataset.sendState === 'sent') sendState('idle'); });
 const email=document.getElementById('contact-email'), verification=document.getElementById('contact-verification'), sendCode=document.getElementById('contact-send-code'), code=document.getElementById('contact-code');
 let signedIn=false, verified=false, ready=false;
 const currentEmail=()=>email.value.trim().toLowerCase();
 const resetGuestVerification = () => fetch(window.contactRequestPath('/api/contact/reset-verification'), { method: 'POST', keepalive: true }).then(response => { if (!response.ok) throw new Error('Could not reset verification'); });
 const productName=document.getElementById('contact-product-name'), image=document.getElementById('contact-image');
 document.getElementById('contact-product-request').hidden=type!=='request';
 document.getElementById('contact-message-field').hidden=type==='request';
 document.getElementById('contact-message').required=type!=='request';productName.required=false;
 async function imageData(){const file=image.files[0];if(!file)return window.contactDrafts.image();const supported=['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/avif'].includes(file.type)||/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name);if(!supported||file.size>10*1024*1024)throw new Error('Choose a JPG, PNG, WebP, HEIC, HEIF or AVIF photo up to 10 MB.');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read image. Please choose it again.'));reader.readAsDataURL(file);});}
 async function request(path,body,signal){const response=await fetch(window.contactRequestPath(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});const data=await response.json();setLocalizedMessage(status,data.message);return {response,data};}
 const codeStatus = document.getElementById('contact-code-status');
 const countdown = document.getElementById('contact-countdown');
 let resendDeadline = 0, countdownTimer, pulseTimer, codeRequest;
 function updateCountdown() {
  const seconds = Math.max(0, Math.ceil((resendDeadline - Date.now()) / 1000));
  countdown.hidden = !seconds; countdown.textContent = seconds ? String(seconds) : '';
  countdown.setAttribute('aria-label', translateText('Request a new code in {seconds} seconds.').replace('{seconds}', seconds));
  sendCode.classList.toggle('code-waiting', Boolean(seconds));
  if (!seconds) clearInterval(countdownTimer);
 }
 function startCountdown(seconds) {
  resendDeadline = Date.now() + seconds * 1000; clearInterval(countdownTimer);
  updateCountdown(); countdownTimer = setInterval(updateCountdown, 1000);
 }
 document.addEventListener('languagechange', updateCountdown);
 window.addEventListener('pageshow', event => {
  if (event.persisted && !signedIn) ready = true;
  if (ready && !signedIn) {
   form.reset(); verified = false; resendDeadline = 0;
   window.contactDrafts.clear(); codeStatus.hidden = true; codeStatus.removeAttribute('data-i18n'); codeStatus.textContent = '';
   status.removeAttribute('data-i18n'); status.textContent = ''; sendState('idle');
  }
  updateCountdown();
 });
 window.cleanupContactForm = () => {
  clearInterval(countdownTimer); clearTimeout(pulseTimer); codeRequest?.abort(); codeRequest = null;
  if (!signedIn) {
   if (ready) resetGuestVerification().catch(() => {});
   ready = false; verified = false; resendDeadline = 0; form.reset();
   countdown.hidden = true; countdown.textContent = ''; countdown.classList.remove('countdown-pulse');
   sendCode.classList.remove('code-waiting', 'code-sending'); sendCode.removeAttribute('aria-busy');
   codeStatus.hidden = true; codeStatus.removeAttribute('data-i18n'); codeStatus.textContent = '';
   status.removeAttribute('data-i18n'); status.textContent = ''; window.contactDrafts.clear();
  }
 };
 window.addEventListener('pagehide', window.cleanupContactForm);
 async function issue() {
  if (sendCode.disabled || !ready || signedIn) return;
  if (Date.now() < resendDeadline) {
   updateCountdown(); clearTimeout(pulseTimer); countdown.classList.remove('countdown-pulse');
   void countdown.offsetWidth; countdown.classList.add('countdown-pulse');
   pulseTimer = setTimeout(() => countdown.classList.remove('countdown-pulse'), 1000); return;
  }
  if (!email.reportValidity()) return;
  const target = currentEmail(), started = performance.now();
  sendCode.disabled = true; sendCode.setAttribute('aria-busy', 'true'); verified = false;
  status.removeAttribute('data-i18n'); status.textContent = '';
  codeStatus.hidden = false;
  sendCode.classList.add('code-sending');
  setLocalizedMessage(codeStatus, 'Sending verification code...');
  codeRequest = new AbortController();
  try {
   const result = await request('/api/contact/code', { email: target }, codeRequest.signal);
   if (!ready) return;
   if (result.response.ok) {
    status.removeAttribute('data-i18n'); status.textContent = '';
    codeStatus.hidden = false; setLocalizedMessage(codeStatus, 'Check your email for a verification code.');
    startCountdown(result.data.retryAfter || 60);
    if (currentEmail() === target) { code.value = ''; code.focus(); }
   } else {
    codeStatus.hidden = true; codeStatus.removeAttribute('data-i18n'); codeStatus.textContent = '';
    if (result.data.retryAfter) { status.removeAttribute('data-i18n'); status.textContent = ''; startCountdown(result.data.retryAfter); }
   }
  } catch (error) {
   if (error.name === 'AbortError' || !ready) return;
   codeStatus.hidden = true; codeStatus.removeAttribute('data-i18n'); codeStatus.textContent = '';
   setLocalizedMessage(status, 'Could not send verification email. Please try again later.');
  }
  finally {
   const remaining = Math.max(0, 1000 - (performance.now() - started));
   if (remaining && ready) await new Promise(resolve => setTimeout(resolve, remaining));
   sendCode.disabled = false; sendCode.removeAttribute('aria-busy'); sendCode.classList.remove('code-sending');
  }
 }
 sendCode.addEventListener('click',issue);
 email.addEventListener('input',()=>{if(!signedIn){verified=false;code.value='';codeStatus.hidden=true;codeStatus.removeAttribute('data-i18n');codeStatus.textContent='';}});
 button.disabled=true;
 fetch(window.contactRequestPath('/api/contact/identity'),{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();signedIn=data.signedIn;verified=signedIn&&data.verified;email.readOnly=signedIn;if(!signedIn){form.reset();await Promise.all([window.contactDrafts.clear(), resetGuestVerification()]);}if(data.email&&signedIn)email.value=data.email;if(signedIn){const name=document.getElementById('contact-name');if(!name.value)name.value=[data.firstName,data.lastName].filter(Boolean).join(' ');}verification.hidden=signedIn;sendCode.hidden=signedIn;await window.contactDrafts.init(data);ready=true;}).catch(()=>setLocalizedMessage(status,'Could not load contact form. Please refresh.')).finally(()=>{button.disabled=!ready;});
 form.addEventListener('submit', async event => {
  event.preventDefault(); if(button.disabled||!ready)return;
  if(!signedIn&&!verified&&!code.value.trim()){setLocalizedMessage(status,'Verify your email before sending.');await issue();return;}
  button.disabled=true;
  form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
  status.removeAttribute('data-i18n'); status.textContent='';
  sendState('sending');
  let sent = false;
  const sendingStarted = performance.now();
  try {
   await window.contactDrafts.flush(); const productImage=await imageData();
   if(!signedIn&&!verified){const target=currentEmail();const result=await request('/api/contact/verify',{email:target,code:code.value.trim()});if(!result.response.ok)return;if(currentEmail()!==target)return;verified=true;code.value='';}
   const response=await fetch(window.contactRequestPath('/api/contact'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name:document.getElementById('contact-name').value.trim(),email:document.getElementById('contact-email').value.trim(),message:document.getElementById('contact-message').value.trim(),image:productImage,...(type==='request'?{productName:productName.value.trim()}:{})})});
   const data=await response.json();
   if(response.ok){
    await window.contactDrafts.clear();
    const remaining = Math.max(0, 1000 - (performance.now() - sendingStarted));
    if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
    sent=true; status.removeAttribute('data-i18n'); status.textContent=''; sendState('sent');
    document.getElementById('contact-message').value='';productName.value='';image.value='';if(!signedIn){verified=false;code.value='';codeStatus.hidden=true;codeStatus.removeAttribute('data-i18n');codeStatus.textContent='';}
   }else{setLocalizedMessage(status,data.message);if(data.verificationRequired){verified=false;verification.hidden=false;}}
  } catch(error) {setLocalizedMessage(status,error.message==='Choose a JPG, PNG, WebP, HEIC, HEIF or AVIF photo up to 10 MB.'||error.message==='Could not read image. Please choose it again.'?error.message:'Could not send your message. Please try again later.');}
  finally {if(!sent)sendState('idle');form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = false; });window.contactDrafts.updateTools();button.disabled=false;}
 });
})();
