(() => {
    const form = document.getElementById('contact-form');
    const imageInput = document.getElementById('contact-image');
    const message = document.getElementById('contact-message');
    const product = document.getElementById('contact-product-name');
    const name = document.getElementById('contact-name');
    const type = ['request', 'partnership'].includes(new URLSearchParams(location.search).get('type')) ? new URLSearchParams(location.search).get('type') : 'email';
    window.contactRequestPath = path => path + (new URLSearchParams(location.search).get('admin') === '1' ? '?admin=1' : '');
    let enabled = false, savedImage = null, imageName = '', reading = Promise.resolve(), writes = Promise.resolve(), timer, version = 0;
    async function api(path, body) {
        const response = await fetch(window.contactRequestPath(path), { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not save draft.');
        return data;
    }
    function indicator(input) {
        const status = document.createElement('span'); status.className = 'contact-draft-feedback'; status.hidden = true;
        status.innerHTML = '<span class="contact-send-circle" aria-hidden="true"></span>';
        const label = form.querySelector(`label[for="${input.id}"]`);
        label.classList.add('contact-save-label'); label.after(status);
        return status;
    }
    const textStatus = indicator(type === 'request' ? product : message), imageStatus = indicator(imageInput);
    function feedback(status, state) {
        if (!enabled) return;
        const hasContent = status === imageStatus ? Boolean(savedImage || imageInput.files.length) : Boolean((type === 'request' ? product : message).value.trim());
        status.hidden = !hasContent;
        status.dataset.sendState = state;
        status.title = state === 'sent' ? 'Saved' : 'Saving'; status.setAttribute('aria-label', status.title);
    }
    const field = document.createElement('div'); field.className = 'contact-image-input'; imageInput.before(field); field.append(imageInput);
    const tools = document.createElement('div'); tools.className = 'contact-image-tools'; field.append(tools);
    function icon(label, paths, className) {
        const button = document.createElement('button'); button.type = 'button'; button.className = className; button.title = label; button.setAttribute('aria-label', label);
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
        tools.append(button); return button;
    }
    const preview = icon('Preview image', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', 'contact-image-preview');
    const remove = icon('Remove image', '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>', 'contact-image-remove');
    function updateTools() {
        tools.hidden = false;
        const hasImage = Boolean(savedImage || imageInput.files.length);
        preview.disabled = !hasImage; remove.disabled = !hasImage;
    }
    updateTools();
    function save() {
        if (!enabled) return Promise.resolve();
        clearTimeout(timer);
        const revision = version;
        const result = writes.catch(() => {}).then(async () => {
            await reading;
            const payload = { name: name.value, message: message.value, productName: product.value, image: savedImage, imageName };
            await api('/api/contact/drafts/' + type, payload);
            if (revision === version) {
                if (textStatus.dataset.sendState === 'sending') feedback(textStatus, 'sent');
                if (imageStatus.dataset.sendState === 'sending') feedback(imageStatus, 'sent');
            }
        });
        writes = result;
        result.catch(error => {
            for (const status of [textStatus, imageStatus]) if (status.dataset.sendState === 'sending') { status.removeAttribute('data-send-state'); status.title = error.message; }
            document.getElementById('contact-status').textContent = error.message;
        });
        return result;
    }
    form.addEventListener('input', event => {
        if (!enabled || [imageInput, document.getElementById('contact-code'), document.getElementById('contact-email')].includes(event.target)) return;
        version++;
        if ([message, product].includes(event.target)) feedback(textStatus, 'sending');
        clearTimeout(timer); timer = setTimeout(save, 350);
    });
    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0]; version++;
        feedback(imageStatus, 'sending'); updateTools();
        reading = (async () => {
            if (file && file.size > 10 * 1024 * 1024) throw new Error('Choose a photo up to 10 MB.');
            savedImage = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); }) : null;
            imageName = file?.name || ''; updateTools(); feedback(imageStatus, 'sending');
        })();
        reading.then(save).catch(error => { document.getElementById('contact-status').textContent = error.message; imageStatus.removeAttribute('data-send-state'); });
    });
    remove.addEventListener('click', () => { imageInput.value = ''; imageInput.dispatchEvent(new Event('change', { bubbles: true })); });
    preview.addEventListener('click', async () => {
        preview.disabled = true;
        try { await reading; if (savedImage) { const source = savedImage, data = await api('/api/contact/preview-image', { image: source }); if (savedImage === source) window.openMessageImage(data.image, preview); } }
        catch (error) { document.getElementById('contact-status').textContent = error.message; }
        finally { updateTools(); }
    });
    window.contactDrafts = {
        updateTools,
        async init(identity) {
            enabled = Boolean(identity.signedIn);
            if (!enabled) return;
            const { draft } = await api('/api/contact/drafts/' + type);
            if (!draft) return;
            name.value = draft.name || name.value; message.value = draft.message || ''; product.value = draft.productName || '';
            savedImage = draft.image; imageName = draft.imageName || 'photo';
            if (savedImage) {
                try { const [header, encoded] = savedImage.split(','); const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))], imageName, { type: header.slice(5).split(';')[0] || 'application/octet-stream' })); imageInput.files = transfer.files; } catch { }
            }
            feedback(textStatus, 'sent'); feedback(imageStatus, 'sent'); updateTools();
        },
        flush: save,
        async image() { await reading; return savedImage; },
        async clear() {
            clearTimeout(timer); await writes.catch(() => {});
            // Successful sends already clear the persisted draft in the server transaction.
            savedImage = null; imageName = ''; imageInput.value = ''; textStatus.hidden = true; imageStatus.hidden = true; updateTools();
        }
    };
})();
