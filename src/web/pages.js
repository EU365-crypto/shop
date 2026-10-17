const path = require('node:path');

// Keep bookmarked page URLs stable while grouping their source by feature.
const publicPages = {
    'index.html': 'store/index.html',
    'store.html': 'store/store.html',
    'search.html': 'store/search.html',
    'cart.html': 'cart/cart.html',
    'contact.html': 'mail/contact.html',
    'user-login.html': 'auth/user-login.html',
    'admin-login.html': 'auth/admin-login.html',
    'signup.html': 'auth/signup.html',
    'verify.html': 'auth/verify.html'
};

function registerPublicPages(app, root) {
    for (const [url, filename] of Object.entries(publicPages)) {
        const routes = url === 'index.html' ? ['/', '/index.html'] : '/' + url;
        app.get(routes, (_req, res) => res.sendFile(path.join(root, 'public', 'pages', filename)));
    }
}

module.exports = { publicPages, registerPublicPages };
