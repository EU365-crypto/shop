(() => {
    // A store revealed by the email transition has already had its entrance.
    if (window.frameElement?.classList.contains('mc-store-preview')) {
        document.documentElement.classList.add('store-email-categories-stable');
    }
    let openingEmail = false;
    let warmedEmail;
    function preloadEmail(link) {
        if (!link || window.frameElement || location.pathname !== '/store.html' || openingEmail) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !['/admin/emails', '/account/emails'].includes(url.pathname)) return;
        if (warmedEmail?.url === url.href) return warmedEmail;
        warmedEmail?.frame.remove();
        const frame = document.createElement('iframe');
        frame.className = 'store-email-preview'; frame.title = url.pathname === '/admin/emails' ? 'Support messages' : 'Messages';
        frame.style.display = 'none';
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        frame.src = url.href;
        document.body.append(frame);
        warmedEmail = { frame, loaded, url: url.href };
        return warmedEmail;
    }
    for (const type of ['pointerover', 'focusin']) document.addEventListener(type, event => preloadEmail(event.target.closest?.('a[href]')), true);
    document.addEventListener('click', async event => {
        const link = event.target.closest?.('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !['/admin/emails', '/account/emails'].includes(url.pathname) || location.pathname !== '/store.html' || window.frameElement) return;
        event.preventDefault();
        if (openingEmail) return;
        const preview = preloadEmail(link);
        openingEmail = true;
        document.documentElement.classList.add('store-email-categories-stable');
        const storeUrl = location.href, storeTitle = document.title, overflow = document.body.style.overflow;
        const storeScroll = { left: window.scrollX, top: window.scrollY };
        const frame = preview.frame;
        Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100vw', height: '100dvh', border: '0', zIndex: '100', background: '#f4f6f5', pointerEvents: 'none', willChange: 'transform, opacity' });
        const loaded = preview.loaded;
        const stage = document.createElement('div');
        stage.className = document.documentElement.className;
        Object.assign(stage.style, { position: 'fixed', inset: '0', width: '100vw', height: '100dvh', boxSizing: 'border-box', zIndex: '101', overflow: 'auto', background: getComputedStyle(document.body).backgroundColor });
        const children = [...document.body.childNodes].filter(child => child !== frame);
        children.forEach(child => stage.append(child));
        document.body.append(frame, stage);
        stage.scrollTop = storeScroll.top;
        stage.scrollLeft = storeScroll.left;
        frame.style.display = 'block';
        async function slide(element, direction) {
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const animation = element.animate([
                { transform: 'translateX(0)', opacity: 1 },
                { transform: `translateX(${direction * 100}vw)`, opacity: 0 }
            ], { duration: 1250, easing: 'ease-in-out', fill: 'forwards' });
            await animation.finished.catch(() => {});
            return animation;
        }
        let closingEmail = false;
        const onBack = () => { if (!history.state?.easyshopEmailView && window.returnToLoadedStore) window.returnToLoadedStore(false); };
        window.returnToLoadedStore = async (animate = true) => {
            if (closingEmail) return;
            closingEmail = true;
            stage.hidden = false; stage.inert = false;
            stage.style.zIndex = '99';
            frame.style.pointerEvents = 'none';
            frame.style.willChange = 'transform, opacity';
            children.forEach(child => document.body.insertBefore(child, frame));
            stage.remove();
            document.body.style.overflow = overflow;
            const scrollBehavior = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = 'auto';
            window.scrollTo(storeScroll.left, storeScroll.top);
            document.documentElement.style.scrollBehavior = scrollBehavior;
            const exitAnimation = animate ? await slide(frame, 1) : null;
            frame.remove();
            warmedEmail = null;
            exitAnimation?.cancel();
            if (animate) history.pushState(null, '', storeUrl);
            document.title = storeTitle;
            window.removeEventListener('popstate', onBack);
            openingEmail = false; window.returnToLoadedStore = null;
            link.focus({ preventScroll: true });
        };
        await loaded;
        frame.style.zIndex = '102';
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const animation = frame.animate([
                { transform: 'translateX(100vw)', opacity: 0 },
                { transform: 'translateX(0)', opacity: 1 }
            ], { duration: 1250, easing: 'ease-in-out', fill: 'forwards' });
            await animation.finished.catch(() => {});
            animation.cancel();
        }
        // Keep the covered store painted so closing email does not rebuild it.
        stage.inert = true;
        frame.style.pointerEvents = 'auto';
        document.body.style.overflow = 'hidden';
        history.pushState({ easyshopEmailView: true }, '', url.href);
        window.addEventListener('popstate', onBack);
        document.title = frame.contentDocument.title;
        frame.focus();
    }, true);
    let contactDialog, contactFrame, contactTrigger, contactOverflow, contactClosing;
    window.closeContactPopup = () => {
        if (!contactDialog?.open) return Promise.resolve();
        if (contactClosing) return contactClosing;
        contactClosing = (async () => {
            contactDialog.classList.add('contact-popup-closing');
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const animation = contactDialog.animate([
                    { opacity: 1, transform: 'translateY(0) scale(1)' },
                    { opacity: 0, transform: 'translateY(12px) scale(.98)' }
                ], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
                await animation.finished.catch(() => {});
                contactDialog.close(); animation.cancel();
            } else contactDialog.close();
            contactDialog.classList.remove('contact-popup-closing');
        })().finally(() => { contactClosing = null; });
        return contactClosing;
    };
    document.addEventListener('click', event => {
        const link = event.target.closest?.('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.pathname !== '/contact.html') return;
        if (location.pathname.startsWith('/admin') || new URLSearchParams(location.search).get('adminView') === '1' || document.body.dataset.messageRole === 'admin') url.searchParams.set('admin', '1');
        event.preventDefault();
        document.getElementById('store-menu-close')?.click();
        if (contactDialog?.open) return;
        contactTrigger = link;
        contactOverflow = document.body.style.overflow;
        if (!contactDialog) {
            contactDialog = document.createElement('dialog');
            contactDialog.className = 'contact-popup-dialog';
            contactDialog.setAttribute('aria-label', 'Contact HongKong Supermarket');
            contactFrame = document.createElement('iframe');
            contactFrame.className = 'contact-popup-frame';
            contactFrame.title = 'Contact HongKong Supermarket';
            contactFrame.addEventListener('load', () => {
                if (contactDialog.open && contactFrame.getAttribute('src') !== 'about:blank') contactFrame.classList.add('contact-popup-ready');
            });
            contactDialog.addEventListener('cancel', event => { event.preventDefault(); window.closeContactPopup(); });
            contactDialog.appendChild(contactFrame);
            document.body.appendChild(contactDialog);
            contactDialog.addEventListener('close', () => {
                document.body.style.overflow = contactOverflow;
                contactFrame.contentWindow?.cleanupContactForm?.();
                contactFrame.src = 'about:blank';
                const trigger = contactTrigger?.getClientRects().length ? contactTrigger : document.getElementById('welcome-menu-toggle');
                trigger?.focus();
            });
        }
        contactFrame.classList.remove('contact-popup-ready');
        contactFrame.src = url.href;
        document.body.style.overflow = 'hidden';
        contactDialog.showModal();
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
        const decoratePop = pop => {
            const welcomeBrand = document.querySelector('.welcome-home .welcome-brand-name');
            if (welcomeBrand) {
                pop.classList.add('welcome-above-logo-pop');
                pop.style.setProperty('--welcome-pop-top', Math.max(40, welcomeBrand.getBoundingClientRect().top / 2) + 'px');
            }
            const header = document.querySelector('.store-menu-header');
            if (header) {
                pop.classList.add('store-header-pop');
                const cart = header.querySelector('.store-cart-link');
                const box = (cart || header).getBoundingClientRect();
                if (cart) {
                    pop.style.setProperty('--store-pop-top', (box.top + box.height / 2 - 17) + 'px');
                    const logo = header.querySelector('.store-hk-logo');
                    const spaceStart = logo ? logo.getBoundingClientRect().right : header.getBoundingClientRect().left;
                    pop.style.setProperty('--store-pop-left', document.body.dataset.customerSignedIn === 'true' ? '50%' : ((spaceStart + box.left) / 2) + 'px');
                } else pop.style.setProperty('--store-pop-top', (box.bottom + 4) + 'px');
            }
            if (pop.querySelector('.pop-motion-line')) return;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('pop-motion-line');
            svg.setAttribute('aria-hidden', 'true');
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', '2'); rect.setAttribute('y', '2');
            rect.setAttribute('width', '100%'); rect.setAttribute('height', '100%');
            rect.setAttribute('rx', '18'); rect.setAttribute('pathLength', '100');
            svg.appendChild(rect); pop.appendChild(svg);
        };
        const observer = new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches('.hongkong-supermarket-navigation-logo')) decoratePop(node);
                node.querySelectorAll('.hongkong-supermarket-navigation-logo').forEach(decoratePop);
            }
        });
        document.querySelectorAll('.hongkong-supermarket-navigation-logo').forEach(decoratePop);
        observer.observe(document.body, { childList: true, subtree: true });
    });
    let logoutConfirmation;
    window.confirmLogout = () => {
        if (logoutConfirmation) return logoutConfirmation;
        logoutConfirmation = new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'cart-confirm-dialog logout-confirm-dialog';
            dialog.setAttribute('aria-labelledby', 'logout-confirm-title');
            const title = document.createElement('h2');
            title.id = 'logout-confirm-title';
            title.dataset.i18n = 'Do you want to log out?';
            title.textContent = translateText('Do you want to log out?');
            const actions = document.createElement('div');
            actions.className = 'logout-confirm-actions';
            let confirmed = false;
            for (const label of ['No', 'Yes']) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.i18n = label;
                button.textContent = translateText(label);
                button.addEventListener('click', () => { confirmed = label === 'Yes'; dialog.close(); });
                actions.appendChild(button);
            }
            dialog.addEventListener('close', () => {
                dialog.remove();
                logoutConfirmation = null;
                resolve(confirmed);
            }, { once: true });
            dialog.append(title, actions);
            document.body.appendChild(dialog);
            dialog.showModal();
        });
        return logoutConfirmation;
    };
    window.addEventListener('pageshow', () => {
        document.querySelectorAll('.password-reveal input[type="checkbox"]').forEach(input => { input.checked = false; });
        if (document.querySelector('.password-reveal')) {
            for (const id of ['password', 'confirm-password', 'security-password', 'security-confirm']) {
                const field = document.getElementById(id);
                if (field) field.type = 'password';
            }
        }
    });
    window.showCodeSentPop = () => {
        document.getElementById('code-sent-pop')?.remove();
        const pop = document.createElement('div');
        pop.id = 'code-sent-pop';
        pop.className = 'hongkong-supermarket-navigation-logo';
        pop.setAttribute('role', 'status');
        pop.textContent = typeof translateText === 'function' ? translateText('Code Send') : 'Code Send';
        document.body.appendChild(pop);
        window.setTimeout(() => pop.remove(), 750);
    };
    let backgroundRequest = 0;
    window.applySiteBackground = value => {
        document.documentElement.dataset.background = ["green", "blue", "warm"].includes(value) ? value : "classic";
        document.dispatchEvent(new CustomEvent("backgroundchange"));
    };
    window.refreshSiteBackground = async () => {
        const request = ++backgroundRequest;
        try {
            const response = await fetch("/api/profile" + (location.pathname.startsWith('/admin') ? '?admin=1' : ''), { cache: "no-store" });
            const data = response.ok ? await response.json() : null;
            if (request === backgroundRequest) window.applySiteBackground(data?.profile?.background);
        } catch { if (request === backgroundRequest) window.applySiteBackground("classic"); }
    };
    window.refreshSiteBackground();
    window.addEventListener("pageshow", window.refreshSiteBackground);
    window.addEventListener("focus", window.refreshSiteBackground);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    if (document.querySelector('.welcome-page') || ['/', '/index.html'].includes(window.location.pathname)) {
        if (!motion.matches) root.classList.add('welcome-controls-pending');
    }
    const duration = 2000;
    let intro = false;
    let navigating = false;
    let overlay;
    let finishTimer;
    let navigateTimer;
    let destination;
    let navigationLogo;
    if (!motion.matches) {
        try {
            intro = sessionStorage.getItem("hongkong-supermarket-intro-seen") !== "true";
            if (intro) sessionStorage.setItem("hongkong-supermarket-intro-seen", "true");
        } catch { intro = false; }
        if (intro) root.classList.add("hongkong-supermarket-intro");
    }
    function finishIntro() {
        window.clearTimeout(finishTimer);
        root.classList.remove("hongkong-supermarket-intro", "hongkong-supermarket-intro-running");
        overlay?.remove();
        overlay = null;
        if (!window.storeIntroFinished && document.readyState !== 'loading') {
            window.storeIntroFinished = true;
            document.dispatchEvent(new Event('storeintrofinished'));
        }
    }
    document.addEventListener("DOMContentLoaded", async () => {
        const arrival = new URL(window.location.href);
        if (arrival.pathname === '/store.html' && arrival.searchParams.get('welcome') === '1') {
            arrival.searchParams.delete('welcome');
            window.history.replaceState(window.history.state, '', arrival.pathname + arrival.search + arrival.hash);
            intro = false;
            finishIntro();
            let greeting = {};
            try {
                const response = await fetch('/api/sign-in-greeting', { cache: 'no-store' });
                if (response.ok) greeting = await response.json();
            } catch { /* Keep the welcome greeting if the request fails. */ }
            const welcome = document.createElement('div');
            welcome.className = 'hongkong-supermarket-navigation-logo';
            welcome.setAttribute('role', 'status');
            const greetingKey = !greeting.firstSignIn && greeting.firstName ? 'Hi, {name}' : 'Welcome';
            welcome.textContent = (typeof translateText === 'function' ? translateText(greetingKey) : greetingKey).replace('{name}', greeting.firstName || '');
            document.body.appendChild(welcome);
            window.setTimeout(() => welcome.remove(), 750);
        }
        if (intro && !motion.matches) {
            overlay = document.createElement("div");
            overlay.className = "hongkong-supermarket-loading";
            overlay.setAttribute("aria-hidden", "true");
            const brand = document.createElement("div");
            brand.className = "hongkong-supermarket-loading-brand";
            const mark = document.createElement("span");
            mark.className = "hongkong-supermarket-loading-mark";
            const name = document.createElement("span");
            name.textContent = "HongKong Supermarket";
            brand.append(mark, name);
            const progress = document.createElement("div");
            progress.className = "hongkong-supermarket-loading-progress";
            overlay.append(brand, progress);
            document.body.appendChild(overlay);
            root.classList.add("hongkong-supermarket-intro-running");
            finishTimer = window.setTimeout(finishIntro, duration);
        } else finishIntro();
    });
    document.addEventListener("click", event => {
        finishIntro();
        const link = event.target.closest?.("a[href]");
        if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
            !link.hasAttribute('download') && (!link.target || link.target === '_self') &&
            (link.dataset.returnPrevious === 'true' || ['returnProducts', 'returnArrow', 'returnStore', 'accountReturn'].includes(link.dataset.i18n))) {
            if (link.dataset.returnDirect === 'true') return;
            let previousIsLocal = false;
            try { previousIsLocal = new URL(document.referrer).origin === window.location.origin; } catch {}
            if (previousIsLocal && window.history.length > 1) {
                event.preventDefault();
                window.history.back();
            }
            return;
        }
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
            link.hasAttribute("download") || (link.target && link.target !== "_self") || motion.matches) return;
        const url = new URL(link.href, window.location.href);
        if (document.body.classList.contains('signin-page') && url.pathname === '/user-login.html') return;
        if (!link.classList.contains("welcome-enter") && !link.classList.contains('welcome-store-link') &&
            !["/user-login.html", "/cart.html"].includes(url.pathname)) return;
        if (url.origin !== window.location.origin || url.hash || url.href === window.location.href || !["http:", "https:"].includes(url.protocol)) return;
        if (link.pathname.startsWith("/auth/") || link.pathname.startsWith("/api/")) return;
        event.preventDefault();
        if (navigating) return;
        navigating = true;
        destination = link.href;
        if (link.classList.contains('welcome-store-link') && typeof window.playWelcomeEnterAnimation === 'function') {
            window.playWelcomeEnterAnimation(link).finally(() => {
                if (!navigating) return;
                navigationLogo = document.createElement('div');
                navigationLogo.className = 'hongkong-supermarket-navigation-logo';
                navigationLogo.setAttribute('role', 'status');
                navigationLogo.textContent = typeof translateText === 'function' ? translateText('Welcome') : 'Welcome';
                document.body.appendChild(navigationLogo);
                navigateTimer = window.setTimeout(() => {
                    navigationLogo?.remove();
                    navigationLogo = null;
                    window.location.assign(destination);
                }, 750);
            });
            return;
        }
        navigationLogo = document.createElement("div");
        navigationLogo.className = "hongkong-supermarket-navigation-logo";
        if (url.pathname === '/cart.html' && document.querySelector('.store-menu-header')) {
            navigationLogo.classList.add('store-cart-navigation-pop');
        }
        navigationLogo.setAttribute("aria-hidden", "true");
        navigationLogo.textContent = (link.classList.contains("welcome-enter") || link.classList.contains('welcome-store-link')) && url.pathname === '/store.html' ? "Welcome" :
            url.pathname === "/cart.html" ? "Check Out" : url.pathname === '/user-login.html' ? translateText('signIn') : "HongKong Supermarket";
        document.body.appendChild(navigationLogo);
        navigateTimer = window.setTimeout(() => {
            navigationLogo?.remove();
            navigationLogo = null;
            window.location.assign(destination);
        }, 750);
    });
    document.addEventListener("keydown", finishIntro);
    window.addEventListener("pageshow", event => {
        navigating = false;
        window.clearTimeout(navigateTimer);
        navigationLogo?.remove();
        navigationLogo = null;
        if (event.persisted) finishIntro();
    });
    motion.addEventListener("change", () => {
        if (!motion.matches) return;
        finishIntro();
        navigationLogo?.remove();
        navigationLogo = null;
        if (navigating) { window.clearTimeout(navigateTimer); window.location.assign(destination); }
    });
})();
