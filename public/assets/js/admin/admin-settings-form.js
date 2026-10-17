(() => {
    const form = document.getElementById('admin-settings-form');
    const tax = document.getElementById('store-tax-rate');
    const limit = document.getElementById('email-limit-enabled');
    const save = document.getElementById('admin-settings-save');
    const message = document.getElementById('admin-settings-message');
    const fields = [tax, limit, save];
    const fill = data => { tax.value = data.taxRate; limit.checked = data.rateLimitEnabled; };
    async function load() {
        try {
            const response = await fetch('/api/admin/settings', { cache: 'no-store' });
            if (!response.ok) throw new Error('Could not load account.');
            fill(await response.json()); fields.forEach(field => { field.disabled = false; });
        } catch (error) { setLocalizedMessage(message, error.message); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (save.disabled || !form.reportValidity()) return;
        fields.forEach(field => { field.disabled = true; });
        try {
            const response = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taxRate: Number(tax.value), rateLimitEnabled: limit.checked }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            fill(data); setLocalizedMessage(message, data.message);
        } catch (error) { setLocalizedMessage(message, error.message || 'Could not connect to server.'); }
        finally { fields.forEach(field => { field.disabled = false; }); }
    });
    load();
})();
