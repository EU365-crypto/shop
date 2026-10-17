/* Visual repetitions never enter catalog or cart storage. */
(() => {
    const controllers = new Set();
    let detailTrack = null, navigationCleanup = null;
    let searchToolsOpen = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previous = 0;
    function tick(now) {
        frame = 0;
        const seconds = previous ? Math.min((now - previous) / 1000, .05) : 0;
        previous = now;
        for (const controller of controllers) controller.advance(seconds, now);
        if (controllers.size && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    }
    function schedule() {
        if (!frame && controllers.size && !document.hidden && !reduced.matches) { previous = 0; frame = requestAnimationFrame(tick); }
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : schedule());
    window.addEventListener('pageshow', () => { stop(); schedule(); });
    reduced.addEventListener('change', () => { for (const c of controllers) c.rebuild(); reduced.matches ? stop() : schedule(); });
    window.clearProductCarousels = () => {
        for (const c of controllers) c.destroy(); controllers.clear(); stop();
        navigationCleanup?.(); navigationCleanup = null;
        const dialog = document.getElementById('customer-product-details');
        if (dialog?.open) dialog.close();
    };
    window.setupProductCarousel = (track, items, createCard, nextCycle = null) => {
        if (!items.length) {
            const empty = document.createElement('p');
            empty.textContent = translateText('No matching items found.');
            track.appendChild(empty);
            return;
        }
        track.classList.add('customer-product-carousel');
        const events = new AbortController();
        let period = 0, position = 0, hover = false, touching = false, focused = false, paused = false, cooldown = 0, writing = false;
        let keyboardInteraction = true;
        const pause = document.createElement('button');
        pause.type = 'button'; pause.className = 'carousel-pause';
        pause.textContent = 'Ⅱ'; pause.setAttribute('aria-label', translateText('Pause')); pause.setAttribute('aria-pressed', 'false');
        pause.addEventListener('click', () => {
            paused = !paused;
            pause.textContent = paused ? '▶' : 'Ⅱ';
            pause.setAttribute('aria-pressed', String(paused));
            pause.setAttribute('aria-label', translateText(paused ? 'Resume' : 'Pause'));
        }, { signal: events.signal });
        track.parentElement.querySelector('.category-shelf-controls').appendChild(pause);
        const original = [...track.children];
        const queuedCycles = [{ cards: [...original] }];
        let stride = 0;
        function prepareAhead() {
            if (!nextCycle || !stride || reduced.matches) return;
            let width = queuedCycles.reduce((total, cycle) => total + cycle.cards.length * stride, 0);
            while (width - position < track.clientWidth + items.length * stride + 64) {
                const sequence = nextCycle();
                if (!sequence.length) break;
                const cards = sequence.map(createCard);
                for (const card of cards) track.appendChild(card);
                queuedCycles.push({ cards }); width += cards.length * stride;
            }
        }
        const controller = {
            rebuild() {
                if (nextCycle) {
                    const oldStride = stride;
                    const first = track.children[0];
                    stride = (first.offsetWidth || first.getBoundingClientRect().width) + (parseFloat(getComputedStyle(track).columnGap) || 0);
                    if (oldStride && stride !== oldStride) position *= stride / oldStride;
                    period = items.length * stride;
                    prepareAhead(); track.scrollLeft = position; return;
                }
                for (const card of [...track.children]) if (!original.includes(card)) card.remove();
                period = items.length * (original[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0));
                if (!period) return;
                if (!reduced.matches) {
                    const copies = Math.ceil(track.clientWidth / period) + 2;
                    for (let copy = 0; copy < copies; copy++) for (const item of items) {
                        const card = createCard(item);
                        // Repeated cards remain clickable, but keyboard navigation uses originals.
                        card.setAttribute('aria-hidden', 'true');
                        for (const control of card.querySelectorAll('button, a, [tabindex]')) control.tabIndex = -1;
                        track.appendChild(card);
                    }
                }
                position = period + (position % period);
                track.scrollLeft = reduced.matches ? 0 : position;
            },
            advance(seconds, now) {
                if (!track.isConnected || hover || touching || focused || paused || detailTrack === track || now < cooldown || !period) return;
                if (nextCycle) {
                    prepareAhead(); position += seconds * 50;
                    while (queuedCycles.length > 1 && position > queuedCycles[0].cards.length * stride + 32) {
                        const passed = queuedCycles.shift();
                        position -= passed.cards.length * stride;
                        for (const card of passed.cards) card.remove();
                    }
                } else position = period + ((position - period + seconds * 50) % period + period) % period;
                writing = true; track.scrollLeft = position; writing = false;
            },
            destroy() { events.abort(); observer?.disconnect(); pause.remove(); controllers.delete(controller); if (!controllers.size) stop(); }
        };
        function listen(type, handler) { track.addEventListener(type, handler, { signal: events.signal, passive: true }); }
        const productUnderPointer = target => {
            const card = target?.closest?.('.shelf-product');
            return card && track.contains(card) ? card : null;
        };
        // Delegation covers visual repetitions and ignores gaps and row padding.
        listen('pointerover', event => {
            if (event.pointerType === 'mouse') hover = Boolean(productUnderPointer(event.target));
        });
        listen('pointerout', event => {
            if (event.pointerType === 'mouse') hover = Boolean(productUnderPointer(event.relatedTarget));
        });
        listen('pointerleave', () => { hover = false; });
        listen('pointerdown', event => { keyboardInteraction = false; focused = false; touching = Boolean(productUnderPointer(event.target)); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(type, () => {
            if (touching) cooldown = performance.now() + 1200;
            touching = false;
        });
        const releaseTouch = () => { if (touching) cooldown = performance.now() + 1200; touching = false; };
        for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, releaseTouch, { signal: events.signal, passive: true });
        window.addEventListener('keydown', event => {
            if (event.key === 'Tab' || event.key?.startsWith('Arrow')) { keyboardInteraction = true; focused = track.contains(document.activeElement); }
        }, { signal: events.signal });
        const resetInteraction = () => { hover = false; touching = false; focused = false; cooldown = 0; };
        window.addEventListener('blur', resetInteraction, { signal: events.signal });
        window.addEventListener('pageshow', resetInteraction, { signal: events.signal });
        listen('focusin', event => { focused = keyboardInteraction && (event.target?.matches?.(':focus-visible') ?? true); });
        listen('focusout', () => { focused = track.contains(document.activeElement) && Boolean(document.activeElement?.matches?.(':focus-visible')); });
        listen('wheel', event => { if (event.deltaX || event.shiftKey) cooldown = performance.now() + 1500; });
        listen('scroll', () => {
            if (writing) return;
            if (hover || touching || focused || performance.now() < cooldown) { position = track.scrollLeft; prepareAhead(); }
        });
        const observer = window.ResizeObserver ? new ResizeObserver(() => controller.rebuild()) : null;
        observer?.observe(track);
        controller.rebuild(); controllers.add(controller); schedule();
        return controller;
    };
    window.openCustomerProduct = (product, trigger) => {
        let dialog = document.getElementById('customer-product-details');
        if (!dialog) {
            dialog = document.createElement('dialog'); dialog.id = 'customer-product-details';
            dialog.className = 'customer-product-details'; document.body.appendChild(dialog);
        }
        dialog.replaceChildren();
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', translateText('Close'));
        close.onclick = () => dialog.close();
        const title = document.createElement('h2'); title.textContent = product.name; title.id = 'customer-product-detail-title';
        dialog.setAttribute('aria-labelledby', title.id);
        const imageFrame = document.createElement('div'); imageFrame.className = 'customer-detail-image';
        const image = document.createElement('img'); image.alt = product.name; image.hidden = !product.image;
        const placeholder = document.createElement('p'); placeholder.textContent = translateText('Image preview'); placeholder.hidden = Boolean(product.image);
        image.onerror = () => { image.hidden = true; placeholder.hidden = false; placeholder.textContent = translateText('Image could not be loaded.'); };
        if (product.image) image.src = product.image;
        imageFrame.append(image, placeholder);
        const info = document.createElement('div'); info.className = 'customer-detail-info';
        const description = document.createElement('p'); description.textContent = product.description || '';
        const price = document.createElement('p'); price.textContent = '$' + Number(product.price).toFixed(2) + (product.priceUnit === 'lb' ? ' / lb' : product.priceUnit === 'item' ? ' / ' + translateText('Each') : '');
        price.className = 'customer-detail-price';
        const availability = document.createElement('p'); availability.textContent = translateText('Availability not provided');
        const quantityLabel = document.createElement('label'); quantityLabel.textContent = translateText('Quantity'); quantityLabel.htmlFor = 'customer-detail-quantity';
        const quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '99'; quantity.step = '1'; quantity.value = '1'; quantity.id = 'customer-detail-quantity'; quantity.required = true;
        const quantityRow = document.createElement('div'); quantityRow.className = 'customer-detail-quantity';
        for (const [symbol, amount, label] of [['−', -1, 'Decrease quantity'], ['+', 1, 'Increase quantity']]) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = symbol; button.setAttribute('aria-label', translateText(label));
            button.onclick = () => { quantity.value = String(Math.max(1, Math.min(99, (Number(quantity.value) || 1) + amount))); };
            quantityRow.appendChild(button); if (amount === -1) quantityRow.appendChild(quantity);
        }
        const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const add = document.createElement('button'); add.type = 'button'; add.textContent = translateText('Add to Cart');
        add.onclick = async () => {
            if (!quantity.reportValidity()) return;
            add.disabled = true;
            try { const success = await addToCart(product.name, product.price, product.taxType, add, product.id, Number(quantity.value)); status.textContent = translateText(success ? 'Add In Cart' : 'Could not add item. Please try again.'); }
            catch { status.textContent = translateText('Could not add item. Please try again.'); }
            finally { add.disabled = false; }
        };
        info.append(title, price, description, availability, quantityLabel, quantityRow, add, status);
        dialog.append(close, imageFrame, info);
        const previousOverflow = document.body.style.overflow;
        detailTrack = trigger.closest('.category-shelf-track');
        const originalCard = detailTrack && [...detailTrack.querySelectorAll('.shelf-product:not([aria-hidden])')].find(card => card.getAttribute('data-product-id') === String(product.id));
        const returnFocus = originalCard?.querySelector('.customer-product-details-trigger') || trigger;
        dialog.onclose = () => { detailTrack = null; document.body.style.overflow = previousOverflow; if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); };
        dialog.onclick = event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        };
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        close.focus();
    };
    window.setupCustomerCategoryNavigation = container => {
        const sticky = document.querySelector('.store-sticky-top'); if (!sticky) return;
        const nav = document.createElement('nav'); nav.className = 'customer-category-nav'; nav.setAttribute('aria-label', translateText('Product Categories'));
        const sections = [...container.querySelectorAll('.category-shelf')];
        let clickedCategory = null;
        const buttons = sections.map((section, index) => {
            section.id = 'customer-category-' + index;
            const button = document.createElement('button'); button.type = 'button'; button.textContent = section.querySelector('h2').textContent;
            button.onclick = () => { clickedCategory = index; activate(index); section.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' }); };
            nav.appendChild(button); return button;
        });
        function activate(index) { buttons.forEach((button, i) => { button.classList.toggle('active', i === index); if (i === index) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); }); }
        function update() {
            if (clickedCategory !== null) { activate(clickedCategory); return; }
            const top = sticky.getBoundingClientRect().bottom + 24; let index = 0;
            sections.forEach((section, i) => { if (section.getBoundingClientRect().top <= top) index = i; }); activate(index);
        }
        let pending = 0;
        const scroll = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); }); };
        const manualScroll = () => { clickedCategory = null; scroll(); };
        const keyboardScroll = event => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(event.target?.tagName)) manualScroll(); };
        const resize = () => { container.style.setProperty('--category-scroll-offset', (sticky.getBoundingClientRect().height + 24) + 'px'); update(); };
        const search = sticky.querySelector?.('.store-item-search');
        let dropdown = null;
        if (search) {
            dropdown = document.createElement('details'); dropdown.className = 'customer-search-dropdown'; dropdown.open = searchToolsOpen;
            const summary = document.createElement('summary'); summary.setAttribute('aria-label', translateText('Product Categories')); summary.title = translateText('Product Categories');
            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('fill', 'none'); chevron.setAttribute('stroke', 'currentColor'); chevron.setAttribute('stroke-width', '2'); chevron.setAttribute('stroke-linecap', 'round'); chevron.setAttribute('stroke-linejoin', 'round'); chevron.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'm6 9 6 6 6-6'); chevron.appendChild(path); summary.appendChild(chevron);
            const row = document.createElement('div'); row.className = 'customer-search-row';
            dropdown.append(summary, nav); row.append(dropdown, search); sticky.appendChild(row);
            dropdown.searchRow = row;
            dropdown.addEventListener('toggle', () => { searchToolsOpen = dropdown.open; resize(); });
        } else sticky.appendChild(nav);
        window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', resize, { passive: true }); resize();
        window.addEventListener('wheel', manualScroll, { passive: true }); window.addEventListener('touchmove', manualScroll, { passive: true }); window.addEventListener('keydown', keyboardScroll);
        navigationCleanup = () => {
            if (dropdown) { searchToolsOpen = dropdown.open; sticky.appendChild(search); dropdown.searchRow.remove(); }
            nav.remove(); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', resize); cancelAnimationFrame(pending);
            window.removeEventListener('wheel', manualScroll); window.removeEventListener('touchmove', manualScroll); window.removeEventListener('keydown', keyboardScroll);
        };
    };
})();
