(() => {
    'use strict';
    const admin = document.body.dataset.messageRole === 'admin', base = admin ? '/api/admin/message-center' : '/api/messages';
    const root = document.getElementById('message-center'), $ = id => document.getElementById(id);
    const supportAvatarIcon = '<svg viewBox="0 0 24 24" style="color:#2563eb" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M5 22v-3a7 7 0 0 1 14 0v3Z" fill="currentColor"/><g fill="none" stroke="#2563eb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8V7a5.5 5.5 0 0 1 11 0v1"/><rect x="5.5" y="7" width="2.5" height="4.5" rx="1.1" fill="#fff"/><rect x="16" y="7" width="2.5" height="4.5" rx="1.1" fill="#fff"/><path d="M17.3 11.5v.5a2 2 0 0 1-2 2H14"/></g></svg>';
    root.innerHTML = `<header class="mc-header"><a href="/store.html${admin ? '?adminView=1' : ''}">← Store</a><h1>${admin ? 'Support messages' : 'Messages'}</h1></header><nav class="mc-tools" aria-label="Folders"><button data-folder="inbox" aria-pressed="true" aria-label="Inbox" title="Inbox" class="mc-folder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16l2 12v4H2v-4L4 4Z"/><path d="M2 16h6l2 3h4l2-3h6M12 6v7m-3-3 3 3 3-3"/></svg> <span id="unread"></span></button><button id="compose" class="primary mc-compose-icon" aria-label="Compose" title="Compose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5M10 14l-1 4 4-1 9-9a2.1 2.1 0 0 0-5-5l-7 11Z"/></svg></button><button data-folder="trash" aria-label="Trash" title="Trash" class="mc-folder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button><label>Filter <select id="filter"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option>${admin ? '<option value="unanswered">Unanswered</option>' : ''}</select></label><input id="search" type="search" aria-label="Search by name or email" placeholder="Search by name or email"></nav><p id="notice" class="mc-notice" role="status" aria-live="polite"></p><div class="mc-layout"><section class="mc-list" aria-label="Conversations"><div id="list"></div><nav id="pages" class="mc-pages" aria-label="Email pages"></nav></section><section id="detail" class="mc-detail" aria-label="Selected conversation"><p>Select a conversation or compose a message.</p></section></div>`;
    const inboxButton = root.querySelector('[data-folder="inbox"]');
    $('filter').closest('label').hidden = true;
    $('filter').value = 'all';
    const stickyHeader = document.createElement('div');
    stickyHeader.className = 'mc-sticky-header';
    const header = root.querySelector('.mc-header'), tools = root.querySelector('.mc-tools');
    header.before(stickyHeader); stickyHeader.append(header, tools);
    if (admin) {
        const heading = root.querySelector('.mc-header h1');
        heading.className = 'mc-support-heading';
        heading.setAttribute('aria-label', 'Support messages'); heading.title = 'Support messages';
        heading.innerHTML = supportAvatarIcon;
        root.querySelector('.mc-header').classList.add('mc-support-header');
    } else {
        const heading = root.querySelector('.mc-header h1');
        heading.className = 'mc-support-heading';
        heading.setAttribute('aria-label', 'Messages'); heading.title = 'Messages';
        heading.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
        root.querySelector('.mc-header').classList.add('mc-support-header');
    }
    const returnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    function styleCustomerReturn(element, label) {
        if (admin) return;
        element.classList.add('user-return-icon');
        element.setAttribute('aria-label', label);
        element.title = label;
        element.innerHTML = returnIcon;
    }
    styleCustomerReturn(root.querySelector('.mc-header > a'), 'Return to Store');
    {
        const returnLink = root.querySelector('.mc-header > a');
        returnLink.className = 'user-return-icon';
        returnLink.setAttribute('aria-label', admin ? 'Return to View Store' : 'Return to Store');
        returnLink.title = admin ? 'Return to View Store' : 'Return to Store';
        returnLink.innerHTML = returnIcon;
        returnLink.href = admin ? '/store.html?adminView=1' : '/store.html';
        const emailTitle = document.title;
        let emailScroll = 0;
        let returningToStore = false;
        let storePreview, exitLayer;
        const originalParent = root.parentNode, originalNextSibling = root.nextSibling;
        function restoreEmailPage() {
            returningToStore = false;
            root.hidden = false; root.inert = false; root.style.pointerEvents = '';
            if (exitLayer) { originalParent.insertBefore(root, originalNextSibling); exitLayer.remove(); exitLayer = null; }
            storePreview?.remove(); storePreview = null;
            document.body.style.overflow = '';
            window.scrollTo({ top: emailScroll, behavior: 'instant' });
            start();
        }
        window.addEventListener('popstate', () => { if (storePreview && !history.state?.easyshopStoreView) restoreEmailPage(); });
        window.addEventListener('pageshow', event => {
            if (!event.persisted) return;
            returningToStore = false;
            root.style.pointerEvents = '';
            root.getAnimations().forEach(animation => animation.cancel());
            if (exitLayer) { originalParent.insertBefore(root, originalNextSibling); exitLayer.remove(); exitLayer = null; }
            storePreview?.remove(); storePreview = null;
        });
        returnLink.addEventListener('click', async event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (returningToStore) return;
            returningToStore = true;
            if (draft.body || draft.image || draft.subject || draft.recipient) {
                try { await saveDraft(); }
                catch (error) { notice(error.message, true); returningToStore = false; return; }
            }
            if (window.frameElement?.classList.contains('store-email-preview') && window.parent.returnToLoadedStore) {
                stopped = true; clearInterval(interval); clearTimeout(draftTimer);
                await window.parent.returnToLoadedStore();
                return;
            }
            root.style.pointerEvents = 'none';
            emailScroll = window.scrollY;
                storePreview = document.createElement('iframe');
                storePreview.className = 'mc-store-preview'; storePreview.title = 'View Store';
                storePreview.setAttribute('aria-hidden', 'true'); storePreview.tabIndex = -1;
                const loaded = new Promise(resolve => storePreview.addEventListener('load', resolve, { once: true }));
                storePreview.src = returnLink.href;
                document.body.append(storePreview);
                exitLayer = document.createElement('div'); exitLayer.className = 'mc-exit-layer';
                exitLayer.append(root); document.body.append(exitLayer);
                exitLayer.scrollTop = emailScroll;
                await loaded;
                storePreview.contentDocument.addEventListener('click', async event => {
                    const link = event.target.closest?.('a[href]');
                    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    const target = new URL(link.href, location.origin);
                    if (target.pathname === (admin ? '/admin/emails' : '/account/emails')) {
                        event.preventDefault();
                        const preview = storePreview;
                        if (preview.style.pointerEvents === 'none') return;
                        preview.style.pointerEvents = 'none';
                        root.hidden = false; root.inert = false;
                        const emailLayer = document.createElement('div');
                        emailLayer.className = 'mc-exit-layer';
                        emailLayer.append(root); document.body.append(emailLayer);
                        emailLayer.scrollTop = emailScroll;
                        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
                            const animation = emailLayer.animate([
                                { transform: 'translateX(100vw)', opacity: 0 },
                                { transform: 'translateX(0)', opacity: 1 }
                            ], { duration: 1250, easing: 'ease-in-out', fill: 'forwards' });
                            await animation.finished.catch(() => {});
                        }
                        originalParent.insertBefore(root, originalNextSibling);
                        emailLayer.remove();
                        restoreEmailPage();
                        history.pushState(null, '', target.href);
                        document.title = emailTitle;
                    }
                }, true);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const animation = exitLayer.animate([
                    { transform: 'translateX(0)', opacity: 1 },
                    { transform: 'translateX(100vw)', opacity: 0 }
                ], { duration: 1250, easing: 'ease-in-out', fill: 'forwards' });
                try { await animation.finished; } catch { }
            }
            if (exitLayer) { originalParent.insertBefore(root, originalNextSibling); exitLayer.remove(); exitLayer = null; }
            root.hidden = true; root.inert = true;
            stopped = true; clearInterval(interval); clearTimeout(draftTimer);
            storePreview.removeAttribute('aria-hidden'); storePreview.removeAttribute('tabindex');
            storePreview.style.pointerEvents = 'auto';
            document.body.style.overflow = 'hidden';
            history.pushState({ easyshopStoreView: true }, '', returnLink.href);
            document.title = storePreview.contentDocument.title;
            storePreview.focus();
        });
    }
    let selected = null, folder = 'inbox', page = 0, identity = '', verified = false, sending = false, stopped = false;
    let listVersion = 0, threadVersion = 0, snapshot = '', listSnapshot = '', draftTimer, interval, writes = Promise.resolve();
    const empty = subject => ({ subject: subject || '', body: '', requestKey: crypto.randomUUID(), updated: 0 });
    let draft = empty(), draftOwner = 'new', imageRead = Promise.resolve(), composeRecipient = '';
    const receiveAnimations = new Map();
    const completedIndicators = new Map();
    const activeSendIndicators = new Set();
    const node = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; };
    const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.remove('mc-send-feedback'); $('notice').removeAttribute('data-send-state'); $('notice').removeAttribute('aria-label'); $('notice').classList.toggle('error', error); };
    const messageDialog = document.createElement('dialog'); messageDialog.className = 'mc-message-dialog';
    messageDialog.setAttribute('aria-label', 'Email');
    const closeDialogButton = node('button', '', 'mc-dialog-close'); closeDialogButton.type = 'button';
    closeDialogButton.setAttribute('aria-label', 'Close email'); closeDialogButton.title = 'Close'; closeDialogButton.innerHTML = returnIcon;
    messageDialog.append(closeDialogButton, $('detail')); root.append(messageDialog);
    let dialogTrigger, dialogOverflow = '';
    function showMessageDialog() {
        if (!closeDialogButton.isConnected) messageDialog.prepend(closeDialogButton);
        if (messageDialog.open) return;
        dialogTrigger = document.activeElement; dialogOverflow = document.body.style.overflow;
        messageDialog.insertBefore($('notice'), $('detail'));
        document.body.style.overflow = 'hidden'; messageDialog.showModal();
    }
    function closeMessageDialog() { if (!sending) messageDialog.close(); }
    closeDialogButton.addEventListener('click', closeMessageDialog);
    messageDialog.addEventListener('cancel', event => { event.preventDefault(); closeMessageDialog(); });
    messageDialog.addEventListener('close', () => {
        document.body.style.overflow = dialogOverflow;
        root.insertBefore($('notice'), root.querySelector('.mc-layout'));
        root.classList.remove('show-detail'); ++threadVersion;
        if (draft.body || draft.image || draft.subject || draft.recipient) { keepLocal(); saveDraft().catch(error => notice(error.message, true)); }
        const focusTarget = dialogTrigger?.isConnected ? dialogTrigger : root.querySelector(`[data-folder="${folder}"]`);
        focusTarget?.focus({ preventScroll: true });
    });
    const stamp = value => new Date(value).toLocaleString();
    async function api(path, method = 'GET', body, signal) {
        const response = await fetch(base + path, { method, signal, cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) { const error = new Error(typeof data.message === 'string' ? data.message : 'Request failed.'); error.verificationRequired = data.verificationRequired; throw error; } return data;
    }
    const storageKey = key => `easyshop-message-draft:${admin ? 'admin' : 'user'}:${identity}:${key}`;
    function keepLocal(value = draft, key = draftOwner) { if (identity) try { localStorage.setItem(storageKey(key), JSON.stringify({ ...value, image: typeof value.image === 'string' ? undefined : value.image })); } catch { notice('Local recovery is unavailable. Your draft will be saved to your account.', true); } }
    function draftFeedback(state) {
        const status = $('draft-status');
        if (!status) return;
        clearTimeout(status.saveFeedbackTimer);
        if (!draft.body?.trim()) { status.hidden = true; status.removeAttribute('data-send-state'); return; }
        status.hidden = false;
        status.dataset.sendState = state === 'saved' ? 'sent' : 'sending';
        status.setAttribute('aria-label', state === 'saved' ? 'Saved' : 'Saving');
        const circle = node('span', '', 'mc-send-circle'); circle.setAttribute('aria-hidden', 'true');
        status.replaceChildren(circle, node('span', state === 'saved' ? 'Saved' : ''));
        if (state === 'saved') {
            status.saveFeedbackTimer = setTimeout(() => {
                if (!status.isConnected || status.hidden || status.dataset.sendState !== 'sent') return;
                status.replaceChildren(circle);
            }, 700);
        }
    }
    function imageDraftFeedback(state) {
        const input = $('message-image');
        const label = input?.closest('form').querySelector('label[for="message-image"]');
        if (!label) return;
        let indicator = label.querySelector('.mc-image-save-feedback');
        if (!draft.image && !input.files.length) { indicator?.remove(); return; }
        if (!indicator) {
            indicator = node('span', '', 'mc-send-feedback mc-image-save-feedback');
            label.append(indicator);
        }
        if (!indicator.querySelector('.mc-send-circle')) {
            const circle = node('span', '', 'mc-send-circle'); circle.setAttribute('aria-hidden', 'true');
            indicator.replaceChildren(circle);
        }
        indicator.dataset.sendState = state === 'saved' ? 'sent' : 'sending';
        indicator.setAttribute('aria-label', state === 'saved' ? 'Image saved' : 'Saving image');
        indicator.title = state === 'saved' ? 'Image saved' : 'Saving image';
    }
    async function saveDraft(owner = draft, key = draftOwner) {
        const pendingImage = imageRead;
        await pendingImage;
        clearTimeout(draftTimer); const value = { ...owner }; keepLocal(value, key);
        const result = writes.catch(() => {}).then(() => api('/drafts/' + key, 'PUT', value)); writes = result;
        result.then(() => {
            if (key !== draftOwner) return;
            if (draft.body === value.body && draft.subject === value.subject && $('draft-status')?.dataset.sendState === 'sending') draftFeedback('saved');
            if (draft.image === value.image && $('message-image')?.closest('form').querySelector('.mc-image-save-feedback')?.dataset.sendState === 'sending') imageDraftFeedback('saved');
        }, () => {
            if (key !== draftOwner) return;
            if ($('draft-status')?.dataset.sendState === 'sending') { $('draft-status').removeAttribute('data-send-state'); $('draft-status').textContent = 'Could not save'; }
            const imageStatus = $('message-image')?.closest('form').querySelector('.mc-image-save-feedback');
            if (imageStatus?.dataset.sendState === 'sending') { imageStatus.removeAttribute('data-send-state'); imageStatus.textContent = 'Could not save image'; }
        }); return result;
    }
    async function restoreDraft(key, subject = '') {
        let local; try { local = JSON.parse(localStorage.getItem(storageKey(key))); } catch { }
        const { draft: saved } = await api('/drafts/' + key);
        const server = saved && { subject: saved.subject, body: saved.body, requestKey: saved.request_key, updated: saved.updated, image: saved.image, imageName: saved.image_name, recipient: saved.recipient };
        const valid = local && typeof local.body === 'string' && typeof local.subject === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(local.requestKey);
        // A provider-accepted draft must not be resurrected from an old local recovery copy.
        if (valid && !server) { const status = await api('/request/' + local.requestKey); if (status.removed || status.message?.delivery === 'accepted') { try { localStorage.removeItem(storageKey(key)); } catch { } return empty(subject); } }
        const value = valid && (!server || local.updated > server.updated) ? local : server || empty(subject);
        if (value.image === undefined && server?.requestKey === value.requestKey) { value.image = server.image; value.imageName = server.imageName; }
        if (value.body || value.image) value.submitted = Boolean((await api('/request/' + value.requestKey)).message);
        return value;
    }
    let listRequest;
    async function loadList() {
        const version = ++listVersion;
        listRequest?.abort();
        listRequest = new AbortController();
        try {
            const data = await api(`?folder=${folder}&filter=${$('filter').value}&page=${page}&q=${encodeURIComponent($('search').value)}`, 'GET', undefined, listRequest.signal);
            if (stopped || version !== listVersion) return;
            if (!data.conversations.length && page > 0) { page--; return loadList(); }
            identity = data.identity; verified = data.verified; $('unread').textContent = data.unread ? String(data.unread) : ''; inboxButton.setAttribute('aria-label', data.unread ? 'Inbox, ' + data.unread + ' unread messages' : 'Inbox'); $('unread').title = data.unread + ' unread messages';
            if ($('resend')) $('resend').hidden = admin || verified;
            const nextSnapshot = JSON.stringify([data.conversations, selected, page, folder, data.more, data.nextUnread, data.totalPages]);
            if (nextSnapshot === listSnapshot) return;
            listSnapshot = nextSnapshot;
            const focused = document.activeElement?.dataset?.conversation;
            $('list').replaceChildren();
            if (!data.conversations.length) $('list').append(node('p', 'No conversations found.'));
            for (const conversation of data.conversations) {
                const isUnread = Boolean(conversation.unread) || conversation.read_through === 0;
                const row = node('div', '', 'mc-row mc-mail-row');
                row.classList.toggle('is-unread', isUnread);
                row.setAttribute('aria-current', String(conversation.id === selected));
                const button = node('button', '', 'mc-row-open'); button.dataset.conversation = String(conversation.id);
                const sender = node('span', admin ? conversation.customer_name || conversation.customer_email : 'HK Support', 'mc-row-sender');
                const content = node('span', '', 'mc-row-content');
                content.append(node('span', conversation.subject, 'mc-row-subject'), node('span', (conversation.preview || '').replace(/\s+/g, ' '), 'mc-row-preview'));
                const date = new Date(conversation.updated), today = new Date();
                const time = node('time', date.toDateString() === today.toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }), 'mc-row-time');
                if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
                time.title = stamp(conversation.updated);
                button.append(sender, content, time);
                button.addEventListener('click', () => openThread(conversation.id).catch(error => notice(error.message, true)));
                row.append(button);
                if (!conversation.trashed) {
                    const tools = node('div', '', 'mc-row-tools');
                    for (const name of [isUnread ? 'read' : 'unread', 'trash']) {
                        const control = node('button', '', 'mc-row-action ' + (name === 'trash' ? 'trash' : isUnread ? 'unread' : 'read'));
                        control.type = 'button'; control.title = name === 'read' ? 'Mark read' : name === 'unread' ? 'Mark unread' : 'Trash';
                        control.setAttribute('aria-label', control.title);
                        const paths = name === 'trash' ? '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>' : isUnread ? '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>' : '<path d="M3 9l9-6 9 6v12H3V9Z"/><path d="m3 9 9 7 9-7M3 21l6-7m12 7-6-7"/>';
                        control.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
                        control.addEventListener('click', async () => { control.disabled = true; try { await action(name, undefined, conversation.id); } catch (error) { notice(error.message, true); } finally { control.disabled = false; } });
                        tools.append(control);
                    }
                    row.append(tools);
                }
                $('list').append(row); if (focused === String(conversation.id)) button.focus({ preventScroll: true });
            }
            const totalPages = data.totalPages || page + 1 + Number(data.more);
            const first = Math.max(0, Math.min(page - 4, totalPages - 10));
            $('pages').replaceChildren();
            for (let index = first; index < Math.min(totalPages, first + 10); index++) {
                const dot = node('button', '', 'mc-page-dot');
                dot.type = 'button'; dot.setAttribute('aria-label', 'Page ' + (index + 1));
                const number = node('span', String(index + 1)); dot.append(number);
                if (index === page) dot.setAttribute('aria-current', 'page');
                dot.addEventListener('click', () => { if (page === index) return; page = index; loadList(); });
                $('pages').append(dot);
            }
            if ($('resend')) $('resend').hidden = admin || verified;
        } catch (error) { if (!stopped && version === listVersion && error.name !== 'AbortError') notice(error.message, true); }
    }
    function composer(parent) {
        const form = document.createElement('form'); form.className = 'mc-compose';
        form.innerHTML = '<label for="subject">Subject</label><input id="subject" maxlength="200" required><label for="message-image">Add image (optional)</label><input id="message-image" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif"><label for="body">Message</label><div class="mc-message-input"><textarea id="body" maxlength="10000" required></textarea><p id="draft-status" class="mc-help mc-send-feedback mc-draft-feedback" role="status" aria-live="polite" hidden></p></div><div class="mc-actions"><button class="primary" type="submit">Send</button><button id="resend" type="button">Resend verification</button></div>';
        parent.append(form); $('subject').value = draft.subject; $('subject').readOnly = selected !== null; if (selected !== null) $('subject').setAttribute('aria-readonly', 'true'); $('body').value = draft.body; $('resend').hidden = admin || verified;
        if (admin && selected === null) draft.recipient = composeRecipient || draft.recipient || '';
        form.querySelector('label[for="body"]').append($('draft-status'));
        if (draft.body) {
            draftFeedback('saved');
        } else {
            const status = $('draft-status');
            status.hidden = true;
        }
        const imageInput = form.querySelector('#message-image');
        const imageField = node('div', '', 'mc-image-field');
        imageInput.before(imageField); imageField.append(imageInput);
        const imageTools = node('div', '', 'mc-image-field-tools'); imageField.append(imageTools);
        const previewImage = node('button', '', 'mc-image-preview-button');
        previewImage.type = 'button'; previewImage.title = 'Preview image'; previewImage.setAttribute('aria-label', 'Preview image');
        previewImage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
        const removeImage = node('button', '', 'mc-image-remove-button');
        removeImage.type = 'button'; removeImage.title = 'Remove image'; removeImage.setAttribute('aria-label', 'Remove image');
        removeImage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
        imageTools.append(previewImage, removeImage);
        function updateImageTools() {
            imageTools.hidden = false;
            const hasImage = Boolean(draft.image || imageInput.files.length);
            previewImage.disabled = !hasImage; removeImage.disabled = !hasImage;
        }
        updateImageTools();
        previewImage.addEventListener('click', async () => {
            previewImage.disabled = true;
            try {
                await imageRead;
                const source = draft.image;
                if (!source) return;
                const result = await api('/preview-image', 'POST', { image: source });
                if (draft.image === source && form.isConnected) window.openMessageImage(result.image, previewImage);
            } catch (error) { notice(error.message, true); }
            finally { updateImageTools(); }
        });
        removeImage.addEventListener('click', () => { imageInput.value = ''; imageInput.dispatchEvent(new Event('change', { bubbles: true })); });
        if (draft.image) {
            try {
                const [header, encoded] = draft.image.split(',');
                const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
                const transfer = new DataTransfer();
                transfer.items.add(new File([bytes], draft.imageName || 'photo', { type: header.slice(5).split(';')[0] || 'application/octet-stream' }));
                imageInput.files = transfer.files;
            } catch { notice('Your saved image will be included when sending.'); }
            imageDraftFeedback('saved');
        }
        imageInput.addEventListener('change', () => {
            previewImage.disabled = !imageInput.files.length;
            removeImage.disabled = !imageInput.files.length;
            const owner = draft, ownerKey = draftOwner, file = imageInput.files[0];
            if (draft.submitted) { draft.requestKey = crypto.randomUUID(); draft.submitted = false; }
            imageDraftFeedback('saving');
            imageRead = (async () => {
                if (file && file.size > 10 * 1024 * 1024) throw new Error('Choose a photo up to 10 MB.');
                const image = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); }) : null;
                owner.image = image; owner.imageName = file?.name || ''; owner.updated = Date.now();
                updateImageTools();
                keepLocal(owner);
            })();
            imageRead.then(() => saveDraft(owner, ownerKey)).catch(error => { notice(error.message, true); imageRead = Promise.resolve(); const imageStatus = imageInput.closest('form').querySelector('.mc-image-save-feedback'); if (imageStatus) { imageStatus.removeAttribute('data-send-state'); imageStatus.textContent = 'Could not save image'; } });
        });
        const sendButton = form.querySelector('button[type="submit"]');
        sendButton.classList.add('mc-send-icon');
        const sendLabel = typeof translateText === 'function' ? translateText('Send') : 'Send';
        sendButton.title = sendLabel; sendButton.setAttribute('aria-label', sendLabel);
        sendButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg>';
        form.addEventListener('input', event => { if (event.target === imageInput) return; if (draft.submitted) { draft.requestKey = crypto.randomUUID(); draft.submitted = false; } draft.subject = $('subject').value; draft.body = $('body').value; if ($('recipient')) draft.recipient = $('recipient').value; draft.updated = Date.now(); keepLocal(); draftFeedback('saving'); clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft().catch(error => notice(error.message, true)), 500); });
        $('resend').addEventListener('click', async event => { event.target.disabled = true; try { const data = await api('/verification', 'POST', {}); notice(data.message || 'Email verified. Click Send when ready.'); await loadList(); } catch (error) { notice(error.message, true); } finally { event.target.disabled = false; } });
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (sending) return; if (admin && selected === null && !draft.recipient) { notice('Open a customer email first, then click Compose.', true); return; } sending = true; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = true); notice('Sending…');
            try {
                const file = form.querySelector('#message-image').files[0];
                let image = draft.image || null;
                if (file) {
                    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo up to 10 MB.');
                    image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); });
                }
                await saveDraft(); const data = await api('/send', 'POST', { ...draft, conversationId: selected, image });
                activeSendIndicators.add(data.message.id);
                notice('');
                if (data.message.delivery === 'accepted') try { localStorage.removeItem(storageKey(draftOwner)); } catch { }
                selected = data.message.conversation_id; draft = empty(data.message.subject); draftOwner = String(selected);
                if ($('history')) {
                    const data = await api('/' + selected);
                    renderHistory(data); snapshot = JSON.stringify(data);
                    $('body').value = ''; form.querySelector('#message-image').value = '';
                    form.querySelector('.mc-image-save-feedback')?.remove();
                    updateImageTools();
                    $('draft-status').hidden = true;
                } else await openThread(selected, false, true);
                await loadList();
                const reply = $('reply');
                if (reply) {
                    const pageX = window.scrollX, pageY = window.scrollY;
                    if (form.isConnected) form.hidden = true;
                    reply.setAttribute('aria-expanded', 'false');
                    reply.focus({ preventScroll: true });
                    window.scrollTo({ left: pageX, top: pageY, behavior: 'instant' });
                }
            } catch (error) { if (error.verificationRequired) { verified = false; if ($('resend')) $('resend').hidden = false; } notice(error.message, true); }
            finally { sending = false; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = false); updateImageTools(); }
        });
        return form;
    }
    function replyButton(parent) {
        const reply = node('button', '', 'primary');
        reply.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7v1"/></svg>';
        const label = typeof translateText === 'function' ? translateText('Reply') : 'Reply';
        reply.title = label; reply.setAttribute('aria-label', label);
        reply.id = 'reply'; reply.type = 'button'; reply.setAttribute('aria-expanded', 'false'); reply.setAttribute('aria-controls', 'reply-editor');
        let form;
        reply.addEventListener('click', () => {
            if (sending) return;
            if (!form) { form = composer(parent); form.id = 'reply-editor'; }
            const opening = reply.getAttribute('aria-expanded') !== 'true';
            form.hidden = !opening; reply.setAttribute('aria-expanded', String(opening));
            if (opening) $('body').focus();
        });
        parent.append(reply);
    }
    function localizeReplyIcon() {
        if (!$('reply') || typeof translateText !== 'function') return;
        $('reply').title = translateText('Reply'); $('reply').setAttribute('aria-label', translateText('Reply'));
    }
    document.addEventListener('languagechange', localizeReplyIcon);
    window.addEventListener('storage', event => { if (event.key === 'language') localizeReplyIcon(); });
    let removalDialog;
    function confirmRemoval(permanent, restore = false) {
        if (removalDialog?.open) return Promise.resolve(false);
        if (!removalDialog) {
            removalDialog = document.createElement('dialog'); removalDialog.className = 'mc-remove-confirm';
            removalDialog.setAttribute('aria-labelledby', 'mc-remove-title');
            removalDialog.innerHTML = '<h2 id="mc-remove-title"></h2><div class="mc-remove-choices"><button type="button" class="mc-remove-no" autofocus>No</button><button type="button" class="mc-remove-yes">Yes</button></div>';
            root.append(removalDialog);
            removalDialog.querySelector('.mc-remove-no').addEventListener('click', () => removalDialog.close('no'));
            removalDialog.querySelector('.mc-remove-yes').addEventListener('click', () => removalDialog.close('yes'));
            removalDialog.addEventListener('cancel', event => { event.preventDefault(); removalDialog.close('no'); });
        }
        removalDialog.querySelector('h2').textContent = restore ? 'Restore?' : permanent ? 'Delete permanently?' : 'Remove?';
        removalDialog.classList.toggle('mc-restore-confirm', restore);
        removalDialog.returnValue = '';
        return new Promise(resolve => {
            removalDialog.addEventListener('close', () => resolve(removalDialog.returnValue === 'yes'), { once: true });
            removalDialog.showModal();
        });
    }
    async function action(name, through, targetId = selected) {
        if (sending) return;
        if (['trash', 'delete'].includes(name) && !await confirmRemoval(name === 'delete')) return;
        if (name === 'restore' && !await confirmRemoval(false, true)) return;
        if (draft.body || draft.image || draft.subject || draft.recipient) await saveDraft(); await api(`/${targetId}/state`, 'POST', { action: name, through });
        if (targetId === selected && ['trash', 'restore', 'delete'].includes(name)) {
            if (name === 'delete') try { localStorage.removeItem(storageKey(draftOwner)); } catch { }
            selected = null; ++threadVersion; draftOwner = 'new'; draft = empty();
            // Close the modal before removing its toolbar and exit button.
            closeMessageDialog();
            messageDialog.prepend(closeDialogButton);
            root.classList.remove('show-detail');
            $('detail').replaceChildren(node('p', 'Select a conversation.'));
        }
        await loadList();
    }
    function renderHistory(data) {
        const pageX = window.scrollX, pageY = window.scrollY;
        const historyScroll = $('history').scrollTop;
        const history = $('history'); history.replaceChildren();
        if (data.more) {
            const older = node('button', 'Load older messages'); history.append(older);
            older.addEventListener('click', async () => { const id = selected, version = threadVersion; older.disabled = true; try { const previous = await api(`/${id}?before=${data.messages[0].id}`); if (id === selected && version === threadVersion) renderHistory({ ...data, messages: [...previous.messages, ...data.messages], more: previous.more }); } catch (error) { notice(error.message, true); older.disabled = false; } });
        }
        for (const message of data.messages) {
            const author = message.sender_role === 'user' ? message.sender_name || 'Customer' : 'HK Support';
            const card = node('article', '', 'mc-message');
            const header = node('div', '', 'mc-email-header');
            const avatar = node('span', '', 'mc-email-avatar'); avatar.setAttribute('aria-hidden', 'true');
            avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg>';
            if (message.sender_role === 'admin') avatar.innerHTML = supportAvatarIcon;
            const sender = node('div', '', 'mc-email-sender'); sender.append(node('strong', author));
            if (message.sender_role === 'user') sender.append(node('span', message.sender_email, 'mc-email-address'));
            sender.append(node('div', message.sender_role === 'user' ? 'Customer' : 'HK Support', 'mc-help'));
            header.append(avatar, sender, node('time', stamp(message.created), 'mc-email-date'));
            card.append(header);
            card.classList.add(message.sender_role === (admin ? 'admin' : 'user') ? 'mc-outgoing' : 'mc-incoming');
            card.append(node('p', message.body, 'mc-body'));
            for (const attachment of message.images || []) {
                const image = document.createElement('img'); image.alt = 'Product image'; image.loading = 'lazy'; image.className = 'mc-product-image'; image.src = `${base}/${message.conversation_id}/images/${attachment.id}`;
                const expand = node('button', '', 'mc-image-open'); expand.type = 'button'; expand.setAttribute('aria-label', 'Open product image at original size'); expand.append(image); expand.addEventListener('click', () => window.openMessageImage(image.src, expand)); card.append(expand);
            }
            const labels = { queued: 'Sending — queued', sending: 'Sending…', accepted: 'Sent', failed: 'Failed', unknown: 'Email acceptance uncertain' };
            if (['queued', 'sending', 'accepted'].includes(message.delivery)) {
                const sent = message.delivery === 'accepted';
                const status = node('p', '', 'mc-status mc-send-feedback');
                status.dataset.sendState = sent ? 'sent' : 'sending';
                const circle = node('span', '', 'mc-send-circle'); circle.setAttribute('aria-hidden', 'true');
                const outgoing = message.sender_role === (admin ? 'admin' : 'user');
                const label = outgoing ? 'Send' : 'Receive';
                if (sent && !completedIndicators.has(message.id) && !activeSendIndicators.has(message.id) && (outgoing || message.id <= (data.conversation.read_through || 0))) {
                    completedIndicators.set(message.id, 0);
                }
                let receiveUntil = receiveAnimations.get(message.id);
                if (!outgoing && sent && message.id > (data.conversation.read_through || 0) && receiveUntil === undefined && !completedIndicators.has(message.id)) {
                    receiveUntil = Date.now() + 2000;
                    receiveAnimations.set(message.id, receiveUntil);
                }
                const remaining = !outgoing && sent ? Math.max(0, (receiveUntil || 0) - Date.now()) : 0;
                if (sent && !completedIndicators.has(message.id)) completedIndicators.set(message.id, Date.now() + remaining + 1000);
                const visibleFor = sent ? Math.max(0, completedIndicators.get(message.id) - Date.now()) : null;
                if (sent && !visibleFor) status.hidden = true;
                const text = node('span', remaining ? '' : label);
                status.append(circle, text);
                status.setAttribute('aria-label', sent ? label : outgoing ? 'Sending message' : 'Receiving message');
                if (remaining) {
                    status.dataset.sendState = 'sending';
                    status.setAttribute('aria-label', 'Receiving message');
                    window.setTimeout(() => {
                        if (!status.isConnected) return;
                        status.dataset.sendState = 'sent';
                        text.textContent = 'Receive';
                        status.setAttribute('aria-label', 'Receive');
                    }, remaining);
                }
                card.append(status);
                if (sent && visibleFor) window.setTimeout(() => { status.hidden = true; }, visibleFor);
            } else card.append(node('p', labels[message.delivery] || message.delivery, 'mc-status ' + message.delivery));
            if (message.error) card.append(node('p', message.error, 'mc-status'));
            if (message.can_retry && ['failed', 'unknown'].includes(message.delivery)) {
                const retry = node('button', 'Retry'); card.append(retry);
                retry.addEventListener('click', async () => { if (message.delivery === 'unknown' && !confirm('Email acceptance is uncertain. Retrying may send a duplicate email. Retry?')) return; retry.disabled = true; try { await api(`/${message.conversation_id}/retry/${message.id}`, 'POST', { acknowledgeDuplicateRisk: message.delivery === 'unknown' }); notice('Retry queued.'); snapshot = ''; await refreshThread(); } catch (error) { notice(error.message, true); retry.disabled = false; } });
            }
            history.append(card);
        }
        history.scrollTop = historyScroll;
        window.scrollTo({ left: pageX, top: pageY, behavior: 'instant' });
    }
    async function openThread(id, restore = true, preservePosition = false) {
        const pageX = window.scrollX, pageY = window.scrollY;
        if (sending && restore) return;
        if (restore && (draft.body || draft.image || draft.subject || draft.recipient)) await saveDraft(); const version = ++threadVersion; selected = id;
        const data = await api('/' + id), recovered = restore ? await restoreDraft(String(id), data.conversation.subject) : draft;
        if (stopped || version !== threadVersion) return;
        if (admin) composeRecipient = data.conversation.customer_email;
        draft = recovered; draftOwner = String(id); draft.subject = data.conversation.subject; root.classList.add('show-detail'); $('detail').replaceChildren();
        showMessageDialog();
        const back = node('button', '← Back', 'mc-back'); back.addEventListener('click', closeMessageDialog); $('detail').append(back);
        const heading = node('h2', data.conversation.subject); heading.tabIndex = -1; $('detail').append(heading); if (!preservePosition) heading.focus();
        const actions = node('div', '', 'mc-actions mc-email-toolbar'); $('detail').insertBefore(actions, heading);
        actions.append(heading);
        actions.append(closeDialogButton);
        const choices = data.conversation.trashed ? [['restore', 'Restore'], ['delete', 'Delete permanently']] : [];
        choices.forEach(([name, label]) => { const button = node('button', '', name === 'delete' ? 'danger' : ''); button.title = label; button.setAttribute('aria-label', label); const paths = name === 'read' ? '<path d="M3 9l9-6 9 6v12H3V9Z"/><path d="m3 9 9 7 9-7"/>' : name === 'unread' ? '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>' : name === 'restore' ? '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>' : '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'; button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; button.addEventListener('click', () => action(name, data.messages.at(-1)?.id).catch(error => notice(error.message, true))); actions.append(button); });
        const history = node('div', '', 'mc-history'); history.id = 'history'; $('detail').append(history); renderHistory(data); snapshot = JSON.stringify(data);
        if (!data.conversation.trashed) replyButton($('detail'));
        await api(`/${id}/state`, 'POST', { action: 'read', through: data.messages.at(-1)?.id }); await loadList();
        if (preservePosition) window.scrollTo({ left: pageX, top: pageY, behavior: 'instant' });
    }
    async function refreshThread() {
        if (!messageDialog.open || !selected || sending || stopped || document.hidden) return; const id = selected, version = threadVersion;
        try { const data = await api('/' + id); if (stopped || id !== selected || version !== threadVersion || !$('history')) return; const next = JSON.stringify(data); if (next !== snapshot) { renderHistory(data); snapshot = next; } } catch (error) { notice(error.message, true); }
    }
    $('compose').addEventListener('click', async () => {
        if (sending || !identity) return;
        try { if (draft.body || draft.image || draft.subject || draft.recipient) await saveDraft(); const version = ++threadVersion, recovered = await restoreDraft('new'); if (version !== threadVersion) return; selected = null; draft = recovered; draftOwner = 'new'; $('detail').replaceChildren(node('h2', 'HK Support')); root.classList.add('show-detail'); const back = node('button', '← Back', 'mc-back'); back.addEventListener('click', closeMessageDialog); $('detail').prepend(back); composer($('detail')); showMessageDialog();
            const heading = $('detail').querySelector('h2');
            heading.textContent = admin ? 'Compose' : 'HK Support';
            const toolbar = node('div', '', 'mc-actions mc-email-toolbar');
            toolbar.append(heading, closeDialogButton); $('detail').prepend(toolbar);
            $('subject').focus(); } catch (error) { notice(error.message, true); }
    });
    root.querySelectorAll('[data-folder]').forEach(button => button.addEventListener('click', () => { folder = button.dataset.folder; page = 0; if (folder !== 'inbox') $('filter').value = 'all'; root.querySelectorAll('[data-folder]').forEach(el => el.setAttribute('aria-pressed', String(el === button))); loadList(); }));
    $('filter').addEventListener('change', () => { folder = 'inbox'; page = 0; root.querySelectorAll('[data-folder]').forEach(el => el.setAttribute('aria-pressed', String(el === inboxButton))); loadList(); });
    function liveSearch() { page = 0; loadList(); }
    $('search').addEventListener('input', event => { if (!event.isComposing) liveSearch(); });
    $('search').addEventListener('compositionend', liveSearch);
    function refresh() { if (!stopped && !document.hidden) { loadList(); refreshThread(); } }
    function start() { stopped = false; clearInterval(interval); interval = setInterval(refresh, 5000); refresh(); }
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); window.addEventListener('pagehide', () => { stopped = true; clearInterval(interval); clearTimeout(draftTimer); if (draft.body || draft.image || draft.subject || draft.recipient) keepLocal(); }); window.addEventListener('pageshow', start); start();
})();
