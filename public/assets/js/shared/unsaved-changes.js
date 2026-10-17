(() => {
    const snapshot = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
    function createUnsavedChangesGuard(win, doc, onChange, confirmDiscard) {
        let baseline, dirty = false, leaving = false, pending = false, replay = false;
        const notify = next => { if (dirty !== next) { dirty = next; onChange(dirty); } };
        const confirm = confirmDiscard || (() => new Promise(resolve => {
            const dialog = doc.createElement('dialog');
            dialog.className = 'admin-unsaved-dialog';
            dialog.setAttribute('aria-labelledby', 'admin-unsaved-title');
            dialog.innerHTML = '<h2 id="admin-unsaved-title"></h2><p></p><div><button type="button" class="unsaved-stay"></button><button type="button" class="unsaved-discard"></button></div>';
            const text = key => win.translateText ? win.translateText(key) : key;
            dialog.querySelector('h2').textContent = text('Unsaved Changes');
            dialog.querySelector('p').textContent = text('Stay to keep editing, or discard your unsaved product and category changes.');
            const stay = dialog.querySelector('.unsaved-stay');
            const discard = dialog.querySelector('.unsaved-discard');
            stay.textContent = text('Stay'); discard.textContent = text('Discard Changes');
            let result = false;
            stay.addEventListener('click', () => dialog.close());
            discard.addEventListener('click', () => { result = true; dialog.close(); });
            dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
            doc.body.appendChild(dialog); dialog.showModal(); stay.focus();
        }));
        const navigate = async action => {
            if (pending) return false;
            if (!dirty) { action(); return true; }
            pending = true;
            try {
                if (!await confirm()) return false;
                win.discardAdminWorkingChanges?.();
                leaving = true; action(); return true;
            } finally { pending = false; }
        };
        win.addEventListener('beforeunload', event => {
            if (!dirty || leaving) return;
            event.preventDefault(); event.returnValue = '';
        });
        win.addEventListener('pageshow', () => { leaving = false; });
        doc.addEventListener('click', event => {
            if (!dirty || replay || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const link = event.target.closest?.('a[href]');
            const logout = event.target.closest?.('#menu-logout');
            if (!link && !logout) return;
            if (link) {
                if (link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
                const destination = new URL(link.href, win.location.href);
                if (destination.origin !== win.location.origin) return;
                if (destination.pathname === win.location.pathname && destination.search === win.location.search && destination.hash) return;
            }
            event.preventDefault(); event.stopImmediatePropagation();
            navigate(() => {
                replay = true;
                try { (link || logout).click(); } finally { replay = false; }
            });
        }, true);
        return {
            saved(rows) { baseline = snapshot(rows); notify(false); },
            changed(rows) { if (baseline !== undefined) notify(snapshot(rows) !== baseline); },
            get dirty() { return dirty; }, navigate,
            cancelNavigation() { leaving = false; }
        };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { createUnsavedChangesGuard };
    if (typeof window !== 'undefined') window.createUnsavedChangesGuard = createUnsavedChangesGuard;
})();
