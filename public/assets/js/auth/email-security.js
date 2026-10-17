(() => {
    const params = new URLSearchParams(location.search);
    const purpose = ['reset', 'change', 'google'].includes(params.get('purpose')) ? params.get('purpose') : 'signup';
    const verifyOnly = purpose === 'signup' || purpose === 'google';
    const email = document.getElementById('security-email');
    email.value = params.get('email') || '';
    document.getElementById('security-title').dataset.i18n = verifyOnly ? 'Verify Email' : purpose === 'change' ? 'Change Password' : 'Reset Password';
    document.getElementById('security-title').textContent = translateText(document.getElementById('security-title').dataset.i18n);
    document.getElementById('security-password-fields').hidden = verifyOnly;
    document.getElementById('security-password').required = !verifyOnly;
    document.getElementById('security-confirm').required = !verifyOnly;
    const message = document.getElementById('security-message');
    const confirmMessage = document.getElementById('security-confirm-message');
    const buttons = [...document.querySelectorAll('#security-form button')];
    const sendButton = document.getElementById('security-send');
    const countdown = document.getElementById('security-countdown');
    let resendDeadline = 0;
    let countdownTimer, pulseTimer;
    function pulseCountdown() {
        window.clearTimeout(pulseTimer);
        countdown.classList.remove('countdown-pulse');
        void countdown.offsetWidth;
        countdown.classList.add('countdown-pulse');
        pulseTimer = window.setTimeout(() => countdown.classList.remove('countdown-pulse'), 1000);
    }
    let busy = false;
    function updateButtons() {
        buttons.forEach(button => { button.disabled = busy; });
        sendButton.classList.toggle('code-waiting', Date.now() < resendDeadline);
    }
    function updateCountdown() {
        const remaining = Math.max(0, Math.ceil((resendDeadline - Date.now()) / 1000));
        countdown.hidden = !remaining;
        countdown.textContent = remaining ? String(remaining) : '';
        countdown.setAttribute('aria-label', translateText('Request a new code in {seconds} seconds.').replace('{seconds}', remaining));
        updateButtons();
        if (!remaining) window.clearInterval(countdownTimer);
    }
    function startCountdown(seconds = 60) {
        resendDeadline = Date.now() + seconds * 1000;
        window.clearInterval(countdownTimer);
        updateCountdown();
        countdownTimer = window.setInterval(updateCountdown, 1000);
    }
    document.addEventListener('languagechange', updateCountdown);
    window.addEventListener('pageshow', updateCountdown);
    async function request(path, body) {
        if (busy) return;
        busy = true; updateButtons();
        const feedback = path.endsWith('/email-code') ? message : confirmMessage;
        feedback.removeAttribute('data-i18n');
        feedback.textContent = '';
        const sendingCode = path.endsWith('/email-code');
        const sendingStarted = performance.now();
        if (sendingCode) {
            sendButton.classList.add('code-sending');
            sendButton.setAttribute('aria-busy', 'true');
            setLocalizedMessage(message, 'Sending verification code...');
        }
        try {
            const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await response.json();
            if (sendingCode) {
                const remaining = Math.max(0, 1000 - (performance.now() - sendingStarted));
                if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
                sendButton.classList.remove('code-sending');
                sendButton.removeAttribute('aria-busy');
            }
            setLocalizedMessage(feedback, data.message);
            if (response.ok && path.endsWith('/email-code')) {
                setLocalizedMessage(message, 'Check your email for a verification code.');
                startCountdown(data.retryAfter || 60);
            }
            if (!response.ok && data.retryAfter) startCountdown(data.retryAfter);
            if (response.ok && data.success) {
                if (data.redirect) { location.href = data.redirect; return; }
                window.clearInterval(countdownTimer);
                resendDeadline = 0;
                countdown.hidden = true;
                document.getElementById('security-form').after(confirmMessage);
                document.getElementById('security-form').hidden = true;
                document.getElementById('security-signin').hidden = false;
            }
        } catch { setLocalizedMessage(feedback, 'Could not connect to server.'); }
        finally {
            if (sendingCode) {
                const remaining = Math.max(0, 1000 - (performance.now() - sendingStarted));
                if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
                sendButton.classList.remove('code-sending');
                sendButton.removeAttribute('aria-busy');
            }
            busy = false; updateButtons();
        }
    }
    document.getElementById('security-send').addEventListener('click', () => {
        if (Date.now() < resendDeadline) {
            updateCountdown(); pulseCountdown();
            return;
        }
        if (!email.reportValidity()) return;
        request(purpose === 'google' ? '/api/google/email-code' : '/api/email-code', { email: email.value, purpose });
    });
    document.getElementById('security-form').addEventListener('submit', event => {
        event.preventDefault();
        const password = document.getElementById('security-password').value;
        if (!verifyOnly && password !== document.getElementById('security-confirm').value) {
            setLocalizedMessage(confirmMessage, 'Passwords do not match.'); return;
        }
        request(purpose === 'google' ? '/api/google/verify-code' : verifyOnly ? '/api/verify-code' : '/api/password-code', {
            email: email.value, purpose, code: document.getElementById('security-code').value.trim(), password
        });
    });
    if (purpose === 'google') {
        email.readOnly = true;
        busy = true; updateButtons();
        fetch('/api/google/verification').then(async response => {
            if (!response.ok) { location.href = '/user-login.html'; return; }
            const data = await response.json();
            email.value = data.email;
            busy = false; updateButtons();
            await request('/api/google/email-code', {});
        }).catch(() => { busy = false; updateButtons(); setLocalizedMessage(message, 'Could not connect to server.'); });
    }
    if (purpose === 'change') {
        email.readOnly = true;
        buttons.forEach(button => button.disabled = true);
        fetch('/api/profile').then(async response => {
            if (response.status === 401) { location.href = '/user-login.html'; return; }
            if (!response.ok) throw new Error();
            const data = await response.json();
            email.value = data.profile.email;
            buttons.forEach(button => button.disabled = false);
        }).catch(() => setLocalizedMessage(message, 'Could not load account.'));
    }
})();
