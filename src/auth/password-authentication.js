const bcrypt = require('bcryptjs');
const { establishSession, saveSession } = require('./session-security');

function registerPasswordAuthentication(app, db, recordSignIn, notifyAdmin) {
    const login = adminOnly => async (req, res) => {
        try {
            const { email, password } = req.body || {};
            if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
                return res.status(400).json({ message: 'Please enter your email and password.' });
            }
            const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
            if (!user) return res.status(401).json({ message: 'Incorrect email or password.' });
            if (adminOnly && user.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
            if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'Incorrect email or password.' });
            if (user.role === 'user' && !user.email_verified) return res.status(403).json({ message: 'Please verify your email first.' });
            await establishSession(req, user);
            if (user.role === 'user') recordSignIn(req, user.id);
            await saveSession(req);
            if (adminOnly) Promise.resolve().then(() => notifyAdmin(user.email)).catch(error => {
                const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,30}$/.test(error.code) ? error.code : 'MAIL_ERROR';
                console.error('Admin sign-in notification could not be delivered:', code);
            });
            res.json({ success: true, redirect: user.role === 'admin' ? '/store.html?adminView=1' : '/store.html?welcome=1' });
        } catch {
            console.error('Authentication operation failed.');
            res.status(500).json({ message: adminOnly ? 'Admin login failed.' : 'Login failed.' });
        }
    };
    app.post('/api/user-login', login(false));
    app.post('/api/admin-login', login(true));
}
module.exports = { registerPasswordAuthentication };
