const adminSession = () => { try { return JSON.parse(localStorage.getItem('greenlife-session') || 'null'); } catch { return null; } };
const adminHeaders = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': adminSession()?.token || '' });
const adminApi = (path, options = {}) => fetch(path, { ...options, headers: { ...adminHeaders(), ...(options.headers || {}) } }).then(async response => { const data = await response.json(); if (response.status === 401) { localStorage.removeItem('greenlife-session'); window.location.replace('/login.html'); throw new Error(data.detail || 'Admin session expired'); } if (!response.ok) throw new Error(data.detail || 'Admin request failed'); return data; });
function showAdminLogin() { document.querySelector('main').innerHTML = `<div class="form-card admin-login-card"><p class="eyebrow">Restricted workspace</p><h2>Admin sign in</h2><p>Sign in with your GreenLife admin account to manage products and orders.</p><form id="admin-login-form" autocomplete="off"><div class="form-field"><label>Email</label><input id="admin-email" type="email" autocomplete="username" required></div><div class="form-field"><label>Password</label><input id="admin-password" type="password" autocomplete="new-password" minlength="6" required></div><button class="button button-dark" type="submit">Unlock dashboard <i data-lucide="lock-keyhole"></i></button><p id="admin-login-message"></p></form></div>`; lucide.createIcons(); document.querySelector('#admin-login-form').addEventListener('submit', async event => { event.preventDefault(); const message = document.querySelector('#admin-login-message'); try { const email = document.querySelector('#admin-email').value; const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: document.querySelector('#admin-password').value, role: 'admin' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || 'Admin sign in failed'); if (result.role !== 'admin') throw new Error('Use the admin email to access this dashboard'); localStorage.setItem('greenlife-session', JSON.stringify({ ...result, email })); location.reload(); } catch (error) { message.textContent = error.message; message.className = 'error-message'; } }); }
async function loadAdmin() {
	try {
		const summary = await adminApi('/api/admin/summary');
		document.querySelector('#metric-revenue').textContent = `Rs. ${Number(summary.revenue).toLocaleString('en-IN')}`;
		document.querySelector('#metric-orders').textContent = summary.orders;
		document.querySelector('#metric-products').textContent = summary.products;
		document.querySelector('#metric-stock').textContent = summary.low_stock;
		const orders = await adminApi('/api/admin/orders');
		document.querySelector('#orders-table').innerHTML = orders.length ? `<table class="data-table"><thead><tr><th>Order</th><th>Customer details</th><th>Items</th><th>Total</th><th>Delivery</th></tr></thead><tbody>${orders.map(order => `<tr><td><strong>#${order.id}</strong><br><small>${order.created_at || ''}</small></td><td><strong>${order.customer_name}</strong><br><small>${order.email}</small><br><small>${order.address}</small></td><td>${(order.items || []).map(item => `<div><strong>${item.name || `Product #${item.product_id}`}</strong><br><small>Qty ${item.quantity} &middot; ${money(item.unit_price)} each</small></div>`).join('') || 'No items'}</td><td>${money(order.total)}</td><td><select class="status-select" data-order="${order.id}">${['Placed','Packed','Shipped','Delivered'].map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">No orders yet.</div>';
		document.querySelectorAll('[data-order]').forEach(select => select.addEventListener('change', async () => {
			try {
				await adminApi(`/api/admin/orders/${select.dataset.order}/status?status=${select.value}`, { method: 'PATCH' });
			} catch (error) {
				alert(error.message);
				loadAdmin();
			}
		}));
	} catch (error) {
		document.querySelector('#orders-table').innerHTML = `<div class="api-error">${error.message}</div>`;
	}
}
const activeAdminSession = adminSession(); if (activeAdminSession?.role === 'admin' && activeAdminSession?.token) { loadAdmin(); document.querySelector('#refresh-admin').addEventListener('click', loadAdmin); document.querySelector('#product-form').addEventListener('submit', async event => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget)); payload.price = Number(payload.price); payload.stock = Number(payload.stock); try { await adminApi('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }); document.querySelector('#admin-message').textContent = 'Product added successfully.'; event.currentTarget.reset(); loadAdmin(); } catch (error) { document.querySelector('#admin-message').textContent = error.message; } }); } else { window.location.replace('/login.html'); }
