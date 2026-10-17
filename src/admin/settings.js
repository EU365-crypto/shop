function registerAdminSettings(app, db, resetRequestLimits) {
    const admin = (req, res, next) => req.session?.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access only.' });
    const read = () => ({
        taxRate: db.prepare('SELECT rate FROM store_tax_settings WHERE id=1').get().rate,
        rateLimitEnabled: Boolean(db.prepare('SELECT rate_limit FROM email_security_settings WHERE id=1').get().rate_limit)
    });
    app.get('/api/admin/settings', admin, (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(read());
    });
    app.put('/api/admin/settings', admin, (req, res) => {
        const { taxRate, rateLimitEnabled } = req.body || {};
        if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return res.status(400).json({ message: 'Enter a tax percentage between 0 and 100.' });
        if (typeof rateLimitEnabled !== 'boolean') return res.status(400).json({ message: 'Invalid setting.' });
        const changedLimit = read().rateLimitEnabled !== rateLimitEnabled;
        try {
            db.exec('BEGIN');
            db.prepare('UPDATE store_tax_settings SET rate=? WHERE id=1').run(taxRate);
            db.prepare('UPDATE email_security_settings SET rate_limit=? WHERE id=1').run(Number(rateLimitEnabled));
            db.exec('COMMIT');
        } catch {
            db.exec('ROLLBACK');
            return res.status(500).json({ message: 'Could not save account.' });
        }
        if (changedLimit) resetRequestLimits();
        res.json({ ...read(), message: 'All settings saved.' });
    });
}
module.exports = { registerAdminSettings };
