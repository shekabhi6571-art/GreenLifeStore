let products = [];

let cart = (() => { try { const stored = JSON.parse(localStorage.getItem('greenlife-cart') || '[]'); return Array.isArray(stored) ? stored : []; } catch { return []; } })();
let activeCategory = 'All';
let sortMode = 'featured';

const productGrid = document.querySelector('#product-grid');
const resultCount = document.querySelector('#result-count');
const cartCount = document.querySelector('#cart-count');
const cartItems = document.querySelector('#cart-items');
const cartEmpty = document.querySelector('#cart-empty');
const cartSummary = document.querySelector('#cart-summary');
const cartTotal = document.querySelector('#cart-total');
const cartDrawer = document.querySelector('#cart-drawer');
const drawerOverlay = document.querySelector('#drawer-overlay');
const toast = document.querySelector('#toast');
let homepageSession = null;
try { homepageSession = JSON.parse(localStorage.getItem('greenlife-session') || 'null'); } catch {}
if (!homepageSession?.token) window.location.replace('/login.html');

function formatPrice(value) { return `Rs. ${value.toLocaleString('en-IN')}`; }

function hideAdminLinksForCustomers() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem('greenlife-session') || 'null'); } catch {}
  if (session?.role === 'admin' && session?.token) return;
  document.querySelectorAll('a[href="admin.html"], a[href="/admin.html"]').forEach(link => link.remove());
}

function renderHomepageNavigation() {
  const navigation = document.querySelector('.main-nav');
  if (!navigation || !homepageSession?.token) return;
  const adminLink = homepageSession.role === 'admin' ? '<a href="admin.html">Admin</a>' : '';
  navigation.innerHTML = `<a href="shop.html">Shop</a><a href="account.html">My account</a><a href="order-details.html">Order details</a><a href="delivery.html">Delivery</a>${adminLink}`;
  document.querySelector('a[href="login.html"]')?.remove();
}

async function loadProducts(search = '') {
  const params = new URLSearchParams({ category: activeCategory, sort: sortMode });
  if (search) params.set('search', search);
  try {
    const response = await fetch(`/api/products?${params}`);
    if (!response.ok) throw new Error('Product request failed');
    products = await response.json();
    renderProducts();
  } catch (error) {
    productGrid.innerHTML = '<p class="api-error">Products are temporarily unavailable. Please start the FastAPI server and refresh.</p>';
    resultCount.textContent = 'Unable to load products';
    console.error(error);
  }
}

function renderProducts() {
  let visible = products.filter(product => activeCategory === 'All' || product.category === activeCategory);
  if (sortMode === 'price-low') visible.sort((a, b) => a.price - b.price);
  if (sortMode === 'price-high') visible.sort((a, b) => b.price - a.price);
  resultCount.textContent = `${visible.length} product${visible.length === 1 ? '' : 's'}`;
  productGrid.innerHTML = visible.map(product => `
    <article class="product-card">
      <div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy" /><span class="product-tag">${product.tag}</span><button class="quick-add" data-add="${product.id}" aria-label="Add ${product.name} to bag" title="Add to bag"><i data-lucide="plus"></i></button></div>
      <div class="product-info"><h3>${product.name}</h3><div class="product-meta"><span>${product.unit}</span><span class="product-price">${formatPrice(product.price)}</span></div></div>
    </article>`).join('');
  productGrid.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addToCart(Number(button.dataset.add))));
  lucide.createIcons();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  cartCount.textContent = count;
  cartItems.innerHTML = cart.map(item => `<div class="cart-row"><img src="${item.image}" alt="${item.name}" /><div><h3>${item.name}</h3><p>${item.unit} · Qty ${item.quantity}</p><button data-remove="${item.id}">Remove</button></div><strong>${formatPrice(item.price * item.quantity)}</strong></div>`).join('');
  cartEmpty.style.display = cart.length ? 'none' : 'block';
  cartSummary.style.display = cart.length ? 'block' : 'none';
  cartTotal.textContent = formatPrice(total);
  cartItems.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => removeFromCart(Number(button.dataset.remove))));
  localStorage.setItem('greenlife-cart', JSON.stringify(cart));
}

function addToCart(id) {
  const product = products.find(item => item.id === id);
  const existing = cart.find(item => item.id === id);
  if (existing) existing.quantity += 1;
  else cart.push({ ...product, quantity: 1 });
  renderCart();
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function removeFromCart(id) { cart = cart.filter(item => item.id !== id); renderCart(); }
function toggleCart(open) { cartDrawer.classList.toggle('open', open); drawerOverlay.classList.toggle('open', open); cartDrawer.setAttribute('aria-hidden', String(!open)); }

document.querySelectorAll('.category-pill').forEach(button => button.addEventListener('click', async () => {
  activeCategory = button.dataset.category;
  document.querySelectorAll('.category-pill').forEach(item => item.classList.toggle('active', item === button));
  await loadProducts();
  document.querySelector('#shop').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

document.querySelector('#sort-button').addEventListener('click', async () => {
  const modes = ['featured', 'price-low', 'price-high'];
  sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
  const labels = { featured: 'Featured', 'price-low': 'Price: low to high', 'price-high': 'Price: high to low' };
  document.querySelector('#sort-button').innerHTML = `Sort: ${labels[sortMode]} <i data-lucide="chevron-down"></i>`;
  await loadProducts();
});
document.querySelector('#cart-button').addEventListener('click', () => toggleCart(true));
document.querySelector('#close-cart').addEventListener('click', () => toggleCart(false));
drawerOverlay.addEventListener('click', () => toggleCart(false));
document.querySelector('#start-shopping').addEventListener('click', () => toggleCart(false));
document.querySelector('#checkout-button').addEventListener('click', () => {
  window.location.href = '/checkout.html';
});
document.querySelector('#newsletter-form').addEventListener('submit', event => { event.preventDefault(); event.target.innerHTML = '<span style="color:#cfdfc9;font-size:11px;padding:9px 0">You are on the list. Welcome to GreenLife.</span>'; });

document.querySelector('.search-toggle').addEventListener('click', async () => {
  const query = window.prompt('Search GreenLife products');
  if (!query) return;
  activeCategory = 'All';
  document.querySelectorAll('.category-pill').forEach(item => item.classList.toggle('active', item.dataset.category === activeCategory));
  await loadProducts(query);
  if (!products.length) alert('No products found. Try pantry, home, body, or wellness.');
  document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' });
});

renderCart();
renderHomepageNavigation();
hideAdminLinksForCustomers();
lucide.createIcons();
loadProducts();
const accentStyles = document.createElement('link'); accentStyles.rel = 'stylesheet'; accentStyles.href = '/css/accent.css'; document.head.appendChild(accentStyles);
const authScript = document.createElement('script'); authScript.src = '/js/auth.js'; document.body.appendChild(authScript);
