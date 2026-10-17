(() => {
    let dialog, photo, viewport, sizeButton, previousFocus, previousOverflow;
    function updateSizeIcon(fit) {
        const label = fit ? 'Original size' : 'Fit to screen';
        sizeButton.title = label; sizeButton.setAttribute('aria-label', label); sizeButton.setAttribute('aria-pressed', String(fit));
        sizeButton.innerHTML = fit
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="m3 3 6 6m12-6-6 6m6 12-6-6M3 21l6-6"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M4 4l5 5H6m3 0V6m11-2-5 5h3m-3 0V6M4 20l5-5H6m3 0v3m11 2-5-5h3m-3 0v3"/></svg>';
    }
    function restore() { document.body.style.overflow = previousOverflow; photo.removeAttribute('src'); if (previousFocus?.isConnected) previousFocus.focus(); }
    function close() { if (dialog?.open) { dialog.close(); restore(); } }
    function create() {
        dialog = document.createElement('dialog'); dialog.className = 'mc-image-viewer'; dialog.setAttribute('aria-label', 'Product image');
        const toolbar = document.createElement('div'); toolbar.className = 'mc-image-toolbar';
        sizeButton = document.createElement('button'); sizeButton.type = 'button';
        sizeButton.addEventListener('click', () => {
            const fit = viewport.classList.toggle('fit'); updateSizeIcon(fit);
        });
        const exit = document.createElement('button'); exit.type = 'button'; exit.textContent = '×'; exit.className = 'mc-image-close'; exit.setAttribute('aria-label', 'Close image'); exit.addEventListener('click', close);
        toolbar.append(sizeButton, exit); viewport = document.createElement('div'); viewport.className = 'mc-image-viewport'; viewport.tabIndex = 0; viewport.setAttribute('aria-label', 'Image; scroll to view at original size');
        photo = document.createElement('img'); viewport.append(photo); dialog.append(toolbar, viewport); document.body.append(dialog);
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); });
        dialog.addEventListener('close', () => { if (!dialog.open) restore(); });
        window.addEventListener('pagehide', close);
    }
    window.openMessageImage = (url, trigger, alt = 'Product image') => {
        if (!dialog) create(); if (dialog.open) close();
        previousFocus = trigger || document.activeElement; previousOverflow = document.body.style.overflow;
        photo.src = url; photo.alt = alt; viewport.classList.remove('fit'); updateSizeIcon(false);
        dialog.showModal(); document.body.style.overflow = 'hidden'; viewport.scrollTop = viewport.scrollLeft = 0; dialog.querySelector('.mc-image-close').focus();
    };
})();
