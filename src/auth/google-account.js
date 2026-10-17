const crypto = require('crypto');
const bcrypt = require('bcryptjs');

async function resolveGoogleAccount(db, profile) {
    const googleEmail = profile.emails?.find(email => email.verified === true);
    const email = googleEmail?.value?.trim().toLowerCase();
    if (!email) return null;
    let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) {
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        db.prepare("INSERT OR IGNORE INTO users(email,password_hash,role,email_verified) VALUES(?,?,'user',1)").run(email, passwordHash);
        user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    }
    if (!user.email_verified) {
        db.prepare('UPDATE users SET email_verified=1, verification_token=NULL, verification_expires=NULL WHERE id=?').run(user.id);
        user.email_verified = 1;
    }
    return user;
}
module.exports = { resolveGoogleAccount };
