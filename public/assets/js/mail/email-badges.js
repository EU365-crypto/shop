(() => {
    function badge(element, text) {
        if (!element) return;
        let marker = element.querySelector('.email-unread-badge');
        if (!marker) {
            if (element.hasAttribute('data-i18n')) {
                const label = document.createElement('span'); label.dataset.i18n = element.dataset.i18n;
                label.textContent = element.textContent; element.removeAttribute('data-i18n'); element.replaceChildren(label);
            }
            marker = document.createElement('span'); marker.className = 'email-unread-badge';
            const arrow = element.querySelector('[aria-hidden="true"]');
            element.insertBefore(marker, arrow || null);
        }
        marker.textContent = text; marker.hidden = !text;
    }
    let busy = false;
    window.refreshEmailBadges = async () => {
        if (busy || document.hidden) return;
        busy = true;
        try {
            const adminView = location.pathname.startsWith('/admin') || new URLSearchParams(location.search).get('adminView') === '1';
            const response = await fetch((adminView ? '/api/admin/message-center' : '/api/messages') + '?filter=unread', { cache: 'no-store' });
            const data = response.ok ? await response.json() : { unread: 0 };
            badge(document.getElementById('user-email-link'), !adminView && data.unread ? String(data.unread) : '');
            const total = adminView ? data.unread : 0;
            badge(document.getElementById('admin-email-toggle'), total ? '!' : '');
            badge(document.getElementById('admin-store-email-link'), total ? '!' : '');
            document.querySelectorAll('#admin-email-submenu a').forEach(link => {
                badge(link, total ? '!' : '');
            });
        } catch { }
        finally { busy = false; }
    };
    window.refreshEmailBadges();
    window.addEventListener('focus', window.refreshEmailBadges);
    document.addEventListener('visibilitychange', window.refreshEmailBadges);
    window.setInterval(window.refreshEmailBadges, 15000);
})();
