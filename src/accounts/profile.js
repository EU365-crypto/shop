function registerProfile(app, db) {
    db.exec(`CREATE TABLE IF NOT EXISTS account_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT ''
    )`);
    if (!db.prepare('PRAGMA table_info(account_profiles)').all().some(column => column.name === 'background')) {
        db.exec("ALTER TABLE account_profiles ADD COLUMN background TEXT NOT NULL DEFAULT 'classic'");
    }
    const auth = (req, res, next) => req.session?.user ? next() : res.status(401).json({ message: "Please sign in first." });
    const read = id => db.prepare(`SELECT u.email, COALESCE(p.first_name, '') AS firstName,
        COALESCE(p.last_name, '') AS lastName, COALESCE(p.phone, '') AS phone, COALESCE(p.background, 'classic') AS background
        FROM users u LEFT JOIN account_profiles p ON p.user_id = u.id WHERE u.id = ?`).get(id);
    app.get('/api/profile', auth, (req, res) => {
        res.set('Cache-Control', 'no-store');
        const profile = read(req.session.user.id);
        if (!profile) return res.status(404).json({ message: "Account not found." });
        res.json({ profile });
    });
    app.put('/api/profile', auth, (req, res) => {
        const { firstName, lastName, phone } = req.body || {};
        if ([firstName, lastName].some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 100) ||
            typeof phone !== 'string' || phone.trim().length > 40 || (phone.trim() && !/^[+\d\s().-]+$/.test(phone.trim()))) {
            return res.status(400).json({ message: "Enter your first and last name and a valid optional phone number." });
        }
        if (!read(req.session.user.id)) return res.status(404).json({ message: "Account not found." });
        db.prepare(`INSERT INTO account_profiles (user_id, first_name, last_name, phone) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, phone=excluded.phone`)
            .run(req.session.user.id, firstName.trim(), lastName.trim(), phone.trim());
        res.json({ profile: read(req.session.user.id) });
    });
    app.put('/api/profile/background', auth, (req, res) => {
        const background = req.body?.background;
        if (!['classic', 'green', 'blue', 'warm'].includes(background)) return res.status(400).json({ message: "Invalid background." });
        if (!read(req.session.user.id)) return res.status(404).json({ message: "Account not found." });
        db.prepare(`INSERT INTO account_profiles (user_id, background) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET background=excluded.background`).run(req.session.user.id, background);
        res.json({ profile: read(req.session.user.id) });
    });
}
module.exports = { registerProfile };
