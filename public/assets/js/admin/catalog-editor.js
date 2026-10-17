let catalogDraftRows = [];
let catalogReady = false;
let catalogBusy = false;
const catalogSearches = new Map();
let catalogSelectedProduct = new URLSearchParams(window.location.search).get("product");
let catalogSelectedCategory = new URLSearchParams(window.location.search).get("category");

let catalogRevision = 0;
let catalogSavedState;
function catalogWorkingState() { return { rows: catalogDraftRows, categories: window.adminWorkingCategories || getCategorySettings().categories, history: window.adminCategoryHistory || [] }; }
function rememberCatalogState() { catalogSavedState = structuredClone(catalogWorkingState()); window.adminUnsavedChanges?.saved(catalogSavedState); }
function catalogItemHasChanges(id) {
    if (!catalogSavedState) return false;
    const current = catalogDraftRows.flat().find(item => String(item.id) === String(id));
    const saved = catalogSavedState.rows.flat().find(item => String(item.id) === String(id));
    const snapshot = item => item && JSON.stringify(Object.keys(item).filter(key => key !== 'rowIndex').sort().map(key => [key, item[key]]));
    return snapshot(current) !== snapshot(saved);
}
function catalogCategoryHasChanges(id) {
    if (!catalogSavedState) return false;
    const categories = catalogWorkingState().categories;
    const index = categories.findIndex(category => category.id === id);
    const savedIndex = catalogSavedState.categories.findIndex(category => category.id === id);
    const current = categories[index], saved = catalogSavedState.categories[savedIndex];
    return index !== savedIndex || ['id', 'en', 'zh', 'vi'].some(key => current?.[key] !== saved?.[key]) || JSON.stringify(current?.subcategories || []) !== JSON.stringify(saved?.subcategories || []);
}
function changeCatalogCategories(categories) {
    if (!catalogReady || catalogBusy) return;
    window.adminWorkingCategories = categories;
    document.dispatchEvent(new Event('categorysettingschange'));
    renderCategoryBar(); renderCatalogEditor(); catalogStatus('Unsaved changes.');
}
function changeCatalogSubcategories(categoryId, subcategories, removedId) {
    if (!catalogReady || catalogBusy) return;
    const names = subcategories.map(sub => sub.en.trim().normalize('NFKC').toLocaleLowerCase());
    if (names.some(name => !name) || new Set(names).size !== names.length || subcategories.length > 100) throw new Error('Subcategory names must be nonempty and unique.');
    if (removedId) for (const product of catalogDraftRows.flat()) if (product.categoryId === categoryId && product.subcategoryId === removedId) delete product.subcategoryId;
    changeCatalogCategories(getCategorySettings().categories.map(category => category.id === categoryId ? { ...category, subcategories } : category));
}
function discardCatalogChanges(ask = true) {
    if (!catalogReady || catalogBusy || !catalogSavedState) return;
    if (ask && !window.confirm(translateText('Discard unsaved product and category changes?'))) return;
    const saved = structuredClone(catalogSavedState);
    catalogDraftRows = saved.rows; window.adminWorkingCategories = saved.categories; window.adminCategoryHistory = saved.history || [];
    if (typeof selectedCategory !== 'undefined' && !saved.categories.some(c => c.id === selectedCategory)) selectedCategory = '';
    catalogSelectedCategory = catalogDraftRows.flat().find(p => String(p.id) === catalogSelectedProduct)?.categoryId ?? null;
    rememberCatalogState(); document.dispatchEvent(new Event('categorysettingschange'));
    renderCategoryBar(); renderCatalogEditor(); catalogStatus('Changes discarded.');
}
function removeCatalogCategory(id) {
    if (!catalogReady || catalogBusy) return;
    const current = catalogWorkingState(), index = current.categories.findIndex(c => c.id === id);
    if (index < 0) return;
    if (current.history.length >= 100) { catalogStatus('Category history is full.'); return; }
    const rows = catalogDraftRows.map(row => row.filter(item => item.categoryId === id)).filter(row => row.length);
    window.adminCategoryHistory = [...current.history, { id: crypto.randomUUID(), category: structuredClone(current.categories[index]), rows: structuredClone(rows), index, removedAt: new Date().toISOString() }];
    catalogDraftRows = catalogDraftRows.map(row => row.filter(item => item.categoryId !== id)).filter(row => row.length);
    if (typeof selectedCategory !== 'undefined' && selectedCategory === id) selectedCategory = '';
    if (catalogSelectedCategory === id) catalogSelectedCategory = null;
    changeCatalogCategories(current.categories.filter(c => c.id !== id));
}
function restoreCatalogCategory(historyId) {
    if (!catalogReady || catalogBusy) return;
    const current = catalogWorkingState(), entry = current.history.find(item => item.id === historyId);
    if (!entry) return;
    const ids = new Set(catalogDraftRows.flat().map(item => String(item.id)));
    if (current.categories.length >= 100 || current.categories.some(c => c.id === entry.category.id) || entry.rows.flat().some(item => ids.has(String(item.id))) || catalogDraftRows.length + entry.rows.length > 100) { catalogStatus('Cannot restore this category because of a conflict or catalog limit.'); return; }
    const categories = [...current.categories]; categories.splice(Math.min(entry.index, categories.length), 0, structuredClone(entry.category));
    catalogDraftRows.push(...structuredClone(entry.rows));
    window.adminCategoryHistory = current.history.filter(item => item.id !== historyId);
    changeCatalogCategories(categories);
}
function catalogStatus(message) {
    if (message === 'Unsaved changes.') window.adminUnsavedChanges?.changed(catalogWorkingState());
    const feedbackInToolbar = window.storeEditorActive && ['Unsaved changes.', 'Draft saved. Customers cannot see this draft.', 'Catalog published.', 'Changes discarded.'].includes(message);
    setLocalizedMessage(document.getElementById("catalog-status"), feedbackInToolbar ? '' : message);
    window.refreshAdminStoreDraft?.();
    window.refreshAdminChangeIcons?.();
    window.refreshAdminCategoryHistory?.();
}
function setCatalogBusy(busy) {
    catalogBusy = busy;
    window.setAdminCategoryBusy?.(busy || !catalogReady);
    for (const id of ["catalog-save", "catalog-publish", "catalog-add"]) {
        document.getElementById(id).disabled = busy || !catalogReady;
    }
    document.getElementById("catalog-editor-rows").inert = busy;
}
function addCatalogItem(rowIndex, categoryId = catalogSelectedCategory ?? "", subcategoryId = '') {
    if (!catalogReady || catalogBusy) return;
    catalogSearches.delete(categoryId);
    if (rowIndex === undefined) {
        rowIndex = catalogDraftRows.findLastIndex(row => row.some(item => item.categoryId === categoryId));
        if (rowIndex < 0) {
            if (catalogDraftRows.length >= 100) return;
            catalogDraftRows.push([]);
            rowIndex = catalogDraftRows.length - 1;
        }
    }
    let row = catalogDraftRows[rowIndex];
    if (!row) return;
    const previous = row[row.length - 1];
    if (row.length >= 4) {
        const next = catalogDraftRows[rowIndex + 1];
        if (next && next.length < 4 && next.every(item => item.categoryId === categoryId)) row = next;
        else {
            if (catalogDraftRows.length >= 100) return;
            row = [];
            catalogDraftRows.splice(rowIndex + 1, 0, row);
        }
    }
    const item = { id: crypto.randomUUID(), name: "", description: "", price: 0, priceUnit: "item", image: "", categoryId,
        cardWidth: previous?.cardWidth ?? 230, imageHeight: previous?.imageHeight ?? 220, imageZoom: 100 };
    row.push(item);
    if (subcategoryId && getCategorySettings().categories.find(category => category.id === categoryId)?.subcategories?.some(sub => sub.id === subcategoryId)) item.subcategoryId = subcategoryId;
    if (window.storeEditorActive) catalogSelectedProduct = String(item.id);
    renderCatalogEditor();
    const entry = document.getElementById("catalog-item-" + item.id);
    entry?.scrollIntoView({ block: "nearest" });
    entry?.querySelector('input[type="text"]')?.focus({ preventScroll: true });
    catalogStatus("Unsaved changes.");
}
function attachCatalogResize(card, item) {
    const frame = card.children[0];
    frame.classList.add("resizable-image-frame");
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "image-resize-corner";
    handle.textContent = "↘";
    handle.setAttribute("aria-label", translateText("Drag to resize"));
    let drag = null;
    const resize = (width, height) => {
        item.cardWidth = Math.round(Math.max(150, Math.min(348, width)));
        item.imageHeight = Math.round(Math.max(100, Math.min(300, height)));
        card.style.width = item.cardWidth + "px";
        card.style.setProperty("--product-image-height", item.imageHeight + "px");
        catalogStatus("Unsaved changes.");
    };
    handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: item.cardWidth, height: item.imageHeight };
        handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", event => {
        if (drag && drag.id === event.pointerId) resize(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(event, () => { drag = null; });
    handle.addEventListener("keydown", event => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        resize(item.cardWidth + (event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0),
            item.imageHeight + (event.key === "ArrowDown" ? 10 : event.key === "ArrowUp" ? -10 : 0));
    });
    frame.appendChild(handle);
}
function renderCatalogEditor() {
    const container = document.getElementById("catalog-editor-rows");
    container.replaceChildren();
    const categories = [...getCategorySettings().categories];
    const knownIds = new Set(categories.map(category => category.id));
    categories.push({ id: "", en: "Uncategorized", zh: "未分类", vi: "Chưa phân loại" });
    for (const category of categories) {
        if (catalogSelectedCategory !== null && category.id !== catalogSelectedCategory) continue;
        const group = document.createElement("section");
        group.className = "catalog-category-group";
        group.id = "catalog-category-" + category.id;
        const title = document.createElement("h2");
        title.textContent = categoryText(category.en, category.zh, category.vi);
        const addItem = document.createElement("button");
        addItem.type = "button";
        addItem.textContent = translateText("Add New Item");
        addItem.addEventListener("click", () => addCatalogItem(undefined, category.id));
        const toolbar = document.createElement("div");
        toolbar.className = "catalog-category-toolbar";
        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = translateText("Search products");
        search.setAttribute("aria-label", translateText("Search products"));
        search.value = catalogSearches.get(category.id) || "";
        const applySearch = () => {
            const query = search.value.trim().toLocaleLowerCase();
            catalogSearches.set(category.id, search.value);
            for (const entry of group.querySelectorAll('.catalog-editor-item')) {
                const item = catalogDraftRows.flat().find(product => "catalog-item-" + product.id === entry.id);
                entry.hidden = Boolean(query && ![item?.name, item?.description].some(value => String(value || "").toLocaleLowerCase().includes(query)));
            }
            for (const row of group.querySelectorAll('.catalog-editor-row')) {
                row.hidden = !Array.from(row.querySelectorAll('.catalog-editor-item')).some(entry => !entry.hidden);
            }
        };
        search.addEventListener("input", applySearch);
        toolbar.append(search, addItem);
        group.append(title, toolbar);
        container.appendChild(group);
        let visibleRow = 0;
        catalogDraftRows.forEach((sourceRow, rowIndex) => {
        const row = sourceRow.filter(item => (!window.storeEditorActive || String(item.id) === catalogSelectedProduct) && (category.id === "" ? !knownIds.has(item.categoryId) : item.categoryId === category.id));
        if (!row.length) return;
        const section = document.createElement("div");
        section.className = "catalog-editor-row";
        const heading = document.createElement("h3");
        heading.textContent = translateText("Row") + " " + (++visibleRow) + " · " + row.length + "/4";
        section.appendChild(heading);
        const grid = document.createElement("div");
        grid.className = "storefront-row";
        row.forEach(item => {
            const entry = document.createElement("div");
            entry.className = "catalog-editor-item";
            entry.id = "catalog-item-" + String(item.id);
            const cardHost = document.createElement("div");
            const updateCard = () => {
                const card = createProductCard({ ...item, name: item.name || translateText("New Product") }, true);
                attachCatalogResize(card, item);
                const frame = card.querySelector('.product-image-frame');
                frame.tabIndex = 0;
                frame.setAttribute('role', 'button');
                frame.setAttribute('aria-label', translateText('Image adjustments'));
                frame.setAttribute('aria-haspopup', 'dialog');
                cardHost.replaceChildren(card);
            };
            updateCard();
            entry.appendChild(cardHost);
            const details = document.createElement("details");
            details.open = !item.name || String(item.id) === catalogSelectedProduct;
            const summary = document.createElement("summary");
            summary.textContent = translateText("Edit Product");
            details.appendChild(summary);
            const imageControls = document.createElement("fieldset");
            imageControls.className = "product-image-controls";
            const legend = document.createElement("legend");
            legend.textContent = translateText("Image adjustments");
            imageControls.appendChild(legend);
            const controls = [];
            for (const [key, title, min, max, fallback, suffix] of [
                ["imageZoom", "Image Zoom", 1, 300, 100, "%"],
                ["imageOffsetX", "Left / right", -300, 300, 0, " px"],
                ["imageOffsetY", "Up / down", -300, 300, 0, " px"]
            ]) {
                const label = document.createElement("label");
                label.textContent = translateText(title);
                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = min;
                slider.max = max;
                slider.step = "1";
                slider.value = item[key] ?? fallback;
                const output = document.createElement("output");
                output.textContent = slider.value + suffix;
                slider.addEventListener("input", () => {
                    item[key] = Number(slider.value);
                    output.textContent = slider.value + suffix;
                    updateCard();
                    catalogStatus("Unsaved changes.");
                });
                label.append(slider, output);
                imageControls.appendChild(label);
                controls.push({ key, slider, output, fallback, suffix });
            }
            const resetImage = document.createElement("button");
            resetImage.type = "button";
            resetImage.textContent = translateText("Reset image");
            resetImage.addEventListener("click", () => {
                for (const control of controls) {
                    item[control.key] = control.fallback;
                    control.slider.value = control.fallback;
                    control.output.textContent = control.fallback + control.suffix;
                }
                updateCard();
                catalogStatus("Unsaved changes.");
            });
            const zoomHelp = document.createElement("p");
            zoomHelp.textContent = translateText("100% uses the image URL's original size.");
            imageControls.append(resetImage, zoomHelp);
            const imagePanel = document.createElement('div');
            imagePanel.className = 'product-image-panel';
            imagePanel.id = 'image-panel-' + item.id;
            imagePanel.setAttribute('popover', 'auto');
            imagePanel.setAttribute('role', 'dialog');
            imagePanel.setAttribute('aria-label', translateText('Image adjustments'));
            const closeImage = document.createElement('button');
            closeImage.type = 'button';
            closeImage.className = 'product-image-panel-close';
            closeImage.textContent = '×';
            closeImage.setAttribute('aria-label', translateText('Close'));
            closeImage.addEventListener('click', () => {
                imagePanel.hidePopover();
                cardHost.querySelector('.product-image-frame')?.focus();
            });
            imagePanel.append(closeImage, imageControls);
            entry.appendChild(imagePanel);
            const openImagePanel = () => {
                const rect = cardHost.getBoundingClientRect();
                const width = Math.min(300, window.innerWidth - 24);
                const left = rect.right + 12 + width <= window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - width - 12);
                imagePanel.style.left = Math.min(left, window.innerWidth - width - 12) + 'px';
                imagePanel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - 430)) + 'px';
                imagePanel.showPopover();
                closeImage.focus();
            };
            cardHost.addEventListener('click', event => {
                if (event.target.closest('.product-image-frame') && !event.target.closest('.image-resize-corner')) openImagePanel();
            });
            cardHost.addEventListener('keydown', event => {
                if (event.target.matches('.product-image-frame') && ['Enter', ' '].includes(event.key)) {
                    event.preventDefault();
                    openImagePanel();
                }
            });
            for (const [key, title, type] of [["name", "productName", "text"], ["price", "price", "number"],
                ["image", "imageUrl", "text"], ["description", "description", "text"]]) {
                const label = document.createElement("label");
                label.textContent = translateText(title);
                const input = document.createElement(key === "description" ? "textarea" : "input");
                input.type = type;
                input.value = item[key];
                if (type === "number") { input.min = "0"; input.step = "0.01"; }
                input.maxLength = key === "description" ? 2000 : key === "image" ? 1000 : 200;
                input.addEventListener("input", () => {
                    item[key] = type === "number" ? Number(input.value) : input.value;
                    updateCard();
                    catalogStatus("Unsaved changes.");
                });
                label.appendChild(input);
                details.appendChild(label);
                if (key === "price") {
                    const priceField = document.createElement("div");
                    priceField.className = "catalog-price-field";
                    const priceRow = document.createElement("div");
                    priceRow.className = "catalog-price-row";
                    input.id = "catalog-price-" + item.id;
                    label.htmlFor = input.id;
                    label.removeChild(input);
                    details.replaceChild(priceField, label);
                    priceField.append(label, priceRow);
                    const unit = document.createElement("select");
                    unit.setAttribute("aria-label", translateText("Price unit"));
                    for (const [value, text] of [["item", "Each"], ["lb", "Per pound (lbs)"]]) {
                        const option = document.createElement("option");
                        option.value = value;
                        option.textContent = translateText(text);
                        unit.appendChild(option);
                    }
                    unit.value = item.priceUnit || "item";
                    unit.addEventListener("change", () => {
                        item.priceUnit = unit.value;
                        updateCard();
                        catalogStatus("Unsaved changes.");
                    });
                    priceRow.append(input, unit);
                }
            }
            const categoryLabel = document.createElement("label");
            categoryLabel.textContent = translateText("category");
            const select = document.createElement("select");
            populateCategorySelect(select, item.categoryId);
            select.addEventListener("change", () => { item.categoryId = select.value; delete item.subcategoryId; if (window.storeEditorActive) catalogSelectedCategory = item.categoryId; renderCatalogEditor(); catalogStatus("Unsaved changes."); });
            categoryLabel.appendChild(select);
            details.appendChild(categoryLabel);
            const subcategoryLabel = document.createElement('label'); subcategoryLabel.textContent = translateText('Subcategory');
            const subcategorySelect = document.createElement('select');
            const none = document.createElement('option'); none.value = ''; none.textContent = translateText('No subcategory'); subcategorySelect.appendChild(none);
            for (const sub of getCategorySettings().categories.find(category => category.id === item.categoryId)?.subcategories || []) {
                const option = document.createElement('option'); option.value = sub.id; option.textContent = categoryText(sub.en, sub.zh, sub.vi); subcategorySelect.appendChild(option);
            }
            subcategorySelect.value = item.subcategoryId || '';
            subcategorySelect.addEventListener('change', () => { if (subcategorySelect.value) item.subcategoryId = subcategorySelect.value; else delete item.subcategoryId; catalogStatus('Unsaved changes.'); });
            subcategoryLabel.appendChild(subcategorySelect); details.appendChild(subcategoryLabel);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "remove";
            remove.textContent = translateText("Remove");
            remove.addEventListener("click", () => { sourceRow.splice(sourceRow.indexOf(item), 1); renderCatalogEditor(); catalogStatus("Unsaved changes."); });
            details.appendChild(remove);
            entry.appendChild(details);
            grid.appendChild(entry);
        });
        section.appendChild(grid);
        const add = document.createElement("button");
        add.type = "button";
        add.textContent = translateText("Add New Item");
        add.addEventListener("click", () => addCatalogItem(rowIndex, category.id));
        section.appendChild(add);
        group.appendChild(section);
    });
        applySearch();
    }
    window.refreshAdminStoreDraft?.();
}
async function submitCatalog(publish) {
    if (!catalogReady || catalogBusy) return;
    const needsSave = () => publish && window.storeEditorActive && window.adminUnsavedChanges?.dirty;
    if (needsSave()) { window.setAdminSaveFeedback?.('blocked'); return; }
    if (publish) {
        const approved = window.confirmAdminCatalogAction
            ? await window.confirmAdminCatalogAction('Publsih?')
            : window.confirm(translateText("Publish this entire draft to the customer product page?"));
        if (!approved || !catalogReady || catalogBusy) return;
        if (needsSave()) { window.setAdminSaveFeedback?.('blocked'); return; }
    }
    const saveStarted = Date.now();
    setCatalogBusy(true);
    window.setAdminSaveFeedback?.('saving', publish ? 'publish' : 'save');
    try {
        const response = await fetch(publish ? "/api/catalog/publish" : "/api/catalog/draft", {
            method: publish ? "POST" : "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...catalogWorkingState(), revision: catalogRevision })
        });
        const data = await response.json();
        if (!response.ok) { if (response.status === 409) window.showCatalogConflict?.(); throw new Error(data.message || "Could not save catalog."); }
        if (window.storeEditorActive && (!Array.isArray(data.categories) || !Number.isSafeInteger(data.revision) || (catalogWorkingState().history.length && !Array.isArray(data.history)))) throw new Error('The server needs to be restarted before saving categories. Your changes are still here.');
        const working = catalogWorkingState();
        if (working.categories.some(category => category.subcategories !== undefined && !Array.isArray(data.categories?.find(saved => saved.id === category.id)?.subcategories)) || working.rows.flat().some(item => item.subcategoryId && !data.rows?.flat().some(saved => String(saved.id) === String(item.id) && saved.subcategoryId === item.subcategoryId))) throw new Error('Restart the server before saving subcategories. Your changes are still here.');
        if (window.storeEditorActive) await new Promise(resolve => setTimeout(resolve, Math.max(0, 500 - (Date.now() - saveStarted))));
        catalogDraftRows = data.rows;
        window.adminWorkingCategories = data.categories || catalogWorkingState().categories;
        window.adminCategoryHistory = data.history ?? window.adminCategoryHistory ?? [];
        catalogRevision = data.revision ?? catalogRevision;
        rememberCatalogState();
        document.dispatchEvent(new Event("categorysettingschange"));
        renderCategoryBar();
        if (publish) {
            products = data.rows.flatMap((row, rowIndex) => row.map(item => ({ ...item, rowIndex })));
            try {
                localStorage.setItem("products", JSON.stringify(products));
                localStorage.setItem("categorySettings", JSON.stringify({ categories: window.adminWorkingCategories, slideDuration: 250 }));
            } catch { /* Database commit succeeded; browser cache is optional. */ }
        }
        renderCatalogEditor();
        catalogStatus(publish ? "Catalog published." : "Draft saved. Customers cannot see this draft.");
        window.setAdminSaveFeedback?.('saved', publish ? 'publish' : 'save');
    } catch (error) { catalogStatus(error.message); window.setAdminSaveFeedback?.('failed', publish ? 'publish' : 'save'); }
    finally { setCatalogBusy(false); }
}
function saveCatalogDraft() { return submitCatalog(false); }
function publishCatalogDraft() { return submitCatalog(true); }
async function loadCatalogEditor() {
    if (document.getElementById("catalog-workspace")?.hidden) return;
    setCatalogBusy(true);
    try {
        const response = await fetch("/api/catalog/draft");
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load catalog.");
        if (window.storeEditorActive && (!Array.isArray(data.categories) || !Number.isSafeInteger(data.revision) || (data.rows !== null && !Array.isArray(data.rows)))) throw new Error('Incomplete draft response. Restart the server with the current code.');
        catalogDraftRows = data.rows ?? Array.from({ length: Math.ceil(products.length / 4) }, (_, index) =>
            products.slice(index * 4, index * 4 + 4).map(item => ({ ...item, description: item.description || "", categoryId: item.categoryId || "", cardWidth: item.cardWidth || 230, imageHeight: item.imageHeight || 220 })));
        for (const row of catalogDraftRows) for (const item of row) {
            item.cardWidth = Math.min(348, item.cardWidth);
            item.imageHeight = Math.min(300, item.imageHeight);
        }
        catalogReady = true;
        window.adminWorkingCategories = data.categories || catalogWorkingState().categories;
        window.adminCategoryHistory = data.history ?? window.adminCategoryHistory ?? [];
        catalogRevision = data.revision ?? catalogRevision;
        rememberCatalogState();
        document.dispatchEvent(new Event("categorysettingschange"));
        renderCategoryBar();
        renderCatalogEditor();
        const categoryId = new URLSearchParams(window.location.search).get("category");
        if (categoryId !== null) document.getElementById("catalog-category-" + categoryId)?.scrollIntoView({ block: "start" });
        if (catalogSelectedProduct) {
            const selected = document.getElementById("catalog-item-" + catalogSelectedProduct);
            if (selected) selected.scrollIntoView({ block: "center" });
            else catalogStatus("This product no longer exists.");
        }
    } catch (error) { catalogStatus(error.message); }
    finally { setCatalogBusy(false); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadCatalogEditor);
else loadCatalogEditor();
document.addEventListener("languagechange", () => { if (catalogReady) renderCatalogEditor(); });
window.addEventListener("storage", event => {
    if (event.key === "categorySettings" && catalogReady && !catalogBusy) renderCatalogEditor();
});
