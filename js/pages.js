const api = (path, options = {}) => fetch(path, options).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Request failed'); return data; });
const getSession = () => { try { return JSON.parse(localStorage.getItem('greenlife-session') || 'null'); } catch { return null; } };
const customerPages = ['/index.html', '/shop.html', '/product.html', '/checkout.html', '/account.html', '/order-details.html', '/delivery.html'];
const adminPages = ['/admin.html'];
const publicPages = ['/login.html', '/'];
const currentPath = window.location.pathname;
const session = getSession();
function showAccessNotice(message, redirectUrl) {
  const existing = document.querySelector('#access-gate');
  if (existing) return;
  const gate = document.createElement('div');
  gate.id = 'access-gate';
  gate.className = 'access-gate';
  gate.innerHTML = `
    <div class="access-gate-card">
      <div class="access-gate-mark">G</div>
      <p class="eyebrow">Please sign in</p>
      <h2>${message}</h2>
      <p>Redirecting you to GreenLife sign in…</p>
    </div>
  `;
  document.body.prepend(gate);
  setTimeout(() => { window.location.href = redirectUrl; }, 1500);
}
if (!publicPages.includes(currentPath)) {
  if (!session?.token) {
    showAccessNotice('Sign in to continue shopping and placing orders.', '/login.html');
  } else if (adminPages.includes(currentPath) && session.role !== 'admin') {
    showAccessNotice('Admin access is required for this page.', '/login.html');
  } else if (customerPages.includes(currentPath) && !['customer', 'admin'].includes(session.role)) {
    showAccessNotice('Customer sign in is required for this page.', '/login.html');
  }
}
const customerKey = localStorage.getItem('greenlife-customer') || `guest-${crypto.randomUUID()}`;
localStorage.setItem('greenlife-customer', customerKey);
const money = value => `Rs. ${Number(value).toLocaleString('en-IN')}`;
const cart = () => { try { const stored = JSON.parse(localStorage.getItem('greenlife-cart') || '[]'); return Array.isArray(stored) ? stored : []; } catch { return []; } };
const saveCart = value => localStorage.setItem('greenlife-cart', JSON.stringify(value));

function siteChrome() {
  const header = document.querySelector('#site-header');
  const footer = document.querySelector('#site-footer');
  const operationsLink = session?.role === 'admin' && session?.token ? '<a href="admin.html#orders-table">Orders &amp; Delivery</a>' : '<a href="order-details.html">Order details</a><a href="delivery.html">Delivery</a>';
  if (header) header.innerHTML = `<div class="announcement"><span>Free delivery on orders over Rs. 999</span><span class="announcement-detail">Certified organic products, thoughtfully sourced</span></div><header class="site-header"><a class="brand" href="/index.html"><span class="brand-mark">G</span><span>green<span>life</span></span></a><nav class="main-nav"><a href="shop.html">Shop</a><a href="account.html">My account</a><a href="admin.html">Admin</a>${operationsLink}</nav><div class="header-actions"><a class="icon-button" href="shop.html" aria-label="Search"><i data-lucide="search"></i></a><a class="cart-button" href="checkout.html" aria-label="Open shopping bag"><i data-lucide="shopping-bag"></i><span>Bag</span><b>${cart().reduce((sum, item) => sum + item.quantity, 0)}</b></a></div></header>`;
  if (footer) footer.innerHTML = `<footer class="site-footer"><div class="footer-brand"><a class="brand" href="/index.html"><span class="brand-mark">G</span><span>green<span>life</span></span></a><p>Organic essentials for a more intentional life.</p></div><div class="footer-links"><div><strong>Explore</strong><a href="shop.html">Shop all</a><a href="account.html">My account</a><a href="admin.html">Admin dashboard</a></div><div><strong>Help</strong><a href="order-details.html">Order details</a><a href="delivery.html">Delivery tracking</a></div><div><strong>GreenLife promise</strong><p>Thoughtful products, fair makers,<br>and less waste at home.</p></div></div><div class="footer-bottom"><span>© 2024 GreenLife Store</span><span>Made with care for a greener tomorrow</span></div></footer>`;
  if (window.lucide) lucide.createIcons();
}

function hideAdminNavigationForCustomers() {
  if (session?.role === 'admin' && session?.token) return;
  document.querySelectorAll('a[href="admin.html"], a[href="/admin.html"]').forEach(link => link.remove());
}

function showCartToast(message) { let toast = document.querySelector('#cart-toast'); if (!toast) { toast = document.createElement('div'); toast.id = 'cart-toast'; toast.className = 'toast'; document.body.appendChild(toast); } toast.textContent = message; toast.classList.add('show'); clearTimeout(window.greenLifeToastTimer); window.greenLifeToastTimer = setTimeout(() => toast.classList.remove('show'), 1800); }
function addToCart(product, quantity = 1) { const current = cart(); const item = current.find(entry => entry.id === product.id); if (item) item.quantity += quantity; else current.push({ ...product, quantity }); saveCart(current); showCartToast(`${product.name} added to your bag`); siteChrome(); hideAdminNavigationForCustomers(); }
function toggleWishlist(id, button) { const saved = JSON.parse(localStorage.getItem('greenlife-wishlist') || '[]'); const index = saved.indexOf(id); if (index >= 0) saved.splice(index, 1); else saved.push(id); localStorage.setItem('greenlife-wishlist', JSON.stringify(saved)); button.classList.toggle('saved', index < 0); button.innerHTML = `<i data-lucide="heart"></i>`; lucide.createIcons(); api(`/api/wishlist/${id}?customer_key=${encodeURIComponent(customerKey)}`, { method: index >= 0 ? 'DELETE' : 'POST' }).catch(() => {}); }
function productCard(product) { const saved = JSON.parse(localStorage.getItem('greenlife-wishlist') || '[]').includes(product.id); return `<article class="product-card"><button class="wish-button ${saved ? 'saved' : ''}" data-wish="${product.id}" aria-label="Save ${product.name}"><i data-lucide="heart"></i></button><a href="product.html?id=${product.id}"><div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy"><span class="product-tag">${product.tag}</span></div><div class="product-info"><h3>${product.name}</h3><div class="product-meta"><span>${product.unit} · ★ ${Number(product.rating).toFixed(1)}</span><span class="product-price">${money(product.price)}</span></div></div></a><button class="button button-dark product-add-button" data-add-product="${product.id}" type="button">Add to bag <i data-lucide="shopping-bag"></i></button></article>`; }
function bindCards(products = []) { document.querySelectorAll('[data-wish]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const id = Number(button.dataset.wish); toggleWishlist(id, button); })); document.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const product = products.find(item => item.id === Number(button.dataset.addProduct)); if (product) addToCart(product); })); if (window.lucide) lucide.createIcons(); }

async function initShop() { const grid = document.querySelector('#shop-grid'); if (!grid) return; const query = () => { const params = new URLSearchParams({ category: document.querySelector('input[name=category]:checked').value, sort: document.querySelector('#shop-sort').value }); const search = document.querySelector('#shop-search').value.trim(); const min = document.querySelector('#min-price').value; const max = document.querySelector('#max-price').value; const rating = document.querySelector('input[name=rating]:checked').value; if (search) params.set('search', search); if (min) params.set('min_price', min); if (max) params.set('max_price', max); if (rating !== '0') params.set('min_rating', rating); if (document.querySelector('#in-stock').checked) params.set('in_stock', 'true'); return params; }; const render = async () => { try { const products = await api(`/api/products?${query()}`); document.querySelector('#shop-count').textContent = `${products.length} products`; grid.innerHTML = products.length ? products.map(productCard).join('') : '<div class="empty-state">No products match these filters.</div>'; bindCards(products); } catch (error) { grid.innerHTML = `<div class="api-error">${error.message}</div>`; } }; document.querySelectorAll('input[name=category],input[name=rating],#in-stock').forEach(element => element.addEventListener('change', render)); document.querySelector('#shop-sort').addEventListener('change', render); document.querySelector('#shop-search').addEventListener('input', render); document.querySelectorAll('#min-price,#max-price').forEach(element => element.addEventListener('change', render)); render(); }

async function initProduct() { const root = document.querySelector('#product-detail'); if (!root) return; const id = new URLSearchParams(location.search).get('id') || '1'; try { const product = await api(`/api/products/${id}`); const reviews = await api(`/api/products/${id}/reviews`); const related = await api(`/api/products?category=${encodeURIComponent(product.category)}`); root.innerHTML = `<div class="detail-layout"><div><div class="gallery-main" id="gallery-main"><img src="${product.image}" alt="${product.name}"></div><div class="gallery-thumbs"><button class="active"><img src="${product.image}" alt="${product.name}"></button><button><img src="${product.image}&sat=-20" alt="${product.name} detail"></button></div></div><div class="detail-copy"><p class="eyebrow">${product.category} / ${product.brand}</p><h1>${product.name}</h1><div class="rating">★★★★★ <span>${Number(product.rating).toFixed(1)} · Customer rating</span></div><p class="description">${product.description}</p><span class="stock ${product.stock < 5 ? 'low' : ''}"><i data-lucide="check-circle-2"></i>${product.stock > 5 ? 'In Stock' : `Only ${product.stock} left!`}</span><div class="detail-price">${money(product.price)} <small>/ ${product.unit}</small></div><div class="detail-actions"><div class="quantity"><button id="minus">−</button><span id="quantity">1</span><button id="plus">+</button></div><button class="button button-dark" id="add-detail">Add to bag <i data-lucide="shopping-bag"></i></button><button class="wish-button" id="save-detail" aria-label="Save to wishlist"><i data-lucide="heart"></i></button></div><p class="eyebrow">Free delivery over Rs. 999 · Secure checkout · Easy returns</p></div></div><section class="reviews-section"><p class="eyebrow">Real GreenLife homes</p><h2>Reviews & experiences</h2><div class="review-list">${reviews.length ? reviews.map(review => `<article class="review-item"><div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div><p>${review.comment}</p><small>${review.customer_name} · verified customer</small></article>`).join('') : '<div class="empty-state">Be the first to review this product.</div>'}</div></section><section class="reviews-section"><p class="eyebrow">Curated for you</p><h2>You may also like</h2><div class="product-grid">${related.filter(item => item.id !== product.id).slice(0, 4).map(productCard).join('')}</div></section>`; const main = document.querySelector('#gallery-main'); main.addEventListener('click', () => main.classList.toggle('zoomed')); let quantity = 1; document.querySelector('#plus').addEventListener('click', () => { quantity = Math.min(product.stock, quantity + 1); document.querySelector('#quantity').textContent = quantity; }); document.querySelector('#minus').addEventListener('click', () => { quantity = Math.max(1, quantity - 1); document.querySelector('#quantity').textContent = quantity; }); document.querySelector('#add-detail').addEventListener('click', () => addToCart(product, quantity)); document.querySelector('#save-detail').addEventListener('click', event => toggleWishlist(product.id, event.currentTarget)); bindCards(); } catch (error) { root.innerHTML = `<div class="api-error">${error.message}</div>`; } }

siteChrome(); hideAdminNavigationForCustomers(); initShop(); initProduct();
const accentStyles = document.createElement('link'); accentStyles.rel = 'stylesheet'; accentStyles.href = '/css/accent.css'; document.head.appendChild(accentStyles);
const authScript = document.createElement('script'); authScript.src = '/js/auth.js'; document.body.appendChild(authScript);
