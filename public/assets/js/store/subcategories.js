(() => {
    const selections = new Map();
    const adminSelections = new Map();
    const expandedManagers = new Set();
    window.createMixedCategoryCycles = (items, random = Math.random) => {
        const shuffle = values => {
            const copy = [...values];
            for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
            return copy;
        };
        const groups = new Map();
        for (const item of items) {
            const key = item.subcategoryId || null;
            if (!groups.has(key)) groups.set(key, { pool: [], bag: [] });
            groups.get(key).pool.push(item);
        }
        let lastGroup;
        return () => {
            const buckets = shuffle([...groups.entries()]).map(([key, group]) => {
                const selected = [];
                while (selected.length < Math.min(2, group.pool.length)) {
                    if (!group.bag.length) group.bag = shuffle(group.pool);
                    let index = group.bag.findIndex(item => !selected.some(picked => picked.id === item.id));
                    if (index < 0) { group.bag = shuffle(group.pool); index = group.bag.findIndex(item => !selected.some(picked => picked.id === item.id)); }
                    selected.push(group.bag.splice(index, 1)[0]);
                }
                return { key, items: shuffle(selected) };
            });
            const result = []; let previous = lastGroup;
            while (buckets.some(bucket => bucket.items.length)) {
                const available = buckets.filter(bucket => bucket.items.length);
                const alternatives = available.filter(bucket => bucket.key !== previous);
                const candidates = alternatives.length ? alternatives : available;
                candidates.sort((a, b) => b.items.length - a.items.length);
                const chosen = candidates[0]; result.push(chosen.items.pop()); previous = chosen.key;
            }
            lastGroup = previous;
            return result;
        };
    };
    window.setupSubcategoryCarousel = (track, category, seeAll, titleGroup) => {
        const admin = Boolean(window.storeEditorActive);
        const savedSelections = admin ? adminSelections : selections;
        const select = document.createElement('select'); select.className = 'customer-subcategory-select';
        const name = categoryText(category.en, category.zh, category.vi);
        select.setAttribute('aria-label', translateText('Subcategory') + ': ' + name);
        const all = document.createElement('option'); all.value = ''; all.textContent = translateText('All'); all.setAttribute('aria-label', translateText('All')); select.appendChild(all);
        for (const sub of category.subcategories || []) {
            const option = document.createElement('option'); option.value = sub.id; option.textContent = categoryText(sub.en, sub.zh, sub.vi); select.appendChild(option);
        }
        let selected = savedSelections.get(category.id) || '';
        if (!(category.subcategories || []).some(sub => sub.id === selected)) selected = '';
        select.value = selected; select.hidden = true; titleGroup.appendChild(select);
        const dropdown = document.createElement('details'); dropdown.className = 'customer-subcategory-dropdown';
        const summary = document.createElement('summary'); summary.setAttribute('aria-label', translateText('Subcategory') + ': ' + name);
        const options = document.createElement('div'); options.className = 'customer-subcategory-options';
        dropdown.appendChild(summary); dropdown.appendChild(options); titleGroup.appendChild(dropdown);
        const optionButtons = [];
        for (const option of select.children) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = option.textContent;
            button.addEventListener('click', () => { select.value = option.value; render(); dropdown.open = false; summary.focus(); });
            options.appendChild(button); optionButtons.push({ button, option });
        }
        dropdown.addEventListener('keydown', event => { if (event.key === 'Escape') { dropdown.open = false; summary.focus(); } });
        let controller;
        const render = () => {
            summary.textContent = [...select.children].find(option => option.value === select.value)?.textContent || translateText('All');
            for (const { button, option } of optionButtons) button.setAttribute('aria-pressed', String(option.value === select.value));
            controller?.destroy(); track.replaceChildren();
            savedSelections.set(category.id, select.value);
            const source = admin ? catalogDraftRows.flat() : products;
            const matching = source.filter(product => product.categoryId === category.id && (!select.value || product.subcategoryId === select.value));
            const nextCycle = !admin && !select.value && matching.length ? window.createMixedCategoryCycles(matching) : null;
            const initial = nextCycle ? nextCycle() : matching;
            for (const product of initial) track.appendChild(createShelfProductCard(product));
            seeAll.href = '/category?category=' + encodeURIComponent(category.id) + (select.value ? '&subcategory=' + encodeURIComponent(select.value) : '') + (admin ? '&adminView=1' : '');
            if (admin) {
                const selectedAdd = document.createElement('button'); selectedAdd.type = 'button'; selectedAdd.className = 'admin-store-add-card'; selectedAdd.textContent = '+'; selectedAdd.setAttribute('aria-label', translateText('Add New Item'));
                selectedAdd.addEventListener('click', () => window.addAdminStoreItem(category.id, select.value)); track.appendChild(selectedAdd);
                requestAnimationFrame(() => track.dispatchEvent(new Event('scroll')));
            } else controller = window.setupProductCarousel(track, initial, createShelfProductCard, nextCycle);
        };
        select.addEventListener('change', render); render();
    };
    document.addEventListener?.('click', event => {
        for (const dropdown of document.querySelectorAll('.customer-subcategory-dropdown[open]')) if (!dropdown.contains(event.target)) dropdown.open = false;
    });
    window.createAdminSubcategoryTrigger = category => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-subcategory-trigger'; button.textContent = '+';
        button.setAttribute('aria-label', translateText('Manage Subcategories') + ': ' + categoryText(category.en, category.zh, category.vi)); button.title = translateText('Manage Subcategories');
        button.addEventListener('click', () => window.openAdminSubcategoryManagement(category)); return button;
    };
    window.openAdminSubcategoryManagement = category => {
        if (!window.storeEditorActive || !catalogReady || catalogBusy || document.getElementById('admin-subcategory-management')) return;
        const dialog = document.createElement('dialog'); dialog.id = 'admin-subcategory-management'; dialog.className = 'admin-subcategory-dialog';
        const close = document.createElement('button'); close.type = 'button'; close.className = 'subcategory-dialog-close'; close.textContent = '×'; close.setAttribute('aria-label', translateText('Close')); close.onclick = () => dialog.close();
        const title = document.createElement('h2'); title.id = 'admin-subcategory-management-title'; title.textContent = translateText('Manage Subcategories'); dialog.setAttribute('aria-labelledby', title.id);
        const content = document.createElement('div');
        const render = () => {
            const current = getCategorySettings().categories.find(parent => parent.id === category.id);
            if (!current) { dialog.close(); return; }
            content.replaceChildren();
            const add = document.createElement('button'); add.type = 'button'; add.className = 'admin-subcategory-trigger'; add.textContent = '+'; add.setAttribute('aria-label', translateText('Add Subcategory')); add.title = translateText('Add Subcategory');
            add.addEventListener('click', () => window.openAdminSubcategoryDialog(current)); content.appendChild(add);
            const manager = window.createAdminSubcategoryManager(current); manager.open = true; content.appendChild(manager);
        };
        dialog.appendChild(close); dialog.appendChild(title); dialog.appendChild(content);
        document.addEventListener('categorysettingschange', render);
        dialog.addEventListener('close', () => { document.removeEventListener('categorysettingschange', render); dialog.remove(); }, { once: true });
        document.body.appendChild(dialog); render(); dialog.showModal();
    };
    window.openAdminSubcategoryDialog = (category, sub = null) => {
        if (!window.storeEditorActive || !catalogReady || catalogBusy || document.getElementById('admin-subcategory-dialog')) return;
        const dialog = document.createElement('dialog'); dialog.id = 'admin-subcategory-dialog'; dialog.className = 'admin-subcategory-dialog';
        const title = document.createElement('h2'); title.id = 'admin-subcategory-dialog-title'; title.textContent = translateText(sub ? 'Edit Subcategory' : 'Add Subcategory');
        dialog.setAttribute('aria-labelledby', title.id);
        const close = document.createElement('button'); close.type = 'button'; close.className = 'subcategory-dialog-close'; close.textContent = '×'; close.setAttribute('aria-label', translateText('Close')); close.onclick = () => dialog.close();
        const form = document.createElement('form'), inputs = {};
        for (const [key, text] of [['en', 'English'], ['zh', '简体中文'], ['vi', 'Tiếng Việt']]) {
            const label = document.createElement('label'); label.textContent = text;
            const input = document.createElement('input'); input.id = 'subcategory-dialog-' + key; label.htmlFor = input.id; input.maxLength = 200; input.required = key === 'en'; input.value = sub?.[key] || '';
            inputs[key] = input; form.appendChild(label); form.appendChild(input);
        }
        const save = document.createElement('button'); save.type = 'submit'; save.textContent = translateText(sub ? 'Save' : 'Add');
        const status = document.createElement('p'); status.setAttribute('role', 'status'); form.appendChild(save); form.appendChild(status);
        form.addEventListener('submit', event => {
            event.preventDefault(); if (!catalogReady || catalogBusy) return;
            const en = inputs.en.value.trim();
            if (!en) { status.textContent = translateText('Please fill out this field.'); return; }
            const current = getCategorySettings().categories.find(parent => parent.id === category.id);
            if (!current || (sub && !current.subcategories?.some(item => item.id === sub.id))) { status.textContent = translateText('Please reload the saved draft.'); return; }
            const value = { id: sub?.id || crypto.randomUUID(), en, zh: inputs.zh.value.trim() || en, vi: inputs.vi.value.trim() || en };
            try { changeCatalogSubcategories(category.id, sub ? current.subcategories.map(item => item.id === sub.id ? value : item) : [...(current.subcategories || []), value]); dialog.close(); }
            catch (error) { status.textContent = translateText(error.message); }
        });
        dialog.appendChild(close); dialog.appendChild(title); dialog.appendChild(form);
        dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal(); inputs.en.focus();
    };
    window.createAdminSubcategoryManager = category => {
        const section = document.createElement('details'); section.className = 'admin-subcategory-manager';
        section.open = expandedManagers.has(category.id);
        section.addEventListener('toggle', () => { if (section.open) expandedManagers.add(category.id); else expandedManagers.delete(category.id); });
        const summary = document.createElement('summary'); summary.hidden = true; summary.textContent = '+'; summary.setAttribute('aria-label', translateText('Manage Subcategories')); summary.title = translateText('Manage Subcategories'); section.appendChild(summary);
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        const list = category.subcategories || [];
        function apply(next, removedId) {
            try { changeCatalogSubcategories(category.id, next, removedId); }
            catch (error) { status.textContent = translateText(error.message); }
        }
        function formFor(sub) {
            const form = document.createElement('form'); form.className = 'admin-subcategory-form';
            const name = document.createElement('button'); name.type = 'button'; name.className = 'admin-subcategory-name'; name.textContent = categoryText(sub.en, sub.zh, sub.vi);
            name.addEventListener('click', () => window.openAdminSubcategoryDialog(category, sub)); form.appendChild(name);
            return form;
        }
        list.forEach((sub, index) => {
            const form = formFor(sub);
            for (const [step, symbol, label] of [[-1, '↑', 'Move up'], [1, '↓', 'Move down']]) {
                const move = document.createElement('button'); move.type = 'button'; move.textContent = symbol; move.setAttribute('aria-label', translateText(label)); move.disabled = index + step < 0 || index + step >= list.length;
                move.onclick = () => { const next = [...list]; [next[index], next[index + step]] = [next[index + step], next[index]]; apply(next); }; form.appendChild(move);
            }
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'admin-subcategory-remove'; remove.textContent = translateText('Remove');
            remove.onclick = () => {
                const count = catalogDraftRows.flat().filter(product => product.categoryId === category.id && product.subcategoryId === sub.id).length;
                const dialog = document.createElement('dialog'); dialog.className = 'admin-category-confirm';
                const title = document.createElement('h2'); title.textContent = translateText('Remove subcategory?');
                const info = document.createElement('p'); info.textContent = categoryText(sub.en, sub.zh, sub.vi) + ' — ' + translateText('{count} products will keep their parent category.').replace('{count}', count);
                dialog.append(title, info);
                const actions = document.createElement('div'); actions.className = 'admin-category-confirm-actions';
                for (const label of ['No', 'Yes']) {
                    const button = document.createElement('button'); button.type = 'button'; button.textContent = translateText(label); button.className = label === 'Yes' ? 'category-remove-yes' : 'category-remove-no';
                    button.onclick = () => { if (label === 'Yes') apply(list.filter(item => item.id !== sub.id), sub.id); dialog.close(); }; actions.appendChild(button);
                }
                dialog.appendChild(actions); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal();
            };
            form.appendChild(remove); section.appendChild(form);
        });
        section.appendChild(status); return section;
    };
})();
