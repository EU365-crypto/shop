// Keep CSRF protection centralized for every existing fetch-based form.
(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : input, location.href);
        const method = (options.method || request?.method || 'GET').toUpperCase();
        if (url.origin === location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const headers = new Headers(options.headers || request?.headers);
            headers.set('X-CSRF-Protection', '1');
            options = { ...options, headers };
        }
        return nativeFetch(input, options);
    };
})();
