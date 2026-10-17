/* =========================
   DEFAULT PRODUCTS
========================= */

const defaultProducts = [];


/* =========================
   LOAD PRODUCTS
========================= */

let products = defaultProducts;
try {
    const cachedProducts = JSON.parse(localStorage.getItem('products'));
    if (Array.isArray(cachedProducts)) products = cachedProducts;
} catch { /* A broken browser cache must not prevent loading the database catalog. */ }


if (document.getElementById("product-container")) products = [];

/* =========================
   CART
========================= */

let currentCartUser = null;

function readCart() {
    if (!currentCartUser) return [];
    try {
        const saved = JSON.parse(localStorage.getItem("cart_" + currentCartUser));
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

let cart = [];
const cartLegacyCatalog = structuredClone(products);

function reconcileCartCatalog(items, catalog, updateDetails = true) {
    let changed = false;
    for (const item of items) {
        const matches = item.id !== undefined && item.id !== null
            ? catalog.filter(product => String(product.id) === String(item.id))
            : catalog.filter(product => product.name === item.name);
        if (matches.length !== 1 || matches[0].id === undefined) continue;
        const product = matches[0];
        const values = updateDetails
            ? { id: product.id, name: product.name, price: product.price, taxType: product.taxType || 'general', image: product.image }
            : { id: product.id };
        for (const [key, value] of Object.entries(values)) {
            if (item[key] !== value) { item[key] = value; changed = true; }
        }
    }
    return changed;
}

function refreshCartCatalog() {
    const migrated = reconcileCartCatalog(cart, cartLegacyCatalog, false);
    const updated = publishedCatalogEnabled && reconcileCartCatalog(cart, products);
    if (migrated || updated) saveCart();
}

async function loadUserCart() {
    try {
        const response = await fetch("/api/me");
        if (response.ok) {
            const data = await response.json();
            const owner = data.loggedIn ? 'user_' + data.user.id : 'guest_' + data.guestId;
            if (!data.loggedIn && !data.guestId) return false;
            if (currentCartUser && currentCartUser !== owner) {
                cart = [];
                updateCart();
                alert(translateText('Your sign-in changed in another tab. Reload this page before continuing.'));
                return false;
            }
            currentCartUser = owner;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Could not check cart account:", error);
        return false;
    }

    cart = readCart();
    refreshCartCatalog();
    updateCart();
    return true;
}

function saveCart() {
    if (!currentCartUser) return;
    localStorage.setItem("cart_" + currentCartUser, JSON.stringify(cart));
}


/* =========================
   DISPLAY PRODUCTS
========================= */

function createProductCard(product, preview = false) {
    const card = document.createElement("div");
    card.className = "product";
    const width = Number.isFinite(product.cardWidth) ? product.cardWidth : getDisplaySettings().cardWidth;
    card.style.width = Math.max(150, Math.min(348, width)) + "px";
    if (Number.isFinite(product.imageHeight)) card.style.setProperty("--product-image-height", Math.max(100, Math.min(300, product.imageHeight)) + "px");
    const image = document.createElement("img");
    image.alt = product.name;
    const offsetX = Number.isFinite(product.imageOffsetX) ? Math.max(-300, Math.min(300, product.imageOffsetX)) : 0;
    const offsetY = Number.isFinite(product.imageOffsetY) ? Math.max(-300, Math.min(300, product.imageOffsetY)) : 0;
    image.style.transform = "translate(-50%, -50%) translate(" + offsetX + "px, " + offsetY + "px)";
    const zoom = Number.isFinite(product.imageZoom) ? Math.max(1, Math.min(300, product.imageZoom)) : 100;
    const applyOriginalImageSize = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        image.style.width = image.naturalWidth * zoom / 100 + "px";
        image.style.height = image.naturalHeight * zoom / 100 + "px";
    };
    image.addEventListener("load", applyOriginalImageSize);
    const placeholder = document.createElement("div");
    placeholder.className = "product-image-placeholder";
    placeholder.textContent = translateText("Image preview");
    placeholder.hidden = Boolean(product.image);
    image.hidden = !product.image;
    image.addEventListener("error", () => {
        image.hidden = true;
        placeholder.hidden = false;
        placeholder.textContent = translateText("Image could not be loaded.");
    });
    if (product.image) image.src = product.image;
    if (image.complete) applyOriginalImageSize();
    const name = document.createElement("h3");
    name.textContent = product.name;
    const description = document.createElement("p");
    description.textContent = product.description;
    const price = document.createElement("h4");
    price.textContent = "$" + Number(product.price).toFixed(2) + (product.priceUnit === "lb" ? " / lb" : product.priceUnit === "item" ? " / " + translateText("Each") : "");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-i18n", "Add to Cart");
    button.textContent = translateText("Add to Cart");
    button.disabled = preview;
    if (!preview) button.addEventListener("click", () => addToCart(product.name, product.price, product.taxType, button, product.id));
    const frame = document.createElement("div");
    frame.className = "product-image-frame";
    frame.append(image, placeholder);
    card.append(frame, name, description, price, button);
    if (window.storeEditorActive && window.createAdminChangeIcon) {
        card.classList.add('admin-change-border-host');
        card.appendChild(window.createAdminChangeIcon('product', product.id));
    }
    return card;
}

function createShelfProductCard(product) {
    const card = createProductCard(product);
    card.classList.add('shelf-product');
    card.setAttribute('data-product-id', String(product.id));
    const button = card.querySelector('button');
    button.removeAttribute('data-i18n'); button.textContent = '+';
    button.classList.add('product-add-to-cart');
    button.setAttribute('aria-label', translateText('Add to Cart') + ': ' + product.name);
    card.querySelector('.product-image-frame').appendChild(button);
    card.querySelector('p')?.remove();
    if (!window.storeEditorActive && window.openCustomerProduct) {
        const details = document.createElement('button');
        details.type = 'button'; details.className = 'customer-product-details-trigger';
        details.setAttribute('aria-label', product.name);
        details.addEventListener('click', () => window.openCustomerProduct(product, details));
        card.querySelector('.product-image-frame').insertBefore(details, button);
        card.addEventListener('click', event => {
            if (!event.target.closest('button')) window.openCustomerProduct(product, details);
        });
    }
    if (window.storeEditorActive) {
        button.hidden = true;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', translateText('Edit Product') + ': ' + (product.name || translateText('New Product')));
        const edit = () => window.openAdminStoreItem(product);
        card.addEventListener('click', event => { if (!event.target.closest('button')) edit(); });
        card.addEventListener('keydown', event => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); edit(); } });
    }
    return card;
}

function createAdminAddCard(categoryId) {
    const button = document.createElement('button');
    button.className = 'admin-store-add-card'; button.type = 'button';
    button.textContent = '+'; button.setAttribute('aria-label', translateText('Add New Item'));
    button.addEventListener('click', () => window.addAdminStoreItem(categoryId));
    return button;
}

function displayCategoryShelves(container) {
    container.classList.remove('storefront-rows');
    container.classList.add('category-shelves');
    for (const category of getCategorySettings().categories) {
        const section = document.createElement('section');
        section.className = 'category-shelf';
        if (!window.storeEditorActive) section.classList.add('customer-category-motion');
        const heading = document.createElement('div');
        heading.className = 'category-shelf-heading';
        const title = document.createElement('h2');
        title.textContent = categoryText(category.en, category.zh, category.vi);
        if (window.storeEditorActive) window.makeAdminCategoryTitleEditable?.(title, category);
        const titleGroup = document.createElement('div');
        titleGroup.className = 'category-title-group';
        titleGroup.appendChild(title);
        if (window.storeEditorActive && window.createAdminCategoryRemoveButton) titleGroup.appendChild(window.createAdminCategoryRemoveButton(category));
        const controls = document.createElement('div');
        controls.className = 'category-shelf-controls';
        const all = document.createElement('a');
        all.href = '/category?category=' + encodeURIComponent(category.id) + (window.storeEditorActive ? '&adminView=1' : '');
        all.textContent = translateText('See All');
        controls.appendChild(all);
        const track = document.createElement('div');
        track.className = 'category-shelf-track';
        track.setAttribute('aria-label', title.textContent);
        const arrows = [];
        for (const [direction, label, symbol] of [[-1, 'Previous items', '‹'], [1, 'Next items', '›']]) {
            const arrow = document.createElement('button');
            arrow.type = 'button'; arrow.textContent = symbol;
            arrow.setAttribute('aria-label', translateText(label));
            arrow.addEventListener('click', () => track.scrollBy({ left: direction * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
            controls.appendChild(arrow); arrows.push(arrow);
        }
        for (const product of products.filter(item => item.categoryId === category.id)) {
            const card = createShelfProductCard(product);
            track.appendChild(card);
        }
        if (window.storeEditorActive) track.appendChild(createAdminAddCard(category.id));
        const updateArrows = () => {
            arrows[0].disabled = track.scrollLeft <= 1;
            arrows[1].disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
        };
        track.addEventListener('scroll', updateArrows, { passive: true });
        heading.append(titleGroup, controls); section.append(heading, track); container.appendChild(section);
        if (window.storeEditorActive && window.createAdminSubcategoryManager) {
            window.setupSubcategoryCarousel(track, category, all, titleGroup);
            titleGroup.insertBefore(window.createAdminSubcategoryTrigger(category), title.nextSibling);
            const categoryActions = titleGroup.querySelector('.admin-category-controls');
            if (categoryActions) titleGroup.appendChild(categoryActions);
        }
        if (!window.storeEditorActive && window.setupProductCarousel) {
            window.setupSubcategoryCarousel(track, category, all, titleGroup);
            for (const arrow of arrows) arrow.hidden = true;
            continue;
        }
        if (window.ResizeObserver) {
            const observer = new ResizeObserver(() => {
                if (!track.isConnected) { observer.disconnect(); return; }
                updateArrows();
            });
            observer.observe(track);
        }
        requestAnimationFrame(updateArrows);
    }
}

function displayProducts() {
    const catalogContainer = document.getElementById('product-container');
    if (catalogContainer && !window.storeEditorActive && !window.publishedCatalogState) {
        catalogContainer.setAttribute('aria-busy', 'true');
        return;
    }
    catalogContainer?.setAttribute('aria-busy', 'false');
    window.clearProductCarousels?.();
    if (window.location.pathname === '/search.html') {
        window.renderSearchPage?.();
        return;
    }

    const container =
        document.getElementById(
            "product-container"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const search = document.getElementById('store-item-search');
    const query = search?.value.trim().toLocaleLowerCase() || '';
    const searchStatus = document.getElementById('store-search-status');
    if (searchStatus) searchStatus.hidden = true;
    if (window.location.pathname === "/store.html" && !query) {
        displayCategoryShelves(container);
        if (!window.storeEditorActive) window.setupCustomerCategoryNavigation?.(container);
        return;
    }
    container.classList.remove('category-shelves');

    const categoryProducts = typeof selectedCategory === "undefined" || !selectedCategory
        ? products : products.filter(product => product.categoryId === selectedCategory);
    const selectedSubcategory = window.location.pathname === '/category' ? new URLSearchParams(window.location.search).get('subcategory') : null;
    const filteredCategoryProducts = selectedSubcategory ? categoryProducts.filter(product => product.subcategoryId === selectedSubcategory) : categoryProducts;
    const visibleProducts = query ? filteredCategoryProducts.filter(product => {
        const category = getCategorySettings().categories.find(category => category.id === product.categoryId);
        return [product.name, product.description, category?.en, category?.zh, category?.vi].some(value => String(value || '').toLocaleLowerCase().includes(query));
    }) : filteredCategoryProducts;
    if (searchStatus && query && !visibleProducts.length) {
        searchStatus.hidden = false;
        setLocalizedMessage(searchStatus, 'No matching items found.');
    }

    if (window.location.pathname === '/category') {
        container.classList.remove('storefront-rows');
        container.classList.add('category-all-grid');
        visibleProducts.forEach(product => container.appendChild(createShelfProductCard(product)));
        if (window.storeEditorActive && getCategorySettings().categories.some(c => c.id === selectedCategory)) container.appendChild(createAdminAddCard(selectedCategory));
        return;
    }
    container.classList.remove('category-all-grid');

    if (visibleProducts.some(product => Number.isInteger(product.rowIndex))) {
        container.classList.add("storefront-rows");
        for (const row of groupPublishedRows(visibleProducts)) {
            const grid = document.createElement("div");
            grid.className = "storefront-row";
            row.forEach(product => grid.appendChild(createProductCard(product)));
            container.appendChild(grid);
        }
    } else {
        container.classList.remove("storefront-rows");
        visibleProducts.forEach(product => container.appendChild(createProductCard(product)));
    }

}


/* =========================
   ADD TO CART
========================= */

async function addToCart(name, price, taxType = "general", sourceButton = null, productId, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
    if (!await loadUserCart()) return;

    const liveProduct = products.find(product => productId !== undefined ? String(product.id) === String(productId) : product.name === name);
    if (publishedCatalogEnabled && !liveProduct) return false;
    if (liveProduct) { productId = liveProduct.id; name = liveProduct.name; price = liveProduct.price; taxType = liveProduct.taxType || 'general'; }
    const existingProduct = cart.find(product => productId !== undefined ? String(product.id) === String(productId) : product.name === name);
    if (existingProduct) {
        existingProduct.quantity += quantity;
        existingProduct.taxType = taxType;
    } else {
        cart.push({ id: productId, name, price: Number(price), quantity, taxType, image: liveProduct?.image });
    }

    saveCart();
    updateCart();
    if (sourceButton) {
        document.getElementById('item-added-pop')?.remove();
        const confirmation = document.createElement('span');
        confirmation.id = 'item-added-pop';
        confirmation.className = 'hongkong-supermarket-navigation-logo';
        confirmation.setAttribute('role', 'status');
        confirmation.textContent = translateText('Add item');
        document.body.appendChild(confirmation);
        window.setTimeout(() => confirmation.remove(), 750);
    }
    if (window.location.pathname === "/category") {
        let status = document.getElementById("cart-add-status");
        if (!status) {
            status = document.createElement("span");
            status.id = "cart-add-status";
            status.className = "cart-add-status";
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            document.body.appendChild(status);
        }
        status.textContent = translateText("Add In Cart");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            if (!sourceButton) {
            document.getElementById("cart-add-pop")?.remove();
            const pop = document.createElement("div");
            pop.id = "cart-add-pop";
            pop.className = "hongkong-supermarket-navigation-logo";
            pop.textContent = translateText("Add In Cart");
            pop.setAttribute("aria-hidden", "true");
            document.body.appendChild(pop);
            window.setTimeout(() => pop.remove(), 750);
            }
        }
    }
    return true;
}


/* =========================
   UPDATE CART
========================= */

let storeTaxRate = 7;
async function refreshStoreTax() {
    try {
        const response = await fetch('/api/tax', { cache: 'no-store' });
        if (!response.ok) return;
        const { rate } = await response.json();
        if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
            storeTaxRate = rate;
            updateTaxSummary();
        }
    } catch { /* Retain the last loaded rate. */ }
}
document.addEventListener('DOMContentLoaded', refreshStoreTax);
window.addEventListener('focus', refreshStoreTax);
function calculateCartTotals() {
    let subtotalCents = 0;
    for (const item of cart) {
        const cents = Math.round(Number(item.price) * 100) * item.quantity;
        subtotalCents += cents;
    }
    const taxCents = Math.round(subtotalCents * storeTaxRate / 100);
    return { subtotal: subtotalCents / 100, tax: taxCents / 100, total: (subtotalCents + taxCents) / 100 };
}
function updateTaxSummary() {
    const totals = calculateCartTotals();
    for (const [id, value] of Object.entries({ "cart-tax": totals.tax, "cart-grand-total": totals.total, "checkout-button-total": totals.total,
        "checkout-subtotal": totals.subtotal, "checkout-tax": totals.tax, "checkout-total": totals.total })) {
        const field = document.getElementById(id);
        if (field) field.textContent = value.toFixed(2);
    }
}
function updateCart() {
    updateTaxSummary();

    const cartItems =
        document.getElementById(
            "cart-items"
        );

    const totalText =
        document.getElementById(
            "total"
        );

    const cartCount =
        document.getElementById(
            "cart-count"
        );


    let total = 0;

    let count = 0;


    cart.forEach(product => {

        total +=
            product.price *
            product.quantity;

        count +=
            product.quantity;

    });


    /* =====================
       RED CART BADGE
    ===================== */

    if (cartCount) {

        cartCount.textContent =
            count;


        if (count > 0) {

            cartCount.style.display =
                "inline-block";

        }

        else {

            cartCount.style.display =
                "none";

        }

    }


    const summaryCount = document.getElementById('cart-summary-count');
    if (summaryCount) summaryCount.textContent = '(' + count + ')';

    /*
    If we are on index.html,
    cart-items does not exist.

    Stop here after updating badge.
    */

    if (!cartItems) {
        return;
    }


    cartItems.innerHTML = "";


    /* EMPTY CART */

    if (cart.length === 0) {

        cartItems.innerHTML = `

            <p data-i18n="Your cart is empty.">
                Your cart is empty.
            </p>

        `;


        if (totalText) {

            totalText.textContent =
                "0.00";

        }


        return;

    }


    /* DISPLAY PRODUCTS */
    cart.forEach(
        (product, index) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "cart-item";


            item.innerHTML = `
                <div class="cart-item-picture"></div>
                <div class="cart-item-description"><strong class="cart-product-name"></strong><p class="cart-unit-price"></p><button type="button" class="cart-remove-text" onclick="removeProductFromCart(${index})" data-i18n="Remove">Remove</button></div>
                <div class="cart-item-purchase"><div class="quantity"><button type="button" onclick="changeQuantity(${index}, -1)">-</button><span>${product.quantity}</span><button type="button" onclick="changeQuantity(${index}, 1)">+</button></div><strong class="cart-line-price">$${(product.price * product.quantity).toFixed(2)}</strong></div>
            `;
            item.querySelector('.cart-unit-price').textContent = '$' + Number(product.price).toFixed(2);
            const catalogItem = products.find(entry => product.id !== undefined ? String(entry.id) === String(product.id) : entry.name === product.name);
            const imageUrl = catalogItem?.image || product.image;
            const picture = item.querySelector('.cart-item-picture');
            if (imageUrl) {
                const image = document.createElement('img'); image.src = imageUrl; image.alt = product.name; image.loading = 'lazy';
                image.addEventListener('error', () => { image.hidden = true; }); picture.appendChild(image);
            }
            item.querySelector(".cart-product-name").textContent = product.name;
            const quantityButtons = item.querySelectorAll(".quantity button");
            quantityButtons[0].setAttribute("aria-label", translateText("Decrease quantity"));
            quantityButtons[1].setAttribute("aria-label", translateText("Increase quantity"));


            cartItems.appendChild(
                item
            );

        }
    );


    /* TOTAL */

    if (totalText) {

        totalText.textContent =
            total.toFixed(2);

    }

}


/* =========================
   QUANTITY
========================= */

async function changeQuantity(
    index,
    amount
) {
    if (!await loadUserCart()) return;

    if (!cart[index]) {
        return;
    }


    if (cart[index].quantity + amount <= 0) {
        removeProductFromCart(index);
        return;
    }
    cart[index].quantity += amount;


    saveCart();

    updateCart();

}


/* =========================
   REMOVE FROM CART
========================= */

function removeProductFromCart(
    index
) {

    const product = cart[index];
    if (!product || document.getElementById("cart-remove-confirm")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "cart-remove-confirm";
    dialog.className = "cart-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "cart-remove-title");
    const title = document.createElement("h2");
    title.id = "cart-remove-title";
    title.textContent = translateText("Remove this item?");
    const name = document.createElement("p");
    name.textContent = product.name;
    const actions = document.createElement("div");
    actions.className = "cart-confirm-actions";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "remove";
    yes.textContent = translateText("Yes");
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = translateText("No");
    no.autofocus = true;
    yes.addEventListener("click", async () => {
        if (yes.disabled) return;
        yes.disabled = true;
        if (!await loadUserCart()) { dialog.close(); return; }
        const currentIndex = cart.findIndex(item => product.id !== undefined ? String(item.id) === String(product.id) : item.name === product.name);
        if (currentIndex !== -1) { cart.splice(currentIndex, 1); saveCart(); updateCart(); }
        dialog.close();
    });
    no.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    actions.append(no, yes);
    dialog.append(title, name, actions);
    document.body.appendChild(dialog);
    dialog.showModal();

}


/* =========================
   CHECKOUT
========================= */

async function showCheckout() {
    if (!await loadUserCart()) return;

    if (cart.length === 0) {

        alert(translateText("Your cart is empty."));

        return;

    }


    const { subtotal, tax, total } = calculateCartTotals();
    updateTaxSummary();


    document.getElementById(
        "checkout-total"
    ).textContent =
        total.toFixed(2);


    document.getElementById(
        "checkout"
    ).classList.remove(
        "hidden"
    );


    document.getElementById(
        "checkout"
    ).scrollIntoView({

        behavior: "smooth"

    });

}


/* =========================
   PAYMENT
========================= */

async function processPayment() {
    if (!await loadUserCart()) return;

    const name =
        document.getElementById(
            "name"
        ).value;

    const emailInput = document.getElementById("email");
    const email = emailInput.value.trim();
    emailInput.value = email;

    if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
    }

    const address =
        document.getElementById(
            "address"
        ).value;

    const cardName =
        document.getElementById(
            "card-name"
        ).value;

    const cardNumber =
        document.getElementById(
            "card-number"
        ).value;

    const expiration =
        document.getElementById(
            "expiration"
        ).value;

    const cvv =
        document.getElementById(
            "cvv"
        ).value;


    if (
        !name ||
        !email ||
        !address ||
        !cardName ||
        !cardNumber ||
        !expiration ||
        !cvv
    ) {

        alert(translateText("Please fill out all information."));

        return;

    }


    const { subtotal, tax, total } = calculateCartTotals();
    updateTaxSummary();


    const orderNumber =
        "ORD-" +
        Math.floor(
            100000 +
            Math.random() *
            900000
        );


    const newOrder = {

        orderNumber:
            orderNumber,

        customer:
            name,

        email:
            email,

        address:
            address,

        products:
            cart,

        subtotal,
        tax,
        total:
            total,

        status:
            "Paid"

    };


    let orders =
        JSON.parse(
            localStorage.getItem(
                "orders_" + currentCartUser
            )
        ) || [];


    orders.push(
        newOrder
    );


    localStorage.setItem(
        "orders_" + currentCartUser,
        JSON.stringify(
            orders
        )
    );


    document.getElementById(
        "order-number"
    ).textContent =
        orderNumber;


    document.getElementById(
        "checkout"
    ).classList.add(
        "hidden"
    );


    document.getElementById(
        "success"
    ).classList.remove(
        "hidden"
    );


    cart = [];

saveCart();

updateCart();

}


/* =========================
   CONTINUE SHOPPING
========================= */

function continueShopping() {

    window.location.href = "/store.html";

}


/* =========================
   START
========================= */

displayProducts();


updateCart();

/* ============================
   LANGUAGE SETTINGS
============================ */

/* ==============================
   PRODUCT DISPLAY SETTINGS
============================== */

const defaultDisplaySettings = {

    imageHeight: 220,

    cardWidth: 230,

    productsPerRow: 1,

    gap: 25

};


/* GET SETTINGS */

function getDisplaySettings() {

    const saved =
        localStorage.getItem(
            "displaySettings"
        );


    if (!saved) {

        return {
            ...defaultDisplaySettings
        };

    }


    try {

        return {
            ...defaultDisplaySettings,
            ...JSON.parse(saved),
            productsPerRow: 1
        };

    }

    catch {

        return {
            ...defaultDisplaySettings
        };

    }

}


/* APPLY SETTINGS */

function applyDisplaySettings() {

    const settings =
        getDisplaySettings();


    document.documentElement.style.setProperty(

        "--product-image-height",

        settings.imageHeight + "px"

    );


    document.documentElement.style.setProperty(

        "--product-card-width",

        settings.cardWidth + "px"

    );


    document.documentElement.style.setProperty(

        "--products-per-row",

        settings.productsPerRow

    );


    document.documentElement.style.setProperty(

        "--product-gap",

        settings.gap + "px"

    );

}


/* START SETTINGS */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        applyDisplaySettings();


    }
);

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadUserCart();

    }
);
// Refresh generated cart controls immediately when the selected language changes.
document.addEventListener("languagechange", () => {
    updateCart();
    applyLanguage(getSelectedLanguage());
});

let publishedCatalogEnabled = false;
let catalogRequestVersion = 0;
let latestPublishedSnapshot = null;
function groupPublishedRows(items) {
    const grouped = new Map();
    items.forEach((item, index) => {
        const row = Number.isInteger(item.rowIndex) ? item.rowIndex : Math.floor(index / 4);
        if (!grouped.has(row)) grouped.set(row, []);
        grouped.get(row).push(item);
    });
    const rows = [];
    for (const items of grouped.values()) for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));
    return rows;
}
async function loadPublishedCatalog(refreshOnly = false) {
    if (window.storeEditorActive || window.storeEditorLoading) return;
    const request = ++catalogRequestVersion;
    try {
        const response = await fetch("/api/catalog", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (window.storeEditorActive || window.storeEditorLoading) return;
        if (request !== catalogRequestVersion) return;
        if ((data.rows !== null && !Array.isArray(data.rows)) || !Array.isArray(data.categories)) throw new Error('Incomplete catalog response. Restart the server with the current code.');
        const snapshot = JSON.stringify({ rows: data.rows, categories: data.categories });
        if (snapshot === latestPublishedSnapshot) return;
        publishedCatalogEnabled = true;
        const nextProducts = (data.rows || []).flatMap((row, rowIndex) => row.map(item => ({ ...item, rowIndex })));
        window.publishedCatalogState = { categories: data.categories, products: nextProducts };
        products = nextProducts;
        try {
            localStorage.setItem("categorySettings", JSON.stringify({ categories: data.categories, slideDuration: 250 }));
            localStorage.setItem("products", JSON.stringify(products));
        } catch { /* Browser caches are optional copies of the database snapshot. */ }
        document.dispatchEvent(new Event("categorysettingschange"));
        if (typeof renderCategoryBar === 'function') renderCategoryBar();
        refreshCartCatalog();
        displayProducts();
        
        if (document.getElementById("cart-items")) updateCart();

        applyLanguage(getSelectedLanguage());
        latestPublishedSnapshot = snapshot;
    } catch (error) { console.error("Could not load catalog:", error); }
}
document.addEventListener("DOMContentLoaded", loadPublishedCatalog);
window.addEventListener("focus", loadPublishedCatalog);
window.addEventListener("pageshow", loadPublishedCatalog);
window.addEventListener('storage', event => { if (event.key === 'products') loadPublishedCatalog(); });
if (document.getElementById('cart-items') || document.getElementById('product-container')) {
    setInterval(() => { if (!document.hidden && !window.storeEditorActive) loadPublishedCatalog(true); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPublishedCatalog(); });
}
