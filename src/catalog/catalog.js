function validateRows(rows, publishing) {
    if (!Array.isArray(rows) || rows.length > 100) throw new Error("Invalid catalog rows.");
    const ids = new Set();
    return rows.map(row => {
        if (!Array.isArray(row) || row.length > 4) throw new Error("Each row can contain at most four items.");
        return row.map(item => {
            if (!item || typeof item !== "object" || !["string", "number"].includes(typeof item.id)) throw new Error("Invalid item.");
            const id = String(item.id);
            if (!id || ids.has(id)) throw new Error("Item IDs must be unique.");
            ids.add(id);
            const text = (key, limit) => {
                if (typeof item[key] !== "string" || item[key].length > limit) throw new Error("Invalid item details.");
                return item[key].trim();
            };
            const product = { id: item.id, name: text("name", 200), description: text("description", 2000),
                image: text("image", 1000), categoryId: text("categoryId", 200), price: item.price,
                cardWidth: item.cardWidth, imageHeight: item.imageHeight, imageZoom: item.imageZoom ?? 100 };
            if (item.subcategoryId !== undefined) {
                if (typeof item.subcategoryId !== 'string' || item.subcategoryId.length > 200) throw new Error('Invalid subcategory assignment.');
                product.subcategoryId = item.subcategoryId;
            }
            if (!Number.isFinite(product.price) || product.price < 0 ||
                !Number.isFinite(product.cardWidth) || product.cardWidth < 150 || product.cardWidth > 348 ||
                !Number.isFinite(product.imageHeight) || product.imageHeight < 100 || product.imageHeight > 300 ||
                !Number.isFinite(product.imageZoom) || product.imageZoom < 1 || product.imageZoom > 300) throw new Error("Invalid price or size.");
            if (publishing && (!product.name || !product.image)) throw new Error("Each item needs a name and image before publishing.");
            if (product.image && !/^(https?:\/\/|\/(?!\/))/.test(product.image)) throw new Error("Use an HTTP image URL or a local image path.");
            if (item.priceUnit !== undefined) {
                if (!["lb", "item"].includes(item.priceUnit)) throw new Error("Invalid item details.");
                product.priceUnit = item.priceUnit;
            }
            product.taxType = item.taxType ?? "general";
            for (const key of ["imageOffsetX", "imageOffsetY"]) {
                if (item[key] !== undefined) {
                    if (!Number.isFinite(item[key]) || Math.abs(item[key]) > 300) throw new Error("Invalid image position.");
                    product[key] = item[key];
                }
            }
            if (!["general", "food"].includes(product.taxType)) throw new Error("Invalid item details.");
            return product;
        });
    });
}

function registerCatalog(app, db) {
    db.exec('CREATE TABLE IF NOT EXISTS store_categories (id INTEGER PRIMARY KEY CHECK(id=1), categories TEXT)');
    db.prepare('INSERT OR IGNORE INTO store_categories(id) VALUES(1)').run();
    db.exec("CREATE TABLE IF NOT EXISTS storefront_catalog (id INTEGER PRIMARY KEY CHECK(id = 1), draft TEXT, published TEXT)");
    db.prepare("INSERT OR IGNORE INTO storefront_catalog (id) VALUES (1)").run();
    const admin = (req, res, next) => {
        if (req.session?.user?.role !== "admin") return res.status(403).json({ message: "Admin access only." });
        next();
    };
    require('./catalog-workflow').registerCatalogWorkflow(app, db, admin, validateRows);
    db.exec("CREATE TABLE IF NOT EXISTS store_tax_settings (id INTEGER PRIMARY KEY CHECK(id = 1), rate REAL NOT NULL)");
    db.prepare("INSERT OR IGNORE INTO store_tax_settings (id, rate) VALUES (1, 7)").run();
    const readTax = () => db.prepare('SELECT rate FROM store_tax_settings WHERE id = 1').get();
    app.get('/api/admin/me', admin, (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ loggedIn: true, user: req.session.user }); });
    app.get('/api/tax', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(readTax()); });
}
module.exports = { registerCatalog, validateRows };
