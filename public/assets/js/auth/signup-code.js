(() => {
    const button = document.getElementById('signup-send');
    const message = document.getElementById('signup-send-message');
    const countdown = document.getElementById('signup-countdown');
    let deadline = 0, timer, pulseTimer;
    function pulseCountdown() {
        clearTimeout(pulseTimer);
        countdown.classList.remove('countdown-pulse');
        void countdown.offsetWidth;
        countdown.classList.add('countdown-pulse');
        pulseTimer = setTimeout(() => countdown.classList.remove('countdown-pulse'), 1000);
    }
    function update() {
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        countdown.hidden = !seconds;
        countdown.textContent = seconds ? String(seconds) : '';
        countdown.setAttribute('aria-label', translateText('Request a new code in {seconds} seconds.').replace('{seconds}', seconds));
        button.classList.toggle('code-waiting', !!seconds);
        if (!seconds) clearInterval(timer);
    }
    button.addEventListener('click', async () => {
        const seconds = Math.ceil((deadline - Date.now()) / 1000);
        if (seconds > 0) {
            update(); pulseCountdown(); return;
        }
        const email = document.getElementById('email');
        if (!email.reportValidity()) return;
        button.disabled = true;
        button.classList.add('code-sending');
        button.setAttribute('aria-busy', 'true');
        setLocalizedMessage(message, 'Sending verification code...');
        try {
            const response = await fetch('/api/email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.value, purpose: 'signup' }) });
            const data = await response.json();
            setLocalizedMessage(message, response.ok ? 'Check your email for a verification code.' : data.message);
            if (response.ok || data.retryAfter) {
                deadline = Date.now() + (data.retryAfter || 60) * 1000; clearInterval(timer); update(); timer = setInterval(update, 1000);
            }
        } catch { setLocalizedMessage(message, 'Could not connect to server.'); }
        finally {
            button.disabled = false;
            button.classList.remove('code-sending');
            button.removeAttribute('aria-busy');
        }
    });
    document.addEventListener('languagechange', update);
})();
