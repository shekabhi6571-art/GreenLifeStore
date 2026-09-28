const readCheckoutCart = () => {
	try {
		const stored = JSON.parse(localStorage.getItem('greenlife-cart') || '[]');
		return Array.isArray(stored) ? stored.filter(item => Number(item?.id) > 0 && Number(item?.price) >= 0 && Number(item?.quantity) > 0) : [];
	} catch {
		return [];
	}
};
const checkoutMoney = value => `Rs. ${Number(value).toLocaleString('en-IN')}`;
let discount = 0;
function renderCheckout() { const checkoutCart = readCheckoutCart(); const container = document.querySelector('#checkout-items'); const subtotal = checkoutCart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0); container.innerHTML = checkoutCart.length ? checkoutCart.map(item => `<div class="order-line"><span>${item.name} × ${item.quantity}</span><strong>${checkoutMoney(item.price * item.quantity)}</strong></div>`).join('') : '<div class="empty-state">Your bag is empty. <a href="shop.html">Shop products</a></div>'; document.querySelector('#checkout-total').textContent = checkoutMoney(Math.max(0, subtotal - discount)); }
renderCheckout();
document.querySelector('#apply-promo').addEventListener('click', () => { const code = document.querySelector('#promo-code').value.trim().toUpperCase(); if (code === 'GREEN10') { const checkoutCart = readCheckoutCart(); const subtotal = checkoutCart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0); discount = Math.round(subtotal * 0.1); document.querySelector('#apply-promo').textContent = 'Applied'; renderCheckout(); } else alert('Try promo code GREEN10'); });
document.querySelector('#checkout-form').addEventListener('submit', async event => { event.preventDefault(); const checkoutCart = readCheckoutCart(); if (!checkoutCart.length) return alert('Your bag is empty'); const form = new FormData(event.currentTarget); try { const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: form.get('customer-name'), email: form.get('email'), address: form.get('address'), payment_method: form.get('payment'), items: checkoutCart.map(item => ({ product_id: Number(item.id), quantity: Number(item.quantity) })) }) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || 'Order could not be placed'); localStorage.setItem('greenlife-last-order-id', String(result.id)); localStorage.removeItem('greenlife-cart'); document.querySelector('#checkout-form').innerHTML = `<div class="empty-state"><h2>Order #${result.id} confirmed</h2><p>Your organic essentials are on their way. Status: ${result.status}.</p><a class="button button-dark" href="order-details.html?order=${result.id}">Track order</a></div>`; renderCheckout(); } catch (error) { alert(error.message); } });
