const defaultCategorySettings = {
    categories: [
        { id: "produce", en: "Fresh Produce", zh: "新鲜蔬果" },
        { id: "groceries", en: "Groceries", zh: "食品杂货" },
        { id: "drinks", en: "Drinks", zh: "饮料" }
    ],
    slideDuration: 250
};
const categoryPageId = window.location.pathname === "/category"
    ? new URLSearchParams(window.location.search).get("category") : null;
let selectedCategory = categoryPageId ?? "";

function getCategorySettings() {
    if (window.storeEditorActive && window.adminWorkingCategories) return { categories: window.adminWorkingCategories, slideDuration: 250 };
    if (window.publishedCatalogState) return { categories: window.publishedCatalogState.categories, slideDuration: 250 };
    try {
        const saved = JSON.parse(localStorage.getItem("categorySettings"));
        if (saved && Array.isArray(saved.categories)) {
            saved.categories = saved.categories.map(category => ({ ...category, vi: category.vi || translations.vi[category.en] || category.en }));
            saved.slideDuration = 250;
            return saved;
        }
    } catch { /* Use defaults when saved data cannot be read. */ }
    const settings = structuredClone(defaultCategorySettings);
    settings.categories.forEach(category => { category.vi = translations.vi[category.en] || category.en; });
    return settings;
}

function categoryText(en, zh, vi) {
    if (!translations.en[en]) translations.en[en] = en;
    if (!translations.zh[en]) translations.zh[en] = zh;
    if (getSelectedLanguage() === "vi") return vi || translateText(en);
    return localStorage.getItem("language") === "zh" ? zh : en;
}

Object.assign(translations.en, {
    managePreviewProducts: "Manage & Preview Products",
    settings: "Settings", category: "Category", categorySettings: "Product Categories",
    categoryHelp: "Add categories and enter their English, Chinese, and Vietnamese names. Assign products in Product Management.",
    addCategory: "Add Category", slideDuration: "Slide duration (milliseconds)", saveAllSettings: "Save All Settings"
});
Object.assign(translations.zh, {
    managePreviewProducts: "管理和预览商品",
    settings: "设置", category: "分类", categorySettings: "商品分类",
    categoryHelp: "添加分类并填写英文、中文和越南语名称。在商品管理中为商品选择分类。",
    addCategory: "添加分类", slideDuration: "滑动时间（毫秒）", saveAllSettings: "保存所有设置"
});

translations.vi.managePreviewProducts = "Quản lý và xem trước sản phẩm";

function toggleProductCategories(force) {
    const panel = document.getElementById("product-category-bar");
    const button = document.getElementById("products-toggle");
    if (!panel || !button) return;
    const open = typeof force === "boolean" ? force : button.getAttribute("aria-expanded") !== "true";
    panel.classList.toggle("is-open", open);
    panel.inert = !open;
    button.setAttribute("aria-expanded", String(open));
}

function renderCategoryBar() {
    const settings = getCategorySettings();
    document.documentElement.style.setProperty("--category-slide-duration", settings.slideDuration + "ms");
    const container = document.getElementById("category-links");
    if (!container) return;
    const menuCategories = document.getElementById('menu-product-categories');
    if (menuCategories) {
        document.querySelector('.store-category-section').hidden = categoryPageId === null;
        container.hidden = true;
        container.style.display = 'none';
    }
    if (categoryPageId !== null) {
        const category = settings.categories.find(category => category.id === (window.storeEditorActive ? selectedCategory : categoryPageId));
        container.hidden = true;
        container.style.display = "none";
        const heading = document.querySelector(".store-category-section h2");
        heading.removeAttribute("data-i18n");
        heading.textContent = category ? categoryText(category.en, category.zh, category.vi) : translateText("categorySettings");
        document.title = heading.textContent + " | HongKong Supermarket";
        document.getElementById("category-return").hidden = false;
        return;
    }
    container.replaceChildren();
    const categories = settings.categories;
    for (const category of categories) {
        const button = document.createElement("a");
        button.href = "/category?category=" + encodeURIComponent(category.id);
        button.textContent = categoryText(category.en, category.zh, category.vi);
        button.className = "category-button";
        container.appendChild(button);
    }
}

function populateCategorySelect(select, value = "") {
    select.replaceChildren();
    const categories = [{ id: "", en: "Uncategorized", zh: "未分类" }, ...getCategorySettings().categories];
    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = categoryText(category.en, category.zh, category.vi);
        select.appendChild(option);
    }
    select.value = categories.some(category => category.id === value) ? value : "";
}

document.addEventListener("DOMContentLoaded", () => {
    renderCategoryBar();

});
document.addEventListener("languagechange", () => {
    renderCategoryBar();

    displayProducts();

});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.getElementById("products-toggle")?.getAttribute("aria-expanded") === "true") {
        toggleProductCategories(false);
        document.getElementById("products-toggle").focus();
    }
});
function refreshPublishedProducts() {
    if (window.storeEditorActive) {
        renderCategoryBar();
        window.refreshAdminStoreDraft?.();
        return;
    }
    if (document.getElementById('product-container') || document.getElementById('cart-items')) {
        if (typeof loadPublishedCatalog === 'function') loadPublishedCatalog(true);
        return;
    }
    try {
        const saved = JSON.parse(localStorage.getItem("products")) || [];
        products = Array.isArray(saved) ? saved : [];
    } catch {
        return;
    }
    if (categoryPageId === null && !getCategorySettings().categories.some(category => category.id === selectedCategory)) selectedCategory = "";
    renderCategoryBar();
    displayProducts();

}
window.addEventListener("storage", event => {
    if (event.key === "categorySettings" || event.key === "products") refreshPublishedProducts();
});
window.addEventListener("focus", refreshPublishedProducts);
window.addEventListener("pageshow", refreshPublishedProducts);
async function loadSharedCategories() {
    if (window.storeEditorActive || window.storeEditorLoading) return;
    if (document.getElementById('product-container') || document.getElementById('cart-items')) return;
    try {
        const response = await fetch('/api/categories', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (window.storeEditorActive) return;
        if (!Array.isArray(data.categories)) return;
        localStorage.setItem('categorySettings', JSON.stringify({ categories: data.categories, slideDuration: 250 }));
        refreshPublishedProducts();
        document.dispatchEvent(new Event('categorysettingschange'));
    } catch { /* Keep the last category list while offline. */ }
}
document.addEventListener('DOMContentLoaded', loadSharedCategories);
window.addEventListener('focus', loadSharedCategories);
