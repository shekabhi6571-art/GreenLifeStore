async function getSessionProfile() {
  const session = JSON.parse(localStorage.getItem('greenlife-session') || 'null');
  if (!session?.token) return null;
  const response = await fetch('/api/profile', { headers: { 'X-Auth-Token': session.token } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Unable to load your profile');
  return data;
}

async function loadAccountProfile() {
  const profileContainer = document.querySelector('#account-profile');
  if (!profileContainer) return;
  try {
    const profile = await getSessionProfile();
    if (!profile) {
      profileContainer.innerHTML = '<p class="empty-state">No active customer session found.</p>';
      return;
    }
    profileContainer.innerHTML = `
      <div class="profile-summary">
        <strong>${profile.full_name || 'Customer'}</strong>
        <span>${profile.email}</span>
        <small>${profile.phone || 'Phone not provided'}</small>
      </div>
    `;
  } catch (error) {
    profileContainer.innerHTML = `<div class="api-error">${error.message}</div>`;
  }
}

async function loadWishlist() { const grid = document.querySelector('#wishlist-grid'); try { const products = await fetch(`/api/wishlist?customer_key=${encodeURIComponent(customerKey)}`).then(response => response.json()); grid.innerHTML = products.length ? products.map(productCard).join('') : '<div class="empty-state">Your wishlist is empty. Save products you love from the shop.</div>'; bindCards(products); } catch (error) { grid.innerHTML = `<div class="api-error">${error.message}</div>`; } }
loadAccountProfile();
loadWishlist();
document.querySelector('#track-form').addEventListener('submit', async event => { event.preventDefault(); const target = document.querySelector('#tracking-result'); try { const order = await api(`/api/orders/${document.querySelector('#order-id').value}`); const statuses = ['Placed', 'Packed', 'Shipped', 'Delivered']; const current = statuses.indexOf(order.status); target.innerHTML = `<div class="tracking-line">${statuses.map((status, index) => `<div class="track-node ${index <= current ? 'done' : ''}"><span>${index <= current ? '✓' : index + 1}</span>${status}</div>`).join('')}</div><div class="form-card"><strong>Order #${order.id}</strong><p>${order.customer_name} · ${order.email}</p><p>Total: ${money(order.total)} · ${order.status}</p></div>`; } catch (error) { target.innerHTML = `<div class="api-error">${error.message}</div>`; } });
