(() => {
    const inputs = [...document.querySelectorAll('.signin-form input')].filter(input => !['checkbox', 'button', 'submit', 'hidden'].includes(input.type));
    function update(input) {
        input.setCustomValidity('');
        const validity = input.validity;
        let message = '';
        if (validity.valueMissing) message = 'Please fill out this field.';
        else if (input.type === 'email' && validity.typeMismatch) message = input.value.includes('@') ? 'Please enter a valid email address.' : 'Please include an @ in the email address.';
        else if (input.id === 'signup-code' && validity.patternMismatch) message = 'Enter a 6-digit verification code.';
        else if (validity.tooShort) {
            input.setCustomValidity(translateText('Please use at least {min} characters.').replace('{min}', input.minLength));
            return;
        }
        if (message) input.setCustomValidity(translateText(message));
    }
    for (const input of inputs) {
        for (const event of ['input', 'change', 'invalid']) input.addEventListener(event, () => update(input));
        update(input);
    }
    document.addEventListener('languagechange', () => inputs.forEach(update));
})();
