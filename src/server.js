const projectRoot = require('node:path').resolve(__dirname, '..');


require("dotenv").config({ path: require("node:path").join(projectRoot, ".env") });

const express = require("express");
const { sessionConfig, installSessions, logoutSession } = require("./auth/session-security");
const secureSessionConfig = sessionConfig();
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const passport = require("passport");

const GoogleStrategy =
    require("passport-google-oauth20").Strategy;

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;


/* =====================================
   DATABASE
===================================== */

const db = new DatabaseSync(path.join(projectRoot, "shop.db"));

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        email TEXT UNIQUE NOT NULL,

        password_hash TEXT NOT NULL,

        role TEXT NOT NULL DEFAULT 'user',

        email_verified INTEGER NOT NULL DEFAULT 0,

        verification_token TEXT,

        verification_expires INTEGER
    )
`);


/* =====================================
   EXPRESS SETTINGS
===================================== */

if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'sign_in_count')) {
    db.exec('ALTER TABLE users ADD COLUMN sign_in_count INTEGER NOT NULL DEFAULT 0');
}
function recordCustomerSignIn(req, userId) {
    const user = db.prepare('SELECT sign_in_count FROM users WHERE id = ?').get(userId);
    req.session.signInGreeting = { firstSignIn: user.sign_in_count === 0 };
    db.prepare('UPDATE users SET sign_in_count = sign_in_count + 1 WHERE id = ?').run(userId);
}

const contactJSON = express.json({ limit: '16mb' });
const defaultJSON = express.json({ limit: '2mb' });
app.use((req, res, next) => (['/api/contact', '/api/contact/preview-image', '/api/messages/send', '/api/admin/message-center/send', '/api/messages/preview-image', '/api/admin/message-center/preview-image'].includes(req.path) || /^\/api\/contact\/drafts\/(?:email|request|partnership)$/.test(req.path) || /^\/api\/(?:messages|admin\/message-center)\/drafts\/(?:new|[1-9]\d{0,12})$/.test(req.path) ? contactJSON : defaultJSON)(req, res, next));

app.use(
    express.urlencoded({
        extended: true
    })
);


function isAdminSessionRequest(req) {
    if (req.path === '/api/user-login' && typeof req.body?.email === 'string') {
        const account = db.prepare('SELECT role FROM users WHERE email=?').get(req.body.email.trim().toLowerCase());
        if (account?.role === 'admin') return true;
    }
    return req.path.startsWith('/admin') || req.path.startsWith('/api/admin/') || req.path === '/api/admin-login' ||
        (req.path.startsWith('/api/catalog/') && req.path !== '/api/catalog') ||
        (['/api/logout', '/api/profile', '/api/profile/background', '/api/email/unread'].includes(req.path) && req.query.admin === '1') ||
        ((req.path === '/api/contact' || req.path.startsWith('/api/contact/')) && req.query.admin === '1') ||
        (req.path === '/api/email/read' && req.body?.scope === 'admin');
}
installSessions(app, db, isAdminSessionRequest, secureSessionConfig);

/* GOOGLE PASSPORT */
// Deleted accounts must not retain access through an existing session.
app.use((req, res, next) => {
    const id = req.session?.user?.id ?? req.session?.passport?.user;
    const account = id && db.prepare('SELECT id,email,role FROM users WHERE id = ?').get(id);
    if (id && (!account || (req.sessionScope === 'admin' && account.role !== 'admin') || (req.sessionScope === 'customer' && account.role !== 'user'))) {
        return req.session.regenerate(error => {
            if (error) return next(error);
            res.clearCookie(req.sessionScope + '.sid', secureSessionConfig.cookie);
            next();
        });
    }
    if (account && req.session.user) req.session.user = { id: account.id, email: account.email, role: account.role };
    next();
});

app.use(
    passport.initialize()
);


/* =====================================
   PUBLIC FILES
===================================== */

require('./web/pages').registerPublicPages(app, projectRoot);

app.use(
    express.static(
        path.join(
            projectRoot,
            "public"
        )
    )
);


/* =====================================
   GMAIL
===================================== */
app.get("/category", (req, res) => {
    res.sendFile(path.join(projectRoot, "public", "pages/store/store.html"));
});
app.get('/api/contact-info', (req, res) => {
    res.json({ email: process.env.CONTACT_EMAIL || null });
});

const transporter = require('./mail/store-mailer').createStoreMailer(nodemailer, process.env,
    email => Boolean(db.prepare("SELECT id FROM users WHERE role='admin' AND lower(email)=lower(?) LIMIT 1").get(email)));
const storeSender = transporter.address;


/* =====================================
   SEND VERIFICATION EMAIL
===================================== */

async function sendVerificationEmail(
    email,
    token
) {

    const verifyLink =
        `${BASE_URL}/verify-email?token=${token}`;


    await transporter.sendMail({

        from:
            { name: 'HongKong Supermarket', address: storeSender },

        to:
            email,

        subject:
            "Verify your HongKong Supermarket account",

        html: `

            <h2>
                Welcome to HongKong Supermarket
            </h2>

            <p>
                Please verify your email
                before signing in.
            </p>

            <p>

                <a href="${verifyLink}">
                    Verify Email
                </a>

            </p>

            <p>
                This link expires
                in 1 hour.
            </p>

        `

    });

}


/* =====================================
   LOGIN NOTIFICATION EMAIL
===================================== */

async function sendLoginNotification(
    email
) {

    await transporter.sendMail({

        from:
            { name: 'HongKong Supermarket', address: storeSender },

        to:
            email,

        subject:
            "New HongKong Supermarket sign-in",

        html: `

            <h2>
                New Sign-In
            </h2>

            <p>
                Your HongKong Supermarket account
                was just signed in.
            </p>

            <p>
                Account:
                ${email}
            </p>

            <p>
                Time:
                ${new Date().toLocaleString()}
            </p>

            <p>
                If this was you,
                no action is needed.
            </p>

        `

    });

}


/* =====================================
   CREATE ADMIN ACCOUNT
===================================== */

async function createAdmin() {

    if (
        !process.env.ADMIN_EMAIL ||
        !process.env.ADMIN_PASSWORD
    ) {

        console.log(
            "ADMIN_EMAIL or ADMIN_PASSWORD missing."
        );

        return;
    }


    const adminEmail =
        process.env.ADMIN_EMAIL
            .trim()
            .toLowerCase();


    const existingAdmin =
        db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(adminEmail);


    if (existingAdmin) {

        /*
            Preserve password changes made by the account owner.
        */

        db.prepare(`
            UPDATE users

            SET
                role = 'admin',
                email_verified = 1

            WHERE email = ?
        `).run(
            adminEmail
        );


        console.log(
            "Admin account updated."
        );

    } else {
        const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

        db.prepare(`
            INSERT INTO users
            (
                email,
                password_hash,
                role,
                email_verified
            )

            VALUES (?, ?, 'admin', 1)
        `).run(
            adminEmail,
            passwordHash
        );


        console.log(
            "Admin account created."
        );

    }

}

/* =====================================
   GOOGLE STRATEGY
===================================== */

if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error(
        "GOOGLE_CLIENT_ID is missing from .env"
    );
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
        "GOOGLE_CLIENT_SECRET is missing from .env"
    );
}


passport.use(

    new GoogleStrategy(

        {
            clientID:
                process.env.GOOGLE_CLIENT_ID,

            clientSecret:
                process.env.GOOGLE_CLIENT_SECRET,

            state: true,
            callbackURL:
                `${BASE_URL}/auth/google/callback`
        },

        async (
            accessToken,
            refreshToken,
            profile,
            done
        ) => {

            try {

                const user = await require("./auth/google-account").resolveGoogleAccount(db, profile);
                if (!user || user.role === 'admin') return done(null, false);

                return done(
                    null,
                    user
                );

            }

            catch (error) {

                return done(error);

            }

        }

    )

);


console.log(
    "Google authentication strategy loaded."
);

/* =====================================
   GOOGLE ROUTES
===================================== */

app.get(
    "/auth/google",

    passport.authenticate(
        "google",
        {
            scope: [
                "profile",
                "email"
            ],

            session: false
        }
    )
);


app.get(
    "/auth/google/callback",

    passport.authenticate(
        "google",
        {
            failureRedirect:
                "/user-login.html?error=google",

            session: false
        }
    ),

    (req, res, next) => {
        const userId = req.user.id;
        req.session.regenerate(error => {
            if (error) return next(error);
            req.session.createdAt = req.session.lastActivity = Date.now();
            req.session.pendingGoogle = { userId, nonce: require('crypto').randomBytes(24).toString('hex'), expires: Date.now() + 600000 };
            req.session.save(error => error ? next(error) : res.redirect('/verify.html?purpose=google'));
        });
    },
    (error, req, res, next) => {
        const cause = error.oauthError || error.cause || error;
        const code = typeof cause.code === 'string' ? cause.code : 'OAUTH_TOKEN_ERROR';
        console.error('Google sign-in failed:', code, 'HTTP status:', cause.statusCode || 'unavailable');
        res.redirect('/user-login.html?error=google');
    }
);

/* =====================================
   USER SIGN UP
===================================== */

const emailSecurity = require("./auth/email-verification").registerEmailSecurity(app, db, transporter, storeSender, recordCustomerSignIn);
const contactMail = require('./mail/contact').registerContactMail(app, transporter, storeSender, process.env.CONTACT_EMAIL || 'hongkongsupermarket365@gmail.com', db);
require('./mail/message-center').registerMessageCenter(app, db, transporter, {
    sender: storeSender, support: process.env.CONTACT_EMAIL || 'hongkongsupermarket365@gmail.com',
    from: storeSender,
    baseUrl: BASE_URL, sendVerification: sendVerificationEmail
});

/* =====================================
   VERIFY EMAIL
===================================== */

app.get(
    "/verify-email",

    (req, res) => {

        const token =
            req.query.token;


        if (!token) {

            return res.send(
                "<h1>Missing verification token.</h1>"
            );

        }


        const user =
            db
                .prepare(`
                    SELECT *
                    FROM users
                    WHERE verification_token = ?
                `)
                .get(token);


        if (!user) {

            return res.send(`

                <h1>
                    Invalid verification link.
                </h1>

            `);

        }


        if (
            user.verification_expires <
            Date.now()
        ) {

            return res.send(`

                <h1>
                    Verification link expired.
                </h1>

            `);

        }


        db
            .prepare(`
                UPDATE users

                SET
                    email_verified = 1,
                    verification_token = NULL,
                    verification_expires = NULL

                WHERE id = ?
            `)
            .run(user.id);


        res.send(`

            <h1>
                Email verified!
            </h1>

            <p>
                Your account is ready.
            </p>

            <a href="/user-login.html">
                Sign In
            </a>

        `);

    }
);


require('./auth/password-authentication').registerPasswordAuthentication(app, db, recordCustomerSignIn, sendLoginNotification);

/* =====================================
   REQUIRE LOGIN
===================================== */

function requireLogin(
    req,
    res,
    next
) {

    if (
        !req.session.user
    ) {

        return res.redirect(
            "/user-login.html"
        );

    }

    next();

}


/* =====================================
   REQUIRE ADMIN
===================================== */

function requireAdmin(
    req,
    res,
    next
) {

    if (
        !req.session.user ||
        req.session.user.role !== "admin"
    ) {

        return res
            .status(403)
            .send(`

                <h1>
                    Access Denied
                </h1>

                <p>
                    Admin access only.
                </p>

                <a href="/">
                    Return to store
                </a>

            `);

    }

    next();

}


/* =====================================
   USER ACCOUNT PAGE
===================================== */

app.get(
    "/account",

    requireLogin,

    (req, res) => {

        res.sendFile(
            path.join(
                projectRoot,
                "private",
                "account/account.html"
            )
        );

    }
);


/* =====================================
   ADMIN MANAGEMENT PAGE
===================================== */

app.get(
    ["/admin", "/admin/products"],

    requireAdmin,

    (req, res) => {

        res.redirect('/admin/settings');

    }
);


require("./catalog/catalog").registerCatalog(app, db);
require('./admin/settings').registerAdminSettings(app, db, () => { emailSecurity.resetRequestLimits(); contactMail.resetRequestLimits(); });
require("./accounts/profile").registerProfile(app, db);
app.get('/api/sign-in-greeting', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.user || req.session.user.role !== 'user') return res.status(401).json({});
    const greeting = req.session.signInGreeting;
    delete req.session.signInGreeting;
    const profile = db.prepare('SELECT first_name FROM account_profiles WHERE user_id = ?').get(req.session.user.id);
    res.json({ firstSignIn: greeting?.firstSignIn ?? true, firstName: profile?.first_name || '' });
});

app.get("/admin/storefront", requireAdmin, (req, res) => {
    const query = new URLSearchParams();
    if (typeof req.query.category === "string") query.set("category", req.query.category);
    res.redirect(query.size ? '/category?adminView=1&' + query : '/store.html?adminView=1');
});

app.get("/admin/products/preview", requireAdmin, (req, res) => {
    res.redirect('/store.html?adminView=1');
});

app.get("/admin/categories", requireAdmin, (req, res) => {
    if (typeof req.query.category === 'string') {
        return res.redirect('/category?adminView=1&category=' + encodeURIComponent(req.query.category));
    }
    res.redirect('/store.html?adminView=1');
});

app.get("/admin/settings", requireAdmin, (req, res) => {
    res.sendFile(path.join(projectRoot, "private", "admin/admin-settings.html"));
});
app.get('/admin/emails', requireAdmin, (req, res) => {
    res.sendFile(path.join(projectRoot, 'private', 'admin/admin-emails.html'));
});
app.get('/account/emails', requireLogin, (req, res) => {
    res.sendFile(path.join(projectRoot, 'private', 'account/account-emails.html'));
});

/* =====================================
   CURRENT USER
===================================== */

app.get(
    "/api/me",

    (req, res) => {
        res.set("Cache-Control", "no-store");

        if (
            !req.session.user
        ) {

            req.session.guestId ||= crypto.randomUUID();
            return res.json({

                loggedIn:
                    false,
                guestId: req.session.guestId

            });

        }


        res.json({

            loggedIn:
                true,

            user: {
                ...req.session.user,
                firstName: db.prepare('SELECT first_name FROM account_profiles WHERE user_id = ?').get(req.session.user.id)?.first_name || ''
            }

        });

    }
);


/* =====================================
   LOG OUT
===================================== */

app.post('/api/logout', (req, res, next) => logoutSession(req, res, next, secureSessionConfig));

/* =====================================
   START SERVER
===================================== */

async function startServer() {

    try {

        await createAdmin();


        app.listen(
            PORT,

            () => {

                console.log(
                    "--------------------------------"
                );

                console.log(
                    `HongKong Supermarket running at ${BASE_URL}`
                );

                console.log(
                    `Store: ${BASE_URL}`
                );

                console.log(
                    `User login: ${BASE_URL}/user-login.html`
                );

                console.log(
                    `Admin login: ${BASE_URL}/admin-login.html`
                );

                console.log(
                    "--------------------------------"
                );

            }
        );

    }

    catch (error) {

        console.error(
            "Server startup error:"
        );

        console.error(error);

    }

}


startServer();
