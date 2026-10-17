const translations = {

    en: {
        "Google sign-in failed. Please try again in your browser.": "Google sign-in failed. Please try again in your browser.",
        "Previous slide": "Previous slide", "Next slide": "Next slide",
        "Drag image to position": "Drag the image to position it, or use the arrow keys",
        "Edit slide": "Edit slide",
        "Store highlights": "Store highlights", "Pause": "Pause", "Play": "Play",
        "Tax": "Tax", "Tax (%)": "Tax (%)", "Tax saved. Applies to all products.": "Tax saved. Applies to all products.",
        "Each": "Each",
        "Close": "Close",
        "Image adjustments": "Image adjustments", "Left / right": "Left / right", "Up / down": "Up / down", "Reset image": "Reset image",
        "Search products": "Search products",
        "Image position (left / right)": "Image position (left / right)",
        "Price unit": "Price unit", "Per item": "Per item", "Per pound (lbs)": "Per pound (lbs)", "item": "item",
        "Do you want to log out?": "Do you want to log out?",
        products: "Products",
        cart: "Cart",
        signIn: "Sign In",
        signUp: "Sign Up",
        myAccount: "My Account",
        manageProducts: "Manage Products",
        logout: "Log Out",

        ourProducts: "Our Products",
        yourCart: "Your Cart",
        checkout: "Checkout",
        shippingInformation: "Shipping Information",
        payment: "Payment",
        orderSummary: "Order Summary",

        total: "Total",
        freeShipping: "FREE",
        payNow: "Pay Now",
        continueShopping: "Continue Shopping",

        productName: "Product Name",
        price: "Price",
        description: "Description",

        adminTitle: "HongKong Supermarket Admin",
        orders: "Orders",
        viewStore: "View Store",
        addProduct: "Add Product",
        currentProducts: "Current Products",
        customerOrders: "Customer Orders",

        email: "Email",
        password: "Password",
        confirmPassword: "Confirm Password",
        createAccount: "Create Account",
        returnStore: "Return to Store"
    },


    zh: {
        "Google sign-in failed. Please try again in your browser.": "Google 登录失败。请在浏览器中重试。",
        "Previous slide": "上一张", "Next slide": "下一张",
        "Drag image to position": "拖动图片调整位置，或使用方向键",
        "Edit slide": "编辑幻灯片",
        "Store highlights": "商店精选", "Pause": "暂停", "Play": "播放",
        "Tax": "税", "Tax (%)": "税率 (%)", "Tax saved. Applies to all products.": "税率已保存，适用于所有商品。",
        "Each": "每件",
        "Close": "关闭",
        "Image adjustments": "图片调整", "Left / right": "左 / 右", "Up / down": "上 / 下", "Reset image": "重置图片",
        "Search products": "搜索商品",
        "Image position (left / right)": "图片位置（左 / 右）",
        "Price unit": "价格单位", "Per item": "每件", "Per pound (lbs)": "每磅 (lbs)", "item": "件",
        "Do you want to log out?": "您要退出登录吗？",
        products: "商品",
        cart: "购物车",
        signIn: "登录",
        signUp: "注册",
        myAccount: "我的账户",
        manageProducts: "管理商品",
        logout: "退出登录",

        ourProducts: "我们的商品",
        yourCart: "您的购物车",
        checkout: "结账",
        shippingInformation: "配送信息",
        payment: "付款",
        orderSummary: "订单摘要",

        total: "总计",
        freeShipping: "免费",
        payNow: "立即付款",
        continueShopping: "继续购物",

        productName: "商品名称",
        price: "价格",
        description: "商品描述",

        adminTitle: "HongKong Supermarket 管理后台",
        orders: "订单",
        viewStore: "查看商店",
        addProduct: "添加商品",
        currentProducts: "当前商品",
        customerOrders: "客户订单",

        email: "电子邮箱",
        password: "密码",
        confirmPassword: "确认密码",
        createAccount: "创建账户",
        returnStore: "返回商店"
    }

};


Object.assign(translations.en, {"store":"Store","signedInAs":"You are signed in as:","accountContinue":"← Continue Shopping","returnArrow":"← Return to Store","displaySettings":"Display Settings","productManagement":"Product Management","productSettings":"Product Page Settings","saveSettings":"Save Display Settings","reset":"Reset","imageUrl":"Image URL","fullName":"Full Name","address":"Address","city":"City","state":"State","zip":"ZIP Code","proceedCheckout":"Proceed to Checkout","adminLogin":"Admin Login","adminSignIn":"Sign In as Admin","googleLogin":"Continue with Google","googleSignup":"Sign Up with Google","checkoutIntro":"Enter your email and shipping details to check out. No sign-in required."});
Object.assign(translations.zh, {"store":"商店","signedInAs":"您当前登录的账户：","accountContinue":"← 继续购物","returnArrow":"← 返回商店","displaySettings":"显示设置","productManagement":"商品管理","productSettings":"商品页面设置","saveSettings":"保存显示设置","reset":"重置","imageUrl":"图片链接","fullName":"姓名","address":"地址","city":"城市","state":"州／省","zip":"邮政编码","proceedCheckout":"前往结账","adminLogin":"管理员登录","adminSignIn":"管理员登录","googleLogin":"使用 Google 登录","googleSignup":"使用 Google 注册","checkoutIntro":"请输入电子邮箱和配送信息以完成结账，无需登录。"});

/* CHANGE LANGUAGE */

function changeLanguage(language) {

    localStorage.setItem(
        "language",
        language
    );

    applyLanguage(language);
    document.dispatchEvent(new Event("languagechange"));
    document.querySelectorAll('.language-choice').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    const selected = document.activeElement;
    if (selected instanceof HTMLSelectElement &&
        (selected.closest('.language-switcher') || ['account-language', 'language-select'].includes(selected.id))) {
        selected.blur();
    }

}

document.addEventListener('DOMContentLoaded', () => {
    for (const select of document.querySelectorAll('.language-switcher select, #account-language')) {
        let bar = select.closest('.language-switcher');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'language-switcher';
            select.before(bar);
            bar.appendChild(select);
        }
        bar.classList.add('language-integrated');
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Choose language');
        const globe = document.createElement('button');
        globe.type = 'button';
        globe.className = 'language-globe';
        globe.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>';
        globe.setAttribute('aria-label', 'Choose language');
        globe.setAttribute('aria-expanded', 'false');
        const choices = document.createElement('div');
        choices.className = 'language-globe-choices';
        choices.hidden = true;
        const close = () => { choices.hidden = true; globe.setAttribute('aria-expanded', 'false'); };
        globe.addEventListener('click', () => {
            choices.hidden = !choices.hidden;
            globe.setAttribute('aria-expanded', String(!choices.hidden));
            if (!choices.hidden) {
                choices.style.transform = '';
                const bounds = choices.getBoundingClientRect();
                // Keep the menu reachable when the globe is near a screen edge.
                const x = Math.max(0, 8 - bounds.left);
                const y = Math.min(0, window.innerHeight - 8 - bounds.bottom);
                choices.style.transform = `translate(${x}px, ${y}px)`;
            }
        });
        document.addEventListener('click', event => { if (!bar.contains(event.target)) close(); });
        bar.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); globe.focus(); } });
        bar.appendChild(globe);
        bar.appendChild(choices);
        select.hidden = true;
        for (const [value, label, name] of [['en', 'EN', 'English'], ['zh', '中文', '简体中文'], ['vi', 'VI', 'Tiếng Việt']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'language-choice';
            button.dataset.language = value;
            button.textContent = name;
            button.title = name;
            button.setAttribute('aria-label', name);
            button.setAttribute('aria-pressed', String(value === getSelectedLanguage()));
            button.addEventListener('click', () => { changeLanguage(value); close(); globe.focus(); globe.blur(); });
            choices.appendChild(button);
        }
    }
});

/* APPLY LANGUAGE */

function applyLanguage(language) {
    for (const select of document.querySelectorAll('.language-switcher select, #account-language')) {
        for (const [value, name, lang] of [['en', 'English', 'en'], ['zh', '简体中文', 'zh-Hans'], ['vi', 'Tiếng Việt', 'vi']]) {
            const option = select.querySelector('option[value="' + value + '"]');
            if (option) { option.textContent = name; option.lang = lang; }
        }
        select.value = language;
        select.setAttribute('aria-label', { en: 'Choose language', zh: '选择语言', vi: 'Chọn ngôn ngữ' }[language] || 'Choose language');
    }
    language = ["en", "zh", "vi"].includes(language) ? language : "en";
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        const key = element.getAttribute("data-i18n-placeholder");
        element.placeholder = translations[language][key] || key;
    });

    const elements =
        document.querySelectorAll(
            "[data-i18n]"
        );


    elements.forEach(element => {

        const key =
            element.getAttribute(
                "data-i18n"
            );


        if (
            translations[language] &&
            translations[language][key]
        ) {

            element.textContent =
                translations[language][key];

        }

    });


    const selector =
        document.getElementById(
            "language-select"
        );


    if (selector) {

        selector.value =
            language;

    }

}


/* LOAD SAVED LANGUAGE */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const savedLanguage =
            localStorage.getItem(
                "language"
            ) || "en";


        applyLanguage(
            savedLanguage
        );

    }
);

// UI phrases also serve as keys for messages returned by the server.
const interfacePhrases = {
    "Email or Username": "电子邮箱或用户名",
    "Admin Email": "管理员邮箱",
    "Admin Password": "管理员密码",
    "Don't have an account?": "还没有账户？",
    "Already have an account?": "已有账户？",
    "Sign in to your HongKong Supermarket account": "登录您的 HongKong Supermarket 账户",
    "Create a customer account": "创建顾客账户",
    "Management access only": "仅限管理员访问",
    "or": "或",
    "Loading...": "加载中…",
    "Please enter your email and password.": "请输入电子邮箱和密码。",
    "Signing in...": "正在登录…",
    "Could not connect to server.": "无法连接服务器。",
    "Please fill out all fields.": "请填写所有字段。",
    "Passwords do not match.": "两次输入的密码不一致。",
    "Password must be at least 8 characters.": "密码必须至少包含 8 个字符。",
    "Creating account...": "正在创建账户…",
    "Email and password are required.": "请输入电子邮箱和密码。",
    "An account already exists with this email.": "此邮箱已注册账户。",
    "Account created. Check your email to verify your account.": "账户已创建，请查收邮件并验证邮箱。",
    "Could not create account.": "无法创建账户。",
    "Incorrect email or password.": "邮箱或密码错误。",
    "Please verify your email first.": "请先验证您的邮箱。",
    "Login failed.": "登录失败。",
    "Enter admin email and password.": "请输入管理员邮箱和密码。",
    "Admin access only.": "仅限管理员访问。",
    "Admin login failed.": "管理员登录失败。",
    "Your cart is empty.": "您的购物车为空。",
    "Please fill out all information.": "请填写所有信息。",
    "Please enter product name, price, and image.": "请输入商品名称、价格和图片。",
    "Add to Cart": "加入购物车",
    "Remove": "删除",
    "Delete": "删除",
    "No orders yet.": "暂无订单。",
    "Settings saved!": "设置已保存！",
    "Settings reset.": "设置已重置。",
    "Product Image Height (px)": "商品图片高度（像素）",
    "Product Card Width (px)": "商品卡片宽度（像素）",
    "Products Per Row": "每行商品数量",
    "Space Between Products (px)": "商品间距（像素）",
    "1 Product": "1 件商品",
    "2 Products": "2 件商品",
    "3 Products": "3 件商品",
    "4 Products": "4 件商品",
    "5 Products": "5 件商品",
    "Example: Gaming Mouse": "例如：新鲜苹果",
    "Product description": "商品描述",
    "English name": "英文名称",
    "DEMO PAYMENT — no real card is charged.": "演示付款 — 不会实际扣款。",
    "Name on Card": "持卡人姓名",
    "Card Number": "银行卡号",
    "Expiration": "有效期",
    "MM/YY": "月／年",
    "CVV": "安全码",
    "Products:": "商品：",
    "Shipping: FREE": "配送：免费",
    "Total:": "总计：",
    "Order Number:": "订单编号：",
    "✅ Order Successful!": "✅ 下单成功！",
    "Thank you for your purchase.": "感谢您的购买。",
    "Customer:": "顾客：",
    "Email:": "邮箱：",
    "Status:": "状态：",
    "Paid": "已付款",
    "HongKong Supermarket User Login": "HongKong Supermarket 用户登录",
    "HongKong Supermarket Sign Up": "HongKong Supermarket 注册",
    "HongKong Supermarket Admin Login": "HongKong Supermarket 管理员登录",
    "HongKong Supermarket Cart": "HongKong Supermarket 购物车",
    "My Account - HongKong Supermarket": "我的账户 - HongKong Supermarket"
};
for (const [english, chinese] of Object.entries(interfacePhrases)) {
    translations.en[english] = english;
    translations.zh[english] = chinese;
}

function translateText(text) {
    const language = getSelectedLanguage();
    return translations[language][text] || text;
}

function setLocalizedMessage(element, text) {
    element.setAttribute("data-i18n", text);
    element.textContent = translateText(text);
}
function setAccountGreeting(element, firstName) {
    if (!element) return;
    element.dataset.accountFirstName = firstName || '';
    element.removeAttribute('data-i18n');
    if (element.dataset.accountIcon === 'true') {
        const label = firstName ? translateText('Hi, {name}').replace('{name}', firstName) : translateText('myAccount');
        element.setAttribute('aria-label', label);
        element.title = label;
        return;
    }
    element.textContent = firstName ? translateText('Hi, {name}').replace('{name}', firstName) : translateText('myAccount');
}
document.addEventListener('languagechange', () => {
    document.querySelectorAll('[data-account-first-name]').forEach(element => setAccountGreeting(element, element.dataset.accountFirstName));
});

// Apply the selected language to cart rows and messages inserted after page load.
document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => {
        observer.disconnect();
        applyLanguage(localStorage.getItem("language"));
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});

function getSelectedLanguage() {
    const language = localStorage.getItem("language");
    return ["en", "zh", "vi"].includes(language) ? language : "en";
}

for (const [key, zh, vi] of [
    ["Edit published product", "编辑已发布商品", "Chỉnh sửa sản phẩm đã đăng"],
    ["Edit Product", "编辑商品", "Chỉnh sửa sản phẩm"],
    ["New Product", "新商品", "Sản phẩm mới"],
    ["Republish Product", "重新发布商品", "Đăng lại sản phẩm"],
    ["Product republished.", "商品已重新发布。", "Đã đăng lại sản phẩm."],
    ["This product no longer exists.", "此商品已不存在。", "Sản phẩm này không còn tồn tại."],
    ["Drag to resize", "拖动调整大小", "Kéo để đổi kích thước"],
    ["Image height", "图片高度", "Chiều cao hình ảnh"],
    ["Drag the image handle to resize. Publish to save this product size.", "拖动图片下方的手柄调整大小，发布后保存此商品的尺寸。", "Kéo tay cầm bên dưới ảnh để đổi kích thước. Đăng sản phẩm để lưu kích thước."],
    ["Product Preview", "商品预览", "Xem trước sản phẩm"],
    ["Preview only. Publish when you are ready.", "仅供预览。准备好后再发布。", "Chỉ xem trước. Đăng khi bạn đã sẵn sàng."],
    ["Publish Product", "发布商品", "Đăng sản phẩm"],
    ["Product published.", "商品已发布。", "Đã đăng sản phẩm."],
    ["Image preview", "图片预览", "Xem trước hình ảnh"],
    ["Image could not be loaded.", "无法加载图片。", "Không thể tải hình ảnh."]
]) {
    translations.en[key] = key;
    translations.zh[key] = zh;
    // Vietnamese is assigned below, after its main dictionary is initialized.
}

translations.vi = {
    "Google sign-in failed. Please try again in your browser.": "Đăng nhập Google thất bại. Vui lòng thử lại trong trình duyệt.",
    "Previous slide": "Ảnh trước", "Next slide": "Ảnh tiếp theo",
    "Drag image to position": "Kéo ảnh để chỉnh vị trí hoặc dùng các phím mũi tên",
    "Edit slide": "Chỉnh sửa ảnh trình chiếu",
    "Store highlights": "Nổi bật tại cửa hàng", "Pause": "Tạm dừng", "Play": "Phát",
    "Tax": "Thuế", "Tax (%)": "Thuế (%)", "Tax saved. Applies to all products.": "Đã lưu thuế. Áp dụng cho tất cả sản phẩm.",
    "Each": "Mỗi sản phẩm",
    "Close": "Đóng",
    "Image adjustments": "Điều chỉnh ảnh", "Left / right": "Trái / phải", "Up / down": "Lên / xuống", "Reset image": "Đặt lại ảnh",
    "Search products": "Tìm kiếm sản phẩm",
    "Image position (left / right)": "Vị trí ảnh (trái / phải)",
    "Price unit": "Đơn vị giá", "Per item": "Mỗi sản phẩm", "Per pound (lbs)": "Mỗi pound (lbs)", "item": "sản phẩm",
    "Do you want to log out?": "Bạn có muốn đăng xuất không?",
    "Edit published product": "Chỉnh sửa sản phẩm đã đăng",
    "Edit Product": "Chỉnh sửa sản phẩm",
    "New Product": "Sản phẩm mới",
    "Republish Product": "Đăng lại sản phẩm",
    "Product republished.": "Đã đăng lại sản phẩm.",
    "This product no longer exists.": "Sản phẩm này không còn tồn tại.",
    "Drag to resize": "Kéo để đổi kích thước",
    "Image height": "Chiều cao hình ảnh",
    "Drag the image handle to resize. Publish to save this product size.": "Kéo tay cầm bên dưới ảnh để đổi kích thước. Đăng sản phẩm để lưu kích thước.",
    "Product Preview": "Xem trước sản phẩm",
    "Preview only. Publish when you are ready.": "Chỉ xem trước. Đăng khi bạn đã sẵn sàng.",
    "Publish Product": "Đăng sản phẩm",
    "Product published.": "Đã đăng sản phẩm.",
    "Image preview": "Xem trước hình ảnh",
    "Image could not be loaded.": "Không thể tải hình ảnh.",
    products: "Sản phẩm", cart: "Giỏ hàng", signIn: "Đăng nhập", signUp: "Đăng ký",
    myAccount: "Tài khoản của tôi", manageProducts: "Quản lý sản phẩm", logout: "Đăng xuất",
    ourProducts: "Sản phẩm của chúng tôi", yourCart: "Giỏ hàng của bạn", checkout: "Thanh toán",
    shippingInformation: "Thông tin giao hàng", payment: "Thanh toán", orderSummary: "Tóm tắt đơn hàng",
    total: "Tổng cộng", freeShipping: "MIỄN PHÍ", payNow: "Thanh toán ngay", continueShopping: "Tiếp tục mua sắm",
    productName: "Tên sản phẩm", price: "Giá", description: "Mô tả", adminTitle: "Quản trị HongKong Supermarket",
    orders: "Đơn hàng", viewStore: "Xem cửa hàng", addProduct: "Thêm sản phẩm", currentProducts: "Sản phẩm hiện có",
    customerOrders: "Đơn hàng của khách", email: "Địa chỉ email", password: "Mật khẩu", confirmPassword: "Xác nhận mật khẩu",
    createAccount: "Tạo tài khoản", returnStore: "Quay lại cửa hàng", store: "Cửa hàng",
    signedInAs: "Bạn đang đăng nhập bằng:", accountContinue: "← Tiếp tục mua sắm", returnArrow: "← Quay lại cửa hàng",
    displaySettings: "Cài đặt hiển thị", productManagement: "Quản lý sản phẩm", productSettings: "Cài đặt trang sản phẩm",
    saveSettings: "Lưu cài đặt hiển thị", reset: "Đặt lại", imageUrl: "Đường dẫn hình ảnh", fullName: "Họ và tên",
    address: "Địa chỉ", city: "Thành phố", state: "Tiểu bang / Tỉnh", zip: "Mã bưu chính",
    proceedCheckout: "Tiến hành thanh toán", adminLogin: "Đăng nhập quản trị", adminSignIn: "Đăng nhập quản trị",
    googleLogin: "Tiếp tục với Google", googleSignup: "Đăng ký bằng Google",
    checkoutIntro: "Nhập email và thông tin giao hàng để thanh toán. Không cần đăng nhập.",
    "Email or Username": "Email hoặc tên người dùng", "Admin Email": "Email quản trị", "Admin Password": "Mật khẩu quản trị",
    "Don't have an account?": "Bạn chưa có tài khoản?", "Already have an account?": "Bạn đã có tài khoản?",
    "Sign in to your HongKong Supermarket account": "Đăng nhập tài khoản HongKong Supermarket của bạn",
    "Create a customer account": "Tạo tài khoản khách hàng", "Management access only": "Chỉ dành cho quản trị viên",
    "or": "hoặc", "Loading...": "Đang tải…", "Please enter your email and password.": "Vui lòng nhập email và mật khẩu.",
    "Signing in...": "Đang đăng nhập…", "Could not connect to server.": "Không thể kết nối với máy chủ.",
    "Please fill out all fields.": "Vui lòng điền đầy đủ các trường.", "Passwords do not match.": "Mật khẩu không khớp.",
    "Password must be at least 8 characters.": "Mật khẩu phải có ít nhất 8 ký tự.", "Creating account...": "Đang tạo tài khoản…",
    "Email and password are required.": "Vui lòng nhập email và mật khẩu.",
    "An account already exists with this email.": "Email này đã được đăng ký.",
    "Account created. Check your email to verify your account.": "Đã tạo tài khoản. Kiểm tra email để xác minh tài khoản.",
    "Could not create account.": "Không thể tạo tài khoản.", "Incorrect email or password.": "Email hoặc mật khẩu không đúng.",
    "Please verify your email first.": "Vui lòng xác minh email trước.", "Login failed.": "Đăng nhập thất bại.",
    "Enter admin email and password.": "Nhập email và mật khẩu quản trị.", "Admin access only.": "Chỉ dành cho quản trị viên.",
    "Admin login failed.": "Đăng nhập quản trị thất bại.", "Your cart is empty.": "Giỏ hàng của bạn đang trống.",
    "Please fill out all information.": "Vui lòng điền đầy đủ thông tin.",
    "Please enter product name, price, and image.": "Vui lòng nhập tên, giá và hình ảnh sản phẩm.",
    "Add to Cart": "Thêm vào giỏ hàng", "Remove": "Xóa", "Delete": "Xóa", "No orders yet.": "Chưa có đơn hàng.",
    "Settings saved!": "Đã lưu cài đặt!", "Settings reset.": "Đã đặt lại cài đặt.",
    "Product Image Height (px)": "Chiều cao hình ảnh sản phẩm (px)", "Product Card Width (px)": "Chiều rộng thẻ sản phẩm (px)",
    "Products Per Row": "Số sản phẩm mỗi hàng", "Space Between Products (px)": "Khoảng cách giữa sản phẩm (px)",
    "1 Product": "1 sản phẩm", "2 Products": "2 sản phẩm", "3 Products": "3 sản phẩm", "4 Products": "4 sản phẩm", "5 Products": "5 sản phẩm",
    "Example: Gaming Mouse": "Ví dụ: Chuột chơi game", "Product description": "Mô tả sản phẩm", "English name": "Tên tiếng Anh",
    "DEMO PAYMENT — no real card is charged.": "THANH TOÁN THỬ — không trừ tiền trên thẻ thật.",
    "Name on Card": "Tên trên thẻ", "Card Number": "Số thẻ", "Expiration": "Ngày hết hạn", "MM/YY": "Tháng/Năm", "CVV": "Mã bảo mật",
    "Products:": "Sản phẩm:", "Shipping: FREE": "Giao hàng: MIỄN PHÍ", "Total:": "Tổng cộng:", "Order Number:": "Mã đơn hàng:",
    "✅ Order Successful!": "✅ Đặt hàng thành công!", "Thank you for your purchase.": "Cảm ơn bạn đã mua hàng.",
    "Customer:": "Khách hàng:", "Email:": "Email:", "Status:": "Trạng thái:", "Paid": "Đã thanh toán",
    "HongKong Supermarket User Login": "Đăng nhập HongKong Supermarket", "HongKong Supermarket Sign Up": "Đăng ký HongKong Supermarket",
    "HongKong Supermarket Admin Login": "Đăng nhập quản trị HongKong Supermarket", "HongKong Supermarket Cart": "Giỏ hàng HongKong Supermarket",
    "My Account - HongKong Supermarket": "Tài khoản của tôi - HongKong Supermarket",
    settings: "Cài đặt", category: "Danh mục", categorySettings: "Danh mục sản phẩm",
    categoryHelp: "Thêm danh mục và nhập tên tiếng Anh, Trung và Việt. Gán danh mục trong Quản lý sản phẩm.",
    addCategory: "Thêm danh mục", slideDuration: "Thời gian trượt (mili giây)", saveAllSettings: "Lưu tất cả cài đặt",
    "Category": "Danh mục", "All Products": "Tất cả sản phẩm", "Uncategorized": "Chưa phân loại",
    "Fresh Produce": "Rau củ quả tươi", "Groceries": "Thực phẩm", "Drinks": "Đồ uống",
    "Enter a value within the allowed range.": "Nhập giá trị trong phạm vi cho phép.",
    "Each category needs unique English, Chinese, and Vietnamese names.": "Mỗi danh mục cần tên riêng bằng tiếng Anh, Trung và Việt.",
    "All settings saved.": "Đã lưu tất cả cài đặt.", "All settings reset.": "Đã đặt lại tất cả cài đặt.",
    "No products in this category yet.": "Danh mục này chưa có sản phẩm.",
    "Chinese name": "Tên tiếng Trung", "Vietnamese name": "Tên tiếng Việt"
};
for (const [key, zh] of Object.entries({
    "Chinese name": "中文名称", "Vietnamese name": "越南语名称", "No products in this category yet.": "此分类暂无商品",
    "Each category needs unique English, Chinese, and Vietnamese names.": "每个分类需要不重复的英文、中文和越南语名称。"
})) {
    translations.en[key] = key;
    translations.zh[key] = zh;
}

for (const [key, zh, vi] of [
    ["100% uses the image URL's original size.", "100% 使用图片链接的原始尺寸。", "100% sử dụng kích thước gốc của hình ảnh từ URL."],
    ["Welcome to our store", "欢迎光临", "Chào mừng đến với cửa hàng"],
    ["Welcome to HongKong Supermarket", "欢迎来到 HongKong Supermarket", "Chào mừng đến với HongKong Supermarket"],
    ["Fresh choices Everyday essentials A warm welcome", "新鲜好物 日常所需 热情欢迎", "Lựa chọn tươi ngon Nhu yếu phẩm hằng ngày Chào đón bạn"],
    ["Enter Store", "进入商店", "Vào cửa hàng"],
    ["Image Zoom", "图片缩放", "Thu phóng hình ảnh"],
    ["Zoom In", "放大", "Phóng to"],
    ["Zoom Out", "缩小", "Thu nhỏ"],
    ["Reset Zoom", "重置缩放", "Đặt lại thu phóng"],
    ["Storefront Editor", "商店页面编辑器", "Chỉnh sửa trang cửa hàng"],
    ["Save Draft", "保存草稿", "Lưu bản nháp"],
    ["Publish All", "发布全部", "Đăng tất cả"],
    ["Add New Item", "添加新商品", "Thêm mặt hàng mới"],
    ["Row", "行", "Hàng"],
    ["Save keeps your draft private. Publish updates the whole customer catalog.", "保存仅保留管理员草稿。发布会更新顾客看到的全部商品。", "Lưu giữ bản nháp riêng tư. Đăng sẽ cập nhật toàn bộ danh mục khách hàng."],
    ["Unsaved changes.", "有未保存的修改。", "Có thay đổi chưa lưu."],
    ["Publish this entire draft to the customer product page?", "确认将整个草稿发布到顾客商品页面？", "Đăng toàn bộ bản nháp này lên trang sản phẩm của khách hàng?"],
    ["Catalog published.", "全部商品已发布。", "Đã đăng danh mục."],
    ["Draft saved. Customers cannot see this draft.", "草稿已保存，顾客无法看到此草稿。", "Đã lưu bản nháp. Khách hàng không thể xem bản nháp này."],
    ["Could not save catalog.", "无法保存商品目录。", "Không thể lưu danh mục."],
    ["Could not load catalog.", "无法加载商品目录。", "Không thể tải danh mục."],
    ["Invalid catalog rows.", "商品行无效。", "Các hàng danh mục không hợp lệ."],
    ["Each row can contain at most four items.", "每行最多包含四件商品。", "Mỗi hàng chứa tối đa bốn mặt hàng."],
    ["Invalid item.", "商品无效。", "Mặt hàng không hợp lệ."],
    ["Item IDs must be unique.", "商品编号必须唯一。", "Mã mặt hàng phải khác nhau."],
    ["Invalid item details.", "商品信息无效。", "Thông tin mặt hàng không hợp lệ."],
    ["Invalid price or size.", "价格或尺寸无效。", "Giá hoặc kích thước không hợp lệ."],
    ["Each item needs a name and image before publishing.", "发布前，每件商品都需要名称和图片。", "Mỗi mặt hàng cần tên và hình ảnh trước khi đăng."],
    ["Use an HTTP image URL or a local image path.", "请使用 HTTP 图片链接或本地图片路径。", "Sử dụng URL hình ảnh HTTP hoặc đường dẫn hình ảnh cục bộ."]
]) {
    translations.en[key] = key;
    translations.zh[key] = zh;
    translations.vi[key] = vi;
}
translations.en.returnProducts = "Return";
for (const [en, zh, vi] of [
    ['Your sign-in changed in another tab. Reload this page before continuing.', '其他标签页中的登录账户已更改。请刷新此页面后继续。', 'Tài khoản đăng nhập đã thay đổi ở tab khác. Hãy tải lại trang trước khi tiếp tục.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.en['Reply from HongKong Supermarket'] = 'Reply from HongKong Supermarket';
translations.zh['Reply from HongKong Supermarket'] = 'HongKong Supermarket 的回复';
translations.vi['Reply from HongKong Supermarket'] = 'Trả lời từ HongKong Supermarket';
for (const [en, zh, vi] of [
    ['Reply', '回复', 'Trả lời'], ['Send Reply', '发送回复', 'Gửi trả lời'], ['Reply sent.', '回复已发送。', 'Đã gửi trả lời.'],
    ['Enter a reply of up to 5000 characters.', '请输入不超过5000个字符的回复。', 'Nhập câu trả lời tối đa 5000 ký tự.'],
    ['Message not found.', '未找到留言。', 'Không tìm thấy tin nhắn.'],
    ['A reply is already being sent.', '回复正在发送。', 'Câu trả lời đang được gửi.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.en['Admin Email'] = 'Email'; translations.zh['Admin Email'] = '邮件'; translations.vi['Admin Email'] = 'Email';
translations.en['No messages yet.'] = 'No messages yet.'; translations.zh['No messages yet.'] = '暂无留言。'; translations.vi['No messages yet.'] = 'Chưa có tin nhắn.';
translations.en['Could not load messages.'] = 'Could not load messages.'; translations.zh['Could not load messages.'] = '无法加载留言。'; translations.vi['Could not load messages.'] = 'Không thể tải tin nhắn.';
for (const [en, zh, vi] of [
    ['Send Message', '发送留言', 'Gửi tin nhắn'],
    ['First Name', '名字', 'Tên'],
    ['Last Name', '姓氏', 'Họ'],
    ['Add image', '添加图片', 'Thêm hình ảnh'],
    ['Add image (optional)', '添加图片（可选）', 'Thêm hình ảnh (không bắt buộc)'],
    ['iPhone and Android photos, up to 10 MB (optional).', 'iPhone和安卓照片，最大10 MB（可选）。', 'Ảnh iPhone và Android, tối đa 10 MB (không bắt buộc).'],
    ['Choose a JPG, PNG, WebP, HEIC, HEIF or AVIF photo up to 10 MB.', '请选择不超过10 MB的JPG、PNG、WebP、HEIC、HEIF或AVIF照片。', 'Chọn ảnh JPG, PNG, WebP, HEIC, HEIF hoặc AVIF tối đa 10 MB.'],
    ['Photo processing is busy. Please try again shortly.', '照片处理繁忙，请稍后重试。', 'Đang bận xử lý ảnh. Vui lòng thử lại sau.'],
    ['Product name', '商品名称', 'Tên sản phẩm'],
    ['Product name (optional)', '商品名称（可选）', 'Tên sản phẩm (không bắt buộc)'],
    ['Add a product name or image.', '请添加商品名称或图片。', 'Thêm tên sản phẩm hoặc hình ảnh.'],
    ['PNG, JPG or WebP, up to 1 MB (optional).', 'PNG、JPG或WebP，最大1 MB（可选）。', 'PNG, JPG hoặc WebP, tối đa 1 MB (không bắt buộc).'],
    ['Enter a product name.', '请输入商品名称。', 'Vui lòng nhập tên sản phẩm.'],
    ['Choose a PNG, JPG or WebP image up to 1 MB.', '请选择不超过1 MB的PNG、JPG或WebP图片。', 'Chọn hình PNG, JPG hoặc WebP tối đa 1 MB.'],
    ['Could not read image. Please choose it again.', '无法读取图片，请重新选择。', 'Không thể đọc hình ảnh. Vui lòng chọn lại.'],
    ['Send verification code', '发送验证码', 'Gửi mã xác minh'],
    ['Verification code', '验证码', 'Mã xác minh'],
    ['Verify email', '验证邮箱', 'Xác minh email'],
    ['Verify your email before sending.', '请先验证邮箱再发送留言。', 'Vui lòng xác minh email trước khi gửi.'],
    ['Verification code sent. It expires in 10 minutes.', '验证码已发送，10分钟内有效。', 'Đã gửi mã xác minh. Mã hết hạn sau 10 phút.'],
    ['Email verified. Click Send Message to send your message.', '邮箱已验证。请点击发送留言。', 'Email đã được xác minh. Nhấn Gửi tin nhắn để gửi.'],
    ['Wait one minute before requesting another code.', '请等待一分钟再获取验证码。', 'Chờ một phút trước khi yêu cầu mã mới.'],
    ['Could not send verification email. Please try again later.', '无法发送验证邮件，请稍后重试。', 'Không thể gửi email xác minh. Vui lòng thử lại sau.'],
    ['Could not verify email. Please try again later.', '无法验证邮箱，请稍后重试。', 'Không thể xác minh email. Vui lòng thử lại sau.'],
    ['Could not load contact form. Please refresh.', '无法加载联系表单，请刷新页面。', 'Không thể tải biểu mẫu liên hệ. Vui lòng tải lại trang.'],
    ['Sending verification code...', '正在发送验证码...', 'Đang gửi mã xác minh...'],
    ['Sent', '已发送', 'Đã gửi'],
    ['Sending your message...', '正在发送留言...', 'Đang gửi tin nhắn...'],
    ['Your message has been sent. Thank you!', '您的留言已发送，谢谢！', 'Tin nhắn của bạn đã được gửi. Cảm ơn!'],
    ['Could not send your message. Please try again later.', '无法发送留言，请稍后重试。', 'Không thể gửi tin nhắn. Vui lòng thử lại sau.'],
    ['Please fill out all contact fields correctly.', '请正确填写所有联系信息。', 'Vui lòng điền đúng tất cả thông tin liên hệ.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.en.welcomeTo = 'Welcome to';
translations.zh.welcomeTo = '欢迎来到';
translations.vi.welcomeTo = 'Chào mừng đến với';
translations.en['Partnership Inquiry'] = 'Partnership Inquiry';
translations.zh['Partnership Inquiry'] = '合作咨询';
translations.vi['Partnership Inquiry'] = 'Liên hệ hợp tác';
for (const [en, zh, vi] of [
    ['Partnership', '合作', 'Hợp tác'],
    ['Order or Item Request', '订单或商品需求', 'Yêu cầu đơn hàng hoặc sản phẩm'],
    ['Email Us', '邮件联系', 'Email'],
    ['Your Message', '您的留言', 'Nội dung tin nhắn'],
    ['Open Email App', '打开邮件应用', 'Mở ứng dụng email'],
    ['Contact email will be available soon.', '联系邮箱即将开放。', 'Email liên hệ sẽ sớm được cung cấp.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.en.menu = 'Menu'; translations.zh.menu = '菜单'; translations.vi.menu = 'Danh mục';
translations.en.storeLocation = 'Store Location';
translations.zh.storeLocation = '门店位置';
translations.vi.storeLocation = 'Địa điểm cửa hàng';
translations.en['Show Password'] = 'Show Password';
translations.en['Search items'] = 'Search items';
translations.en['Add New Category'] = 'Add New Category';
translations.en['Unsave'] = 'Unsave';
for (const [en, zh, vi] of [
    ['Unsaved Changes', '未保存的更改', 'Thay đổi chưa lưu'],
    ['Stay', '留下', 'Ở lại'],
    ['Discard Changes', '放弃更改', 'Bỏ thay đổi'],
    ['Stay to keep editing, or discard your unsaved product changes.', '留下以继续编辑，或放弃未保存的商品更改。', 'Ở lại để tiếp tục chỉnh sửa hoặc bỏ các thay đổi sản phẩm chưa lưu.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.zh['Unsave'] = '未保存';
translations.vi['Unsave'] = 'Chưa lưu';
translations.en['Remove?'] = 'Remove?';
translations.zh['Remove?'] = '删除？';
translations.vi['Remove?'] = 'Xóa?';
translations.zh['Add New Category'] = '添加新分类';
translations.vi['Add New Category'] = 'Thêm danh mục mới';
translations.en['Category Name'] = 'Category Name';
translations.zh['Category Name'] = '分类名称';
translations.vi['Category Name'] = 'Tên danh mục';
translations.en['Order Summary'] = 'Order Summary';
translations.zh['Order Summary'] = '订单摘要';
translations.vi['Order Summary'] = 'Tóm tắt đơn hàng';
translations.en['Items'] = 'Items';
translations.zh['Items'] = '商品';
translations.vi['Items'] = 'Sản phẩm';
translations.en['Add more items'] = 'Add more items';
translations.zh['Add more items'] = '添加更多商品';
translations.vi['Add more items'] = 'Thêm sản phẩm';
translations.en['Add item'] = 'Add item';
translations.zh['Add item'] = '添加商品';
translations.vi['Add item'] = 'Thêm sản phẩm';
translations.en['View all results'] = 'View all results';
translations.zh['View all results'] = '查看所有结果';
translations.vi['View all results'] = 'Xem tất cả kết quả';
translations.en['See All'] = 'See All';
translations.zh['See All'] = '查看全部';
translations.vi['See All'] = 'Xem tất cả';
translations.en['Previous items'] = 'Previous items';
translations.zh['Previous items'] = '上一组商品';
translations.vi['Previous items'] = 'Sản phẩm trước';
translations.en['Next items'] = 'Next items';
translations.zh['Next items'] = '下一组商品';
translations.vi['Next items'] = 'Sản phẩm tiếp theo';
translations.en['Search HongKong Supermarket'] = 'Search HongKong Supermarket';
translations.zh['Search HongKong Supermarket'] = '搜索 HongKong Supermarket';
translations.vi['Search HongKong Supermarket'] = 'Tìm kiếm HongKong Supermarket';
translations.zh['Search items'] = '搜索商品';
translations.vi['Search items'] = 'Tìm sản phẩm';
translations.en['No matching items found.'] = 'No matching items found.';
translations.zh['No matching items found.'] = '没有找到匹配的商品。';
translations.vi['No matching items found.'] = 'Không tìm thấy sản phẩm phù hợp.';
translations.en.accountPasswordHelp = 'This is your sign-in password. It cannot be displayed. Change it using an emailed verification code.';
translations.zh.accountPasswordHelp = '这是您的登录密码，无法显示。您可以通过电子邮件验证码修改密码。';
translations.vi.accountPasswordHelp = 'Đây là mật khẩu đăng nhập của bạn và không thể hiển thị. Bạn có thể đổi mật khẩu bằng mã xác minh gửi qua email.';
translations.zh['Show Password'] = '显示密码';
translations.vi['Show Password'] = 'Hiện mật khẩu';
translations.en['Hi, {name}'] = 'Hi, {name}';
translations.zh['Hi, {name}'] = '你好，{name}';
translations.vi['Hi, {name}'] = 'Xin chào, {name}';
translations.en.Verify = 'Verify'; translations.zh.Verify = '验证'; translations.vi.Verify = 'Xác minh';
translations.en['Code Send'] = 'Code Send'; translations.zh['Code Send'] = '验证码已发送'; translations.vi['Code Send'] = 'Đã gửi mã';
for (const [en, zh, vi] of [
    ['Email Request Limit', '邮件请求限制', 'Giới hạn yêu cầu email'],
    ['Request Limits', '请求限制', 'Giới hạn yêu cầu'],
    ['Enable request limits for email verification, password resets, and contact messages.', '启用邮箱验证、密码重置和联系留言的请求限制。', 'Bật giới hạn yêu cầu cho xác minh email, đặt lại mật khẩu và tin nhắn liên hệ.'],
    ['Turn Off Request Limit', '关闭请求限制', 'Tắt giới hạn yêu cầu'],
    ['Turn On Request Limit', '开启请求限制', 'Bật giới hạn yêu cầu'],
    ['Limit email verification and password requests to 30 per 15 minutes.', '每15分钟最多允许30次邮箱验证和密码请求。', 'Giới hạn 30 yêu cầu xác minh email và mật khẩu mỗi 15 phút.']
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
translations.en['Your new password must be different from your current password.'] = 'Your new password must be different from your current password.';
translations.zh['Your new password must be different from your current password.'] = '新密码必须与当前密码不同。';
translations.vi['Your new password must be different from your current password.'] = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
translations.en['Please wait {seconds} seconds.'] = 'Please wait {seconds} seconds.';
translations.zh['Please wait {seconds} seconds.'] = '请等待{seconds}秒。';
translations.vi['Please wait {seconds} seconds.'] = 'Vui lòng đợi {seconds} giây.';
translations.en['Check your email for a verification code.'] = 'Check your email for a verification code.';
translations.zh['Check your email for a verification code.'] = '请查看邮箱中的验证码。';
translations.vi['Check your email for a verification code.'] = 'Kiểm tra email để nhận mã xác minh.';
translations.en['Request a new code in {seconds} seconds.'] = 'Request a new code in {seconds} seconds.';
translations.zh['Request a new code in {seconds} seconds.'] = '{seconds}秒后可重新获取验证码。';
translations.vi['Request a new code in {seconds} seconds.'] = 'Bạn có thể yêu cầu mã mới sau {seconds} giây.';
for (const [en, zh, vi] of [
    ["Verify Email", "验证邮箱", "Xác minh email"],
    ["Change Password", "修改密码", "Đổi mật khẩu"],
    ["Reset Password", "重置密码", "Đặt lại mật khẩu"],
    ["Forgot Password?", "忘记密码？", "Quên mật khẩu?"],
    ["Send Code", "发送验证码", "Gửi mã"],
    ["Confirm Code", "确认验证码", "Xác nhận mã"],
    ["Verification Code", "验证码", "Mã xác minh"],
    ["New Password", "新密码", "Mật khẩu mới"],
    ["Codes expire in 10 minutes. Request another after 60 seconds.", "验证码10分钟后失效，60秒后可重新发送。", "Mã hết hạn sau 10 phút. Yêu cầu mã mới sau 60 giây."],
    ["Check your email for your verification code.", "请查看邮箱中的验证码。", "Kiểm tra email để nhận mã xác minh."],
    ["Check your email for a verification code. You can request a new code in 60 seconds.", "请查看邮箱中的验证码。60秒后可重新获取验证码。", "Kiểm tra email để nhận mã xác minh. Bạn có thể yêu cầu mã mới sau 60 giây."],
    ["Invalid or expired code. Request a new code.", "验证码无效或已过期，请重新获取。", "Mã không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới."],
    ["Email verified. You can now sign in.", "邮箱已验证，您现在可以登录。", "Email đã được xác minh. Bạn có thể đăng nhập."],
    ["Password updated. Sign in with your new password.", "密码已更新，请使用新密码登录。", "Đã cập nhật mật khẩu. Đăng nhập bằng mật khẩu mới."],
    ["Use a valid email and a password of 8–72 characters.", "请输入有效邮箱和8至72个字符的密码。", "Nhập email hợp lệ và mật khẩu từ 8–72 ký tự."],
    ["Could not send email. Please try again later.", "无法发送邮件，请稍后重试。", "Không thể gửi email. Vui lòng thử lại sau."],
    ["Too many requests. Please try again later.", "请求过多，请稍后重试。", "Quá nhiều yêu cầu. Vui lòng thử lại sau."]
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
for (const [key, en, zh, vi] of [
    ["accountBackground", "Background", "背景", "Nền"],
    ["backgroundClassic", "Classic", "经典", "Cổ điển"],
    ["backgroundGreen", "Warm Pink & Purple", "暖粉紫色", "Hồng và tím ấm"],
    ["backgroundBlue", "Soft Blue", "柔和蓝色", "Xanh dương dịu"],
    ["backgroundWarm", "Warm Cream", "暖米色", "Màu kem ấm"]
]) { translations.en[key] = en; translations.zh[key] = zh; translations.vi[key] = vi; }
translations.en.settings = "Settings";
translations.zh.settings = "设置";
translations.en.accountLanguage = "Preferred language";
translations.zh.accountLanguage = "首选语言";
translations.vi.accountLanguage = "Ngôn ngữ ưu tiên";
for (const [en, zh, vi] of [["Remove this item?", "移除此商品？", "Xóa sản phẩm này?"], ["Yes", "是", "Có"], ["No", "否", "Không"]]) {
    translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi;
}
translations.en["Tax:"] = "Tax:";
translations.zh["Tax:"] = "税费：";
translations.vi["Tax:"] = "Thuế:";
for (const [en, zh, vi] of [
    ["Subtotal:", "小计：", "Tạm tính:"],
    ["Winterville, NC tax:", "北卡罗来纳州 Winterville 税费：", "Thuế Winterville, NC:"],
    ["Tax type", "税务类型", "Loại thuế"],
    ["General items (7%)", "普通商品（7%）", "Hàng thông thường (7%)"],
    ["Qualifying groceries (2%)", "符合条件的食品（2%）", "Thực phẩm đủ điều kiện (2%)"],
    ["7% general items; 2% qualifying groceries. Unclassified items use 7%.", "普通商品7%；符合条件的食品2%。未分类商品按7%计算。", "7% cho hàng thông thường; 2% cho thực phẩm đủ điều kiện. Hàng chưa phân loại áp dụng 7%."]
]) { translations.en[en] = en; translations.zh[en] = zh; translations.vi[en] = vi; }
for (const [key, en, zh, vi] of [
    ["cartItem", "Item", "商品", "Sản phẩm"],
    ["cartQuantity", "Quantity", "数量", "Số lượng"],
    ["cartItemTotal", "Subtotal", "小计", "Thành tiền"],
    ["cartActions", "Actions", "操作", "Thao tác"],
    ["Decrease quantity", "Decrease quantity", "减少数量", "Giảm số lượng"],
    ["Increase quantity", "Increase quantity", "增加数量", "Tăng số lượng"]
]) {
    translations.en[key] = en; translations.zh[key] = zh; translations.vi[key] = vi;
}
translations.en["Add In Cart"] = "Add In Cart";
translations.zh["Add In Cart"] = "已加入购物车";
translations.vi["Add In Cart"] = "Đã thêm vào giỏ hàng";
translations.en.accountReturn = "Return";
translations.zh.accountReturn = "返回";
translations.vi.accountReturn = "Quay lại";
for (const [key, en, zh, vi] of [
    ["firstName", "First Name", "名", "Tên"],
    ["lastName", "Last Name", "姓", "Họ"],
    ["optionalPhone", "Phone Number (optional)", "电话号码（选填）", "Số điện thoại (không bắt buộc)"],
    ["saveProfile", "Save", "保存", "Lưu"],
    ["Account saved.", "Account saved.", "账户信息已保存。", "Đã lưu thông tin tài khoản."],
    ["Could not load account.", "Could not load account.", "无法加载账户信息。", "Không thể tải thông tin tài khoản."],
    ["Could not save account.", "Could not save account.", "无法保存账户信息。", "Không thể lưu thông tin tài khoản."],
    ["Enter your first and last name and a valid optional phone number.", "Enter your first and last name and a valid optional phone number.", "请输入姓名及有效的电话号码（选填）。", "Nhập họ tên và số điện thoại hợp lệ (không bắt buộc)."]
]) {
    translations.en[key] = en;
    translations.zh[key] = zh;
    translations.vi[key] = vi;
}
translations.en.adminSigninHint = "Admins can sign in here with their admin email and password.";
translations.zh.adminSigninHint = "管理员可以使用管理员邮箱和密码在此登录。";
translations.vi.adminSigninHint = "Quản trị viên có thể đăng nhập tại đây bằng email và mật khẩu quản trị viên.";
translations.zh.returnProducts = "返回";
translations.vi.returnProducts = "Quay lại";
for (const [en, zh, vi] of [
    ['Save changes before publishing.', '请先保存更改，再发布。', 'Vui lòng lưu thay đổi trước khi xuất bản.'],
    ['Discard changes?', '放弃更改？', 'Hủy thay đổi?'],
    ['History', '历史记录', 'Lịch sử'],
    ['Restore', '恢复', 'Khôi phục'],
    ['No removed categories.', '没有已移除的分类。', 'Không có danh mục đã xóa.'],
    ['Please fill out this field.', '请填写此字段。', 'Vui lòng điền vào trường này.'],
    ['Please include an @ in the email address.', '请在电子邮箱地址中包含 @ 符号。', 'Vui lòng thêm ký tự @ vào địa chỉ email.'],
    ['Please enter a valid email address.', '请输入有效的电子邮箱地址。', 'Vui lòng nhập địa chỉ email hợp lệ.'],
    ['Enter a 6-digit verification code.', '请输入六位数字验证码。', 'Vui lòng nhập mã xác minh gồm 6 chữ số.'],
    ['Please use at least {min} characters.', '请至少输入 {min} 个字符。', 'Vui lòng nhập ít nhất {min} ký tự.'],
    ['Publsih?', '发布？', 'Xuất bản?'],
    ['Publish', '发布', 'Xuất bản'],
    ['Save', '保存', 'Lưu'],
    ['Saving...', '正在保存...', 'Đang lưu...'],
    ['Publishing...', '正在发布...', 'Đang xuất bản...'],
    ['Published', '已发布', 'Đã xuất bản'],
    ['Discarding...', '正在放弃更改...', 'Đang hủy thay đổi...'],
    ['Discarded', '已放弃更改', 'Đã hủy thay đổi'],
    ['Quantity', '数量', 'Số lượng'],
    ['All', '全部', 'Tất cả'],
    ['Subcategory', '子分类', 'Danh mục con'],
    ['Add Subcategory', '添加子分类', 'Thêm danh mục con'],
    ['Edit Subcategory', '编辑子分类', 'Sửa danh mục con'],
    ['Subcategory Name', '子分类名称', 'Tên danh mục con'],
    ['No subcategory', '无子分类', 'Không có danh mục con'],
    ['Manage Subcategories', '管理子分类', 'Quản lý danh mục con'],
    ['Remove subcategory?', '移除子分类？', 'Xóa danh mục con?'],
    ['{count} products will keep their parent category.', '{count} 件商品将保留在原分类中。', '{count} sản phẩm vẫn ở danh mục chính.'],
    ['Subcategory names must be nonempty and unique.', '子分类名称不能为空或重复。', 'Tên danh mục con không được trống hoặc trùng lặp.'],
    ['Availability not provided', '未提供库存信息', 'Chưa có thông tin tồn kho'],
    ['Could not add item. Please try again.', '无法添加商品，请重试。', 'Không thể thêm sản phẩm. Vui lòng thử lại.']
]) {
    translations.en[en] = en;
    translations.zh[en] = zh;
    translations.vi[en] = vi;
}
