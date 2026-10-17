function validateCategories(categories) {
    if (!Array.isArray(categories) || categories.length > 100 || categories.some(c => !c || typeof c.id !== 'string' || !c.id.trim() || c.id.length > 200 || typeof c.en !== 'string' || !c.en.trim() || c.en.length > 200 || ['zh', 'vi'].some(k => typeof c[k] !== 'string' || c[k].length > 200)) || new Set(categories.map(c => c.id)).size !== categories.length) throw new Error('Invalid categories.');
    const subIds = new Set();
    return categories.map(({ id, en, zh, vi, subcategories }) => {
        const category = { id, en: en.trim(), zh: zh.trim() || en.trim(), vi: vi.trim() || en.trim() };
        if (subcategories !== undefined) {
            if (!Array.isArray(subcategories) || subcategories.length > 100) throw new Error('Invalid subcategories.');
            const names = new Set();
            category.subcategories = subcategories.map(sub => {
                if (!sub || typeof sub.id !== 'string' || !sub.id.trim() || sub.id.length > 200 || subIds.has(sub.id) || typeof sub.en !== 'string' || !sub.en.trim() || sub.en.length > 200 || ['zh', 'vi'].some(key => typeof sub[key] !== 'string' || sub[key].length > 200)) throw new Error('Invalid subcategory.');
                const name = sub.en.trim().normalize('NFKC').toLocaleLowerCase();
                if (names.has(name)) throw new Error('Subcategory names must be unique within their category.');
                names.add(name); subIds.add(sub.id);
                return { id: sub.id, en: sub.en.trim(), zh: sub.zh.trim() || sub.en.trim(), vi: sub.vi.trim() || sub.en.trim() };
            });
        }
        return category;
    });
}
function validateAssignments(rows, categories) {
    const assignments = new Map(categories.map(category => [category.id, new Set((category.subcategories || []).map(sub => sub.id))]));
    for (const row of rows) for (const item of row) {
        if (item.subcategoryId && !assignments.get(item.categoryId)?.has(item.subcategoryId)) throw new Error('Subcategory must belong to the product category.');
    }
}
function registerCatalogWorkflow(app, db, admin, validateRows) {
    const columns = new Set(db.prepare('PRAGMA table_info(storefront_catalog)').all().map(c => c.name));
    for (const [name, type] of [['draft_categories', 'TEXT'], ['revision', 'INTEGER NOT NULL DEFAULT 0'], ['category_history', "TEXT NOT NULL DEFAULT '[]'"]]) if (!columns.has(name)) db.exec(`ALTER TABLE storefront_catalog ADD COLUMN ${name} ${type}`);
    const defaults = [{ id: 'produce', en: 'Fresh Produce', zh: '新鲜蔬果', vi: 'Rau quả tươi' }, { id: 'groceries', en: 'Groceries', zh: '食品杂货', vi: 'Thực phẩm' }, { id: 'drinks', en: 'Drinks', zh: '饮料', vi: 'Đồ uống' }];
    db.prepare('UPDATE store_categories SET categories=? WHERE id=1 AND categories IS NULL').run(JSON.stringify(defaults));
    const read = () => db.prepare('SELECT c.*,s.categories AS live_categories FROM storefront_catalog c JOIN store_categories s ON s.id=c.id WHERE c.id=1').get();
    // Older servers could persist products while leaving their category names only in the browser.
    const legacy = read();
    if (legacy.revision === 0 && legacy.draft_categories === null) {
        const recover = (categories, rows) => {
            const recovered = [...categories];
            for (const item of rows.flat()) {
                if (!item.categoryId || recovered.some(category => category.id === item.categoryId)) continue;
                const name = 'Recovered Category ' + (recovered.length + 1);
                recovered.push({ id: item.categoryId, en: name, zh: name, vi: name });
            }
            return recovered;
        };
        const live = JSON.parse(legacy.live_categories);
        const recoveredLive = recover(live, JSON.parse(legacy.published || '[]'));
        const recoveredDraft = recover(recoveredLive, JSON.parse(legacy.draft || legacy.published || '[]'));
        if (recoveredDraft.length !== live.length) {
            db.exec('BEGIN IMMEDIATE');
            try {
                db.prepare('UPDATE store_categories SET categories=? WHERE id=1').run(JSON.stringify(recoveredLive));
                db.prepare('UPDATE storefront_catalog SET draft_categories=?,revision=revision+1 WHERE id=1').run(JSON.stringify(recoveredDraft));
                db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
    }
    app.get('/api/categories', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ categories: JSON.parse(read().live_categories) }); });
    app.get('/api/catalog', (_req, res) => { const s = read(); res.set('Cache-Control', 'no-store'); res.json({ rows: s.published === null ? null : JSON.parse(s.published), categories: JSON.parse(s.live_categories) }); });
    app.get('/api/catalog/draft', admin, (_req, res) => {
        const s = read(); res.set('Cache-Control', 'no-store');
        res.json({ rows: s.draft === null && s.published === null ? null : JSON.parse(s.draft ?? s.published), categories: JSON.parse(s.draft_categories || s.live_categories), history: JSON.parse(s.category_history), revision: s.revision });
    });
    app.put('/api/admin/categories', admin, (_req, res) => res.status(409).json({ message: 'Save categories and products together using Save Draft or Publish All.' }));
    const save = publish => (req, res) => {
        let rows, categories, history;
        try {
            rows = validateRows(req.body?.rows, publish); categories = validateCategories(req.body?.categories);
            validateAssignments(rows, categories);
            if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) throw new Error('A catalog revision is required. Reload the saved draft.');
            const ids = new Set(categories.map(c => c.id));
            if (publish && rows.flat().some(item => !ids.has(item.categoryId))) throw new Error('Assign every product to an existing category before publishing.');
            if (req.body.history !== undefined) {
                if (!Array.isArray(req.body.history) || req.body.history.length > 100) throw new Error('Invalid category history.');
                const historyIds = new Set();
                history = req.body.history.map(entry => {
                    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 200 || historyIds.has(entry.id) || !Number.isInteger(entry.index) || entry.index < 0 || entry.index > 100 || typeof entry.removedAt !== 'string' || entry.removedAt.length > 40 || !Number.isFinite(Date.parse(entry.removedAt))) throw new Error('Invalid category history.');
                    historyIds.add(entry.id);
                    const category = validateCategories([entry.category])[0];
                    const archivedRows = validateRows(entry.rows, false);
                    validateAssignments(archivedRows, [category]);
                    if (archivedRows.flat().some(item => item.categoryId !== category.id)) throw new Error('Invalid category history.');
                    return { id: entry.id, category, rows: archivedRows, index: entry.index, removedAt: entry.removedAt };
                });
            }
        } catch (error) { return res.status(400).json({ message: error.message }); }
        let transaction = false;
        try {
            db.exec('BEGIN IMMEDIATE'); transaction = true; const saved = read();
            if (saved.revision !== req.body.revision) {
                db.exec('ROLLBACK'); transaction = false;
                return res.status(409).json({ message: 'Another administrator saved a newer catalog. Your changes are still here. Export your changes before reloading the saved draft.', revision: saved.revision });
            }
            const json = JSON.stringify(rows), cats = JSON.stringify(categories);
            history ??= JSON.parse(saved.category_history);
            db.prepare('UPDATE storefront_catalog SET category_history=? WHERE id=1').run(JSON.stringify(history));
            if (publish) {
                db.prepare('UPDATE storefront_catalog SET draft=?,published=?,draft_categories=?,revision=revision+1 WHERE id=1').run(json, json, cats);
                db.prepare('UPDATE store_categories SET categories=? WHERE id=1').run(cats);
            } else db.prepare('UPDATE storefront_catalog SET draft=?,draft_categories=?,revision=revision+1 WHERE id=1').run(json, cats);
            db.exec('COMMIT'); transaction = false;
            res.json({ rows, categories, history, revision: saved.revision + 1 });
        } catch {
            if (transaction) db.exec('ROLLBACK');
            res.status(500).json({ message: 'Could not save catalog. Your changes have not been discarded. Please try again.' });
        }
    };
    app.put('/api/catalog/draft', admin, save(false)); app.post('/api/catalog/publish', admin, save(true));
}
module.exports = { registerCatalogWorkflow, validateCategories };
