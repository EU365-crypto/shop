(() => {
    if (new URLSearchParams(location.search).get('adminView') !== '1') return;
    async function start() {
        const response = await fetch('/api/admin/me', { cache: 'no-store' });
        if (!response.ok) return;
        const identity = await response.json();
        if (!identity.loggedIn || identity.user?.role !== 'admin') return;
        window.storeEditorLoading = true;
        const publishedResponse = await fetch('/api/catalog', { cache: 'no-store' });
        if (!publishedResponse.ok) throw new Error('Could not load catalog.');
        const published = await publishedResponse.json();
        products = (published.rows || []).flatMap((row, rowIndex) => row.map(item => ({ ...item, rowIndex })));
        const dialog = document.createElement('dialog');
        dialog.className = 'admin-store-item-dialog';
        dialog.setAttribute('aria-labelledby', 'admin-item-title');
        dialog.setAttribute('aria-label', translateText('Edit Product'));
        dialog.removeAttribute('aria-labelledby');
        dialog.innerHTML = `<div id="catalog-workspace"><div class="admin-item-return-row"><button id="admin-item-close" type="button" aria-label="Return" title="Return"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 5-7 7 7 7"/><path d="M5 12h14"/></svg></button></div><div hidden><button id="catalog-save" type="button" data-i18n="Save Draft" disabled>Save Draft</button><button id="catalog-publish" type="button" data-i18n="Publish All" disabled>Publish All</button><button id="catalog-add" type="button" hidden disabled></button><p id="catalog-status" role="status"></p></div><div id="catalog-editor-rows"></div></div>`;
        document.body.appendChild(dialog);
        const toolbar = document.createElement('div');
        toolbar.className = 'admin-store-publish-toolbar';
        const addCategory = document.createElement('button');
        addCategory.type = 'button'; addCategory.className = 'admin-catalog-action-icon';
        addCategory.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
        const updateAddCategoryLabel = () => {
            addCategory.title = translateText('Add New Category');
            addCategory.setAttribute('aria-label', translateText('Add New Category'));
        };
        updateAddCategoryLabel(); document.addEventListener('languagechange', updateAddCategoryLabel);
        addCategory.disabled = true;
        const actions = document.createElement('div');
        actions.className = 'admin-store-publish-actions';
        actions.append(dialog.querySelector('#catalog-save'), dialog.querySelector('#catalog-publish'));
        toolbar.append(addCategory, actions, dialog.querySelector('#catalog-status'));
        const historyButton = document.createElement('button');
        historyButton.type = 'button'; historyButton.className = 'admin-catalog-action-icon';
        historyButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></svg>';
        addCategory.after(historyButton);
        const historyDialog = document.createElement('dialog'); historyDialog.className = 'admin-category-history-dialog';
        historyDialog.setAttribute('aria-labelledby', 'admin-category-history-title');
        historyDialog.innerHTML = '<div class="admin-category-heading"><h2 id="admin-category-history-title"></h2><button type="button" class="history-close">×</button></div><div class="history-list"></div>';
        document.body.appendChild(historyDialog);
        historyDialog.querySelector('.history-close').addEventListener('click', () => historyDialog.close());
        window.refreshAdminCategoryHistory = () => {
            historyButton.title = translateText('History'); historyButton.setAttribute('aria-label', historyButton.title);
            historyDialog.querySelector('h2').textContent = translateText('History');
            historyDialog.querySelector('.history-close').setAttribute('aria-label', translateText('Close'));
            const list = historyDialog.querySelector('.history-list'); list.replaceChildren();
            const history = window.adminCategoryHistory || [];
            if (!history.length) { const empty = document.createElement('p'); empty.textContent = translateText('No removed categories.'); list.appendChild(empty); }
            for (const entry of [...history].reverse()) {
                const row = document.createElement('div'); row.className = 'admin-category-history-row';
                const label = document.createElement('span'); label.textContent = categoryText(entry.category.en, entry.category.zh, entry.category.vi) + ' (' + entry.rows.flat().length + ')';
                const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = translateText('Restore'); restore.disabled = typeof catalogReady === 'undefined' || !catalogReady || catalogBusy;
                restore.addEventListener('click', () => restoreCatalogCategory(entry.id));
                row.append(label, restore); list.appendChild(row);
            }
        };
        historyButton.addEventListener('click', () => { window.refreshAdminCategoryHistory(); historyDialog.showModal(); });
        document.addEventListener('languagechange', window.refreshAdminCategoryHistory);
        window.refreshAdminCategoryHistory();
        const saveIndicator = document.createElement('div');
        saveIndicator.className = 'admin-save-indicator';
        saveIndicator.setAttribute('role', 'status');
        saveIndicator.hidden = true;
        saveIndicator.innerHTML = '<span class="admin-save-ring" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></span><span class="admin-save-label"></span>';
        toolbar.appendChild(saveIndicator);
        let saveFeedbackTimer;
        let unsaved = false;
        let saveFeedbackLabel = '';
        const updateSaveFeedbackLanguage = () => {
            saveIndicator.querySelector('.admin-save-label').textContent = saveFeedbackLabel ? translateText(saveFeedbackLabel) : '';
        };
        document.addEventListener('languagechange', updateSaveFeedbackLanguage);
        window.confirmAdminCatalogAction = message => new Promise(resolve => {
            if (document.getElementById('admin-catalog-action-confirm')) { resolve(false); return; }
            const confirmation = document.createElement('dialog');
            confirmation.id = 'admin-catalog-action-confirm';
            confirmation.className = 'admin-category-confirm';
            if (message === 'Publsih?') confirmation.classList.add('admin-publish-confirm');
            confirmation.setAttribute('aria-labelledby', 'admin-catalog-action-title');
            confirmation.innerHTML = '<h2 id="admin-catalog-action-title"></h2><div class="admin-category-confirm-actions"><button type="button" class="category-remove-no"></button><button type="button" class="category-remove-yes"></button></div>';
            const no = confirmation.querySelector('.category-remove-no');
            const yes = confirmation.querySelector('.category-remove-yes');
            const updateConfirmationLanguage = () => {
                confirmation.querySelector('h2').textContent = translateText(message);
                no.textContent = translateText('No'); yes.textContent = translateText('Yes');
            };
            updateConfirmationLanguage();
            document.addEventListener('languagechange', updateConfirmationLanguage);
            let accepted = false;
            no.addEventListener('click', () => confirmation.close());
            yes.addEventListener('click', () => { accepted = true; confirmation.close(); });
            confirmation.addEventListener('close', () => {
                document.removeEventListener('languagechange', updateConfirmationLanguage);
                confirmation.remove(); resolve(accepted);
            }, { once: true });
            document.body.appendChild(confirmation); confirmation.showModal(); no.focus();
        });
        window.setAdminSaveFeedback = (state, action = 'save') => {
            clearTimeout(saveFeedbackTimer);
            if (state === 'dirty') unsaved = true;
            if (state === 'saved') unsaved = false;
            if (state === 'idle') unsaved = false;
            if (state === 'failed') state = unsaved ? 'dirty' : 'idle';
            saveIndicator.hidden = state === 'idle';
            saveIndicator.dataset.state = state;
            const progress = { save: 'Saving...', publish: 'Publishing...', discard: 'Discarding...' };
            const complete = { save: 'Save', publish: 'Published', discard: 'Discarded' };
            saveFeedbackLabel = state === 'blocked' ? 'Save changes before publishing.' : state === 'dirty' ? 'Unsaved Changes' : state === 'saving' ? progress[action] : state === 'saved' ? complete[action] : '';
            updateSaveFeedbackLanguage();
            if (state === 'blocked') {
                saveIndicator.getAnimations().forEach(animation => animation.cancel());
                if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) saveIndicator.animate([{ opacity: 0, transform: 'translateY(-5px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 220, easing: 'ease-out' });
            }
            if (state === 'saved') saveFeedbackTimer = setTimeout(() => { saveIndicator.hidden = true; }, 1800);
        };
        const discard = document.createElement('button'); discard.type = 'button'; discard.textContent = translateText('Discard Changes'); discard.disabled = true;
        actions.prepend(discard);
        const iconActions = [
            [discard, 'Discard', '<path d="M3 10h11a7 7 0 0 1 0 14" transform="translate(0 -3)"/><path d="m7 3-4 4 4 4"/>'],
            [actions.querySelector('#catalog-save'), 'Save', '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>'],
            [actions.querySelector('#catalog-publish'), 'Publish', '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>']
        ];
        for (const [button, label, paths] of iconActions) {
            button.removeAttribute('data-i18n'); button.classList.add('admin-catalog-action-icon');
            button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
            const updateLabel = () => { button.title = translateText(label); button.setAttribute('aria-label', translateText(label)); };
            updateLabel(); document.addEventListener('languagechange', updateLabel);
        }
        discard.addEventListener('click', async () => {
            if (!catalogReady || catalogBusy || !window.adminUnsavedChanges.dirty) return;
            if (!await window.confirmAdminCatalogAction('Discard changes?')) return;
            if (!catalogReady || catalogBusy) return;
            setCatalogBusy(true);
            window.setAdminSaveFeedback('saving', 'discard');
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                setCatalogBusy(false);
                discardCatalogChanges(false);
                window.setAdminSaveFeedback('saved', 'discard');
            } catch (error) {
                catalogStatus(error.message);
                window.setAdminSaveFeedback('failed', 'discard');
            } finally { setCatalogBusy(false); }
        });
        const exportDraft = document.createElement('button'), reloadDraft = document.createElement('button');
        exportDraft.type = reloadDraft.type = 'button'; exportDraft.hidden = reloadDraft.hidden = true;
        exportDraft.textContent = translateText('Export Draft'); reloadDraft.textContent = translateText('Reload Saved Draft');
        actions.append(exportDraft, reloadDraft);
        window.showCatalogConflict = () => { exportDraft.hidden = reloadDraft.hidden = false; };
        exportDraft.addEventListener('click', () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ ...catalogWorkingState(), revision: catalogRevision }, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'easyshop-working-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        reloadDraft.addEventListener('click', () => window.adminUnsavedChanges.navigate(() => loadCatalogEditor().finally(() => window.adminUnsavedChanges.cancelNavigation())));
        window.discardAdminWorkingChanges = () => discardCatalogChanges(false);
        window.setAdminCategoryBusy = busy => {
            historyDialog.querySelectorAll('.admin-category-history-row button').forEach(button => { button.disabled = busy; });
            addCategory.disabled = busy; discard.disabled = busy || !window.adminUnsavedChanges.dirty; reloadDraft.disabled = busy;
            categoryDialog.querySelector('#admin-category-create').disabled = busy;
            document.querySelectorAll('.admin-category-controls button').forEach(button => { button.disabled = busy || button.dataset.boundary === 'true'; });
        };
        window.adminUnsavedChanges = window.createUnsavedChangesGuard(window, document, dirty => { window.setAdminSaveFeedback(dirty ? 'dirty' : 'idle'); discard.disabled = !dirty || catalogBusy; });
        const categoryDialog = document.createElement('dialog');
        categoryDialog.className = 'admin-new-category-dialog';
        categoryDialog.setAttribute('aria-labelledby', 'admin-category-title');
        categoryDialog.innerHTML = `<form id="admin-new-category-form"><div class="admin-category-heading"><h2 id="admin-category-title" data-i18n="Add New Category">Add New Category</h2><button type="button" id="admin-category-close" aria-label="Close">×</button></div><label for="category-name-en" data-i18n="Category Name">Category Name</label><input id="category-name-en" maxlength="200" required><label for="category-name-zh">简体中文</label><input id="category-name-zh" maxlength="200"><label for="category-name-vi">Tiếng Việt</label><input id="category-name-vi" maxlength="200"><button id="admin-category-create" type="submit" data-i18n="Add Category">Add Category</button><p id="admin-category-message" role="status"></p></form>`;
        document.body.appendChild(categoryDialog);
        let editingCategory = null;
        const openCategory = category => {
            if (!catalogReady || catalogBusy) return;
            editingCategory = category; categoryDialog.querySelector('form').reset();
            categoryDialog.querySelector('#admin-category-title').removeAttribute('data-i18n');
            categoryDialog.querySelector('#admin-category-title').textContent = translateText(category ? 'Edit Category' : 'Add New Category');
            for (const key of ['en', 'zh', 'vi']) categoryDialog.querySelector('#category-name-' + key).value = category?.[key] || '';
            categoryDialog.showModal(); categoryDialog.querySelector('input').focus();
        };
        addCategory.addEventListener('click', () => openCategory(null));
        categoryDialog.querySelector('#admin-category-close').addEventListener('click', () => categoryDialog.close());
        categoryDialog.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            if (!catalogReady || catalogBusy || !event.target.reportValidity()) return;
            const en = categoryDialog.querySelector('#category-name-en').value.trim(); if (!en) return;
            const value = { ...editingCategory, id: editingCategory?.id || crypto.randomUUID(), en, zh: categoryDialog.querySelector('#category-name-zh').value.trim() || en, vi: categoryDialog.querySelector('#category-name-vi').value.trim() || en };
            const categories = getCategorySettings().categories.map(c => ({ ...c }));
            if (editingCategory) categories.splice(categories.findIndex(c => c.id === editingCategory.id), 1, value); else categories.push(value);
            changeCatalogCategories(categories); categoryDialog.close();
        });
        const productsSection = document.getElementById('products');
        const categoryHeading = document.querySelector('.store-category-section');
        const searchMain = document.querySelector('.item-search-main');
        const stickyTop = document.querySelector('.store-sticky-top');
        if (stickyTop) {
            stickyTop.classList.add('admin-sticky-top');
            stickyTop.appendChild(toolbar);
        }
        else if (categoryHeading) categoryHeading.before(toolbar);
        else if (productsSection) productsSection.before(toolbar);
        else if (searchMain) searchMain.prepend(toolbar);
        window.storeEditorActive = true;
        document.documentElement.classList.add('admin-store-scrollbars');
        window.storeEditorLoading = false;
        window.createAdminChangeIcon = (kind, id) => {
            const icon = document.createElement('span');
            icon.className = 'admin-change-icon'; icon.dataset.changeKind = kind; icon.dataset.changeId = String(id);
            icon.setAttribute('role', 'img');
            icon.title = translateText('Unsaved Changes'); icon.setAttribute('aria-label', icon.title);
            icon.innerHTML = '<svg width="100%" height="100%" aria-hidden="true"><rect x="2" y="2" rx="8" pathLength="100"/></svg>';
            icon.hidden = typeof catalogReady === 'undefined' || !catalogReady || !(kind === 'product' ? catalogItemHasChanges(id) : catalogCategoryHasChanges(id));
            return icon;
        };
        window.refreshAdminChangeIcons = () => {
            document.querySelectorAll('.admin-change-icon').forEach(icon => {
                icon.hidden = typeof catalogReady === 'undefined' || !catalogReady || !(icon.dataset.changeKind === 'product' ? catalogItemHasChanges(icon.dataset.changeId) : catalogCategoryHasChanges(icon.dataset.changeId));
                icon.title = translateText('Unsaved Changes'); icon.setAttribute('aria-label', icon.title);
            });
        };
        document.addEventListener('languagechange', window.refreshAdminChangeIcons);
        window.makeAdminCategoryTitleEditable = (heading, category) => {
            const edit = document.createElement('button');
            edit.type = 'button'; edit.className = 'admin-category-title-edit';
            edit.textContent = categoryText(category.en, category.zh, category.vi);
            edit.setAttribute('aria-label', translateText('Edit Category') + ': ' + edit.textContent);
            edit.title = translateText('Edit Category');
            edit.addEventListener('click', () => openCategory(category));
            edit.classList.add('admin-change-border-host');
            edit.appendChild(window.createAdminChangeIcon('category', category.id));
            heading.replaceChildren(edit);
        };
        window.createAdminCategoryRemoveButton = category => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'admin-category-remove';
            button.textContent = translateText('Remove');
            button.setAttribute('aria-label', translateText('Remove') + ' ' + categoryText(category.en, category.zh, category.vi));
            button.addEventListener('click', () => {
                if (!catalogReady || catalogBusy || document.getElementById('admin-category-remove-confirm')) return;
                const confirmation = document.createElement('dialog');
                confirmation.id = 'admin-category-remove-confirm';
                confirmation.className = 'admin-category-confirm';
                confirmation.setAttribute('aria-labelledby', 'admin-category-remove-title');
                confirmation.innerHTML = '<h2 id="admin-category-remove-title"></h2><p class="category-name"></p><div class="admin-category-confirm-actions"><button type="button" class="category-remove-yes"></button><button type="button" class="category-remove-no"></button></div><p class="category-remove-message" role="status"></p>';
                confirmation.querySelector('h2').textContent = translateText('Remove?');
                confirmation.querySelector('.category-name').textContent = categoryText(category.en, category.zh, category.vi);
                const yes = confirmation.querySelector('.category-remove-yes');
                const no = confirmation.querySelector('.category-remove-no');
                yes.before(no);
                yes.textContent = translateText('Yes'); no.textContent = translateText('No');
                no.addEventListener('click', () => confirmation.close());
                confirmation.addEventListener('close', () => confirmation.remove());
                yes.addEventListener('click', () => {
                    if (!catalogReady || catalogBusy) return;
                    removeCatalogCategory(category.id); confirmation.close();
                });
                document.body.appendChild(confirmation); confirmation.showModal(); no.focus();
            });
            const controls = document.createElement('span'); controls.className = 'admin-category-controls'; controls.appendChild(button);
            for (const [step, text] of [[-1, 'Up'], [1, 'Down']]) {
                const move = document.createElement('button'); move.type = 'button'; move.className = 'admin-category-move';
                move.setAttribute('aria-label', translateText(text)); move.title = translateText(text);
                move.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${step < 0 ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'}"/></svg>`;
                const index = getCategorySettings().categories.findIndex(c => c.id === category.id);
                move.dataset.boundary = String(index + step < 0 || index + step >= getCategorySettings().categories.length); move.disabled = move.dataset.boundary === 'true';
                move.addEventListener('click', () => {
                    if (!catalogReady || catalogBusy) return;
                    const categories = [...getCategorySettings().categories], index = categories.findIndex(c => c.id === category.id), target = index + step;
                    if (target < 0 || target >= categories.length) return;
                    [categories[index], categories[target]] = [categories[target], categories[index]]; changeCatalogCategories(categories);
                }); controls.appendChild(move);
            }
            return controls;
        };
        const updateCategoryRemove = () => {
            document.querySelector('.store-category-section .admin-category-controls')?.remove();
            if (window.location.pathname === '/category') return;
            const category = getCategorySettings().categories.find(item => item.id === selectedCategory);
            const heading = document.querySelector('.store-category-section h2');
            if (category && heading) {
                window.makeAdminCategoryTitleEditable(heading, category);
                heading.after(window.createAdminCategoryRemoveButton(category));
            }
        };
        document.addEventListener('categorysettingschange', updateCategoryRemove);
        updateCategoryRemove();
        window.refreshAdminStoreDraft = () => {
            if (!catalogReady) return;
            products = catalogDraftRows.flatMap((row, rowIndex) => row.map(item => ({ ...item, rowIndex })));
            displayProducts();
        };
        window.openAdminStoreItem = product => {
            if (!catalogReady || catalogBusy) return;
            catalogSelectedProduct = String(product.id);
            catalogSelectedCategory = product.categoryId;
            catalogSearches.clear();
            renderCatalogEditor();
            if (!dialog.open) dialog.showModal();
        };
        window.addAdminStoreItem = (categoryId, subcategoryId = '') => {
            if (!catalogReady || catalogBusy) return;
            catalogSelectedCategory = categoryId;
            if (!dialog.open) dialog.showModal();
            addCatalogItem(undefined, categoryId, subcategoryId);
        };
        dialog.querySelector('#admin-item-close').addEventListener('click', () => dialog.close());
        toolbar.querySelector('#catalog-save').addEventListener('click', () => saveCatalogDraft());
        toolbar.querySelector('#catalog-publish').addEventListener('click', () => publishCatalogDraft());
        const script = document.createElement('script');
        script.src = '/assets/js/admin/catalog-editor.js';
        script.addEventListener('error', () => { window.storeEditorActive = false; document.documentElement.classList.remove('admin-store-scrollbars'); dialog.remove(); toolbar.remove(); loadPublishedCatalog(); });
        document.body.appendChild(script);
    }
    start().catch(error => { window.storeEditorLoading = false; console.error('Could not open admin store editor:', error); });
})();
