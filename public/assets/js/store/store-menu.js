(() => {
    const button = document.getElementById('welcome-menu-toggle');
    const panel = document.getElementById('welcome-menu-panel');
    const backdrop = document.getElementById('store-menu-backdrop');
    const closeButton = document.getElementById('store-menu-close');
    // Keep the drawer above the sticky navigation and its backdrop.
    if (panel.classList.contains('store-menu-drawer')) document.body.appendChild(panel);
    let previousOverflow = '';
    let isOpen = false;
    let toggleVersion = 0;
    function renderMenuCategories() {
        const container = document.getElementById('menu-product-categories');
        if (!container) return;
        container.replaceChildren();
        for (const category of getCategorySettings().categories) {
            const link = document.createElement('a');
            link.href = '/category?category=' + encodeURIComponent(category.id) + (window.storeEditorActive ? '&adminView=1' : '');
            link.textContent = categoryText(category.en, category.zh, category.vi);
            container.appendChild(link);
        }
    }
    renderMenuCategories();
    document.addEventListener('languagechange', renderMenuCategories);
    document.addEventListener('categorysettingschange', renderMenuCategories);
    window.addEventListener('storage', event => { if (event.key === 'categorySettings') renderMenuCategories(); });
    function toggle(open) {
        if (open === isOpen) return;
        isOpen = open;
        const version = ++toggleVersion;
        panel.getAnimations().forEach(animation => animation.cancel());
        button.setAttribute('aria-expanded', String(open));
        if (open) {
            if (panel.hidden) previousOverflow = document.body.style.overflow;
            panel.hidden = false;
            panel.inert = false;
            panel.style.pointerEvents = '';
            if (backdrop) backdrop.hidden = false;
            document.body.style.overflow = 'hidden';
            closeButton?.focus();
        } else {
            panel.inert = true;
            panel.style.pointerEvents = 'none';
            if (backdrop) backdrop.hidden = true;
            document.body.style.overflow = previousOverflow;
            button.focus();
        }
        const finishClose = () => {
            if (version !== toggleVersion || isOpen) return;
            panel.hidden = true;
            if (backdrop) backdrop.hidden = true;
        };
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const animation = panel.animate([
                { transform: open ? 'translateX(-100%)' : 'translateX(0)' },
                { transform: open ? 'translateX(0)' : 'translateX(-100%)' }
            ], { duration: open ? 300 : 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
            animation.finished.then(() => { if (!open) finishClose(); animation.cancel(); }).catch(() => {});
        } else if (!open) finishClose();
    }
    button.addEventListener('click', () => toggle(!isOpen));
    closeButton?.addEventListener('click', () => toggle(false));
    const logoutButton = document.getElementById('menu-logout');
    logoutButton?.addEventListener('click', async () => {
        if (!await window.confirmLogout()) { window.adminUnsavedChanges?.cancelNavigation(); return; }
        logoutButton.disabled = true;
        try {
            const admin = new URLSearchParams(location.search).get('adminView') === '1';
            const response = await fetch(admin ? '/api/logout?admin=1' : '/api/logout', { method: 'POST' });
            if (!response.ok) throw new Error();
            location.href = '/';
        } catch {
            window.adminUnsavedChanges?.cancelNavigation();
            alert(translateText('Could not connect to server.'));
            logoutButton.disabled = false;
        }
    });
    panel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...panel.querySelectorAll('a, button, summary')].filter(element => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('click', event => { if (!panel.contains(event.target) && !button.contains(event.target)) toggle(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { toggle(false); button.focus(); } });
})();
