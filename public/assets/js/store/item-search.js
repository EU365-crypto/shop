(() => {
    const adminView = new URLSearchParams(location.search).get('adminView') === '1';
    if (adminView) {
        const back = document.querySelector('.item-search-back');
        back.href = '/store.html?adminView=1';
        back.dataset.returnDirect = 'true';
    }
    const input = document.getElementById('item-search-query');
    const suggestions = document.getElementById('item-search-suggestions');
    const results = document.getElementById('product-container');
    const viewAll = document.getElementById('item-search-results');
    const feedback = document.getElementById('item-search-feedback');
    let showResults = false;
    input.value = new URLSearchParams(location.search).get('q') || '';
    window.renderSearchPage = () => {
        const query = input.value.trim().toLocaleLowerCase();
        const matches = query ? products.filter(product => {
            const category = getCategorySettings().categories.find(category => category.id === product.categoryId);
            return [product.name, product.description, category?.en, category?.zh, category?.vi].some(value => String(value || '').toLocaleLowerCase().includes(query));
        }) : [];
        suggestions.replaceChildren(); results.replaceChildren();
        suggestions.hidden = showResults; results.hidden = !showResults;
        viewAll.hidden = showResults || !matches.length;
        feedback.textContent = '';
        feedback.removeAttribute('data-i18n');
        if (query && !matches.length) setLocalizedMessage(feedback, 'No matching items found.');
        if (showResults) matches.forEach(product => results.appendChild(createShelfProductCard(product)));
        else for (const product of matches.slice(0, 8)) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'item-search-suggestion';
            const image = document.createElement('img');
            image.alt = ''; image.loading = 'lazy';
            if (product.image) image.src = product.image;
            else image.hidden = true;
            image.addEventListener('error', () => { image.hidden = true; });
            const label = document.createElement('span'); label.textContent = product.name;
            button.append(image, label);
            button.addEventListener('click', () => { input.value = product.name; showResults = true; window.renderSearchPage(); });
            suggestions.appendChild(button);
        }
    };
    input.addEventListener('input', () => { showResults = false; window.renderSearchPage(); });
    document.getElementById('item-search-clear').addEventListener('click', () => { input.value = ''; showResults = false; window.renderSearchPage(); input.focus(); });
    document.getElementById('item-search-form').addEventListener('submit', event => { event.preventDefault(); showResults = true; window.renderSearchPage(); });
    viewAll.addEventListener('click', () => { showResults = true; window.renderSearchPage(); });
    document.addEventListener('languagechange', () => { input.setAttribute('aria-label', translateText('Search items')); window.renderSearchPage(); });
    window.renderSearchPage();
    input.focus();
})();
