(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const brand = document.querySelector('.welcome-brand-name');
    if (!brand) return;
    const entrance = document.querySelector('.welcome-store-link');
    function positionEntrance() {
        if (!entrance) return;
        entrance.style.setProperty('--entrance-offset', '0px');
        const rect = entrance.getBoundingClientRect();
        const available = Math.max(0, window.innerHeight - rect.bottom - 24);
        entrance.style.setProperty('--entrance-offset', Math.min(entrance.offsetWidth * 0.5, available) + 'px');
        const linkRect = entrance.getBoundingClientRect();
        const lineBottom = Math.max(0, brand.getBoundingClientRect().top / 2);
        entrance.style.setProperty('--entrance-hit-left', -linkRect.left + 'px');
        entrance.style.setProperty('--entrance-hit-top', lineBottom - linkRect.top + 'px');
        entrance.style.setProperty('--entrance-hit-width', window.innerWidth + 'px');
        entrance.style.setProperty('--entrance-hit-height', Math.max(0, window.innerHeight - lineBottom) + 'px');
    }
    requestAnimationFrame(positionEntrance);
    window.addEventListener('resize', positionEntrance);
    document.addEventListener('languagechange', () => requestAnimationFrame(positionEntrance));
    document.fonts?.ready.then(positionEntrance);
    brand.setAttribute('aria-label', 'HongKong Supermarket');
    brand.replaceChildren();
    const letters = [];
    for (const word of ['HongKong', 'Supermarket']) {
        const line = document.createElement('span');
        line.className = 'welcome-brand-line';
        line.setAttribute('aria-hidden', 'true');
        for (const character of word) {
            const letter = document.createElement('span');
            letter.className = 'welcome-brand-letter';
            letter.textContent = character;
            line.appendChild(letter);
            letters.push(letter);
        }
        brand.appendChild(line);
    }
    let started = false;
    let animations = [];
    if (!motion.matches) brand.classList.add('welcome-line-pending');
    const revealControls = () => document.documentElement.classList.remove('welcome-controls-pending');
    let welcomeShown = false;
    function showWelcome() {
        if (welcomeShown) return;
        welcomeShown = true;
        revealControls();
        const pop = document.createElement('div');
        pop.className = 'hongkong-supermarket-navigation-logo';
        pop.setAttribute('role', 'status');
        pop.textContent = translateText('Welcome');
        if (motion.matches) { pop.style.display = 'block'; pop.style.animation = 'none'; pop.style.transform = 'translate(-50%, -50%)'; }
        document.body.appendChild(pop);
        setTimeout(() => { pop.remove(); location.replace('/store.html'); }, 750);
    }
    async function start() {
        if (started) return;
        started = true;
        if (motion.matches) { brand.classList.remove('welcome-line-pending'); showWelcome(); return; }
        document.querySelector('.welcome-page')?.animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: 350, easing: 'ease-out' });
        animations = [brand.animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: 750, easing: 'ease-in-out', fill: 'both' })];
        await Promise.allSettled(animations.map(animation => animation.finished));
        brand.classList.remove('welcome-line-pending');
        if (!motion.matches) {
            brand.classList.add('welcome-line-charging');
            const lineAnimation = brand.getAnimations().find(animation => animation.animationName === 'welcome-line-charge');
            if (lineAnimation) await lineAnimation.finished.catch(() => {});
            else await new Promise(resolve => setTimeout(resolve, 400));
        }
        showWelcome();

    }
    document.addEventListener('storeintrofinished', start);
    window.addEventListener('pageshow', event => {
        if (event.persisted) animations.forEach(animation => animation.cancel());
    });
    if (window.storeIntroFinished) start();
    motion.addEventListener('change', () => {
        if (motion.matches) {
            animations.forEach(animation => animation.cancel());
            brand.classList.remove('welcome-line-pending', 'welcome-line-charging');
            revealControls();
        }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Tab') revealControls(); });
})();
