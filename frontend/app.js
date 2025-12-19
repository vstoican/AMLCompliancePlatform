const API_BASE = window.API_BASE || "http://localhost:8000";

// =============================================================================
// AUTHENTICATION
// =============================================================================

// Token storage
let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');
let authUser = JSON.parse(localStorage.getItem('authUser') || 'null');

function isAuthenticated() {
  return !!accessToken;
}

function getTokenExpiry(token) {
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000; // Convert to milliseconds
  } catch {
    return 0;
  }
}

function isTokenExpired(token) {
  const expiry = getTokenExpiry(token);
  return Date.now() >= expiry - 60000; // Consider expired 1 minute before actual expiry
}

async function refreshAccessToken() {
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      logout();
      return false;
    }

    const data = await res.json();
    accessToken = data.access_token;
    localStorage.setItem('accessToken', accessToken);
    return true;
  } catch (err) {
    console.error('Token refresh failed:', err);
    logout();
    return false;
  }
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Login failed');
  }

  const data = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;

  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  // Fetch user info
  const userRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (userRes.ok) {
    authUser = await userRes.json();
    localStorage.setItem('authUser', JSON.stringify(authUser));
  }

  return authUser;
}

function logout() {
  // Revoke refresh token on server
  if (refreshToken) {
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {}); // Ignore errors
  }

  accessToken = null;
  refreshToken = null;
  authUser = null;

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('authUser');

  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.querySelector('.app-shell').style.display = 'none';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

function hideLoginScreen() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.querySelector('.app-shell').style.display = 'grid';
}

function updateUserDisplay() {
  const userMenuContainer = document.getElementById('userMenuContainer');
  if (userMenuContainer && authUser) {
    const initials = authUser.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
    userMenuContainer.innerHTML = `
      <div class="user-menu" onclick="toggleUserDropdown(event)">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <span class="user-name">${authUser.full_name}</span>
          <span class="user-role">${authUser.role}</span>
        </div>
        <span class="user-chevron">▾</span>
      </div>
      <div id="userDropdown" class="user-dropdown hidden">
        <button onclick="navigateToProfile()" class="btn ghost dropdown-item">
          <span class="dropdown-icon">👤</span> My Profile
        </button>
        <div class="dropdown-divider"></div>
        <button onclick="logout()" class="btn ghost dropdown-item dropdown-item-danger">
          <span class="dropdown-icon">🚪</span> Sign Out
        </button>
      </div>
    `;
  }
}

function navigateToProfile() {
  // Close the dropdown
  document.getElementById('userDropdown')?.classList.add('hidden');
  // Navigate to profile panel
  activatePanel('profile', '/profile');
  loadProfileData();
}

function toggleUserDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

// Close user dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('userDropdown');
  const userMenu = document.querySelector('.user-menu');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (!userMenu?.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

// Initialize login form handler
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errorDiv = document.getElementById('loginError');
      const btnText = document.getElementById('loginBtnText');
      const spinner = document.getElementById('loginSpinner');

      // Show loading state
      btnText.textContent = 'Signing in...';
      spinner.style.display = 'inline-block';
      errorDiv.style.display = 'none';

      try {
        await login(email, password);
        hideLoginScreen();
        updateUserDisplay();
        initApp();
        showToast('success', 'Welcome back!', `Logged in as ${authUser.full_name}`);
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
      } finally {
        btnText.textContent = 'Sign In';
        spinner.style.display = 'none';
      }
    });
  }

  // Check authentication on page load
  if (isAuthenticated()) {
    if (isTokenExpired(accessToken)) {
      // Try to refresh
      refreshAccessToken().then(success => {
        if (success) {
          hideLoginScreen();
          updateUserDisplay();
          initApp();
        } else {
          showLoginScreen();
        }
      });
    } else {
      hideLoginScreen();
      updateUserDisplay();
      initApp();
    }
  } else {
    showLoginScreen();
  }
});

// =============================================================================
// END AUTHENTICATION
// =============================================================================

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

let profileData = null;

async function loadProfileData() {
  try {
    // Fetch full profile from API
    const response = await fetchJSON('/auth/me');
    profileData = response;

    // Update profile avatar and header
    const initials = response.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('profileName').textContent = response.full_name;
    document.getElementById('profileRole').textContent = response.role;

    // Populate form fields
    document.getElementById('profileFullName').value = response.full_name;
    document.getElementById('profileEmail').value = response.email;
    document.getElementById('profileRoleInput').value = response.role;

    // Update account details
    document.getElementById('profileUserId').textContent = response.id;
    document.getElementById('profileStatus').textContent = response.is_active ? 'Active' : 'Inactive';
    document.getElementById('profileStatus').className = response.is_active ? 'badge teal' : 'badge red';

    // Note: last_login and created_at would need to be added to the API response
    // For now, show placeholder values
    document.getElementById('profileLastLogin').textContent = 'Just now';
    document.getElementById('profileCreatedAt').textContent = '-';

  } catch (error) {
    console.error('Failed to load profile:', error);
    showToast('error', 'Error', 'Failed to load profile data');
  }
}

function resetProfileForm() {
  if (profileData) {
    document.getElementById('profileFullName').value = profileData.full_name;
    document.getElementById('profileEmail').value = profileData.email;
  }
  document.getElementById('profileSuccess').style.display = 'none';
  document.getElementById('profileError').style.display = 'none';
}

async function updateProfile(fullName, email) {
  const successEl = document.getElementById('profileSuccess');
  const errorEl = document.getElementById('profileError');

  successEl.style.display = 'none';
  errorEl.style.display = 'none';

  try {
    const body = {};
    if (fullName !== profileData.full_name) body.full_name = fullName;
    if (email !== profileData.email) body.email = email;

    if (Object.keys(body).length === 0) {
      errorEl.textContent = 'No changes to save';
      errorEl.style.display = 'block';
      return;
    }

    const response = await fetchJSON('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    // Update local state
    profileData = response;
    authUser = { ...authUser, full_name: response.full_name, email: response.email };
    localStorage.setItem('authUser', JSON.stringify(authUser));

    // Update UI
    updateUserDisplay();
    loadProfileData();

    successEl.style.display = 'block';
    showToast('success', 'Profile Updated', 'Your profile has been updated successfully');

  } catch (error) {
    errorEl.textContent = error.message || 'Failed to update profile';
    errorEl.style.display = 'block';
  }
}

async function changePassword(currentPassword, newPassword, confirmPassword) {
  const successEl = document.getElementById('passwordSuccess');
  const errorEl = document.getElementById('passwordError');

  successEl.style.display = 'none';
  errorEl.style.display = 'none';

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'New passwords do not match';
    errorEl.style.display = 'block';
    return;
  }

  // Validate password length
  if (newPassword.length < 8) {
    errorEl.textContent = 'Password must be at least 8 characters';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await fetchJSON('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    successEl.style.display = 'block';
    showToast('success', 'Password Changed', 'Please log in again with your new password');

    // Clear form
    document.getElementById('changePasswordForm').reset();

    // Log out after a short delay
    setTimeout(() => {
      logout();
    }, 2000);

  } catch (error) {
    errorEl.textContent = error.message || 'Failed to change password';
    errorEl.style.display = 'block';
  }
}

async function logoutAllSessions() {
  if (!confirm('This will log you out from all other devices. Continue?')) {
    return;
  }

  try {
    const response = await fetchJSON('/auth/logout-all', { method: 'POST' });
    showToast('success', 'Sessions Cleared', response.message || 'Logged out from all other sessions');
  } catch (error) {
    showToast('error', 'Error', error.message || 'Failed to logout from other sessions');
  }
}

// Initialize profile form handlers
document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('profileFullName').value.trim();
      const email = document.getElementById('profileEmail').value.trim();
      await updateProfile(fullName, email);
    });
  }

  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      await changePassword(currentPassword, newPassword, confirmPassword);
    });
  }
});

// Expose functions globally
window.navigateToProfile = navigateToProfile;
window.resetProfileForm = resetProfileForm;
window.logoutAllSessions = logoutAllSessions;

// =============================================================================
// END PROFILE MANAGEMENT
// =============================================================================

// Toast notification system
function showToast(type, title, message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

const state = {
  customers: [],
  transactions: [],
  alerts: [],
  alertDefinitions: [],
  tasks: [],
  taskDefinitions: [],
  users: [],
  selectedTask: null,
  reports: {
    highRisk: [],
    alerts: [],
  },
  // Sorting state
  transactionSort: {
    column: 'created_at',
    direction: 'desc', // 'asc' or 'desc'
  },
  // Selected customer for detail view
  selectedCustomerId: null,
  // Transaction pagination
  transactionPagination: {
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
    loading: false,
  },
};

// Current user (in production, get from auth)
let currentUser = null;

const navButtons = document.querySelectorAll(".nav-item");
const accordionTriggers = document.querySelectorAll(".accordion-trigger");
const panels = document.querySelectorAll(".panel");

// Contextual filters - Customers
const customerSearch = document.getElementById("customerSearch");
const customerStatusFilter = document.getElementById("customerStatusFilter");
const customerRiskFilter = document.getElementById("customerRiskFilter");
const customerValidationFilter = document.getElementById("customerValidationFilter");

// Contextual filters - Transactions
const transactionSearch = document.getElementById("transactionSearch");
const transactionFinancialFilter = document.getElementById("transactionFinancialFilter");
const transactionSettlementFilter = document.getElementById("transactionSettlementFilter");
const transactionDeliveryFilter = document.getElementById("transactionDeliveryFilter");

// Contextual filters - Alerts
const alertSearch = document.getElementById("alertSearch");
const alertStatusFilter = document.getElementById("alertStatusFilter");
const alertSeverityFilter = document.getElementById("alertSeverityFilter");
const alertTypeFilter = document.getElementById("alertTypeFilter");
const alertStatusFilter2 = document.getElementById("alertStatusFilter2");
const alertSeverityFilter2 = document.getElementById("alertSeverityFilter2");
const alertAssignedFilter = document.getElementById("alertAssignedFilter");
const alertStreamSearch = document.getElementById("alertStreamSearch");

// Task filters
const taskSearch = document.getElementById("taskSearch");
const taskStatusFilter = document.getElementById("taskStatusFilter");
const taskTypeFilter = document.getElementById("taskTypeFilter");
const taskPriorityFilter = document.getElementById("taskPriorityFilter");
const taskUnclaimedOnly = document.getElementById("taskUnclaimedOnly");

const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const runReportBtn = document.getElementById("runReportBtn");
const reportFrom = document.getElementById("reportFrom");
const reportTo = document.getElementById("reportTo");

const modal = document.getElementById("modal");
const openModalBtn = document.getElementById("createCustomerBtn");
const closeModalBtn = document.getElementById("closeModal");
const customerForm = document.getElementById("customerForm");

const alertDefModal = document.getElementById("alertDefModal");
const openAlertDefModalBtn = document.getElementById("createAlertDefBtn");
const closeAlertDefModalBtn = document.getElementById("closeAlertDefModal");
const alertDefForm = document.getElementById("alertDefForm");
const alertDefModalTitle = document.getElementById("alertDefModalTitle");

// Router configuration
const routes = {
  '/': 'overview',
  '/overview': 'overview',
  '/ai-assistant': 'ai-assistant',
  '/customers': 'customers',
  '/reports': 'reports',
  '/transactions': 'transactions',
  '/alert-definitions': 'alert-definitions',
  '/alert-stream': 'alert-stream',
  '/tasks': 'tasks',
  '/settings': 'settings',
  '/webhooks': 'webhooks',
  '/api-keys': 'api-keys',
  '/data-exports': 'data-exports',
  '/country-distribution': 'country-distribution',
  '/transactions-alerts': 'transactions-alerts',
  '/risk-analysis': 'risk-analysis',
  '/users': 'users',
  '/roles': 'roles',
  '/audit-log': 'audit-log',
  '/workflow-definitions': 'workflow-definitions',
  '/workflow-executions': 'workflow-executions',
};
const legacyRoutes = {
  '/alerts': '/alert-stream',
};

// Navigate to a route
function navigate(path, queryParams = {}) {
  const normalizedPath = legacyRoutes[path] || path;
  const panelId = routes[normalizedPath] || routes['/'];

  // Build URL with query params
  let url = normalizedPath;
  const params = new URLSearchParams(queryParams);
  if (params.toString()) {
    url = `${normalizedPath}?${params.toString()}`;
  }

  activatePanel(panelId, normalizedPath);
  window.history.pushState({ path: normalizedPath, queryParams }, '', url);
}

// Navigate to customer detail view
function viewCustomerDetails(customerId) {
  state.selectedCustomerId = customerId;
  navigate('/customers', { id: customerId });

  // Scroll to customer card after a brief delay for rendering
  setTimeout(() => {
    const customerCard = document.querySelector(`[data-customer-id="${customerId}"]`);
    if (customerCard) {
      customerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
  const path = event.state?.path || window.location.pathname;
  const panelId = routes[path] || routes['/'];
  activatePanel(panelId, path, false); // Don't push to history
});

navButtons.forEach((btn) =>
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const panelId = btn.dataset.target;
    const path = Object.keys(routes).find(key => routes[key] === panelId) || '/';
    navigate(path);
  })
);

accordionTriggers.forEach((trigger) =>
  trigger.addEventListener("click", () => {
    const item = trigger.parentElement;
    item.classList.toggle("open");
  })
);

document.querySelectorAll(".btn.text").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const panelId = btn.dataset.target;
    const path = Object.keys(routes).find(key => routes[key] === panelId) || '/';
    navigate(path);
  });
});

// Contextual filter event listeners - Customers
if (customerSearch) customerSearch.addEventListener("input", () => renderCustomers());
if (customerStatusFilter) customerStatusFilter.addEventListener("change", () => renderCustomers());
if (customerRiskFilter) customerRiskFilter.addEventListener("change", () => renderCustomers());
if (customerValidationFilter) customerValidationFilter.addEventListener("change", () => renderCustomers());

// Contextual filter event listeners - Transactions
if (transactionSearch) transactionSearch.addEventListener("input", () => renderTransactions());
if (transactionFinancialFilter) transactionFinancialFilter.addEventListener("change", () => renderTransactions());
if (transactionSettlementFilter) transactionSettlementFilter.addEventListener("change", () => renderTransactions());
if (transactionDeliveryFilter) transactionDeliveryFilter.addEventListener("change", () => renderTransactions());

// Contextual filter event listeners - Alerts
if (alertSearch) alertSearch.addEventListener("input", () => renderAlerts());
if (alertStatusFilter) alertStatusFilter.addEventListener("change", () => renderAlerts());
if (alertSeverityFilter) alertSeverityFilter.addEventListener("change", () => renderAlerts());
if (alertTypeFilter) alertTypeFilter.addEventListener("change", () => renderAlerts());
if (alertStatusFilter2) alertStatusFilter2.addEventListener("change", () => renderAlerts());
if (alertSeverityFilter2) alertSeverityFilter2.addEventListener("change", () => renderAlerts());
if (alertAssignedFilter) alertAssignedFilter.addEventListener("change", () => renderAlerts());
if (alertStreamSearch) alertStreamSearch.addEventListener("input", () => renderAlerts());

// Contextual filter event listeners - Tasks
if (taskSearch) taskSearch.addEventListener("input", () => renderTasks());
if (taskStatusFilter) taskStatusFilter.addEventListener("change", () => loadTasks());
if (taskTypeFilter) taskTypeFilter.addEventListener("change", () => loadTasks());
if (taskPriorityFilter) taskPriorityFilter.addEventListener("change", () => loadTasks());
if (taskUnclaimedOnly) taskUnclaimedOnly.addEventListener("change", () => loadTasks());

runReportBtn.addEventListener("click", handleRunReport);
themeToggle.addEventListener("click", toggleTheme);

openModalBtn.addEventListener("click", () => openCreateCustomerModal());
closeModalBtn.addEventListener("click", () => toggleModal(false));
modal.addEventListener("click", (e) => {
  if (e.target === modal) toggleModal(false);
});

openAlertDefModalBtn.addEventListener("click", () => openAlertDefModalForCreate());
closeAlertDefModalBtn.addEventListener("click", () => toggleAlertDefModal(false));
alertDefModal.addEventListener("click", (e) => {
  if (e.target === alertDefModal) toggleAlertDefModal(false);
});

const sunIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4a1 1 0 0 1 1-1h0a1 1 0 1 1-2 0h0a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1h0a1 1 0 1 1-2 0h0a1 1 0 0 1 1-1Zm8-9a1 1 0 0 1 1 1h0a1 1 0 1 1-2 0h0a1 1 0 0 1 1-1ZM4 12a1 1 0 0 1 1 1h0a1 1 0 1 1-2 0h0a1 1 0 0 1 1-1Zm12.95-6.364a1 1 0 0 1 1.414 0h0a1 1 0 1 1-1.414-1.414h0a1 1 0 0 1 0 1.414ZM6.636 17.95a1 1 0 0 1 1.414 0h0a1 1 0 1 1-1.414 1.414h0a1 1 0 0 1 0-1.414Zm11.314 1.414a1 1 0 0 1-1.414 0h0a1 1 0 1 1 1.414 1.414h0a1 1 0 0 1 0-1.414ZM7.05 5.636a1 1 0 0 1-1.414 0h0A1 1 0 1 1 7.05 4.222h0a1 1 0 0 1 0 1.414ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>
  </svg>
`;
const moonIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.742 14.045a8.001 8.001 0 0 1-10.787-10.5.75.75 0 0 0-.847-.997A9.5 9.5 0 1 0 21.99 14.9a.75.75 0 0 0-.997-.847c-.081.028-.162.056-.251.085Z"/>
  </svg>
`;

customerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(customerForm);
  const customerId = data.get("customer_id");

  const payload = {
    // Basic Info
    member_id: data.get("member_id") || null,
    first_name: data.get("first_name"),
    last_name: data.get("last_name"),
    phone_number: data.get("phone_number") || null,
    status: data.get("status") || "PENDING",
    email: data.get("email") || null,

    // Personal Details
    birth_date: data.get("birth_date") || null,
    identity_number: data.get("identity_number") || null,
    place_of_birth: data.get("place_of_birth") || null,
    country_of_birth: data.get("country_of_birth") || null,

    // Address
    address_county: data.get("address_county") || null,
    address_city: data.get("address_city") || null,
    address_street: data.get("address_street") || null,
    address_house_number: data.get("address_house_number") || null,
    address_block_number: data.get("address_block_number") || null,
    address_entrance: data.get("address_entrance") || null,
    address_apartment: data.get("address_apartment") || null,

    // Employment
    employer_name: data.get("employer_name") || null,

    // Document Info
    document_type: data.get("document_type") || null,
    document_id: data.get("document_id") || null,
    document_issuer: data.get("document_issuer") || null,
    document_date_of_expire: data.get("document_date_of_expire") || null,
    document_date_of_issue: data.get("document_date_of_issue") || null,

    // Financial
    leanpay_monthly_repayment: Number(data.get("leanpay_monthly_repayment") || 0),
    available_monthly_credit_limit: Number(data.get("available_monthly_credit_limit") || 0),
    available_exposure: Number(data.get("available_exposure") || 0),

    // Validation & Consent
    data_validated: data.get("data_validated") || "NOT VALIDATED",
    marketing_consent: data.get("marketing_consent") || "NOT SET",
    kyc_motion_consent_given: data.get("kyc_motion_consent_given") === "on",

    // Risk Indicators
    indicators: {
      geography_risk: Number(data.get("geography_risk") || 1),
      product_risk: Number(data.get("product_risk") || 1),
      behavior_risk: Number(data.get("behavior_risk") || 1),
      pep_flag: data.get("pep_flag") === "on",
      sanctions_hit: data.get("sanctions_hit") === "on",
    },
    risk_override: data.get("risk_override") || null,
  };

  let result;
  if (customerId) {
    // Update existing customer
    result = await fetchJSON(`/customers/${customerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    // Create new customer
    result = await fetchJSON("/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  if (result) {
    toggleModal(false);
    customerForm.reset();
    await loadCustomers();
    showToast(customerId ? "Customer updated successfully" : "Customer created successfully", "success");
  } else {
    showToast(customerId ? "Could not update customer. Check API." : "Could not create customer. Check API.", "error");
  }
});

function toggleModal(show) {
  modal.classList.toggle("hidden", !show);
}

// Risk calculation preview - matches backend formula for 1-100 scale
function calculateRiskPreview() {
  const geoRisk = parseFloat(customerForm.querySelector('[name="geography_risk"]').value) || 1;
  const prodRisk = parseFloat(customerForm.querySelector('[name="product_risk"]').value) || 1;
  const behavRisk = parseFloat(customerForm.querySelector('[name="behavior_risk"]').value) || 1;
  const pepFlag = customerForm.querySelector('[name="pep_flag"]').checked;
  const sanctionsHit = customerForm.querySelector('[name="sanctions_hit"]').checked;

  // Calculate base score: (geo * 30 + prod * 20 + behav * 30) / 8
  // This scales from 1-10 inputs to 10-100 output
  // Min: (1*30 + 1*20 + 1*30) / 8 = 80/8 = 10
  // Max: (10*30 + 10*20 + 10*30) / 8 = 800/8 = 100
  let score = (geoRisk * 30 + prodRisk * 20 + behavRisk * 30) / 8;

  // Add penalty scores
  if (pepFlag) score += 10;
  if (sanctionsHit) score += 15;

  // Cap at 100
  score = Math.min(score, 100);

  // Round to 2 decimals
  score = Math.round(score * 100) / 100;

  // Determine risk level
  let level = "low";
  let levelClass = "teal";
  if (score >= 70) {
    level = "high";
    levelClass = "red";
  } else if (score >= 40) {
    level = "medium";
    levelClass = "amber";
  }

  // Update preview display
  const preview = document.getElementById('riskPreview');
  const scoreDisplay = document.getElementById('riskScorePreview');
  const levelDisplay = document.getElementById('riskLevelPreview');

  if (preview && scoreDisplay && levelDisplay) {
    preview.style.display = 'block';
    scoreDisplay.textContent = score.toFixed(2);
    levelDisplay.textContent = level;
    levelDisplay.className = `badge ${levelClass}`;
  }
}

// Attach event listeners to risk fields
function initRiskCalculator() {
  const riskFields = [
    customerForm.querySelector('[name="geography_risk"]'),
    customerForm.querySelector('[name="product_risk"]'),
    customerForm.querySelector('[name="behavior_risk"]'),
    customerForm.querySelector('[name="pep_flag"]'),
    customerForm.querySelector('[name="sanctions_hit"]')
  ];

  riskFields.forEach(field => {
    if (field) {
      field.addEventListener('input', calculateRiskPreview);
      field.addEventListener('change', calculateRiskPreview);
    }
  });
}

// Initialize risk calculator when DOM is ready
initRiskCalculator();

function viewCustomer(customerId) {
  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) return;

  // Update modal title
  document.getElementById("modalTitle").textContent = "View Customer";

  // Store customer ID in hidden field
  let hiddenIdField = customerForm.querySelector('[name="customer_id"]');
  if (!hiddenIdField) {
    hiddenIdField = document.createElement('input');
    hiddenIdField.type = 'hidden';
    hiddenIdField.name = 'customer_id';
    customerForm.insertBefore(hiddenIdField, customerForm.firstChild);
  }
  hiddenIdField.value = customer.id;

  // Populate form fields - Basic Info
  const setFieldValue = (name, value) => {
    const field = customerForm.querySelector(`[name="${name}"]`);
    if (field) {
      if (field.type === 'checkbox') {
        field.checked = value || false;
      } else {
        field.value = value || '';
      }
    }
  };

  setFieldValue('member_id', customer.member_id);
  setFieldValue('status', customer.status);
  setFieldValue('first_name', customer.first_name);
  setFieldValue('last_name', customer.last_name);
  setFieldValue('phone_number', customer.phone_number);
  setFieldValue('email', customer.email);

  // Personal Details
  setFieldValue('birth_date', customer.birth_date);
  setFieldValue('identity_number', customer.identity_number);
  setFieldValue('place_of_birth', customer.place_of_birth);
  setFieldValue('country_of_birth', customer.country_of_birth);

  // Address
  setFieldValue('address_county', customer.address_county);
  setFieldValue('address_city', customer.address_city);
  setFieldValue('address_street', customer.address_street);
  setFieldValue('address_house_number', customer.address_house_number);

  // Employment
  setFieldValue('employer_name', customer.employer_name);

  // Document Info
  setFieldValue('document_type', customer.document_type);
  setFieldValue('document_id', customer.document_id);
  setFieldValue('document_issuer', customer.document_issuer);
  setFieldValue('document_date_of_issue', customer.document_date_of_issue);
  setFieldValue('document_date_of_expire', customer.document_date_of_expire);

  // Financial
  setFieldValue('leanpay_monthly_repayment', customer.leanpay_monthly_repayment);
  setFieldValue('available_monthly_credit_limit', customer.available_monthly_credit_limit);
  setFieldValue('available_exposure', customer.available_exposure);

  // Validation & Consent
  setFieldValue('data_validated', customer.data_validated);
  setFieldValue('marketing_consent', customer.marketing_consent);
  setFieldValue('kyc_motion_consent_given', customer.kyc_motion_consent_given);

  // Risk indicators
  setFieldValue('geography_risk', customer.geography_risk || 1);
  setFieldValue('product_risk', customer.product_risk || 1);
  setFieldValue('behavior_risk', customer.behavior_risk || 1);
  setFieldValue('pep_flag', customer.pep_flag);
  setFieldValue('sanctions_hit', customer.sanctions_hit);
  setFieldValue('risk_override', customer.risk_override);

  // Make all fields read-only
  const inputs = customerForm.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.setAttribute('readonly', 'readonly');
    if (input.type === 'checkbox' || input.tagName === 'SELECT') {
      input.disabled = true;
    }
  });

  // Update submit button to Close button
  const submitBtn = customerForm.querySelector('[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = 'Close';
    submitBtn.type = 'button';
    submitBtn.onclick = () => toggleModal(false);
  }

  // Calculate and show risk preview
  calculateRiskPreview();

  toggleModal(true);
}

function editCustomer(customerId) {
  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) return;

  // Update modal title
  document.getElementById("modalTitle").textContent = "Edit Customer";

  // Store customer ID in hidden field
  let hiddenIdField = customerForm.querySelector('[name="customer_id"]');
  if (!hiddenIdField) {
    hiddenIdField = document.createElement('input');
    hiddenIdField.type = 'hidden';
    hiddenIdField.name = 'customer_id';
    customerForm.insertBefore(hiddenIdField, customerForm.firstChild);
  }
  hiddenIdField.value = customer.id;

  // Remove readonly attributes from all fields
  const inputs = customerForm.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.removeAttribute('readonly');
    input.disabled = false;
  });

  // Populate form fields
  const setFieldValue = (name, value) => {
    const field = customerForm.querySelector(`[name="${name}"]`);
    if (field) {
      if (field.type === 'checkbox') {
        field.checked = value || false;
      } else {
        field.value = value || '';
      }
    }
  };

  // Basic Info
  setFieldValue('member_id', customer.member_id);
  setFieldValue('status', customer.status);
  setFieldValue('first_name', customer.first_name);
  setFieldValue('last_name', customer.last_name);
  setFieldValue('phone_number', customer.phone_number);
  setFieldValue('email', customer.email);

  // Personal Details
  setFieldValue('birth_date', customer.birth_date);
  setFieldValue('identity_number', customer.identity_number);
  setFieldValue('place_of_birth', customer.place_of_birth);
  setFieldValue('country_of_birth', customer.country_of_birth);

  // Address
  setFieldValue('address_county', customer.address_county);
  setFieldValue('address_city', customer.address_city);
  setFieldValue('address_street', customer.address_street);
  setFieldValue('address_house_number', customer.address_house_number);

  // Employment
  setFieldValue('employer_name', customer.employer_name);

  // Document Info
  setFieldValue('document_type', customer.document_type);
  setFieldValue('document_id', customer.document_id);
  setFieldValue('document_issuer', customer.document_issuer);
  setFieldValue('document_date_of_issue', customer.document_date_of_issue);
  setFieldValue('document_date_of_expire', customer.document_date_of_expire);

  // Financial
  setFieldValue('leanpay_monthly_repayment', customer.leanpay_monthly_repayment);
  setFieldValue('available_monthly_credit_limit', customer.available_monthly_credit_limit);
  setFieldValue('available_exposure', customer.available_exposure);

  // Validation & Consent
  setFieldValue('data_validated', customer.data_validated);
  setFieldValue('marketing_consent', customer.marketing_consent);
  setFieldValue('kyc_motion_consent_given', customer.kyc_motion_consent_given);

  // Risk indicators
  setFieldValue('geography_risk', customer.geography_risk || 1);
  setFieldValue('product_risk', customer.product_risk || 1);
  setFieldValue('behavior_risk', customer.behavior_risk || 1);
  setFieldValue('pep_flag', customer.pep_flag);
  setFieldValue('sanctions_hit', customer.sanctions_hit);
  setFieldValue('risk_override', customer.risk_override);

  // Update submit button
  const submitBtn = customerForm.querySelector('button[type="submit"], button[type="button"]');
  if (submitBtn) {
    submitBtn.textContent = 'Update';
    submitBtn.type = 'submit';
    submitBtn.onclick = null;
  }

  // Calculate and show risk preview
  calculateRiskPreview();

  toggleModal(true);
}

function openCreateCustomerModal() {
  // Reset form
  customerForm.reset();

  // Remove hidden customer_id field if it exists
  const hiddenIdField = customerForm.querySelector('[name="customer_id"]');
  if (hiddenIdField) {
    hiddenIdField.remove();
  }

  // Remove readonly attributes from all fields
  const inputs = customerForm.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.removeAttribute('readonly');
    input.disabled = false;
  });

  // Update modal title
  document.getElementById("modalTitle").textContent = "Create Customer";

  // Update submit button
  const submitBtn = customerForm.querySelector('button[type="submit"], button[type="button"]');
  if (submitBtn) {
    submitBtn.textContent = 'Create';
    submitBtn.type = 'submit';
    submitBtn.onclick = null;
  }

  // Calculate and show risk preview (will show 0.00 for new customer)
  calculateRiskPreview();

  toggleModal(true);
}

// Make functions available globally for inline onclick handlers
window.viewCustomer = viewCustomer;
window.editCustomer = editCustomer;
window.viewCustomerDetails = viewCustomerDetails;
window.sortTransactions = sortTransactions;
window.goToTransactionPage = goToTransactionPage;
window.changeTransactionPageSize = changeTransactionPageSize;
window.handleTransactionSearch = handleTransactionSearch;
window.handleTransactionFilterChange = handleTransactionFilterChange;
window.loadMoreTransactions = loadMoreTransactions;
window.loadTransactions = loadTransactions;

function toggleAlertDefModal(show) {
  alertDefModal.classList.toggle("hidden", !show);
}

function openAlertDefModalForCreate() {
  alertDefModalTitle.textContent = "Create Alert Rule";
  alertDefForm.reset();
  alertDefForm.querySelector('[name="definition_id"]').value = "";
  alertDefForm.querySelector('[name="code"]').removeAttribute("readonly");
  toggleAlertDefModal(true);
}

function openAlertDefModalForEdit(definition) {
  alertDefModalTitle.textContent = "Edit Alert Rule";
  alertDefForm.querySelector('[name="definition_id"]').value = definition.id;
  alertDefForm.querySelector('[name="code"]').value = definition.code;
  alertDefForm.querySelector('[name="code"]').setAttribute("readonly", "readonly");
  alertDefForm.querySelector('[name="name"]').value = definition.name;
  alertDefForm.querySelector('[name="description"]').value = definition.description || "";
  alertDefForm.querySelector('[name="category"]').value = definition.category;
  alertDefForm.querySelector('[name="severity"]').value = definition.severity;
  alertDefForm.querySelector('[name="threshold_amount"]').value = definition.threshold_amount || "";
  alertDefForm.querySelector('[name="window_minutes"]').value = definition.window_minutes || "";
  alertDefForm.querySelector('[name="channels"]').value = definition.channels ? definition.channels.join(", ") : "";
  alertDefForm.querySelector('[name="country_scope"]').value = definition.country_scope ? definition.country_scope.join(", ") : "";
  alertDefForm.querySelector('[name="direction"]').value = definition.direction || "";
  alertDefForm.querySelector('[name="enabled"]').checked = definition.enabled;
  toggleAlertDefModal(true);
}

alertDefForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(alertDefForm);
  const definitionId = data.get("definition_id");

  const channelsStr = data.get("channels");
  const channels = channelsStr ? channelsStr.split(",").map(s => s.trim()).filter(Boolean) : null;

  const countryScopeStr = data.get("country_scope");
  const country_scope = countryScopeStr ? countryScopeStr.split(",").map(s => s.trim()).filter(Boolean) : null;

  const payload = {
    code: data.get("code"),
    name: data.get("name"),
    description: data.get("description") || null,
    category: data.get("category"),
    severity: data.get("severity"),
    threshold_amount: data.get("threshold_amount") ? Number(data.get("threshold_amount")) : null,
    window_minutes: data.get("window_minutes") ? Number(data.get("window_minutes")) : null,
    channels: channels,
    country_scope: country_scope,
    direction: data.get("direction") || null,
    enabled: data.get("enabled") === "on",
  };

  let result;
  if (definitionId) {
    // Update existing
    result = await fetchJSON(`/alert-definitions/${definitionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    // Create new
    result = await fetchJSON("/alert-definitions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  if (result) {
    toggleAlertDefModal(false);
    alertDefForm.reset();
    await loadAlertDefinitions();
  } else {
    alert("Could not save alert definition. Check API or ensure code is unique.");
  }
});

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("aml-theme", theme);
  themeIcon.innerHTML = theme === "dark" ? sunIcon : moonIcon;
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}

function initTheme() {
  const saved = localStorage.getItem("aml-theme") || "dark";
  setTheme(saved);
}

function activatePanel(name, path, updateHistory = true) {
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.target === name));
  panels.forEach((p) => p.classList.toggle("active", p.id === name));

  // Update page title based on route
  const titles = {
    // Dashboard
    'overview': 'Dashboard',
    // AI Assistant
    'ai-assistant': 'AI Assistant',
    // Case Management
    'customers': 'Customers',
    'transactions': 'Transactions',
    'tasks': 'Task Queue',
    'alert-stream': 'Alert Stream',
    // Rules & Automation
    'alert-definitions': 'Alert Definitions',
    'workflow-definitions': 'Workflows',
    'workflow-executions': 'Workflow History',
    // Analytics
    'risk-analysis': 'Risk Analysis',
    'country-distribution': 'Country Distribution',
    'transactions-alerts': 'Transaction Trends',
    'reports': 'Compliance Reports',
    // Administration
    'users': 'User Management',
    'roles': 'Roles & Permissions',
    'audit-log': 'Audit Log',
    // User Profile
    'profile': 'My Profile',
    // Settings
    'settings': 'Settings',
    'webhooks': 'Webhooks',
    'api-keys': 'API Keys',
    'data-exports': 'Data Exports',
  };
  const pageTitle = titles[name] || 'TrustRelay AML';
  document.title = `${pageTitle} - TrustRelay AML`;

  // Load workflows data when workflow panels are activated
  if (name === 'workflow-definitions' || name === 'workflow-executions') {
    if (typeof loadWorkflows === 'function') {
      loadWorkflows();
    } else if (typeof window.loadWorkflows === 'function') {
      window.loadWorkflows();
    }
  }

  // Load tasks when tasks panel is activated (stats are updated in loadTasks)
  if (name === 'tasks') {
    if (typeof loadTasks === 'function') {
      loadTasks();
    }
  }

  // Load alerts when alert stream panel is activated (stats are updated in loadAlerts)
  if (name === 'alert-stream') {
    if (typeof loadAlerts === 'function') {
      loadAlerts();
    }
  }
}

async function fetchJSON(path, opts = {}) {
  // Check if token needs refresh before making request
  if (accessToken && isTokenExpired(accessToken)) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return null;
    }
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };

    // Add Authorization header if authenticated
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
    });

    // Handle 401 Unauthorized
    if (res.status === 401) {
      // Try to refresh token
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the request with new token
        headers["Authorization"] = `Bearer ${accessToken}`;
        const retryRes = await fetch(`${API_BASE}${path}`, {
          ...opts,
          headers,
        });
        if (!retryRes.ok) return null;
        return await retryRes.json();
      }
      return null;
    }

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("fetch failed", path, err);
    return null;
  }
}

async function loadCustomers() {
  // Load all customers, filtering is done client-side via contextual filters
  const data = await fetchJSON(`/customers`);
  state.customers = data ?? sampleCustomers();
  renderCustomers();
  renderOverview();
}

async function loadTransactions(options = {}) {
  const { append = false, offset = 0 } = options;

  if (state.transactionPagination.loading) return;
  state.transactionPagination.loading = true;

  // Build query params
  const params = new URLSearchParams({
    limit: state.transactionPagination.limit,
    offset: offset,
  });

  // Add search filter if present
  const searchValue = transactionSearch?.value?.trim();
  if (searchValue) {
    params.set('search', searchValue);
  }

  // Add status filters
  const financialFilter = transactionFinancialFilter?.value;
  if (financialFilter) {
    params.set('financial_status', financialFilter);
  }
  const settlementFilter = transactionSettlementFilter?.value;
  if (settlementFilter) {
    params.set('settlement_status', settlementFilter);
  }

  try {
    const data = await fetchJSON(`/transactions?${params}`);

    if (data && data.transactions) {
      // New paginated response format
      if (append) {
        state.transactions = [...state.transactions, ...data.transactions];
      } else {
        state.transactions = data.transactions;
      }
      state.transactionPagination = {
        ...state.transactionPagination,
        total: data.total,
        offset: data.offset,
        hasMore: data.has_more,
        loading: false,
      };
    } else if (Array.isArray(data)) {
      // Legacy format (array)
      state.transactions = data;
      state.transactionPagination.loading = false;
    } else {
      state.transactions = sampleTransactions();
      state.transactionPagination.loading = false;
    }

    renderTransactions();
    renderOverview();
  } catch (error) {
    console.error('Error loading transactions:', error);
    state.transactionPagination.loading = false;
  }
}

async function loadMoreTransactions() {
  if (!state.transactionPagination.hasMore || state.transactionPagination.loading) return;
  const newOffset = state.transactionPagination.offset + state.transactionPagination.limit;
  await loadTransactions({ append: true, offset: newOffset });
}

function goToTransactionPage(page) {
  const offset = (page - 1) * state.transactionPagination.limit;
  loadTransactions({ offset });
}

function changeTransactionPageSize(size) {
  state.transactionPagination.limit = parseInt(size);
  state.transactionPagination.offset = 0;
  loadTransactions();
}

// Debounce helper for search
let transactionSearchTimeout = null;
function handleTransactionSearch() {
  clearTimeout(transactionSearchTimeout);
  transactionSearchTimeout = setTimeout(() => {
    state.transactionPagination.offset = 0;
    loadTransactions();
  }, 300);
}

function handleTransactionFilterChange() {
  state.transactionPagination.offset = 0;
  loadTransactions();
}

async function loadAlerts() {
  // Load all alerts, filtering is done client-side via contextual filters
  const data = await fetchJSON(`/alerts`);
  // API returns {alerts: [], total: N} or just an array for backwards compat
  state.alerts = data?.alerts ?? data ?? sampleAlerts();
  renderAlerts();
  renderOverview();
  // Update stats after loading alerts
  if (typeof renderAlertStats === 'function') {
    renderAlertStats();
  }
}

async function loadTasks() {
  // Always load ALL tasks (no API-level filtering) for accurate stats
  // Client-side filtering happens in renderTasks()
  const data = await fetchJSON(`/tasks`);
  state.tasks = data ?? [];
  renderTasks();
  // Update stats after loading tasks
  if (typeof renderTaskStats === 'function') {
    renderTaskStats();
  }
}

// =============================================================================
// USER MANAGEMENT
// =============================================================================

let filteredUsers = [];
let selectedUserId = null;

async function loadUsers() {
  // Load all users (including disabled) for admin view
  const data = await fetchJSON('/users');
  state.users = data ?? [];
  filteredUsers = [...state.users];

  // Set currentUser from authUser (the logged-in user)
  if (authUser && state.users.length > 0) {
    currentUser = state.users.find(u => u.id === authUser.id) || state.users.find(u => u.email === authUser.email);
    if (!currentUser) {
      // Fallback: create currentUser from authUser if not found in users list
      currentUser = {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.full_name,
        role: authUser.role,
        is_active: true
      };
    }
  }

  updateUserStats();
  renderUsersTable();
}

function updateUserStats() {
  const total = state.users.length;
  const active = state.users.filter(u => u.is_active).length;
  const admins = state.users.filter(u => u.role === 'admin').length;
  const disabled = state.users.filter(u => !u.is_active).length;

  const totalEl = document.getElementById('statTotalUsers');
  const activeEl = document.getElementById('statActiveUsers');
  const adminEl = document.getElementById('statAdminUsers');
  const disabledEl = document.getElementById('statDisabledUsers');

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (adminEl) adminEl.textContent = admins;
  if (disabledEl) disabledEl.textContent = disabled;
}

function filterUsers() {
  const searchTerm = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('userRoleFilter')?.value || '';
  const statusFilter = document.getElementById('userStatusFilter')?.value || '';

  filteredUsers = state.users.filter(u => {
    // Search filter
    const matchesSearch = !searchTerm ||
      u.full_name.toLowerCase().includes(searchTerm) ||
      u.email.toLowerCase().includes(searchTerm);

    // Role filter
    const matchesRole = !roleFilter || u.role === roleFilter;

    // Status filter
    const matchesStatus = !statusFilter ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'disabled' && !u.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const roleBadge = (role) => {
    const colors = { admin: 'purple', manager: 'amber', senior_analyst: 'teal', analyst: 'teal' };
    return colors[role] || 'muted';
  };

  const roleLabel = (role) => {
    const labels = { admin: 'Administrator', manager: 'Manager', senior_analyst: 'Senior Analyst', analyst: 'Analyst' };
    return labels[role] || role;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (filteredUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px; color: var(--muted);">
          No users found matching your criteria
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredUsers.map(u => `
    <tr class="user-row" onclick="showUserDetail('${u.id}')" style="cursor: pointer;">
      <td>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="user-avatar" style="width: 40px; height: 40px; font-size: 14px;">${getInitials(u.full_name)}</div>
          <div>
            <div style="font-weight: 600;">${u.full_name}</div>
            <div style="font-size: 13px; color: var(--muted);">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${roleBadge(u.role)}">${roleLabel(u.role)}</span></td>
      <td><span class="badge ${u.is_active ? 'teal' : 'red'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
      <td style="color: var(--muted); font-size: 13px;">${formatDate(u.last_login)}</td>
      <td>
        <div style="display: flex; gap: 6px;" onclick="event.stopPropagation();">
          <button class="btn ghost small" onclick="showEditUserModal('${u.id}')">Edit</button>
          <button class="btn ghost small" onclick="showResetPasswordModal('${u.id}')">Reset</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showEditUserModal(userId = null) {
  const modal = document.getElementById('editUserModal');
  const titleEl = document.getElementById('editUserModalTitle');
  const idEl = document.getElementById('editUserId');
  const nameEl = document.getElementById('editUserName');
  const emailEl = document.getElementById('editUserEmail');
  const roleEl = document.getElementById('editUserRole');
  const passwordSection = document.getElementById('passwordSection');
  const passwordEl = document.getElementById('editUserPassword');
  const passwordConfirmEl = document.getElementById('editUserPasswordConfirm');
  const errorEl = document.getElementById('editUserError');

  // Clear previous error
  if (errorEl) errorEl.style.display = 'none';

  if (userId) {
    // Edit existing user
    const user = state.users.find(u => u.id === userId);
    if (!user) return;
    titleEl.textContent = 'Edit User';
    idEl.value = userId;
    nameEl.value = user.full_name;
    emailEl.value = user.email;
    roleEl.value = user.role;
    // Hide password section for existing users
    if (passwordSection) passwordSection.style.display = 'none';
    if (passwordEl) passwordEl.required = false;
    if (passwordConfirmEl) passwordConfirmEl.required = false;
  } else {
    // New user
    titleEl.textContent = 'Add New User';
    idEl.value = '';
    nameEl.value = '';
    emailEl.value = '';
    roleEl.value = 'analyst';
    // Show password section for new users
    if (passwordSection) passwordSection.style.display = 'block';
    if (passwordEl) {
      passwordEl.value = '';
      passwordEl.required = true;
    }
    if (passwordConfirmEl) {
      passwordConfirmEl.value = '';
      passwordConfirmEl.required = true;
    }
  }

  modal.classList.remove('hidden');
}

function toggleEditUserModal(show) {
  const modal = document.getElementById('editUserModal');
  if (modal) {
    modal.classList.toggle('hidden', !show);
    if (!show) {
      // Reset form when closing
      document.getElementById('editUserForm')?.reset();
      const errorEl = document.getElementById('editUserError');
      if (errorEl) errorEl.style.display = 'none';
    }
  }
}

async function saveUser(event) {
  if (event) event.preventDefault();

  const idEl = document.getElementById('editUserId');
  const nameEl = document.getElementById('editUserName');
  const emailEl = document.getElementById('editUserEmail');
  const roleEl = document.getElementById('editUserRole');
  const passwordEl = document.getElementById('editUserPassword');
  const passwordConfirmEl = document.getElementById('editUserPasswordConfirm');
  const errorEl = document.getElementById('editUserError');

  const userId = idEl.value;
  const payload = {
    full_name: nameEl.value.trim(),
    email: emailEl.value.trim(),
    role: roleEl.value,
  };

  // Clear previous error
  if (errorEl) errorEl.style.display = 'none';

  if (!payload.full_name || !payload.email) {
    if (errorEl) {
      errorEl.textContent = 'Name and email are required';
      errorEl.style.display = 'block';
    }
    return;
  }

  // For new users, validate password
  if (!userId) {
    const password = passwordEl?.value || '';
    const passwordConfirm = passwordConfirmEl?.value || '';

    if (password.length < 8) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 8 characters';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (password !== passwordConfirm) {
      if (errorEl) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.style.display = 'block';
      }
      return;
    }

    payload.password = password;
  }

  try {
    let result;
    if (userId) {
      // Update existing user
      result = await fetchJSON(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      // Create new user
      result = await fetchJSON('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    if (result) {
      showToast('success', userId ? 'User Updated' : 'User Created', `${payload.full_name} has been saved`);
      toggleEditUserModal(false);
      await loadUsers();
    }
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message || 'Unable to save user';
      errorEl.style.display = 'block';
    }
  }
}

async function toggleUserStatus(userId, newStatus) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  const action = newStatus ? 'enable' : 'disable';
  if (!confirm(`Are you sure you want to ${action} ${user.full_name}?`)) return;

  try {
    const result = await fetchJSON(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: newStatus }),
    });

    if (result) {
      showToast('success', `User ${action}d`, `${user.full_name} has been ${action}d`);
      await loadUsers();
      // Update detail panel if open
      if (selectedUserId === userId) {
        showUserDetail(userId);
      }
    }
  } catch (error) {
    showToast('error', `${action} failed`, error.message || `Unable to ${action} user`);
  }
}

// User Detail Panel
function showUserDetail(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  selectedUserId = userId;

  const getInitials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const roleLabel = (role) => {
    const labels = { admin: 'Administrator', manager: 'Manager', senior_analyst: 'Senior Analyst', analyst: 'Analyst' };
    return labels[role] || role;
  };

  const roleBadge = (role) => {
    const colors = { admin: 'purple', manager: 'amber', senior_analyst: 'teal', analyst: 'teal' };
    return colors[role] || 'muted';
  };

  // Update panel content
  document.getElementById('userDetailAvatar').textContent = getInitials(user.full_name);
  document.getElementById('userDetailName').textContent = user.full_name;
  document.getElementById('userDetailRole').textContent = roleLabel(user.role);
  document.getElementById('userDetailRole').className = `badge ${roleBadge(user.role)}`;
  document.getElementById('userDetailStatus').textContent = user.is_active ? 'Active' : 'Disabled';
  document.getElementById('userDetailStatus').className = `badge ${user.is_active ? 'teal' : 'red'}`;
  document.getElementById('userDetailEmail').textContent = user.email;
  document.getElementById('userDetailId').textContent = user.id;
  document.getElementById('userDetailCreated').textContent = formatDate(user.created_at);
  document.getElementById('userDetailLastLogin').textContent = formatDate(user.last_login);
  document.getElementById('userDetailUpdated').textContent = formatDate(user.updated_at);

  // Update toggle button
  const toggleBtn = document.getElementById('userDetailToggleBtn');
  if (toggleBtn) {
    toggleBtn.textContent = user.is_active ? 'Disable User' : 'Enable User';
    toggleBtn.style.color = user.is_active ? 'var(--red)' : 'var(--primary)';
  }

  // Show panel
  document.getElementById('userDetailOverlay').classList.remove('hidden');
  document.getElementById('userDetailPanel').classList.remove('hidden');
}

function closeUserDetailPanel() {
  const overlay = document.getElementById('userDetailOverlay');
  const panel = document.getElementById('userDetailPanel');

  panel.classList.add('closing');
  overlay.classList.add('closing');

  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('closing');
    overlay.classList.add('hidden');
    overlay.classList.remove('closing');
    selectedUserId = null;
  }, 250);
}

function editUserFromPanel() {
  if (selectedUserId) {
    closeUserDetailPanel();
    setTimeout(() => showEditUserModal(selectedUserId), 300);
  }
}

function resetPasswordFromPanel() {
  if (selectedUserId) {
    showResetPasswordModal(selectedUserId);
  }
}

function toggleUserFromPanel() {
  if (selectedUserId) {
    const user = state.users.find(u => u.id === selectedUserId);
    if (user) {
      toggleUserStatus(selectedUserId, !user.is_active);
    }
  }
}

// Reset Password Modal
function showResetPasswordModal(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('resetPasswordUserId').value = userId;
  document.getElementById('resetPasswordUserName').textContent = user.full_name;
  document.getElementById('resetNewPassword').value = '';
  document.getElementById('resetNewPasswordConfirm').value = '';

  const errorEl = document.getElementById('resetPasswordError');
  if (errorEl) errorEl.style.display = 'none';

  document.getElementById('resetPasswordModal').classList.remove('hidden');
}

function toggleResetPasswordModal(show) {
  const modal = document.getElementById('resetPasswordModal');
  if (modal) {
    modal.classList.toggle('hidden', !show);
    if (!show) {
      document.getElementById('resetPasswordForm')?.reset();
    }
  }
}

async function resetUserPassword(event) {
  if (event) event.preventDefault();

  const userId = document.getElementById('resetPasswordUserId').value;
  const newPassword = document.getElementById('resetNewPassword').value;
  const confirmPassword = document.getElementById('resetNewPasswordConfirm').value;
  const errorEl = document.getElementById('resetPasswordError');

  if (errorEl) errorEl.style.display = 'none';

  if (newPassword.length < 8) {
    if (errorEl) {
      errorEl.textContent = 'Password must be at least 8 characters';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (newPassword !== confirmPassword) {
    if (errorEl) {
      errorEl.textContent = 'Passwords do not match';
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    await fetchJSON(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });

    const user = state.users.find(u => u.id === userId);
    showToast('success', 'Password Reset', `Password for ${user?.full_name || 'user'} has been reset`);
    toggleResetPasswordModal(false);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message || 'Failed to reset password';
      errorEl.style.display = 'block';
    }
  }
}

// Initialize user form handlers
document.addEventListener('DOMContentLoaded', () => {
  const editUserForm = document.getElementById('editUserForm');
  if (editUserForm) {
    editUserForm.addEventListener('submit', saveUser);
  }

  const resetPasswordForm = document.getElementById('resetPasswordForm');
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', resetUserPassword);
  }
});

// =============================================================================
// END USER MANAGEMENT
// =============================================================================

async function loadAlertDefinitions() {
  const data = await fetchJSON("/alert-definitions");
  state.alertDefinitions = data ?? [];
  renderAlertDefinitions();
}

async function handleRunReport() {
  await loadReports();
}

async function loadReports() {
  const highRisk = await fetchJSON("/reports/high-risk");
  state.reports.highRisk = highRisk ?? state.customers.filter((c) => c.risk_level === "high");

  const payload = {};
  if (reportFrom.value) payload.from_date = reportFrom.value;
  if (reportTo.value) payload.to_date = reportTo.value;
  const alertRows = await fetchJSON("/reports/alerts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.reports.alerts = alertRows ?? state.alerts;
  renderReports();
}

function renderCustomers() {
  // Get contextual filter values
  const q = (customerSearch?.value || '').toLowerCase();
  const statusFilter = customerStatusFilter?.value || '';
  const riskFilter = customerRiskFilter?.value || '';
  const validationFilter = customerValidationFilter?.value || '';

  const rows = state.customers.filter((c) => {
    // Text search
    const matchesSearch = !q ||
      (c.full_name && c.full_name.toLowerCase().includes(q)) ||
      (c.first_name && c.first_name.toLowerCase().includes(q)) ||
      (c.last_name && c.last_name.toLowerCase().includes(q)) ||
      (c.member_id && c.member_id.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone_number && c.phone_number.includes(q)) ||
      (c.identity_number && c.identity_number.includes(q));

    // Status filter
    const matchesStatus = !statusFilter || c.status === statusFilter;

    // Risk level filter
    const matchesRisk = !riskFilter || c.risk_level === riskFilter;

    // Data validation filter
    const matchesValidation = !validationFilter || c.data_validated === validationFilter;

    return matchesSearch && matchesStatus && matchesRisk && matchesValidation;
  });

  // Status badge helper
  const statusBadge = (status) => {
    const badges = {
      'PENDING': 'amber',
      'ACTIVE': 'teal',
      'SUSPENDED': 'red',
      'CLOSED': 'purple',
    };
    return badges[status] || 'purple';
  };

  // Validation badge
  const validationBadge = (validated) => {
    if (validated === 'VALIDATED') return 'teal';
    if (validated === 'PENDING') return 'amber';
    return 'red';
  };

  const table = `
    <table>
      <thead>
        <tr>
          <th>Member ID</th>
          <th>Name</th>
          <th>Status</th>
          <th>Phone</th>
          <th>Risk</th>
          <th>Data</th>
          <th>Doc Expiry</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr>
            <td colspan="8" style="text-align: center; padding: 24px; color: var(--muted);">
              No customers found
            </td>
          </tr>
        ` : rows
          .map(
            (c) => {
              const isSelected = state.selectedCustomerId === c.id;
              const displayName = c.first_name && c.last_name
                ? `${c.first_name} ${c.last_name}`
                : c.full_name || '-';
              return `
          <tr class="${isSelected ? 'customer-selected' : ''}"
              data-customer-id="${c.id}">
            <td style="font-family: monospace; font-size: 12px;">${c.member_id ?? "-"}</td>
            <td>
              <div style="font-weight: 500;">${displayName}</div>
              <div style="font-size: 11px; color: var(--muted);">${c.email ?? ""}</div>
            </td>
            <td><span class="badge ${statusBadge(c.status)}">${c.status || "PENDING"}</span></td>
            <td style="font-size: 12px;">${c.phone_number ?? "-"}</td>
            <td>
              <span class="badge ${riskBadge(c.risk_level)}">${c.risk_level || "low"}</span>
              <span style="font-size: 11px; color: var(--muted); margin-left: 4px;">(${Number(c.risk_score || 0).toFixed(1)})</span>
            </td>
            <td><span class="badge ${validationBadge(c.data_validated)}" style="font-size: 10px;">${c.data_validated || "NOT VALIDATED"}</span></td>
            <td style="font-size: 12px;">${c.document_date_of_expire ?? "-"}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn ghost" onclick="viewCustomer('${c.id}')" style="padding: 6px 10px; font-size: 13px;">View</button>
                <button class="btn ghost" onclick="editCustomer('${c.id}')" style="padding: 6px 10px; font-size: 13px;">Edit</button>
              </div>
            </td>
          </tr>`;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("customerTable").innerHTML = table;
}

function sortTransactions(column) {
  // Toggle direction if clicking the same column
  if (state.transactionSort.column === column) {
    state.transactionSort.direction = state.transactionSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.transactionSort.column = column;
    state.transactionSort.direction = 'asc';
  }
  renderTransactions();
}

function getSortedTransactions(rows) {
  const { column, direction } = state.transactionSort;

  return [...rows].sort((a, b) => {
    let aVal, bVal;

    switch (column) {
      case 'id':
        aVal = parseInt(a.id) || 0;
        bVal = parseInt(b.id) || 0;
        break;
      case 'surrogate_id':
        aVal = (a.surrogate_id || '').toLowerCase();
        bVal = (b.surrogate_id || '').toLowerCase();
        break;
      case 'person':
        aVal = `${a.person_first_name || ''} ${a.person_last_name || ''}`.toLowerCase();
        bVal = `${b.person_first_name || ''} ${b.person_last_name || ''}`.toLowerCase();
        break;
      case 'vendor':
        aVal = (a.vendor_name || '').toLowerCase();
        bVal = (b.vendor_name || '').toLowerCase();
        break;
      case 'amount':
        aVal = parseFloat(a.amount) || 0;
        bVal = parseFloat(b.amount) || 0;
        break;
      case 'financial_status':
        aVal = (a.transaction_financial_status || '').toLowerCase();
        bVal = (b.transaction_financial_status || '').toLowerCase();
        break;
      case 'client_settlement':
        aVal = (a.client_settlement_status || '').toLowerCase();
        bVal = (b.client_settlement_status || '').toLowerCase();
        break;
      case 'delivery_status':
        aVal = (a.transaction_delivery_status || '').toLowerCase();
        bVal = (b.transaction_delivery_status || '').toLowerCase();
        break;
      case 'created_at':
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function getSortIcon(column) {
  if (state.transactionSort.column !== column) {
    return '<span class="sort-icon">⇅</span>';
  }
  return state.transactionSort.direction === 'asc'
    ? '<span class="sort-icon active">↑</span>'
    : '<span class="sort-icon active">↓</span>';
}

function renderTransactions() {
  // Data is already filtered server-side, just sort locally for display
  const rows = getSortedTransactions(state.transactions);

  // Status badge helper
  const statusBadge = (status) => {
    const badges = {
      'PENDING': 'amber',
      'COMPLETED': 'teal',
      'FAILED': 'red',
      'DELIVERED': 'teal',
      'paid': 'teal',
      'unpaid': 'amber',
      'REGULAR': 'purple',
    };
    return badges[status] || 'purple';
  };

  const table = `
    <table>
      <thead>
        <tr>
          <th class="sortable" onclick="sortTransactions('id')">Txn ID ${getSortIcon('id')}</th>
          <th class="sortable" onclick="sortTransactions('surrogate_id')">Surrogate ID ${getSortIcon('surrogate_id')}</th>
          <th class="sortable" onclick="sortTransactions('person')">Person ${getSortIcon('person')}</th>
          <th class="sortable" onclick="sortTransactions('vendor')">Vendor ${getSortIcon('vendor')}</th>
          <th class="sortable" onclick="sortTransactions('amount')">Amount ${getSortIcon('amount')}</th>
          <th class="sortable" onclick="sortTransactions('financial_status')">Financial ${getSortIcon('financial_status')}</th>
          <th class="sortable" onclick="sortTransactions('client_settlement')">Client ${getSortIcon('client_settlement')}</th>
          <th>Vendor</th>
          <th class="sortable" onclick="sortTransactions('delivery_status')">Delivery ${getSortIcon('delivery_status')}</th>
          <th>Customer</th>
          <th class="sortable" onclick="sortTransactions('created_at')">Created ${getSortIcon('created_at')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr>
            <td colspan="11" style="text-align: center; padding: 24px; color: var(--muted);">
              No transactions found
            </td>
          </tr>
        ` : rows
          .map(
            (t) => {
              const hasDiscount = t.original_transaction_amount && t.original_transaction_amount !== t.amount;
              return `
          <tr>
            <td style="font-family: monospace; font-size: 11px; color: var(--muted);">${t.id}</td>
            <td style="font-family: monospace; font-size: 11px;" title="${t.vendor_transaction_id ? 'Vendor ID: ' + t.vendor_transaction_id : ''}">${t.surrogate_id}</td>
            <td>
              <div style="font-weight: 500;">${t.person_first_name} ${t.person_last_name}</div>
            </td>
            <td>
              <div style="font-size: 13px;">${t.vendor_name ?? "-"}</div>
              ${t.price_number_of_months > 1 ? `<div style="font-size: 11px; color: var(--muted);">${t.price_number_of_months}mo${t.grace_number_of_months > 0 ? ' +' + t.grace_number_of_months + ' grace' : ''}</div>` : ''}
            </td>
            <td>
              <div style="font-weight: 600;">${formatCurrency(t.amount)}</div>
              ${hasDiscount ? `<div style="font-size: 11px; color: var(--muted); text-decoration: line-through;">${formatCurrency(t.original_transaction_amount)}</div>` : ''}
            </td>
            <td><span class="badge ${statusBadge(t.transaction_financial_status)}">${t.transaction_financial_status}</span></td>
            <td><span class="badge ${statusBadge(t.client_settlement_status)}">${t.client_settlement_status}</span></td>
            <td><span class="badge ${statusBadge(t.vendor_settlement_status)}">${t.vendor_settlement_status}</span></td>
            <td>
              <span class="badge ${statusBadge(t.transaction_delivery_status)}">${t.transaction_delivery_status}</span>
              ${t.partial_delivery ? '<span style="font-size: 10px; color: var(--amber);"> (partial)</span>' : ''}
            </td>
            <td>
              ${t.customer_name ? `
                <div style="font-size: 12px;">${t.customer_name}</div>
                ${t.risk_level ? `<span class="badge ${riskBadge(t.risk_level)}" style="font-size: 10px;">${t.risk_level}</span>` : ''}
              ` : '<span style="color: var(--muted); font-size: 12px;">-</span>'}
            </td>
            <td style="font-size: 11px;">${new Date(t.created_at).toLocaleString()}</td>
          </tr>`;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;

  // Pagination controls
  const { total, limit, offset, hasMore, loading } = state.transactionPagination;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const startItem = offset + 1;
  const endItem = Math.min(offset + rows.length, total);

  const pagination = `
    <div class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-top: 1px solid var(--border); margin-top: 8px;">
      <div style="color: var(--muted); font-size: 13px;">
        Showing ${rows.length > 0 ? startItem.toLocaleString() : 0} - ${endItem.toLocaleString()} of ${total.toLocaleString()} transactions
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn ghost" onclick="goToTransactionPage(1)" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 10px;">
          ⏮ First
        </button>
        <button class="btn ghost" onclick="goToTransactionPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 12px;">
          ← Prev
        </button>
        <span style="padding: 0 12px; font-size: 13px;">
          Page <strong>${currentPage}</strong> of <strong>${totalPages.toLocaleString()}</strong>
        </span>
        <button class="btn ghost" onclick="goToTransactionPage(${currentPage + 1})" ${!hasMore ? 'disabled' : ''} style="padding: 6px 12px;">
          Next →
        </button>
        <button class="btn ghost" onclick="goToTransactionPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px;">
          Last ⏭
        </button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <label style="font-size: 13px; color: var(--muted);">Per page:</label>
        <select onchange="changeTransactionPageSize(this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);">
          <option value="25" ${limit === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${limit === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${limit === 100 ? 'selected' : ''}>100</option>
          <option value="200" ${limit === 200 ? 'selected' : ''}>200</option>
        </select>
      </div>
    </div>
    ${loading ? '<div style="text-align: center; padding: 8px; color: var(--muted);">Loading...</div>' : ''}
  `;

  document.getElementById("transactionTable").innerHTML = table + pagination;
  renderTransactionStats();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

function renderTransactionStats() {
  // Use total from pagination for overall count
  const total = state.transactionPagination.total || state.transactions.length;
  // Calculate stats from current page (note: these are page-level stats, not global)
  const pendingFinancial = state.transactions.filter(t => t.transaction_financial_status === 'PENDING').length;
  const unpaidClient = state.transactions.filter(t => t.client_settlement_status === 'unpaid').length;
  const totalVolume = state.transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  setText("txnTotalCount", total.toLocaleString());
  setText("txnPendingFinancial", pendingFinancial);
  setText("txnUnpaidClient", unpaidClient);
  setText("txnTotalVolume", formatCurrency(totalVolume));
}

function renderAlerts() {
  // Get contextual filter values from both filter locations
  const q = (alertSearch?.value || alertStreamSearch?.value || '').toLowerCase();
  const statusFilter = alertStatusFilter?.value || alertStatusFilter2?.value || '';
  const severityFilter = alertSeverityFilter?.value || alertSeverityFilter2?.value || '';
  const typeFilter = alertTypeFilter?.value || '';
  const assignedFilter = alertAssignedFilter?.value || '';

  const rows = state.alerts.filter((a) => {
    // Text search
    const matchesSearch = !q ||
      (a.scenario && a.scenario.toLowerCase().includes(q)) ||
      (a.type && a.type.toLowerCase().includes(q)) ||
      (a.details?.definition_name && a.details.definition_name.toLowerCase().includes(q)) ||
      (a.details?.definition_code && a.details.definition_code.toLowerCase().includes(q)) ||
      (a.customer_name && a.customer_name.toLowerCase().includes(q));

    // Status filter
    const matchesStatus = !statusFilter || a.status === statusFilter;

    // Severity filter
    const matchesSeverity = !severityFilter || a.severity === severityFilter;

    // Type filter
    const matchesType = !typeFilter || a.type === typeFilter;

    // Assigned filter
    let matchesAssigned = true;
    if (assignedFilter === 'unassigned') {
      matchesAssigned = !a.assigned_to;
    } else if (assignedFilter === 'me' && currentUser) {
      matchesAssigned = a.assigned_to === currentUser.id;
    }

    return matchesSearch && matchesStatus && matchesSeverity && matchesType && matchesAssigned;
  });

  // Status badge helper - new 6 statuses
  const alertStatusBadge = (status) => {
    const badges = {
      'open': 'amber',
      'assigned': 'blue',
      'in_progress': 'teal',
      'escalated': 'red',
      'on_hold': 'purple',
      'resolved': 'muted',
    };
    return badges[status] || 'muted';
  };

  // Format status for display
  const formatStatus = (status) => {
    const labels = {
      'open': 'Open',
      'assigned': 'Assigned',
      'in_progress': 'In Progress',
      'escalated': 'Escalated',
      'on_hold': 'On Hold',
      'resolved': 'Resolved',
    };
    return labels[status] || status;
  };

  // Get assignment chip - shows task assignee (since assignment is on tasks now)
  const getAssignmentChip = (a) => {
    // Find linked task for this alert
    const linkedTask = state.tasks.find(t => t.alert_id === a.id);

    if (a.status === 'resolved') {
      return a.resolved_by ? `<span class="chip muted">By: ${a.resolved_by}</span>` : '';
    }

    if (linkedTask) {
      const assigneeName = linkedTask.assigned_to_name || linkedTask.claimed_by_name;
      if (assigneeName) {
        const isMyTask = currentUser && (linkedTask.assigned_to === currentUser.id || linkedTask.claimed_by_id === currentUser.id);
        return `<span class="chip ${isMyTask ? 'teal' : 'blue'}">${isMyTask ? 'My task' : assigneeName}</span>`;
      }
    }

    return '<span class="chip amber">Unassigned</span>';
  };

  // Get table actions - simplified to show View Task
  const getTableActions = (a) => {
    const actions = [];

    // Find linked task for this alert
    const linkedTask = state.tasks.find(t => t.alert_id === a.id);

    // Details button first
    actions.push(`<button class="btn ghost small" onclick="openAlertPanel(${a.id})">Details</button>`);

    // View Task button if task exists
    if (linkedTask) {
      actions.push(`<button class="btn primary small" onclick="viewTaskDetail(${linkedTask.id})">View Task</button>`);
    }

    return actions.join(' ');
  };

  const table = `
    <table class="clickable-rows">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Customer</th>
          <th>Severity</th>
          <th>Status</th>
          <th>Task Assignee</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr>
            <td colspan="7" style="text-align: center; padding: 24px; color: var(--muted);">
              No alerts found
            </td>
          </tr>
        ` : rows
          .map(
            (a) => `
          <tr class="alert-row" data-alert-id="${a.id}" onclick="openAlertPanel(${a.id})">
            <td>
              <div class="cell-primary">${a.scenario ?? a.type ?? "-"}</div>
              <div class="cell-secondary">${a.details?.definition_name ?? a.details?.definition_code ?? ""}</div>
            </td>
            <td>${a.customer_name ?? "-"}</td>
            <td><span class="badge ${severityBadge(a.severity)}">${a.severity}</span></td>
            <td><span class="badge ${alertStatusBadge(a.status)}">${formatStatus(a.status)}</span></td>
            <td>${getAssignmentChip(a)}</td>
            <td>${new Date(a.created_at).toLocaleString()}</td>
            <td onclick="event.stopPropagation()">${getTableActions(a)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  const alertTable = document.getElementById("alertTable");
  const alertTable2 = document.getElementById("alertTable2");
  if (alertTable) alertTable.innerHTML = table;
  if (alertTable2) alertTable2.innerHTML = table;

  // Update alert stats
  renderAlertStats();
}

function renderAlertStats() {
  const alerts = state.alerts;
  const openCount = alerts.filter(a => a.status === 'open').length;
  const assignedCount = alerts.filter(a => a.status === 'assigned' || a.status === 'in_progress').length;
  const escalatedCount = alerts.filter(a => a.status === 'escalated').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resolvedTodayCount = alerts.filter(a => {
    if (a.status !== 'resolved' || !a.resolved_at) return false;
    const resolved = new Date(a.resolved_at);
    return resolved >= today;
  }).length;

  const openEl = document.getElementById('alertOpenCount');
  const assignedEl = document.getElementById('alertAssignedCount');
  const escalatedEl = document.getElementById('alertEscalatedCount');
  const resolvedTodayEl = document.getElementById('alertResolvedTodayCount');

  if (openEl) openEl.textContent = openCount;
  if (assignedEl) assignedEl.textContent = assignedCount;
  if (escalatedEl) escalatedEl.textContent = escalatedCount;
  if (resolvedTodayEl) resolvedTodayEl.textContent = resolvedTodayCount;
}

function renderTasks() {
  const q = (taskSearch?.value || "").toLowerCase();
  const status = taskStatusFilter?.value || "";
  const type = taskTypeFilter?.value || "";
  const priority = taskPriorityFilter?.value || "";
  const unclaimedOnly = taskUnclaimedOnly?.checked;

  const rows = state.tasks.filter((t) => {
    const matchesSearch =
      !q ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.customer_name && t.customer_name.toLowerCase().includes(q));
    const matchesStatus = !status || t.status === status;
    const matchesType = !type || t.task_type === type;
    const matchesPriority = !priority || t.priority === priority;
    const matchesUnclaimed = !unclaimedOnly || (!t.claimed_by_id && !t.assigned_to);
    return matchesSearch && matchesStatus && matchesType && matchesPriority && matchesUnclaimed;
  });

  const statusBadge = (s) => {
    const map = {
      pending: "amber",
      in_progress: "blue",
      completed: "teal",
    };
    return map[s] || "muted";
  };

  const priorityBadge = (p) => {
    const map = {
      low: "muted",
      medium: "amber",
      high: "red",
      critical: "red",
    };
    return map[p] || "muted";
  };

  const isMyTask = (t) => currentUser && (t.claimed_by_id === currentUser.id || t.assigned_to === currentUser.id);
  const isOverdue = (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';

  // Generate assignment/claim chip based on task status
  const getAssignmentChip = (t) => {
    // For completed tasks, show who completed it
    if (t.status === 'completed') {
      if (t.claimed_by_name) {
        return `<span class="chip muted">By: ${t.claimed_by_name}</span>`;
      }
      return '';
    }
    // For active tasks, show assignment status
    if (t.assigned_to) {
      return `<span class="chip blue">Assigned: ${t.assigned_to_name || 'User'}</span>`;
    }
    if (t.claimed_by_id) {
      return `<span class="chip ${isMyTask(t) ? 'teal' : ''}">${isMyTask(t) ? 'My task' : (t.claimed_by_name || 'Claimed')}</span>`;
    }
    return '<span class="chip amber">Unclaimed</span>';
  };

  const list = rows
    .map(
      (t) => `
        <div class="task-card ${isOverdue(t) ? 'overdue' : ''} ${isMyTask(t) ? 'my-claim' : ''}" data-task-id="${t.id}">
          <div class="task-card-header">
            <div class="task-card-title">
              <span class="title">${t.title}</span>
              ${t.customer_name ? `<span class="customer-link" onclick="viewCustomer('${t.customer_id}')">${t.customer_name}</span>` : ''}
            </div>
            <div class="task-badges">
              <span class="badge ${priorityBadge(t.priority)}">${t.priority}</span>
              <span class="badge ${statusBadge(t.status)}">${t.status}</span>
              ${t.workflow_status && t.status !== 'completed' ? `<span class="badge blue">${t.workflow_status}</span>` : ''}
            </div>
          </div>
          <div class="task-card-body">
            <div class="task-meta">
              <span class="chip">${t.task_type.replace('_', ' ')}</span>
              ${t.alert_id ? `<span class="chip">Alert #${t.alert_id}</span>` : ''}
              ${getAssignmentChip(t)}
              ${isOverdue(t) ? '<span class="chip red">Overdue</span>' : ''}
            </div>
            ${t.description ? `<p class="task-description">${t.description}</p>` : ''}
            ${t.due_date ? `<p class="task-due">Due: ${new Date(t.due_date).toLocaleString()}</p>` : ''}
          </div>
          <div class="task-card-actions">
            <button class="btn ghost" onclick="viewTaskDetail(${t.id})">View</button>
            ${t.status === 'pending' && !t.claimed_by_id && !t.assigned_to ? `<button class="btn primary" onclick="showAssignTaskModal(${t.id})">Assign</button>` : ''}
            ${t.status === 'in_progress' && isMyTask(t) ? `
              <button class="btn ghost" onclick="releaseTask(${t.id})">Release</button>
              <button class="btn primary" onclick="completeTaskPrompt(${t.id})">Complete</button>
              ${!t.workflow_id ? `<button class="btn ghost" onclick="startTaskWorkflow(${t.id})">Start Workflow</button>` : ''}
            ` : ''}
          </div>
        </div>
      `
    )
    .join("");

  const container = document.getElementById("taskList");
  if (container) container.innerHTML = list || emptyState("No tasks yet");

  // Update task stats
  renderTaskStats();
}

function renderTaskStats() {
  const tasks = state.tasks;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const criticalCount = tasks.filter(t => t.priority === 'critical' && t.status !== 'completed').length;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const dueTodayCount = tasks.filter(t => {
    if (!t.due_date || t.status === 'completed') return false;
    const due = new Date(t.due_date);
    return due <= today;
  }).length;

  const pendingEl = document.getElementById('taskPendingCount');
  const inProgressEl = document.getElementById('taskInProgressCount');
  const criticalEl = document.getElementById('taskCriticalCount');
  const dueTodayEl = document.getElementById('taskDueTodayCount');

  if (pendingEl) pendingEl.textContent = pendingCount;
  if (inProgressEl) inProgressEl.textContent = inProgressCount;
  if (criticalEl) criticalEl.textContent = criticalCount;
  if (dueTodayEl) dueTodayEl.textContent = dueTodayCount;
}

async function handleAlertAction(event) {
  const btn = event.currentTarget;
  const alertId = parseInt(btn.dataset.alertId, 10);
  const action = btn.dataset.alertAction;
  if (!alertId || !action) return;

  try {
    await startAlertWorkflow(alertId, action);
  } catch (error) {
    console.error("Alert action failed", error);
    showToast("error", "Action failed", error.message || "Unable to update alert");
  }
}

async function startAlertWorkflow(alertId, action = "investigation") {
  const result = await fetchJSON(`/workflows/alert-handling/start?alert_id=${alertId}&action=${action}`, {
    method: "POST",
  });
  if (result) {
    showToast("success", "Workflow started", `Alert ${alertId} investigation started`);
    await loadAlerts();
    await loadTasks();
    await loadWorkflows();
  } else {
    throw new Error("Unable to start workflow");
  }
}

// Deprecated helper kept for potential future reuse
async function updateAlertStatus(alertId, status, notes) {
  const result = await fetchJSON(`/alerts/${alertId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      resolution_notes: notes,
      resolved_by: "console",
    }),
  });
  if (result) {
    showToast("success", "Alert updated", `Alert ${alertId} set to ${status}`);
    await loadAlerts();
  } else {
    throw new Error("Update failed");
  }
}

// =============================================================================
// ALERT LIFECYCLE FUNCTIONS
// =============================================================================

// Currently selected alert for the panel
let selectedAlertId = null;

// Open the slide-out panel with alert details
async function openAlertPanel(alertId) {
  selectedAlertId = alertId;
  const panel = document.getElementById('detailPanel');
  const overlay = document.getElementById('detailPanelOverlay');

  if (!panel || !overlay) return;

  // Show loading state
  document.getElementById('panelContent').innerHTML = '<div style="padding: 24px; text-align: center;">Loading...</div>';
  document.getElementById('panelActions').innerHTML = '';

  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');

  // Highlight the selected row
  document.querySelectorAll('.alert-row').forEach(row => row.classList.remove('selected'));
  const selectedRow = document.querySelector(`.alert-row[data-alert-id="${alertId}"]`);
  if (selectedRow) selectedRow.classList.add('selected');

  // Fetch alert and find linked task
  try {
    const alert = await fetchJSON(`/alerts/${alertId}`);
    if (!alert) throw new Error('Alert not found');

    // Find linked task from state.tasks (alert_id matches)
    const linkedTask = state.tasks.find(t => t.alert_id === alertId);

    renderSimplifiedAlertPanel(alert, linkedTask);
  } catch (error) {
    document.getElementById('panelContent').innerHTML = `<div style="padding: 24px; color: var(--red);">Error loading alert: ${error.message}</div>`;
  }
}

// Simplified alert panel - shows detection details + link to task
function renderSimplifiedAlertPanel(alert, linkedTask) {
  const content = document.getElementById('panelContent');
  const actions = document.getElementById('panelActions');
  const title = document.getElementById('panelTitle');

  if (title) title.textContent = `Alert #${alert.id}`;

  // Status badge helper
  const statusBadge = {
    'open': 'amber',
    'resolved': 'teal',
  };

  // Format alert details (amount, transaction type, etc.)
  const formatDetails = (details) => {
    if (!details) return '';
    const items = [];
    if (details.amount) items.push(`<div class="panel-row"><span class="label">Amount</span><span>${details.amount.toLocaleString()} ${details.currency || 'EUR'}</span></div>`);
    if (details.transaction_type) items.push(`<div class="panel-row"><span class="label">Transaction Type</span><span>${details.transaction_type}</span></div>`);
    if (details.risk_score) items.push(`<div class="panel-row"><span class="label">Risk Score</span><span>${details.risk_score}</span></div>`);
    return items.join('');
  };

  // Task status display
  const taskStatusBadge = (status) => {
    const map = { pending: 'amber', in_progress: 'blue', completed: 'teal' };
    return map[status] || 'muted';
  };

  const html = `
    <div class="simplified-alert-panel">
      <!-- Detection Summary -->
      <div class="panel-section">
        <h4 style="margin-top: 0; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detection Details</h4>
        <div class="panel-row">
          <span class="label">Scenario</span>
          <span style="font-weight: 500;">${alert.scenario?.replace(/_/g, ' ') || '-'}</span>
        </div>
        <div class="panel-row">
          <span class="label">Severity</span>
          <span class="badge ${severityBadge(alert.severity)}">${alert.severity}</span>
        </div>
        <div class="panel-row">
          <span class="label">Status</span>
          <span class="badge ${statusBadge[alert.status] || 'muted'}">${alert.status}</span>
        </div>
        ${alert.customer_name ? `
          <div class="panel-row">
            <span class="label">Customer</span>
            <span><a href="#" onclick="viewCustomerDetails('${alert.customer_id}')">${alert.customer_name}</a></span>
          </div>
        ` : ''}
        <div class="panel-row">
          <span class="label">Detected</span>
          <span>${new Date(alert.created_at).toLocaleString()}</span>
        </div>
        ${formatDetails(alert.details)}
      </div>

      <!-- Linked Task Card -->
      <div class="panel-section">
        <h4 style="margin-top: 0; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Investigation Task</h4>
        ${linkedTask ? `
          <div class="task-link-card" style="background: var(--bg-muted); border-radius: 8px; padding: 16px; border-left: 4px solid var(--teal); cursor: pointer;" onclick="viewTaskDetail(${linkedTask.id})">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div>
                <div style="font-weight: 600; margin-bottom: 4px;">Task #${linkedTask.id}</div>
                <div style="font-size: 13px; color: var(--text-muted);">${linkedTask.title || linkedTask.task_type?.replace(/_/g, ' ')}</div>
              </div>
              <span class="badge ${taskStatusBadge(linkedTask.status)}">${linkedTask.status}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
              <div>
                <span class="label" style="display: block; margin-bottom: 2px;">Assigned To</span>
                <span style="font-weight: 500;">${linkedTask.assigned_to_name || linkedTask.claimed_by_name || 'Unassigned'}</span>
              </div>
              <div>
                <span class="label" style="display: block; margin-bottom: 2px;">Priority</span>
                <span class="badge ${linkedTask.priority === 'critical' ? 'red' : linkedTask.priority === 'high' ? 'amber' : 'muted'}">${linkedTask.priority || 'medium'}</span>
              </div>
            </div>
            <div style="margin-top: 12px; text-align: center;">
              <span style="color: var(--teal); font-weight: 500;">Click to view investigation details →</span>
            </div>
          </div>
        ` : `
          <div style="background: var(--bg-muted); border-radius: 8px; padding: 16px; text-align: center; color: var(--text-muted);">
            <p style="margin: 0;">No task linked to this alert</p>
            <p style="margin: 8px 0 0 0; font-size: 12px;">Tasks are auto-created based on alert definitions</p>
          </div>
        `}
      </div>

      ${alert.status === 'resolved' ? `
        <div class="panel-section">
          <h4 style="margin-top: 0; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Resolution</h4>
          <div class="panel-row">
            <span class="label">Resolution Type</span>
            <span>${alert.resolution_type?.replace(/_/g, ' ') || '-'}</span>
          </div>
          ${alert.resolution_notes ? `
            <div class="panel-row">
              <span class="label">Notes</span>
              <span>${alert.resolution_notes}</span>
            </div>
          ` : ''}
          <div class="panel-row">
            <span class="label">Resolved At</span>
            <span>${alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : '-'}</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  content.innerHTML = html;

  // Simplified actions - just Back button and View Task (if linked)
  const actionsHtml = `
    <div style="display: flex; justify-content: space-between; width: 100%;">
      <button class="btn ghost" onclick="closeDetailPanel()">Back</button>
      ${linkedTask ? `
        <button class="btn primary" onclick="viewTaskDetail(${linkedTask.id})">View Investigation Task</button>
      ` : ''}
    </div>
  `;

  actions.innerHTML = actionsHtml;
}

function closeDetailPanel() {
  const panel = document.getElementById('detailPanel');
  const overlay = document.getElementById('detailPanelOverlay');

  if (!panel || panel.classList.contains('hidden')) return;

  // Add closing animation classes
  panel.classList.add('closing');
  overlay.classList.add('closing');

  // After animation completes, hide elements
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('closing');
    overlay.classList.add('hidden');
    overlay.classList.remove('closing');

    // Remove row highlight
    document.querySelectorAll('.alert-row').forEach(row => row.classList.remove('selected'));
    selectedAlertId = null;
    state.selectedTask = null;

    // Reset edit mode
    panelEditMode = false;
    currentPanelAlert = null;
    currentPanelNotes = [];
    currentPanelAttachments = [];
  }, 250); // Match animation duration
}

// Handle Escape key to close panel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailPanel();
  }
});

// Track panel edit mode
let panelEditMode = false;
let currentPanelAlert = null;
let currentPanelNotes = [];
let currentPanelAttachments = [];

function renderAlertPanelContent(alert, notes, history, attachments = []) {
  const content = document.getElementById('panelContent');
  const actions = document.getElementById('panelActions');
  const title = document.getElementById('panelTitle');

  // Store current data for edit mode
  currentPanelAlert = alert;
  currentPanelNotes = notes;
  currentPanelAttachments = attachments;

  // Update title
  if (title) title.textContent = `Alert #${alert.id}`;

  // Status badge helper
  const getStatusBadge = (status) => {
    const badges = {
      'open': 'amber',
      'assigned': 'blue',
      'in_progress': 'teal',
      'escalated': 'red',
      'on_hold': 'purple',
      'resolved': 'muted',
    };
    const labels = {
      'open': 'Open',
      'assigned': 'Assigned',
      'in_progress': 'In Progress',
      'escalated': 'Escalated',
      'on_hold': 'On Hold',
      'resolved': 'Resolved',
    };
    return `<span class="badge ${badges[status] || 'muted'}">${labels[status] || status}</span>`;
  };

  // Resolution type badge
  const getResolutionBadge = (type) => {
    const badges = {
      'confirmed_suspicious': 'red',
      'false_positive': 'muted',
      'not_suspicious': 'teal',
      'duplicate': 'muted',
      'other': 'muted',
    };
    const labels = {
      'confirmed_suspicious': 'Confirmed Suspicious',
      'false_positive': 'False Positive',
      'not_suspicious': 'Not Suspicious',
      'duplicate': 'Duplicate',
      'other': 'Other',
    };
    return type ? `<span class="badge ${badges[type] || 'muted'}">${labels[type] || type}</span>` : '';
  };

  // Format due date for input
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
  };

  // Priority row - editable or view mode
  const priorityRow = panelEditMode ? `
    <div class="panel-row">
      <span class="label">Priority</span>
      <select id="editAlertPriority" class="input" style="width: auto; min-width: 120px;">
        <option value="low" ${alert.priority === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${alert.priority === 'medium' || !alert.priority ? 'selected' : ''}>Medium</option>
        <option value="high" ${alert.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="critical" ${alert.priority === 'critical' ? 'selected' : ''}>Critical</option>
      </select>
    </div>
  ` : `
    <div class="panel-row">
      <span class="label">Priority</span>
      <span class="badge ${alert.priority === 'critical' ? 'red' : alert.priority === 'high' ? 'amber' : 'muted'}">${alert.priority || 'medium'}</span>
    </div>
  `;

  // Due date row - editable or view mode
  const dueDateRow = panelEditMode ? `
    <div class="panel-row">
      <span class="label">Due Date</span>
      <input type="datetime-local" id="editAlertDueDate" class="input" style="width: auto;" value="${formatDateForInput(alert.due_date)}">
    </div>
  ` : (alert.due_date ? `
    <div class="panel-row">
      <span class="label">Due Date</span>
      <span>${new Date(alert.due_date).toLocaleString()}</span>
    </div>
  ` : '');

  // Assignee row - editable or view mode
  const assigneeRow = panelEditMode ? `
    <div class="panel-row">
      <span class="label">Assigned to</span>
      <select id="editAlertAssignee" class="input" style="width: auto; min-width: 150px;">
        <option value="">Unassigned</option>
        ${state.users.filter(u => u.is_active).map(u => `
          <option value="${u.id}" ${alert.assigned_to === u.id ? 'selected' : ''}>${u.full_name} (${u.role})</option>
        `).join('')}
      </select>
    </div>
  ` : (alert.assigned_to_name ? `
    <div class="panel-row">
      <span class="label">Assigned to</span>
      <span>${alert.assigned_to_name}</span>
    </div>
  ` : '');

  const html = `
    <div class="panel-section">
      <div class="panel-row">
        <span class="label">Status</span>
        <span>${getStatusBadge(alert.status)}</span>
      </div>
      <div class="panel-row">
        <span class="label">Severity</span>
        <span class="badge ${severityBadge(alert.severity)}">${alert.severity}</span>
      </div>
      ${priorityRow}
      ${dueDateRow}
      ${assigneeRow}
      ${alert.escalated_to_name ? `
        <div class="panel-row">
          <span class="label">Escalated to</span>
          <span>${alert.escalated_to_name}</span>
        </div>
        <div class="panel-row">
          <span class="label">Escalation reason</span>
          <span>${alert.escalation_reason || '-'}</span>
        </div>
      ` : ''}
    </div>

    <div class="panel-section">
      <h4>Alert Details</h4>
      <div class="panel-row">
        <span class="label">Scenario</span>
        <span>${alert.scenario || '-'}</span>
      </div>
      <div class="panel-row">
        <span class="label">Type</span>
        <span>${alert.type || '-'}</span>
      </div>
      ${alert.customer_name ? `
        <div class="panel-row">
          <span class="label">Customer</span>
          <span><a href="#" onclick="viewCustomerDetails('${alert.customer_id}')">${alert.customer_name}</a></span>
        </div>
      ` : ''}
      <div class="panel-row">
        <span class="label">Created</span>
        <span>${new Date(alert.created_at).toLocaleString()}</span>
      </div>
      ${alert.details ? `
        <div class="panel-row">
          <span class="label">Details</span>
          <span class="details-json">${formatAlertDetails(alert.details)}</span>
        </div>
      ` : ''}
    </div>

    ${alert.status === 'resolved' ? `
      <div class="panel-section">
        <h4>Resolution</h4>
        <div class="panel-row">
          <span class="label">Resolution type</span>
          <span>${getResolutionBadge(alert.resolution_type)}</span>
        </div>
        ${alert.resolution_notes ? `
          <div class="panel-row">
            <span class="label">Notes</span>
            <span>${alert.resolution_notes}</span>
          </div>
        ` : ''}
        <div class="panel-row">
          <span class="label">Resolved at</span>
          <span>${alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : '-'}</span>
        </div>
      </div>
    ` : ''}

    <div class="panel-section">
      <h4>Notes</h4>
      <div class="inline-note-form" style="margin-bottom: 12px;">
        <textarea id="inlineAlertNote" class="input" placeholder="Add a note..." rows="2" style="width: 100%; resize: vertical;"></textarea>
        <button class="btn primary small" onclick="addInlineAlertNote(${alert.id})" style="margin-top: 8px;">Add Note</button>
      </div>
      <div class="notes-list">
        ${notes.length === 0 ? '<p class="muted">No notes yet</p>' : notes.map(n => `
          <div class="note-item">
            <div class="note-header">
              <span class="note-author">${n.user_name || 'System'}</span>
              <span class="note-date">${new Date(n.created_at).toLocaleString()}</span>
            </div>
            <div class="note-content">${n.content}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel-section">
      <h4>Attachments</h4>
      <div class="inline-attachment-form" style="margin-bottom: 12px;">
        <input type="file" id="inlineAlertAttachment" style="display: none;" onchange="uploadInlineAlertAttachment(${alert.id}, this.files[0])">
        <button class="btn ghost small" onclick="document.getElementById('inlineAlertAttachment').click()">
          + Upload File
        </button>
      </div>
      <div class="attachments-list">
        ${attachments.length === 0 ? '<p class="muted">No attachments</p>' : attachments.map(a => `
          <div class="attachment-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-muted); border-radius: 4px; margin: 4px 0;">
            <span style="flex: 1;">${a.original_filename}</span>
            <span style="font-size: 12px; color: var(--text-muted);">${(a.file_size / 1024).toFixed(1)} KB</span>
            <button class="btn ghost small" onclick="downloadAlertAttachment(${alert.id}, ${a.id})">Download</button>
            <button class="btn ghost small" onclick="deleteAlertAttachment(${alert.id}, ${a.id})" style="color: var(--red);">&times;</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel-section">
      <h4>History</h4>
      <div class="history-timeline">
        ${history.length === 0 ? '<p class="muted">No history</p>' : history.map(h => `
          <div class="history-item">
            <div class="history-dot"></div>
            <div class="history-content">
              <span class="history-change">${h.previous_status ? `${h.previous_status} → ` : ''}${h.new_status}</span>
              ${h.changed_by_name ? `<span class="history-by"> by ${h.changed_by_name}</span>` : ''}
              ${h.reason ? `<div class="history-reason">${h.reason}</div>` : ''}
              <span class="history-date">${new Date(h.created_at).toLocaleString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  content.innerHTML = html;
  actions.innerHTML = getAlertPanelActions(alert);
}

function formatAlertDetails(details) {
  if (!details) return '-';
  const entries = Object.entries(details)
    .filter(([k, v]) => v !== null && v !== undefined && !['definition_name', 'definition_code'].includes(k))
    .map(([k, v]) => `<div><span class="label">${k.replace(/_/g, ' ')}:</span> ${v}</div>`)
    .join('');
  return entries || '-';
}

function getAlertPanelActions(alert) {
  const isMyAlert = currentUser && alert.assigned_to === currentUser.id;
  const canManage = currentUser && ['manager', 'admin'].includes(currentUser.role);

  // In edit mode, show Save and Cancel buttons
  if (panelEditMode) {
    return `
      <div style="display: flex; justify-content: space-between; width: 100%;">
        <button class="btn ghost" onclick="closeDetailPanel()">Back</button>
        <div style="display: flex; gap: 8px;">
          <button class="btn ghost" onclick="toggleAlertEditMode()">Cancel</button>
          <button class="btn primary" onclick="saveAlertEdits(${alert.id})">Save Changes</button>
        </div>
      </div>
    `;
  }

  // Build status-specific actions
  const statusActions = [];

  switch (alert.status) {
    case 'open':
      statusActions.push(`<button class="btn primary" onclick="assignAlertToMe(${alert.id})">Claim</button>`);
      if (canManage) {
        statusActions.push(`<button class="btn ghost" onclick="openAlertAssignModal(${alert.id})">Assign to...</button>`);
      }
      break;

    case 'assigned':
      if (isMyAlert) {
        statusActions.push(`<button class="btn primary" onclick="startAlertWork(${alert.id})">Start Work</button>`);
        statusActions.push(`<button class="btn ghost" onclick="unassignAlert(${alert.id})">Unassign</button>`);
      }
      if (canManage && !isMyAlert) {
        statusActions.push(`<button class="btn ghost" onclick="openAlertAssignModal(${alert.id})">Reassign</button>`);
      }
      break;

    case 'in_progress':
      if (isMyAlert) {
        statusActions.push(`<button class="btn primary" onclick="openAlertResolveModal(${alert.id})">Resolve</button>`);
        statusActions.push(`<button class="btn ghost" onclick="openAlertEscalateModal(${alert.id})">Escalate</button>`);
        statusActions.push(`<button class="btn ghost" onclick="openAlertHoldModal(${alert.id})">Put on Hold</button>`);
      }
      break;

    case 'escalated':
      if (isMyAlert) {
        statusActions.push(`<button class="btn primary" onclick="resumeAlert(${alert.id})">Resume</button>`);
      }
      if (canManage) {
        statusActions.push(`<button class="btn primary" onclick="openAlertResolveModal(${alert.id})">Resolve</button>`);
        statusActions.push(`<button class="btn ghost" onclick="openAlertAssignModal(${alert.id})">Reassign</button>`);
      }
      break;

    case 'on_hold':
      if (isMyAlert) {
        statusActions.push(`<button class="btn primary" onclick="resumeAlert(${alert.id})">Resume</button>`);
        statusActions.push(`<button class="btn ghost" onclick="openAlertResolveModal(${alert.id})">Resolve</button>`);
      }
      break;

    case 'resolved':
      if (canManage) {
        statusActions.push(`<button class="btn ghost" onclick="reopenAlert(${alert.id})">Reopen</button>`);
      }
      break;
  }

  // Edit button only for non-resolved alerts
  const editBtn = alert.status !== 'resolved'
    ? `<button class="btn ghost" onclick="toggleAlertEditMode()">Edit</button>`
    : '';

  return `
    <div style="display: flex; justify-content: space-between; width: 100%;">
      <button class="btn ghost" onclick="closeDetailPanel()">Back</button>
      <div style="display: flex; gap: 8px;">
        ${editBtn}
        ${statusActions.join(' ')}
      </div>
    </div>
  `;
}

// Alert lifecycle API calls
function getAlertApiParams() {
  if (!currentUser) return '';
  return `?current_user_id=${currentUser.id}&current_user_role=${currentUser.role || 'analyst'}`;
}

async function assignAlertToMe(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in to claim alerts');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/assign${params}`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to: currentUser.id }),
    });

    if (result) {
      showToast('success', 'Alert claimed', `Alert #${alertId} is now assigned to you`);
      await loadAlerts();
      if (selectedAlertId === alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to claim', error.message);
  }
}

async function unassignAlert(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/unassign${params}`, {
      method: 'POST',
    });

    if (result) {
      showToast('success', 'Alert unassigned', `Alert #${alertId} is now unassigned`);
      await loadAlerts();
      if (selectedAlertId === alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to unassign', error.message);
  }
}

async function startAlertWork(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/start${params}`, {
      method: 'POST',
    });

    if (result) {
      showToast('success', 'Work started', `Alert #${alertId} is now in progress`);
      await loadAlerts();
      if (selectedAlertId === alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to start work', error.message);
  }
}

async function resumeAlert(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/resume${params}`, {
      method: 'POST',
    });

    if (result) {
      showToast('success', 'Work resumed', `Alert #${alertId} is now in progress`);
      await loadAlerts();
      if (selectedAlertId === alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to resume', error.message);
  }
}

async function reopenAlert(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/reopen${params}`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Reopened by manager' }),
    });

    if (result) {
      showToast('success', 'Alert reopened', `Alert #${alertId} has been reopened`);
      await loadAlerts();
      if (selectedAlertId === alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to reopen', error.message);
  }
}

// Modal handlers
function openAlertAssignModal(alertId) {
  document.getElementById('alertAssignId').value = alertId;
  populateUserSelect('alertAssignTo');
  document.getElementById('alertAssignModal').classList.remove('hidden');
}

function closeAlertAssignModal() {
  document.getElementById('alertAssignModal').classList.add('hidden');
  document.getElementById('alertAssignForm').reset();
}

async function submitAlertAssign(event) {
  event.preventDefault();
  const alertId = document.getElementById('alertAssignId').value;
  const assignedTo = document.getElementById('alertAssignTo').value;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/assign${params}`, {
      method: 'POST',
      body: JSON.stringify({
        assigned_to: assignedTo,
        assigned_by: currentUser.id,
      }),
    });

    if (result) {
      showToast('success', 'Alert assigned', `Alert #${alertId} has been assigned`);
      closeAlertAssignModal();
      await loadAlerts();
      if (selectedAlertId == alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to assign', error.message);
  }
}

function openAlertEscalateModal(alertId) {
  document.getElementById('alertEscalateId').value = alertId;
  populateUserSelect('alertEscalateTo', ['senior_analyst', 'manager', 'admin']);
  document.getElementById('alertEscalateModal').classList.remove('hidden');
}

function closeAlertEscalateModal() {
  document.getElementById('alertEscalateModal').classList.add('hidden');
  document.getElementById('alertEscalateForm').reset();
}

async function submitAlertEscalate(event) {
  event.preventDefault();
  const alertId = document.getElementById('alertEscalateId').value;
  const escalateTo = document.getElementById('alertEscalateTo').value;
  const reason = document.getElementById('alertEscalateReason').value;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/escalate${params}`, {
      method: 'POST',
      body: JSON.stringify({
        escalated_to: escalateTo,
        reason: reason,
      }),
    });

    if (result) {
      showToast('success', 'Alert escalated', `Alert #${alertId} has been escalated`);
      closeAlertEscalateModal();
      await loadAlerts();
      if (selectedAlertId == alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to escalate', error.message);
  }
}

function openAlertResolveModal(alertId) {
  document.getElementById('alertResolveId').value = alertId;
  document.getElementById('alertResolveModal').classList.remove('hidden');
}

function closeAlertResolveModal() {
  document.getElementById('alertResolveModal').classList.add('hidden');
  document.getElementById('alertResolveForm').reset();
}

function toggleResolutionNotes() {
  const type = document.getElementById('alertResolutionType').value;
  const notes = document.getElementById('alertResolutionNotes');
  if (type === 'other') {
    notes.required = true;
    notes.placeholder = 'Required for "Other" resolution type...';
  } else {
    notes.required = false;
    notes.placeholder = 'Add notes about the resolution...';
  }
}

async function submitAlertResolve(event) {
  event.preventDefault();
  const alertId = document.getElementById('alertResolveId').value;
  const resolutionType = document.getElementById('alertResolutionType').value;
  const notes = document.getElementById('alertResolutionNotes').value;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/resolve${params}`, {
      method: 'POST',
      body: JSON.stringify({
        resolution_type: resolutionType,
        resolution_notes: notes || null,
      }),
    });

    if (result) {
      showToast('success', 'Alert resolved', `Alert #${alertId} has been resolved`);
      closeAlertResolveModal();
      await loadAlerts();
      if (selectedAlertId == alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to resolve', error.message);
  }
}

function openAlertHoldModal(alertId) {
  document.getElementById('alertHoldId').value = alertId;
  document.getElementById('alertHoldModal').classList.remove('hidden');
}

function closeAlertHoldModal() {
  document.getElementById('alertHoldModal').classList.add('hidden');
  document.getElementById('alertHoldForm').reset();
}

async function submitAlertHold(event) {
  event.preventDefault();
  const alertId = document.getElementById('alertHoldId').value;
  const reason = document.getElementById('alertHoldReason').value;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in');
    return;
  }

  try {
    const params = getAlertApiParams();
    const result = await fetchJSON(`/alerts/${alertId}/hold${params}`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reason || null,
      }),
    });

    if (result) {
      showToast('success', 'Alert on hold', `Alert #${alertId} is now on hold`);
      closeAlertHoldModal();
      await loadAlerts();
      if (selectedAlertId == alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to put on hold', error.message);
  }
}

function openAlertNoteModal(alertId) {
  document.getElementById('alertNoteAlertId').value = alertId;
  document.getElementById('alertNoteModal').classList.remove('hidden');
}

function closeAlertNoteModal() {
  document.getElementById('alertNoteModal').classList.add('hidden');
  document.getElementById('alertNoteForm').reset();
}

async function submitAlertNote(event) {
  event.preventDefault();
  const alertId = document.getElementById('alertNoteAlertId').value;
  const content = document.getElementById('alertNoteContent').value;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in to add notes');
    return;
  }

  try {
    const result = await fetchJSON(`/alerts/${alertId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: currentUser.id,
        content: content,
        note_type: 'comment',
      }),
    });

    if (result) {
      showToast('success', 'Note added', 'Your note has been added');
      closeAlertNoteModal();
      if (selectedAlertId == alertId) {
        openAlertPanel(alertId);
      }
    }
  } catch (error) {
    showToast('error', 'Failed to add note', error.message);
  }
}

// Populate user select dropdowns
function populateUserSelect(selectId, roleFilter = null) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const users = roleFilter
    ? state.users.filter(u => roleFilter.includes(u.role) && u.is_active)
    : state.users.filter(u => u.is_active);

  select.innerHTML = '<option value="">Select user...</option>';
  users.forEach(user => {
    const option = document.createElement('option');
    option.value = user.id;
    option.textContent = `${user.full_name} (${user.role})`;
    select.appendChild(option);
  });
}

// =============================================================================
// ALERT PANEL EDIT MODE FUNCTIONS
// =============================================================================

function toggleAlertEditMode() {
  panelEditMode = !panelEditMode;
  if (currentPanelAlert) {
    // Re-fetch and render with edit mode
    openAlertPanel(currentPanelAlert.id);
  }
}

async function saveAlertEdits(alertId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in to save changes');
    return;
  }

  const priority = document.getElementById('editAlertPriority')?.value;
  const dueDate = document.getElementById('editAlertDueDate')?.value;
  const assignee = document.getElementById('editAlertAssignee')?.value;

  try {
    // Update priority and due date
    if (priority || dueDate !== undefined) {
      const params = new URLSearchParams();
      params.append('current_user_id', currentUser.id);
      if (priority) params.append('priority', priority);
      if (dueDate !== undefined) params.append('due_date', dueDate || '');

      await fetchJSON(`/alerts/${alertId}?${params.toString()}`, {
        method: 'PATCH',
      });
    }

    // Handle assignee change separately (goes through Temporal)
    if (assignee !== undefined) {
      const currentAssignee = currentPanelAlert.assigned_to;
      if (assignee && assignee !== currentAssignee) {
        // Assign to new user
        await fetchJSON(`/alerts/${alertId}/assign${getAlertApiParams()}`, {
          method: 'POST',
          body: JSON.stringify({
            assigned_to: assignee,
            assigned_by: currentUser.id,
          }),
        });
      } else if (!assignee && currentAssignee) {
        // Unassign
        await fetchJSON(`/alerts/${alertId}/unassign${getAlertApiParams()}`, {
          method: 'POST',
        });
      }
    }

    showToast('success', 'Saved', 'Alert updated successfully');
    panelEditMode = false;
    await loadAlerts();
    await openAlertPanel(alertId);
  } catch (error) {
    showToast('error', 'Save failed', error.message || 'Unable to save changes');
  }
}

async function addInlineAlertNote(alertId) {
  const textarea = document.getElementById('inlineAlertNote');
  const content = textarea?.value?.trim();

  if (!content) {
    showToast('error', 'Empty note', 'Please enter a note');
    return;
  }

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in to add notes');
    return;
  }

  try {
    await fetchJSON(`/alerts/${alertId}/notes${getAlertApiParams()}`, {
      method: 'POST',
      body: JSON.stringify({
        content: content,
        note_type: 'comment',
      }),
    });

    showToast('success', 'Note added', 'Your note has been saved');
    textarea.value = '';
    await openAlertPanel(alertId); // Refresh panel
  } catch (error) {
    showToast('error', 'Failed to add note', error.message || 'Unable to add note');
  }
}

async function uploadInlineAlertAttachment(alertId, file) {
  if (!file) return;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Please log in to upload files');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('error', 'File too large', 'Maximum file size is 10MB');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/alerts/${alertId}/attachments?current_user_id=${currentUser.id}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }

    showToast('success', 'File uploaded', 'Attachment added successfully');
    document.getElementById('inlineAlertAttachment').value = '';
    await openAlertPanel(alertId); // Refresh panel
  } catch (error) {
    showToast('error', 'Upload failed', error.message || 'Unable to upload file');
  }
}

async function downloadAlertAttachment(alertId, attachmentId) {
  try {
    const response = await fetch(`/alerts/${alertId}/attachments/${attachmentId}/download`);
    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'download';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (error) {
    showToast('error', 'Download failed', error.message || 'Unable to download file');
  }
}

async function deleteAlertAttachment(alertId, attachmentId) {
  if (!confirm('Delete this attachment?')) return;

  try {
    await fetchJSON(`/alerts/${alertId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });

    showToast('success', 'Deleted', 'Attachment removed');
    await openAlertPanel(alertId); // Refresh panel
  } catch (error) {
    showToast('error', 'Delete failed', error.message || 'Unable to delete attachment');
  }
}

// Export alert lifecycle functions to window for onclick handlers
window.openAlertPanel = openAlertPanel;
window.closeDetailPanel = closeDetailPanel;
window.assignAlertToMe = assignAlertToMe;
window.unassignAlert = unassignAlert;
window.toggleAlertEditMode = toggleAlertEditMode;
window.saveAlertEdits = saveAlertEdits;
window.addInlineAlertNote = addInlineAlertNote;
window.uploadInlineAlertAttachment = uploadInlineAlertAttachment;
window.downloadAlertAttachment = downloadAlertAttachment;
window.deleteAlertAttachment = deleteAlertAttachment;
window.startAlertWork = startAlertWork;
window.resumeAlert = resumeAlert;
window.reopenAlert = reopenAlert;
window.openAlertAssignModal = openAlertAssignModal;
window.closeAlertAssignModal = closeAlertAssignModal;
window.submitAlertAssign = submitAlertAssign;
window.openAlertEscalateModal = openAlertEscalateModal;
window.closeAlertEscalateModal = closeAlertEscalateModal;
window.submitAlertEscalate = submitAlertEscalate;
window.openAlertResolveModal = openAlertResolveModal;
window.closeAlertResolveModal = closeAlertResolveModal;
window.submitAlertResolve = submitAlertResolve;
window.openAlertHoldModal = openAlertHoldModal;
window.closeAlertHoldModal = closeAlertHoldModal;
window.submitAlertHold = submitAlertHold;
window.openAlertNoteModal = openAlertNoteModal;
window.closeAlertNoteModal = closeAlertNoteModal;
window.submitAlertNote = submitAlertNote;

// =============================================================================
// END ALERT LIFECYCLE FUNCTIONS
// =============================================================================

function renderAlertDefinitions() {
  const list = state.alertDefinitions
    .map(
      (d) => `
        <div class="row definition-row">
          <div>
            <div class="title">${d.name}${d.is_system_default ? ' <span class="chip" style="background: rgba(91,224,179,0.12); color: var(--primary);">System</span>' : ""}</div>
            <div class="subtitle">${d.description ?? ""}</div>
            <div class="chips">
              <span class="chip">${d.code}</span>
              <span class="chip">${d.category}</span>
              <span class="chip">${d.direction ?? "transaction"}</span>
              ${d.threshold_amount ? `<span class="chip">≥ ${d.threshold_amount}</span>` : ""}
              ${d.window_minutes ? `<span class="chip">${d.window_minutes}m window</span>` : ""}
            </div>
          </div>
          <div class="row-actions">
            <span class="badge ${severityBadge(d.severity)}">${d.severity}</span>
            <button class="btn ghost" data-edit-def="${d.id}" style="padding: 6px 10px; font-size: 13px;">Edit</button>
            ${!d.is_system_default ? `<button class="btn ghost" data-delete-def="${d.id}" style="padding: 6px 10px; font-size: 13px; color: var(--red);">Delete</button>` : ""}
            <label class="switch">
              <input type="checkbox" data-definition-id="${d.id}" ${d.enabled ? "checked" : ""} />
              <span></span>
            </label>
          </div>
        </div>
      `
    )
    .join("");
  const defList = document.getElementById("alertDefinitions");
  const defList2 = document.getElementById("alertDefinitions2");
  if (defList) defList.innerHTML = list || emptyState("No definitions");
  if (defList2) defList2.innerHTML = list || emptyState("No definitions");

  // Toggle enable/disable
  document.querySelectorAll("[data-definition-id]").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const id = e.target.dataset.definitionId;
      const enabled = e.target.checked;
      await fetchJSON(`/alert-definitions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await loadAlertDefinitions();
    });
  });

  // Edit buttons
  document.querySelectorAll("[data-edit-def]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.editDef);
      const definition = state.alertDefinitions.find(d => d.id === id);
      if (definition) openAlertDefModalForEdit(definition);
    });
  });

  // Delete buttons
  document.querySelectorAll("[data-delete-def]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.deleteDef);
      const definition = state.alertDefinitions.find(d => d.id === id);
      if (definition && confirm(`Delete alert rule "${definition.name}"?`)) {
        await fetchJSON(`/alert-definitions/${id}`, {
          method: "DELETE",
        });
        await loadAlertDefinitions();
      }
    });
  });
}

function renderReports() {
  const highRisk = state.reports.highRisk
    .map(
      (c) => `
        <div class="row">
          <div>
            <div class="title">${c.full_name ?? c.id}</div>
            <div class="subtitle">${c.country ?? "-"} · Score ${c.risk_score}</div>
          </div>
          <span class="badge ${riskBadge(c.risk_level)}">${c.risk_level}</span>
        </div>
      `
    )
    .join("");
  document.getElementById("reportHighRisk").innerHTML = highRisk || emptyState("No high-risk customers");

  const alertRows = state.reports.alerts
    .map(
      (a) => `
        <div class="row">
          <div>
            <div class="title">${a.type}</div>
            <div class="subtitle">${a.scenario ?? "-"} · ${new Date(a.created_at).toLocaleString()}</div>
          </div>
          <span class="badge ${severityBadge(a.severity)}">${a.severity}</span>
        </div>
      `
    )
    .join("");
  document.getElementById("reportAlerts").innerHTML = alertRows || emptyState("No alerts for period");
}

function renderOverview() {
  const openAlerts = state.alerts.filter((a) => a.status === "open").length;
  const highRisk = state.customers.filter((c) => c.risk_level === "high").length;
  const now = Date.now();
  const recentVolume = state.transactions
    .filter((t) => now - new Date(t.created_at).getTime() < 24 * 3600 * 1000)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  setText("statAlerts", openAlerts);
  setText("statHighRisk", highRisk);
  setText("statVolume", recentVolume.toLocaleString(undefined, { maximumFractionDigits: 0 }));

  document.getElementById("recentAlerts").innerHTML =
    state.alerts
      .slice(0, 5)
      .map(
        (a) => `
        <div class="row">
          <div>
            <div class="title">${a.type}</div>
            <div class="subtitle">${a.scenario ?? "-"} · ${new Date(a.created_at).toLocaleTimeString()}</div>
          </div>
          <span class="badge ${severityBadge(a.severity)}">${a.severity}</span>
        </div>`
      )
      .join("") || emptyState("No alerts");

  document.getElementById("recentTransactions").innerHTML =
    state.transactions
      .slice(0, 5)
      .map(
        (t) => `
        <div class="row">
          <div>
            <div class="title">${t.person_first_name} ${t.person_last_name}</div>
            <div class="subtitle">${formatCurrency(t.amount)} · ${t.vendor_name || 'N/A'} · ${new Date(t.created_at).toLocaleTimeString()}</div>
          </div>
          <span class="badge ${t.transaction_financial_status === 'COMPLETED' ? 'teal' : t.transaction_financial_status === 'PENDING' ? 'amber' : 'purple'}">${t.transaction_financial_status}</span>
        </div>`
      )
      .join("") || emptyState("No transactions");
}

function renderReportingStats() {
  // Country Distribution
  const totalCustomers = state.customers.length;
  setText("totalCustomers", totalCustomers);

  // Transactions vs Alerts
  const totalTransactions = state.transactions.length;
  const totalAlerts = state.alerts.length;
  const alertRate = totalTransactions > 0 ? ((totalAlerts / totalTransactions) * 100).toFixed(1) : 0;
  const avgDaily = (totalTransactions / 30).toFixed(0);

  setText("totalTransactions", totalTransactions);
  setText("totalAlerts", totalAlerts);
  setText("alertRate", `${alertRate}%`);
  setText("avgDailyTransactions", avgDaily);

  // Risk Analysis
  const highRisk = state.customers.filter(c => c.risk_level === 'high').length;
  const mediumRisk = state.customers.filter(c => c.risk_level === 'medium').length;
  const lowRisk = state.customers.filter(c => c.risk_level === 'low').length;
  const avgRisk = state.customers.reduce((sum, c) => sum + (Number(c.risk_score) || 0), 0) / (totalCustomers || 1);

  setText("highRiskCount", highRisk);
  setText("mediumRiskCount", mediumRisk);
  setText("lowRiskCount", lowRisk);
  setText("avgRiskScore", avgRisk.toFixed(1));
}

function renderAll() {
  renderCustomers();
  renderTransactions();
  renderAlerts();
  renderAlertDefinitions();
  renderReports();
  renderOverview();
  renderReportingStats();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function riskBadge(level) {
  if (level === "high") return "red";
  if (level === "medium") return "amber";
  return "teal";
}

function severityBadge(sev) {
  if (sev === "high") return "red";
  if (sev === "medium") return "amber";
  return "teal";
}

function emptyState(text) {
  return `<div class="muted">${text}</div>`;
}

function sampleCustomers() {
  return [
    {
      id: "c1",
      member_id: "161390",
      first_name: "Ionela",
      last_name: "Cojocaru",
      full_name: "Ionela Cojocaru",
      phone_number: "40766259918",
      status: "PENDING",
      email: "ionela@example.com",
      birth_date: "1978-11-19",
      identity_number: "2781119436018",
      country_of_birth: "ROMANIA",
      address_city: "Bucuresti",
      document_type: "PERSONAL_ID",
      document_id: "RD836425",
      document_date_of_expire: "2027-11-19",
      data_validated: "NOT VALIDATED",
      marketing_consent: "ACCEPTED",
      risk_score: 8.2,
      risk_level: "high",
      pep_flag: true,
      sanctions_hit: false
    },
    {
      id: "c2",
      member_id: "161391",
      first_name: "John",
      last_name: "Doe",
      full_name: "John Doe",
      phone_number: "40755123456",
      status: "ACTIVE",
      email: "john@example.com",
      birth_date: "1985-03-15",
      identity_number: "1850315123456",
      country_of_birth: "ROMANIA",
      address_city: "Cluj-Napoca",
      document_type: "PERSONAL_ID",
      document_id: "AB123456",
      document_date_of_expire: "2025-12-10",
      data_validated: "VALIDATED",
      marketing_consent: "REJECTED",
      risk_score: 5.1,
      risk_level: "medium",
      pep_flag: false,
      sanctions_hit: false
    },
    {
      id: "c3",
      member_id: "161392",
      first_name: "Maria",
      last_name: "Pop",
      full_name: "Maria Pop",
      phone_number: "40722987654",
      status: "ACTIVE",
      email: "maria@example.com",
      birth_date: "1990-07-22",
      identity_number: "2900722654321",
      country_of_birth: "ROMANIA",
      address_city: "Timisoara",
      document_type: "PASSPORT",
      document_id: "PAR987654",
      document_date_of_expire: "2026-01-01",
      data_validated: "VALIDATED",
      marketing_consent: "ACCEPTED",
      risk_score: 2.1,
      risk_level: "low",
      pep_flag: false,
      sanctions_hit: false
    },
  ];
}
function sampleTransactions() {
  const now = new Date();
  return [
    {
      id: 1,
      surrogate_id: "TXN-DEMO-001",
      person_first_name: "John",
      person_last_name: "Doe",
      vendor_name: "Demo Vendor",
      price_number_of_months: 12,
      grace_number_of_months: 0,
      original_transaction_amount: 12000,
      amount: 12000,
      vendor_transaction_id: "VND-001",
      client_settlement_status: "unpaid",
      vendor_settlement_status: "unpaid",
      transaction_delivery_status: "PENDING",
      partial_delivery: false,
      transaction_last_activity: "REGULAR",
      transaction_financial_status: "PENDING",
      customer_id: "c1",
      customer_name: "John Doe",
      risk_level: "high",
      created_at: now.toISOString()
    },
    {
      id: 2,
      surrogate_id: "TXN-DEMO-002",
      person_first_name: "Jane",
      person_last_name: "Smith",
      vendor_name: "Test Vendor",
      price_number_of_months: 6,
      grace_number_of_months: 1,
      original_transaction_amount: 2200,
      amount: 2200,
      vendor_transaction_id: "VND-002",
      client_settlement_status: "paid",
      vendor_settlement_status: "paid",
      transaction_delivery_status: "DELIVERED",
      partial_delivery: false,
      transaction_last_activity: "REGULAR",
      transaction_financial_status: "COMPLETED",
      customer_id: "c2",
      customer_name: "Jane Smith",
      risk_level: "medium",
      created_at: now.toISOString()
    },
  ];
}
function sampleAlerts() {
  return [
    { id: 10, type: "transaction_monitoring", scenario: "large_transaction", severity: "high", status: "open", created_at: new Date().toISOString() },
    { id: 11, type: "workflow", scenario: "sanctions_match", severity: "high", status: "open", created_at: new Date().toISOString() },
  ];
}

async function loadAll() {
  // Load users first to set currentUser before other loads
  await loadUsers();
  await Promise.all([
    loadCustomers(),
    loadTransactions(),
    loadAlerts(),
    loadTasks(),
    loadAlertDefinitions(),
    loadReports(),
  ]);
}

// =============================================================================
// Server-Sent Events (SSE) for Real-Time Updates
// =============================================================================

let transactionEventSource = null;
let alertEventSource = null;
let liveIndicator = null;

function createLiveIndicator() {
  // Create live indicator if it doesn't exist
  const header = document.querySelector('.panel-header');
  if (!header || document.getElementById('liveIndicator')) return;

  const indicator = document.createElement('div');
  indicator.id = 'liveIndicator';
  indicator.className = 'live-indicator';
  indicator.innerHTML = '<span class="pulse-dot"></span> <span>Live</span>';
  indicator.style.cssText = 'display: flex; align-items: center; gap: 6px; color: #10b981; font-size: 12px; font-weight: 600;';

  const pulseDot = indicator.querySelector('.pulse-dot');
  pulseDot.style.cssText = 'width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;';

  header.appendChild(indicator);
  liveIndicator = indicator;

  // Add CSS animation if not already present
  if (!document.getElementById('sseStyles')) {
    const style = document.createElement('style');
    style.id = 'sseStyles';
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
      }
      .transaction-new {
        animation: highlight 1s ease-out;
      }
      @keyframes highlight {
        0% { background-color: rgba(34, 197, 94, 0.2); }
        100% { background-color: transparent; }
      }
    `;
    document.head.appendChild(style);
  }
}

function setLiveStatus(isLive) {
  if (!liveIndicator) return;
  if (isLive) {
    liveIndicator.style.display = 'flex';
  } else {
    liveIndicator.style.display = 'none';
  }
}

function startTransactionStream() {
  if (transactionEventSource) {
    transactionEventSource.close();
  }

  console.log('🔴 Starting transaction SSE stream...');

  transactionEventSource = new EventSource(`${API_BASE}/stream/transactions`);

  transactionEventSource.onopen = () => {
    console.log('✅ Transaction stream connected');
    setLiveStatus(true);
  };

  transactionEventSource.onmessage = (event) => {
    try {
      const transaction = JSON.parse(event.data);
      console.log('📊 New transaction received:', transaction);

      // Add to state if not already present
      const exists = state.transactions.find(t => t.id === transaction.id);
      if (!exists) {
        state.transactions.unshift(transaction);

        // Keep only last 150 transactions
        if (state.transactions.length > 150) {
          state.transactions = state.transactions.slice(0, 150);
        }

        // Re-render transactions if on transactions panel
        const transactionsPanel = document.getElementById('transactions');
        if (transactionsPanel && transactionsPanel.classList.contains('active')) {
          renderTransactions();
          renderOverview();
        }
      }
    } catch (error) {
      console.error('Error parsing transaction:', error);
    }
  };

  transactionEventSource.onerror = (error) => {
    console.error('❌ Transaction stream error:', error);
    setLiveStatus(false);

    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log('🔄 Reconnecting transaction stream...');
      startTransactionStream();
    }, 5000);
  };
}

function startAlertStream() {
  if (alertEventSource) {
    alertEventSource.close();
  }

  console.log('🔴 Starting alert SSE stream...');

  alertEventSource = new EventSource(`${API_BASE}/stream/alerts`);

  alertEventSource.onopen = () => {
    console.log('✅ Alert stream connected');
  };

  alertEventSource.onmessage = (event) => {
    try {
      const alert = JSON.parse(event.data);
      console.log('🚨 New alert received:', alert);

      // Add to state if not already present
      const exists = state.alerts.find(a => a.id === alert.id);
      if (!exists) {
        state.alerts.unshift(alert);

        // Keep only last 100 alerts
        if (state.alerts.length > 100) {
          state.alerts = state.alerts.slice(0, 100);
        }

        // Re-render alerts if viewing the alert stream
        const alertsPanel = document.getElementById('alert-stream');
        if (alertsPanel && alertsPanel.classList.contains('active')) {
          renderAlerts();
          renderOverview();
        }
      }
    } catch (error) {
      console.error('Error parsing alert:', error);
    }
  };

  alertEventSource.onerror = (error) => {
    console.error('❌ Alert stream error:', error);

    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log('🔄 Reconnecting alert stream...');
      startAlertStream();
    }, 5000);
  };
}

function stopStreams() {
  if (transactionEventSource) {
    transactionEventSource.close();
    transactionEventSource = null;
  }
  if (alertEventSource) {
    alertEventSource.close();
    alertEventSource = null;
  }
  setLiveStatus(false);
  console.log('⏹️ SSE streams stopped');
}

// Clean up on page unload
window.addEventListener('beforeunload', stopStreams);

// Initialize everything
initTheme();

// Load the correct panel based on current URL
const currentPath = window.location.pathname;
const normalizedPath = legacyRoutes[currentPath] || currentPath;
const panelId = routes[normalizedPath] || routes['/'];

// Check for query parameters (e.g., customer ID)
const urlParams = new URLSearchParams(window.location.search);
const customerId = urlParams.get('id');
if (customerId) {
  state.selectedCustomerId = customerId;
}

activatePanel(panelId, normalizedPath, false);

// Set initial history state; normalize legacy paths
if (!window.history.state || normalizedPath !== currentPath) {
  window.history.replaceState({ path: normalizedPath }, '', normalizedPath);
}

// initApp - called after successful authentication
function initApp() {
  loadAll().then(() => {
    // Start SSE streams after initial load
    createLiveIndicator();
    startTransactionStream();
    startAlertStream();

    // Ensure stats are computed after all data is loaded
    if (typeof renderTaskStats === 'function') renderTaskStats();
    if (typeof renderAlertStats === 'function') renderAlertStats();
  });
}

// Expose functions to window for onclick handlers
window.logout = logout;
window.toggleUserDropdown = toggleUserDropdown;

// ========================================
// Settings functionality
// ========================================

const settingsBtn = document.getElementById('settingsBtn');
const companyForm = document.getElementById('companyForm');
const riskMatrixForm = document.getElementById('riskMatrixForm');
const resetRiskMatrixBtn = document.getElementById('resetRiskMatrix');

// Settings tab switching
document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update tab content
    document.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(targetTab).classList.add('active');
  });
});

// Settings button - open settings panel
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    navigate('/settings');
  });
}

// Settings cards - navigate to respective panels
document.querySelectorAll('.settings-card[data-target]').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.target;
    const path = `/${target}`;
    navigate(path);
  });
});

// Default settings
const defaultSettings = {
  company: {
    company_name: '',
    registration_number: '',
    address_line1: '',
    city: '',
    postal_code: '',
    country: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    compliance_officer_name: '',
    compliance_officer_email: '',
    compliance_officer_phone: ''
  },
  riskMatrix: {
    geography_weight: 30,
    product_weight: 20,
    behavior_weight: 30,
    pep_penalty: 10,
    sanctions_penalty: 15,
    adverse_media_penalty: 5,
    high_threshold: 70,
    medium_threshold: 40
  }
};

// Load settings from localStorage
function loadSettings() {
  try {
    const savedSettings = localStorage.getItem('trustrelaySettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;

    // Load company info
    Object.keys(settings.company || defaultSettings.company).forEach(key => {
      const input = companyForm.querySelector(`[name="${key}"]`);
      if (input) {
        input.value = settings.company[key] || '';
      }
    });

    // Load risk matrix
    Object.keys(settings.riskMatrix || defaultSettings.riskMatrix).forEach(key => {
      const input = riskMatrixForm.querySelector(`[name="${key}"]`);
      if (input) {
        input.value = settings.riskMatrix[key] || defaultSettings.riskMatrix[key];
      }
    });

    // Update weight preview
    updateWeightPreview();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save company info
companyForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const formData = new FormData(companyForm);
  const companyData = {};

  for (let [key, value] of formData.entries()) {
    companyData[key] = value;
  }

  try {
    const savedSettings = localStorage.getItem('trustrelaySettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    settings.company = companyData;

    localStorage.setItem('trustrelaySettings', JSON.stringify(settings));
    alert('Company information saved successfully!');
  } catch (error) {
    console.error('Error saving company info:', error);
    alert('Failed to save company information');
  }
});

// Save risk matrix
riskMatrixForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const formData = new FormData(riskMatrixForm);
  const riskMatrixData = {};

  for (let [key, value] of formData.entries()) {
    riskMatrixData[key] = parseFloat(value);
  }

  // Validate total weight
  const totalWeight = riskMatrixData.geography_weight + riskMatrixData.product_weight + riskMatrixData.behavior_weight;
  if (totalWeight > 100) {
    alert(`Total weight cannot exceed 100%. Current total: ${totalWeight}%`);
    return;
  }

  try {
    const savedSettings = localStorage.getItem('trustrelaySettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    settings.riskMatrix = riskMatrixData;

    localStorage.setItem('trustrelaySettings', JSON.stringify(settings));
    alert('Risk matrix configuration saved successfully!');
  } catch (error) {
    console.error('Error saving risk matrix:', error);
    alert('Failed to save risk matrix configuration');
  }
});

// Update weight preview in real-time
function updateWeightPreview() {
  const geoWeight = parseFloat(riskMatrixForm.querySelector('[name="geography_weight"]').value) || 0;
  const prodWeight = parseFloat(riskMatrixForm.querySelector('[name="product_weight"]').value) || 0;
  const behavWeight = parseFloat(riskMatrixForm.querySelector('[name="behavior_weight"]').value) || 0;

  const totalWeight = geoWeight + prodWeight + behavWeight;

  // Update formula preview
  const formulaPreview = document.getElementById('formulaPreview');
  if (formulaPreview) {
    const divisor = totalWeight / 10; // To scale to 1-100
    formulaPreview.textContent = `(geo × ${geoWeight} + prod × ${prodWeight} + behav × ${behavWeight}) / ${divisor.toFixed(1)}`;
  }

  // Update total weight display
  const totalWeightDisplay = document.getElementById('totalWeight');
  if (totalWeightDisplay) {
    totalWeightDisplay.textContent = `${totalWeight}%`;

    // Color code the total weight
    if (totalWeight > 100) {
      totalWeightDisplay.style.color = 'var(--red)';
    } else if (totalWeight === 80) {
      totalWeightDisplay.style.color = 'var(--primary)';
    } else {
      totalWeightDisplay.style.color = 'var(--amber)';
    }
  }
}

// Attach listeners to weight inputs
['geography_weight', 'product_weight', 'behavior_weight'].forEach(name => {
  const input = riskMatrixForm.querySelector(`[name="${name}"]`);
  if (input) {
    input.addEventListener('input', updateWeightPreview);
    input.addEventListener('change', updateWeightPreview);
  }
});

// Reset risk matrix to defaults
if (resetRiskMatrixBtn) {
  resetRiskMatrixBtn.addEventListener('click', () => {
    if (confirm('Reset all risk matrix settings to default values?')) {
      Object.keys(defaultSettings.riskMatrix).forEach(key => {
        const input = riskMatrixForm.querySelector(`[name="${key}"]`);
        if (input) {
          input.value = defaultSettings.riskMatrix[key];
        }
      });
      updateWeightPreview();
    }
  });
}

// Initialize weight preview
updateWeightPreview();

// ========================================
// Geography Risk functionality
// ========================================

// Country risk sorting state
const countryRiskSort = {
  column: 'risk_score',
  direction: 'desc'
};

// Default country risk data
const defaultCountryRisks = [
  { code: 'US', name: 'United States', risk_score: 2 },
  { code: 'GB', name: 'United Kingdom', risk_score: 2 },
  { code: 'DE', name: 'Germany', risk_score: 2 },
  { code: 'FR', name: 'France', risk_score: 2 },
  { code: 'NL', name: 'Netherlands', risk_score: 2 },
  { code: 'CH', name: 'Switzerland', risk_score: 3 },
  { code: 'AT', name: 'Austria', risk_score: 2 },
  { code: 'BE', name: 'Belgium', risk_score: 2 },
  { code: 'IT', name: 'Italy', risk_score: 3 },
  { code: 'ES', name: 'Spain', risk_score: 2 },
  { code: 'PT', name: 'Portugal', risk_score: 2 },
  { code: 'PL', name: 'Poland', risk_score: 3 },
  { code: 'RO', name: 'Romania', risk_score: 4 },
  { code: 'BG', name: 'Bulgaria', risk_score: 5 },
  { code: 'HU', name: 'Hungary', risk_score: 4 },
  { code: 'CZ', name: 'Czech Republic', risk_score: 3 },
  { code: 'SK', name: 'Slovakia', risk_score: 3 },
  { code: 'SI', name: 'Slovenia', risk_score: 3 },
  { code: 'HR', name: 'Croatia', risk_score: 4 },
  { code: 'RS', name: 'Serbia', risk_score: 6 },
  { code: 'UA', name: 'Ukraine', risk_score: 7 },
  { code: 'RU', name: 'Russia', risk_score: 9 },
  { code: 'BY', name: 'Belarus', risk_score: 9 },
  { code: 'CN', name: 'China', risk_score: 6 },
  { code: 'HK', name: 'Hong Kong', risk_score: 5 },
  { code: 'SG', name: 'Singapore', risk_score: 3 },
  { code: 'JP', name: 'Japan', risk_score: 2 },
  { code: 'KR', name: 'South Korea', risk_score: 2 },
  { code: 'AE', name: 'United Arab Emirates', risk_score: 5 },
  { code: 'SA', name: 'Saudi Arabia', risk_score: 6 },
  { code: 'TR', name: 'Turkey', risk_score: 6 },
  { code: 'IL', name: 'Israel', risk_score: 4 },
  { code: 'EG', name: 'Egypt', risk_score: 6 },
  { code: 'ZA', name: 'South Africa', risk_score: 5 },
  { code: 'NG', name: 'Nigeria', risk_score: 8 },
  { code: 'KE', name: 'Kenya', risk_score: 7 },
  { code: 'BR', name: 'Brazil', risk_score: 5 },
  { code: 'MX', name: 'Mexico', risk_score: 6 },
  { code: 'AR', name: 'Argentina', risk_score: 5 },
  { code: 'CO', name: 'Colombia', risk_score: 6 },
  { code: 'VE', name: 'Venezuela', risk_score: 9 },
  { code: 'PA', name: 'Panama', risk_score: 7 },
  { code: 'KY', name: 'Cayman Islands', risk_score: 7 },
  { code: 'VG', name: 'British Virgin Islands', risk_score: 8 },
  { code: 'CY', name: 'Cyprus', risk_score: 6 },
  { code: 'MT', name: 'Malta', risk_score: 5 },
  { code: 'AF', name: 'Afghanistan', risk_score: 10 },
  { code: 'IR', name: 'Iran', risk_score: 10 },
  { code: 'KP', name: 'North Korea', risk_score: 10 },
  { code: 'SY', name: 'Syria', risk_score: 10 },
  { code: 'MM', name: 'Myanmar', risk_score: 9 },
];

// Load country risks from localStorage or use defaults
function loadCountryRisks() {
  try {
    const saved = localStorage.getItem('trustrelayCountryRisks');
    return saved ? JSON.parse(saved) : [...defaultCountryRisks];
  } catch (error) {
    console.error('Error loading country risks:', error);
    return [...defaultCountryRisks];
  }
}

// Save country risks to localStorage
function saveCountryRisks(risks) {
  try {
    localStorage.setItem('trustrelayCountryRisks', JSON.stringify(risks));
  } catch (error) {
    console.error('Error saving country risks:', error);
  }
}

// Get risk level from score
function getCountryRiskLevel(score) {
  if (score >= 8) return { level: 'critical', color: 'red' };
  if (score >= 6) return { level: 'high', color: 'red' };
  if (score >= 4) return { level: 'medium', color: 'amber' };
  return { level: 'low', color: 'teal' };
}

// Sort country risks
function sortCountryRisks(column) {
  if (countryRiskSort.column === column) {
    countryRiskSort.direction = countryRiskSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    countryRiskSort.column = column;
    countryRiskSort.direction = column === 'risk_score' ? 'desc' : 'asc';
  }
  renderCountryRiskTable();
}

// Get sort icon for country table
function getCountrySortIcon(column) {
  if (countryRiskSort.column !== column) {
    return '<span class="sort-icon">⇅</span>';
  }
  return countryRiskSort.direction === 'asc'
    ? '<span class="sort-icon active">↑</span>'
    : '<span class="sort-icon active">↓</span>';
}

// Make sort function globally available
window.sortCountryRisks = sortCountryRisks;

// Render country risk table
function renderCountryRiskTable() {
  const tableContainer = document.querySelector('.country-risk-table');
  if (!tableContainer) return;

  const searchInput = document.getElementById('countrySearchInput');
  const searchTerm = (searchInput?.value || '').toLowerCase();

  const countryRisks = loadCountryRisks();
  const filtered = countryRisks.filter(c =>
    c.name.toLowerCase().includes(searchTerm) ||
    c.code.toLowerCase().includes(searchTerm)
  );

  // Sort based on current sort state
  filtered.sort((a, b) => {
    let aVal, bVal;

    switch (countryRiskSort.column) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'code':
        aVal = a.code.toLowerCase();
        bVal = b.code.toLowerCase();
        break;
      case 'risk_score':
        aVal = a.risk_score;
        bVal = b.risk_score;
        break;
      case 'risk_level':
        aVal = a.risk_score; // Sort by score for level
        bVal = b.risk_score;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return countryRiskSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return countryRiskSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const tableHTML = `
    <table>
      <thead>
        <tr>
          <th class="sortable" onclick="sortCountryRisks('name')">Country ${getCountrySortIcon('name')}</th>
          <th class="sortable" onclick="sortCountryRisks('code')">ISO Code ${getCountrySortIcon('code')}</th>
          <th class="sortable" onclick="sortCountryRisks('risk_score')" style="width: 150px;">Risk Score ${getCountrySortIcon('risk_score')}</th>
          <th class="sortable" onclick="sortCountryRisks('risk_level')" style="width: 100px;">Risk Level ${getCountrySortIcon('risk_level')}</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.length === 0 ? `
          <tr>
            <td colspan="5" style="text-align: center; padding: 24px; color: var(--muted);">
              No countries found
            </td>
          </tr>
        ` : filtered.map(country => {
          const riskInfo = getCountryRiskLevel(country.risk_score);
          return `
            <tr data-country-code="${country.code}">
              <td style="font-weight: 500;">${country.name}</td>
              <td><span class="chip">${country.code}</span></td>
              <td>
                <input type="range" min="1" max="10" value="${country.risk_score}"
                       class="country-risk-slider" data-code="${country.code}"
                       style="width: 80px; vertical-align: middle;" />
                <span class="country-risk-value" style="margin-left: 8px; font-weight: 600; min-width: 20px; display: inline-block;">${country.risk_score}</span>
              </td>
              <td><span class="badge ${riskInfo.color}">${riskInfo.level}</span></td>
              <td>
                <button class="btn ghost" onclick="deleteCountryRisk('${country.code}')" style="padding: 4px 8px; font-size: 12px; color: var(--red);">Remove</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = tableHTML;

  // Attach slider event listeners
  tableContainer.querySelectorAll('.country-risk-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      const row = e.target.closest('tr');

      // Update display value
      row.querySelector('.country-risk-value').textContent = value;

      // Update badge
      const riskInfo = getCountryRiskLevel(value);
      const badge = row.querySelector('.badge');
      badge.textContent = riskInfo.level;
      badge.className = `badge ${riskInfo.color}`;
    });

    slider.addEventListener('change', (e) => {
      const code = e.target.dataset.code;
      const value = parseInt(e.target.value);
      updateCountryRisk(code, value);
    });
  });
}

// Update country risk score
function updateCountryRisk(code, score) {
  const risks = loadCountryRisks();
  const country = risks.find(c => c.code === code);
  if (country) {
    country.risk_score = score;
    saveCountryRisks(risks);
    showToast('success', 'Risk Updated', `${country.name} risk score set to ${score}`);
  }
}

// Delete country from risk list
function deleteCountryRisk(code) {
  if (!confirm('Remove this country from the risk list?')) return;

  const risks = loadCountryRisks();
  const index = risks.findIndex(c => c.code === code);
  if (index > -1) {
    const country = risks[index];
    risks.splice(index, 1);
    saveCountryRisks(risks);
    renderCountryRiskTable();
    showToast('success', 'Country Removed', `${country.name} removed from risk list`);
  }
}

// Add new country
function addCountryRisk() {
  const name = prompt('Enter country name:');
  if (!name) return;

  const code = prompt('Enter ISO country code (2 letters):');
  if (!code || code.length !== 2) {
    alert('Please enter a valid 2-letter ISO country code');
    return;
  }

  const risks = loadCountryRisks();
  if (risks.find(c => c.code.toUpperCase() === code.toUpperCase())) {
    alert('This country code already exists');
    return;
  }

  const score = parseInt(prompt('Enter risk score (1-10):', '5'));
  if (isNaN(score) || score < 1 || score > 10) {
    alert('Please enter a valid risk score between 1 and 10');
    return;
  }

  risks.push({
    code: code.toUpperCase(),
    name: name,
    risk_score: score
  });

  saveCountryRisks(risks);
  renderCountryRiskTable();
  showToast('success', 'Country Added', `${name} added with risk score ${score}`);
}

// Make functions globally available
window.deleteCountryRisk = deleteCountryRisk;
window.addCountryRisk = addCountryRisk;

// Event listeners for Geography Risk
const countrySearchInput = document.getElementById('countrySearchInput');
const addCountryBtn = document.getElementById('addCountryBtn');

if (countrySearchInput) {
  countrySearchInput.addEventListener('input', renderCountryRiskTable);
}

if (addCountryBtn) {
  addCountryBtn.addEventListener('click', addCountryRisk);
}

// Initialize country risk table when settings tab is opened
document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'geography-risk') {
      renderCountryRiskTable();
    }
  });
});

// ========================================
// Workflows functionality
// ========================================

const refreshWorkflowsBtn = document.getElementById('refreshWorkflowsBtn');
const workflowStatusFilter = document.getElementById('workflowStatusFilter');
const workflowTypeFilter = document.getElementById('workflowTypeFilter');
const workflowsListView = document.getElementById('workflowsListView');
const workflowModal = document.getElementById('workflowModal');
const workflowForm = document.getElementById('workflowForm');
const closeWorkflowModalBtn = document.getElementById('closeWorkflowModal');
const workflowDetailsPanel = document.getElementById('workflowDetailsPanel');

let allWorkflows = [];
let currentWorkflowType = '';

// Open workflow modal
function openWorkflowModal(workflowType) {
  currentWorkflowType = workflowType;
  const workflowTypeInput = document.getElementById('workflowType');
  const workflowModalTitle = document.getElementById('workflowModalTitle');
  const workflowDescText = document.getElementById('workflowDescText');
  const kycParams = document.getElementById('kycRefreshParams');
  const sanctionsParams = document.getElementById('sanctionsParams');
  const customerSelect = document.getElementById('workflowCustomerId');

  // Populate customer dropdown
  customerSelect.innerHTML = '<option value="">Select a customer...</option>' +
    state.customers.map(c => `<option value="${c.id}">${c.full_name} (${c.email || 'No email'})</option>`).join('');

  // Configure modal based on workflow type
  if (workflowType === 'kyc-refresh') {
    workflowTypeInput.value = 'kyc-refresh';
    workflowModalTitle.textContent = 'Start KYC Refresh Workflow';
    workflowDescText.textContent = 'This workflow will check the selected customer\'s document expiration date and create a KYC task if the document is expiring soon.';
    kycParams.style.display = 'block';
    sanctionsParams.style.display = 'none';
  } else if (workflowType === 'sanctions-screening') {
    workflowTypeInput.value = 'sanctions-screening';
    workflowModalTitle.textContent = 'Start Sanctions Screening Workflow';
    workflowDescText.textContent = 'This workflow will perform sanctions list screening for the selected customer and create an alert if a match is detected.';
    kycParams.style.display = 'none';
    sanctionsParams.style.display = 'block';
  }

  workflowModal.classList.remove('hidden');
}

// Close workflow modal
if (closeWorkflowModalBtn) {
  closeWorkflowModalBtn.addEventListener('click', () => {
    workflowModal.classList.add('hidden');
    workflowForm.reset();
  });
}

// Submit workflow form
workflowForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(workflowForm);
  const workflowType = formData.get('workflow_type');
  const customerId = formData.get('customer_id');

  if (!customerId) {
    alert('Please select a customer');
    return;
  }

  try {
    let result;
    if (workflowType === 'kyc-refresh') {
      const daysBefore = parseInt(formData.get('days_before')) || 365;
      result = await fetchJSON(`/workflows/kyc-refresh/start?customer_id=${customerId}&days_before=${daysBefore}`, {
        method: 'POST',
      });
    } else if (workflowType === 'sanctions-screening') {
      const hitDetected = formData.get('hit_detected') === 'on';
      result = await fetchJSON(`/workflows/sanctions-screening/start?customer_id=${customerId}&hit_detected=${hitDetected}`, {
        method: 'POST',
      });
    }

    if (result) {
      const customer = state.customers.find(c => c.id === customerId);
      const workflowName = workflowType === 'kyc-refresh' ? 'KYC Expiration Check' : 'Sanctions Screening';
      showToast('success', 'Workflow Started', `${workflowName} for ${customer?.full_name || 'customer'}`);

      workflowModal.classList.add('hidden');
      workflowForm.reset();

      // Navigate to executions panel and refresh
      const executionsNavItem = document.querySelector('[data-target="workflow-executions"]');
      if (executionsNavItem) {
        executionsNavItem.click();
        setTimeout(loadWorkflows, 500);
      }
    }
  } catch (error) {
    console.error('Error starting workflow:', error);
    showToast('error', 'Workflow Failed', error.message);
  }
});

// Make openWorkflowModal available globally
window.openWorkflowModal = openWorkflowModal;

// Load workflows
async function loadWorkflows() {
  try {
    const workflows = await fetchJSON('/workflows');
    allWorkflows = workflows;
    updateWorkflowStats();
    renderWorkflows();
  } catch (error) {
    console.error('Error loading workflows:', error);
    const listView = document.getElementById('workflowsListView');
    if (listView) {
      listView.innerHTML = `
        <div class="workflows-empty">
          <div class="workflows-empty-icon">⚠️</div>
          <p>Error loading workflows: ${error.message}</p>
        </div>
      `;
    }
  }
}

// Update workflow statistics
function updateWorkflowStats() {
  const total = allWorkflows.length;
  const completed = allWorkflows.filter(wf => wf.status === 'COMPLETED').length;
  const running = allWorkflows.filter(wf => wf.status === 'RUNNING').length;
  const failed = allWorkflows.filter(wf => wf.status === 'FAILED').length;
  const canceled = allWorkflows.filter(wf => wf.status === 'CANCELED').length;

  // KYC workflow stats
  const kycWorkflows = allWorkflows.filter(wf => wf.workflow_type === 'KycRefreshWorkflow');
  const kycCompleted = kycWorkflows.filter(wf => wf.status === 'COMPLETED').length;
  const kycRunning = kycWorkflows.filter(wf => wf.status === 'RUNNING').length;

  // Sanctions workflow stats
  const sanctionsWorkflows = allWorkflows.filter(wf => wf.workflow_type === 'SanctionsScreeningWorkflow');
  const sanctionsCompleted = sanctionsWorkflows.filter(wf => wf.status === 'COMPLETED').length;
  const sanctionsRunning = sanctionsWorkflows.filter(wf => wf.status === 'RUNNING').length;

  // Calculate average duration for completed workflows
  let avgDuration = '-';
  const completedWorkflows = allWorkflows.filter(wf => wf.status === 'COMPLETED' && wf.start_time && wf.close_time);
  if (completedWorkflows.length > 0) {
    const totalMs = completedWorkflows.reduce((sum, wf) => {
      return sum + (new Date(wf.close_time) - new Date(wf.start_time));
    }, 0);
    const avgMs = totalMs / completedWorkflows.length;
    avgDuration = formatDuration(avgMs);
  }

  // Success rate
  const successRate = total > 0 ? Math.round((completed / total) * 100) + '%' : '-';

  // Update definitions page stats
  const wfTotalEl = document.getElementById('wfTotalExecutions');
  const wfSuccessEl = document.getElementById('wfSuccessRate');
  const wfRunningEl = document.getElementById('wfRunningCount');
  const kycCompletedEl = document.getElementById('kycWfCompleted');
  const kycRunningEl = document.getElementById('kycWfRunning');
  const sanctionsCompletedEl = document.getElementById('sanctionsWfCompleted');
  const sanctionsRunningEl = document.getElementById('sanctionsWfRunning');
  const sanctionsAlertsEl = document.getElementById('sanctionsWfAlerts');

  if (wfTotalEl) wfTotalEl.textContent = total;
  if (wfSuccessEl) wfSuccessEl.textContent = successRate;
  if (wfRunningEl) wfRunningEl.textContent = running;
  if (kycCompletedEl) kycCompletedEl.textContent = kycCompleted;
  if (kycRunningEl) kycRunningEl.textContent = kycRunning;
  if (sanctionsCompletedEl) sanctionsCompletedEl.textContent = sanctionsCompleted;
  if (sanctionsRunningEl) sanctionsRunningEl.textContent = sanctionsRunning;
  if (sanctionsAlertsEl) sanctionsAlertsEl.textContent = '-'; // Would need to track this separately

  // Update executions page stats
  const execCompletedEl = document.getElementById('execCompleted');
  const execRunningEl = document.getElementById('execRunning');
  const execFailedEl = document.getElementById('execFailed');
  const execAvgDurationEl = document.getElementById('execAvgDuration');

  if (execCompletedEl) execCompletedEl.textContent = completed;
  if (execRunningEl) execRunningEl.textContent = running;
  if (execFailedEl) execFailedEl.textContent = failed;
  if (execAvgDurationEl) execAvgDurationEl.textContent = avgDuration;
}

// Format duration in a friendly way
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  if (seconds > 0) return `${seconds}.${Math.round((ms % 1000) / 100)}s`;
  return `${Math.round(ms)}ms`;
}

// Format relative time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Render workflows as a list view
function renderWorkflows() {
  const statusFilter = workflowStatusFilter?.value || '';
  const typeFilter = workflowTypeFilter?.value || '';
  const listView = document.getElementById('workflowsListView');

  if (!listView) return;

  let filtered = allWorkflows;
  if (statusFilter) {
    filtered = filtered.filter(wf => wf.status === statusFilter);
  }
  if (typeFilter) {
    filtered = filtered.filter(wf => wf.workflow_type === typeFilter);
  }

  // Sort by start time descending
  filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  if (filtered.length === 0) {
    listView.innerHTML = `
      <div class="workflows-empty">
        <div class="workflows-empty-icon">📋</div>
        <p style="font-size: 15px; margin-bottom: 8px;">
          ${allWorkflows.length === 0
            ? 'No workflow executions yet'
            : 'No workflows match the current filters'}
        </p>
        <p style="font-size: 13px;">
          ${allWorkflows.length === 0
            ? 'Go to Workflow Definitions to start your first workflow'
            : 'Try adjusting your filters'}
        </p>
      </div>
    `;
    return;
  }

  listView.innerHTML = filtered.map(wf => {
    // Calculate duration
    let duration = '-';
    let durationMs = 0;
    if (wf.start_time) {
      const start = new Date(wf.start_time);
      const end = wf.close_time ? new Date(wf.close_time) : new Date();
      durationMs = Math.abs(end - start);
      duration = formatDuration(durationMs);
    }

    // Status config
    const statusConfig = {
      'COMPLETED': { class: 'completed', icon: '✓', color: 'var(--primary)', label: 'Completed' },
      'RUNNING': { class: 'running', icon: '◐', color: 'var(--amber)', label: 'Running' },
      'FAILED': { class: 'failed', icon: '✕', color: 'var(--red)', label: 'Failed' },
      'CANCELED': { class: 'canceled', icon: '⊘', color: 'var(--purple)', label: 'Canceled' }
    };
    const status = statusConfig[wf.status] || statusConfig['COMPLETED'];

    // Workflow type config
    const typeConfig = {
      'KycRefreshWorkflow': { name: 'KYC Expiration Check', icon: '📋', color: 'var(--primary)' },
      'SanctionsScreeningWorkflow': { name: 'Sanctions Screening', icon: '🛡️', color: 'var(--red)' },
      'AlertHandlingWorkflow': { name: 'Alert Handling', icon: '🚨', color: 'var(--amber)' },
    };
    const type = typeConfig[wf.workflow_type] || { name: wf.workflow_type, icon: '⚙️', color: 'var(--muted)' };

    // Extract customer ID from workflow_id if possible
    const workflowIdParts = wf.workflow_id.split('-');
    let customerIdDisplay = '';
    if (workflowIdParts.length > 5) {
      const customerId = workflowIdParts.slice(1, 6).join('-');
      customerIdDisplay = `<span style="color: var(--muted);">Customer:</span> ${customerId.substring(0, 8)}...`;
    }

    const relativeTime = formatRelativeTime(wf.start_time);
    const canCancel = wf.status === 'RUNNING';

    return `
      <div class="workflow-item">
        <div class="workflow-item-icon ${status.class}">
          <span>${type.icon}</span>
        </div>
        <div class="workflow-item-main">
          <div class="workflow-item-title">
            <span>${type.name}</span>
            <span class="badge ${status.class === 'completed' ? 'teal' : status.class === 'running' ? 'amber' : status.class === 'failed' ? 'red' : 'purple'}" ${status.class === 'running' ? 'class="status-running"' : ''}>
              ${status.icon} ${status.label}
            </span>
          </div>
          <div class="workflow-item-subtitle">
            ${customerIdDisplay ? `<span>${customerIdDisplay}</span>` : ''}
            <span style="color: var(--muted);">ID:</span> <span style="font-family: monospace; font-size: 11px;">${wf.workflow_id.substring(0, 20)}...</span>
          </div>
        </div>
        <div class="workflow-item-meta">
          <div class="workflow-item-time">${relativeTime}</div>
          <div class="workflow-item-duration" style="color: ${status.color};">${duration}</div>
        </div>
        <div class="workflow-item-actions">
          ${canCancel ? `<button class="btn ghost" onclick="cancelWorkflow('${wf.workflow_id}', '${wf.run_id}')">Cancel</button>` : ''}
          <button class="btn ghost" onclick="viewWorkflowDetails('${wf.workflow_id}', '${wf.run_id}')">Details</button>
          <a href="http://localhost:8080/namespaces/default/workflows/${wf.workflow_id}/${wf.run_id}" target="_blank" class="btn ghost" style="text-decoration: none;">
            Temporal
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// View workflow details
async function viewWorkflowDetails(workflowId, runId) {
  try {
    const details = await fetchJSON(`/workflows/${workflowId}/${runId}`);

    const startTime = details.start_time ? new Date(details.start_time).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }) : 'Not started';

    const closeTime = details.close_time ? new Date(details.close_time).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }) : 'Still running';

    // Calculate execution time
    let executionTime = 'N/A';
    if (details.start_time) {
      const start = new Date(details.start_time);
      const end = details.close_time ? new Date(details.close_time) : new Date();
      const diff = end - start;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      executionTime = hours > 0 ? `${hours}h ${minutes % 60}m ${seconds % 60}s` :
                      minutes > 0 ? `${minutes}m ${seconds % 60}s` :
                      `${seconds}s`;
    }

    const detailsContent = document.getElementById('workflowDetailsContent');
    detailsContent.innerHTML = `
      <div style="display: grid; gap: 16px;">
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 10px; padding: 16px;">
          <div style="display: grid; gap: 12px;">
            <div>
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Workflow ID</div>
              <div style="font-family: monospace; font-size: 13px;">${details.workflow_id}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Run ID</div>
              <div style="font-family: monospace; font-size: 13px;">${details.run_id}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Workflow Type</div>
              <div style="font-size: 14px;">${details.workflow_type}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Task Queue</div>
              <div style="font-family: monospace; font-size: 13px;">${details.task_queue}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Status</div>
              <div><span class="badge ${details.status === 'COMPLETED' ? 'teal' : details.status === 'RUNNING' ? 'amber' : details.status === 'FAILED' ? 'red' : 'purple'}">${details.status}</span></div>
            </div>
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 10px; padding: 16px;">
          <h4 style="margin: 0 0 12px 0;">Execution Timeline</h4>
          <div style="display: grid; gap: 10px;">
            <div style="display: flex; gap: 12px; align-items: start;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(91,224,179,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px;">▶</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">Started</div>
                <div style="font-size: 12px; color: var(--muted);">${startTime}</div>
              </div>
            </div>
            ${details.close_time ? `
            <div style="display: flex; gap: 12px; align-items: start;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(91,224,179,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px;">■</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">${details.status === 'COMPLETED' ? 'Completed' : details.status}</div>
                <div style="font-size: 12px; color: var(--muted);">${closeTime}</div>
              </div>
            </div>` : `
            <div style="display: flex; gap: 12px; align-items: start;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(248,199,97,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px;">⟳</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">In Progress</div>
                <div style="font-size: 12px; color: var(--muted);">Currently executing...</div>
              </div>
            </div>`}
            <div style="padding: 8px 12px; background: rgba(91,224,179,0.08); border-radius: 8px;">
              <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">Total Execution Time</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--primary);">${executionTime}</div>
            </div>
          </div>
        </div>

        <div style="padding: 12px; background: rgba(91,224,179,0.08); border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 12px; color: var(--muted);">
            💡 For detailed execution history, activity logs, and event timeline, view this workflow in the
            <a href="http://localhost:8080/namespaces/default/workflows/${details.workflow_id}/${details.run_id}"
               target="_blank"
               style="color: var(--primary); text-decoration: underline;">
              Temporal UI
            </a>
          </div>
        </div>
      </div>
    `;

    workflowDetailsPanel.style.display = 'block';
    workflowDetailsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('Error loading workflow details:', error);
    alert(`Failed to load workflow details: ${error.message}`);
  }
}

// Close workflow details
function closeWorkflowDetails() {
  workflowDetailsPanel.style.display = 'none';
}

// Cancel workflow
async function cancelWorkflow(workflowId, runId) {
  if (!confirm(`Are you sure you want to cancel this workflow?\n\nWorkflow ID: ${workflowId}\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    await fetchJSON(`/workflows/${workflowId}/${runId}/cancel`, {
      method: 'POST',
    });

    alert('✓ Workflow canceled successfully');
    await loadWorkflows();
    closeWorkflowDetails();
  } catch (error) {
    console.error('Error canceling workflow:', error);
    alert(`Failed to cancel workflow: ${error.message}`);
  }
}

// Make functions available globally
window.cancelWorkflow = cancelWorkflow;
window.viewWorkflowDetails = viewWorkflowDetails;
window.closeWorkflowDetails = closeWorkflowDetails;

// Refresh workflows button
if (refreshWorkflowsBtn) {
  refreshWorkflowsBtn.addEventListener('click', loadWorkflows);
}

// Filters
if (workflowStatusFilter) {
  workflowStatusFilter.addEventListener('change', renderWorkflows);
}
if (workflowTypeFilter) {
  workflowTypeFilter.addEventListener('change', renderWorkflows);
}

// Load workflows when the executions panel is activated
const workflowExecutionsNavItem = document.querySelector('[data-target="workflow-executions"]');
if (workflowExecutionsNavItem) {
  workflowExecutionsNavItem.addEventListener('click', () => {
    setTimeout(loadWorkflows, 100);
  });
}

// Load tasks when viewing tasks panel
const tasksNavItem = document.querySelector('[data-target="tasks"]');
if (tasksNavItem) {
  tasksNavItem.addEventListener('click', () => {
    setTimeout(loadTasks, 150);
  });
}

// Load workflows when the definitions panel is activated (for stats)
const workflowDefinitionsNavItem = document.querySelector('[data-target="workflow-definitions"]');
if (workflowDefinitionsNavItem) {
  workflowDefinitionsNavItem.addEventListener('click', () => {
    setTimeout(loadWorkflows, 100);
  });
}

// Auto-refresh workflows when there are running ones
let workflowRefreshInterval = null;

function startWorkflowAutoRefresh() {
  if (workflowRefreshInterval) return; // Already running

  workflowRefreshInterval = setInterval(async () => {
    const hasRunning = allWorkflows.some(wf => wf.status === 'RUNNING');
    if (hasRunning) {
      await loadWorkflows();
    } else {
      // No running workflows, stop auto-refresh
      stopWorkflowAutoRefresh();
    }
  }, 3000); // Refresh every 3 seconds
}

function stopWorkflowAutoRefresh() {
  if (workflowRefreshInterval) {
    clearInterval(workflowRefreshInterval);
    workflowRefreshInterval = null;
  }
}

// Override loadWorkflows to start auto-refresh when needed
const originalLoadWorkflows = loadWorkflows;
async function loadWorkflowsWithAutoRefresh() {
  await originalLoadWorkflows();
  const hasRunning = allWorkflows.some(wf => wf.status === 'RUNNING');
  if (hasRunning) {
    startWorkflowAutoRefresh();
  }
}

// Replace global reference
window.loadWorkflows = loadWorkflowsWithAutoRefresh;

// ===========================================
// Task Management Functions
// ===========================================

async function claimTask(taskId) {
  if (!currentUser) {
    showToast('error', 'Not logged in', 'Cannot claim task without a user session');
    return;
  }
  try {
    const result = await fetchJSON(`/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ claimed_by_id: currentUser.id }),
    });
    if (result) {
      showToast('success', 'Task claimed', 'You have claimed this task');
      await loadTasks();
      // Refresh panel if viewing this task
      if (state.selectedTask && state.selectedTask.id === taskId) {
        await viewTaskDetail(taskId);
      }
    }
  } catch (error) {
    showToast('error', 'Claim failed', error.message || 'Unable to claim task');
  }
}

async function releaseTask(taskId) {
  try {
    const result = await fetchJSON(`/tasks/${taskId}/release`, {
      method: 'POST',
    });
    if (result) {
      showToast('info', 'Task released', 'Task returned to queue');
      await loadTasks();
      // Refresh panel if viewing this task
      if (state.selectedTask && state.selectedTask.id === taskId) {
        await viewTaskDetail(taskId);
      }
    }
  } catch (error) {
    showToast('error', 'Release failed', error.message || 'Unable to release task');
  }
}

async function completeTaskPrompt(taskId) {
  const notes = prompt('Enter resolution notes (optional):');
  if (notes === null) return; // User cancelled

  try {
    const result = await fetchJSON(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        completed_by_id: currentUser?.id || null,
        completed_by: currentUser?.full_name || CURRENT_USER_EMAIL,
        resolution_notes: notes || null,
      }),
    });
    if (result) {
      showToast('success', 'Task completed', 'Task marked as completed');
      await loadTasks();
      await loadAlerts(); // Refresh alerts since completing a task may close linked alert
      closeDetailPanel();
    }
  } catch (error) {
    showToast('error', 'Complete failed', error.message || 'Unable to complete task');
  }
}

// ===========================================
// Task Notes Functions
// ===========================================

function toggleNoteForm(show) {
  const formContainer = document.getElementById('noteFormContainer');
  const addBtn = document.getElementById('addNoteBtn');
  const textarea = document.getElementById('noteTextarea');

  if (formContainer) {
    formContainer.style.display = show ? 'block' : 'none';
    if (show && textarea) {
      textarea.value = '';
      textarea.focus();
    }
  }
  if (addBtn) {
    addBtn.style.display = show ? 'none' : 'inline-flex';
  }
}

async function submitTaskNote(taskId) {
  const textarea = document.getElementById('noteTextarea');
  const content = textarea ? textarea.value.trim() : '';

  if (!content) {
    showToast('error', 'Empty note', 'Please enter a note');
    return;
  }

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Cannot add note without a user session');
    return;
  }

  try {
    const result = await fetchJSON(`/tasks/${taskId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: currentUser.id,
        content: content,
      }),
    });
    if (result) {
      showToast('success', 'Note added', 'Your note has been added');
      // Refresh the task detail view
      await viewTaskDetail(taskId);
    }
  } catch (error) {
    showToast('error', 'Add note failed', error.message || 'Unable to add note');
  }
}

// ===========================================
// Task Attachment Functions
// ===========================================

async function uploadTaskAttachment(taskId, file) {
  if (!file) return;

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Cannot upload attachment without a user session');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    // user_id must be passed as query parameter, not in FormData
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments?user_id=${currentUser.id}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }

    showToast('success', 'File uploaded', 'Attachment has been added');
    // Refresh the task detail view
    await viewTaskDetail(taskId);
  } catch (error) {
    showToast('error', 'Upload failed', error.message || 'Unable to upload attachment');
  } finally {
    // Reset file input so same file can be uploaded again
    const fileInput = document.getElementById('taskAttachmentInput');
    if (fileInput) fileInput.value = '';
  }
}

async function downloadTaskAttachment(taskId, attachmentId) {
  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments/${attachmentId}/download`);
    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition && contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch ? filenameMatch[1] : 'attachment';

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (error) {
    showToast('error', 'Download failed', error.message || 'Unable to download attachment');
  }
}

// ===========================================
// Task Assignment Functions
// ===========================================

async function showAssignTaskModal(taskId) {
  // Ensure users are loaded
  if (!state.users || state.users.length === 0) {
    const users = await fetchJSON('/users');
    state.users = users ?? [];
  }

  // Build user select options from all active users
  const userOptions = state.users
    .filter(u => u.is_active)
    .map(u => `<option value="${u.id}">${u.full_name} (${u.role})</option>`)
    .join('');

  const html = `
    <div style="padding: 16px;">
      <h3 style="margin-top: 0;">Assign Task</h3>
      <div style="margin-bottom: 16px;">
        <label class="label">Select Analyst</label>
        <select id="assignTaskUserSelect" class="input" style="width: 100%;">
          <option value="">Choose analyst...</option>
          ${userOptions}
        </select>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn ghost" onclick="toggleAssignModal(false)">Cancel</button>
        <button class="btn primary" onclick="assignTask(${taskId})">Assign</button>
      </div>
    </div>
  `;

  // Create or update modal
  let modal = document.getElementById('assignTaskModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'assignTaskModal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width: 400px;"></div>`;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) toggleAssignModal(false);
    });
    document.body.appendChild(modal);
  }

  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
}

function toggleAssignModal(show) {
  const modal = document.getElementById('assignTaskModal');
  if (modal) {
    if (show) {
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
    }
  }
}

async function assignTask(taskId) {
  const selectEl = document.getElementById('assignTaskUserSelect');
  const assignedTo = selectEl?.value;

  if (!assignedTo) {
    showToast('error', 'No user selected', 'Please select a user to assign the task to');
    return;
  }

  if (!currentUser) {
    showToast('error', 'Not logged in', 'Cannot assign task without a user session');
    return;
  }

  try {
    const result = await fetchJSON(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        assigned_to: assignedTo,
        assigned_by: currentUser.id,
      }),
    });

    if (result) {
      showToast('success', 'Task assigned', 'Task has been assigned to the selected analyst');
      toggleAssignModal(false);
      await loadTasks();
      await viewTaskDetail(taskId);
    }
  } catch (error) {
    showToast('error', 'Assignment failed', error.message || 'Unable to assign task');
  }
}

async function startTaskWorkflow(taskId) {
  try {
    const result = await fetchJSON(`/tasks/${taskId}/start-workflow`, {
      method: 'POST',
    });
    if (result) {
      showToast('success', 'Workflow started', `Workflow ${result.workflow_id} started`);
      await loadTasks();
      await loadWorkflows();
      // Refresh panel if viewing this task
      if (state.selectedTask && state.selectedTask.id === taskId) {
        await viewTaskDetail(taskId);
      }
    }
  } catch (error) {
    showToast('error', 'Workflow start failed', error.message || 'Unable to start workflow');
  }
}

async function viewTaskDetail(taskId) {
  // Use slide-out panel (same as alerts)
  const panel = document.getElementById('detailPanel');
  const overlay = document.getElementById('detailPanelOverlay');

  if (!panel || !overlay) return;

  // Show loading state
  document.getElementById('panelTitle').textContent = 'Task Details';
  document.getElementById('panelContent').innerHTML = '<div style="padding: 24px; text-align: center;">Loading...</div>';
  document.getElementById('panelActions').innerHTML = '';

  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');

  try {
    // Load task, notes, attachments, and history in parallel
    const [task, notes, attachments, history] = await Promise.all([
      fetchJSON(`/tasks/${taskId}`),
      fetchJSON(`/tasks/${taskId}/notes`),
      fetchJSON(`/tasks/${taskId}/attachments`),
      fetchJSON(`/tasks/${taskId}/history`),
    ]);
    if (!task) throw new Error('Task not found');

    state.selectedTask = task;

    const statusBadge = (s) => {
      const map = { pending: 'amber', in_progress: 'blue', completed: 'teal' };
      return map[s] || 'muted';
    };

    const priorityBadge = (p) => {
      const map = { low: 'muted', medium: 'amber', high: 'red', critical: 'red' };
      return map[p] || 'muted';
    };

    const isMyTask = currentUser && (task.claimed_by_id === currentUser.id || task.assigned_to === currentUser.id);
    const canManage = currentUser && ['manager', 'admin'].includes(currentUser.role);
    const isActive = task.status !== 'completed';

    // Assignment display
    const getAssignmentDisplay = () => {
      if (task.assigned_to) {
        return `<span class="chip blue">Assigned: ${task.assigned_to_name || 'User'}</span>`;
      }
      if (task.claimed_by_id) {
        return `<span class="chip ${isMyTask ? 'teal' : ''}">${task.claimed_by_name || 'Claimed'}</span>`;
      }
      return '<span class="chip amber">Unclaimed</span>';
    };

    // Notes section
    const notesHtml = (notes || []).map(n => `
      <div class="task-note" style="padding: 8px; margin: 4px 0; background: var(--bg-muted); border-radius: 4px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">
          ${n.user_name || 'Unknown'} - ${new Date(n.created_at).toLocaleString()}
        </div>
        <p style="margin: 0;">${n.content}</p>
      </div>
    `).join('') || '<p style="color: var(--text-muted);">No notes yet</p>';

    // Attachments section
    const attachmentsHtml = (attachments || []).map(a => `
      <div class="task-attachment" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-muted); border-radius: 4px; margin: 4px 0;">
        <span style="flex: 1;">${a.original_filename}</span>
        <span style="font-size: 12px; color: var(--text-muted);">${(a.file_size / 1024).toFixed(1)} KB</span>
        <button class="btn ghost" onclick="downloadTaskAttachment(${task.id}, ${a.id})">Download</button>
      </div>
    `).join('') || '<p style="color: var(--text-muted);">No attachments</p>';

    // History section
    const historyHtml = (history || []).map(h => {
      const statusColor = {
        pending: 'var(--amber)',
        in_progress: 'var(--blue)',
        completed: 'var(--teal)'
      }[h.new_status] || 'var(--text-muted)';
      return `
        <div class="history-item" style="display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; margin-top: 6px; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div style="font-weight: 500;">${h.new_status}${h.previous_status ? ` (from ${h.previous_status})` : ''}</div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${h.changed_by_name || 'System'} - ${new Date(h.created_at).toLocaleString()}
            </div>
            ${h.reason ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${h.reason}</div>` : ''}
          </div>
        </div>
      `;
    }).join('') || '<p style="color: var(--text-muted);">No history available</p>';

    // Get assignee display name
    const getAssigneeName = () => {
      if (task.assigned_to) return task.assigned_to_name || 'Assigned User';
      if (task.claimed_by_id) return task.claimed_by_name || task.claimed_by || 'Claimed User';
      return null;
    };

    const assigneeName = getAssigneeName();

    const content = `
      <div class="task-detail">
        <!-- Prominent Assignment Card -->
        <div style="background: var(--bg-muted); border-radius: 8px; padding: 16px; margin-bottom: 16px; border-left: 4px solid ${assigneeName ? 'var(--teal)' : 'var(--amber)'};">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label class="label" style="margin-bottom: 4px;">Assigned To</label>
              <p style="font-size: 16px; font-weight: 500; margin: 0;">${assigneeName || 'Unassigned'}</p>
            </div>
            <div>
              <label class="label" style="margin-bottom: 4px;">Status</label>
              <p style="margin: 0;"><span class="badge ${statusBadge(task.status)}">${task.status}</span></p>
            </div>
            <div>
              <label class="label" style="margin-bottom: 4px;">Priority</label>
              <p style="margin: 0;"><span class="badge ${priorityBadge(task.priority)}">${task.priority}</span></p>
            </div>
            <div>
              <label class="label" style="margin-bottom: 4px;">Due Date</label>
              <p style="margin: 0;">${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}</p>
            </div>
          </div>
        </div>

        <div class="task-detail-header">
          <div class="badges" style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            <span class="chip">${task.task_type.replace('_', ' ')}</span>
            ${task.workflow_status && isActive ? `<span class="badge blue">${task.workflow_status}</span>` : ''}
          </div>
        </div>

        <div class="task-detail-body" style="display: grid; gap: 16px;">
          ${task.description ? `
            <div>
              <label class="label">Description</label>
              <p>${task.description}</p>
            </div>
          ` : ''}

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label class="label">Customer</label>
              <p>${task.customer_name ? `<a href="#" onclick="viewCustomer('${task.customer_id}')">${task.customer_name}</a>` : '-'}</p>
            </div>
            <div>
              <label class="label">Alert</label>
              <p>${task.alert_id ? `#${task.alert_id} - ${task.alert_scenario || ''}` : '-'}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label class="label">Created</label>
              <p>${task.created_at ? new Date(task.created_at).toLocaleString() : '-'}</p>
            </div>
            <div>
              <label class="label">Due Date</label>
              <p>${task.due_date ? new Date(task.due_date).toLocaleString() : '-'}</p>
            </div>
          </div>

          ${task.assigned_to ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label class="label">Assigned To</label>
                <p>${task.assigned_to_name || '-'}</p>
              </div>
              <div>
                <label class="label">Assigned At</label>
                <p>${task.assigned_at ? new Date(task.assigned_at).toLocaleString() : '-'}</p>
              </div>
            </div>
          ` : ''}

          ${task.claimed_by_id ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label class="label">Claimed By</label>
                <p>${task.claimed_by_name || task.claimed_by || '-'}</p>
              </div>
              <div>
                <label class="label">Claimed At</label>
                <p>${task.claimed_at ? new Date(task.claimed_at).toLocaleString() : '-'}</p>
              </div>
            </div>
          ` : ''}

          ${task.workflow_id ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label class="label">Workflow ID</label>
                <p style="font-family: monospace; font-size: 12px;">${task.workflow_id}</p>
              </div>
              <div>
                <label class="label">Run ID</label>
                <p style="font-family: monospace; font-size: 12px;">${task.workflow_run_id || '-'}</p>
              </div>
            </div>
          ` : ''}

          ${task.completed_at ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label class="label">Completed By</label>
                <p>${task.completed_by || '-'}</p>
              </div>
              <div>
                <label class="label">Completed At</label>
                <p>${new Date(task.completed_at).toLocaleString()}</p>
              </div>
            </div>
            ${task.resolution_notes ? `
              <div>
                <label class="label">Resolution Notes</label>
                <p>${task.resolution_notes}</p>
              </div>
            ` : ''}
          ` : ''}

          <!-- Notes Section -->
          <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="label" style="margin: 0;">Notes</label>
              ${isActive ? `<button class="btn ghost" id="addNoteBtn" onclick="toggleNoteForm(true)">+ Add Note</button>` : ''}
            </div>
            ${isActive ? `
              <div id="noteFormContainer" style="display: none; margin-bottom: 12px; padding: 12px; background: var(--bg-muted); border-radius: 8px;">
                <textarea id="noteTextarea" placeholder="Enter your note..." style="width: 100%; min-height: 80px; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); resize: vertical; font-family: inherit;"></textarea>
                <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
                  <button class="btn ghost" onclick="toggleNoteForm(false)">Cancel</button>
                  <button class="btn primary" onclick="submitTaskNote(${task.id})">Save Note</button>
                </div>
              </div>
            ` : ''}
            <div id="taskNotesContainer" style="max-height: 200px; overflow-y: auto;">
              ${notesHtml}
            </div>
          </div>

          <!-- Attachments Section -->
          <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="label" style="margin: 0;">Attachments</label>
              ${isActive ? `<button class="btn ghost" onclick="document.getElementById('taskAttachmentInput').click()">+ Upload</button>` : ''}
            </div>
            <input type="file" id="taskAttachmentInput" style="display: none;" onchange="uploadTaskAttachment(${task.id}, this.files[0])">
            <div id="taskAttachmentsContainer">
              ${attachmentsHtml}
            </div>
          </div>

          <!-- History Section -->
          <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
            <label class="label" style="margin-bottom: 8px; display: block;">History</label>
            <div id="taskHistoryContainer" style="max-height: 200px; overflow-y: auto;">
              ${historyHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    // Build status-specific action buttons
    let statusActions = [];
    if (task.status === 'pending' && !task.claimed_by_id && !task.assigned_to) {
      statusActions.push(`<button class="btn primary" onclick="showAssignTaskModal(${task.id})">Assign</button>`);
    } else if (task.status === 'in_progress' && isMyTask) {
      statusActions.push(`<button class="btn ghost" onclick="releaseTask(${task.id})">Release</button>`);
      if (!task.workflow_id) {
        statusActions.push(`<button class="btn ghost" onclick="startTaskWorkflow(${task.id})">Start Workflow</button>`);
      }
      statusActions.push(`<button class="btn primary" onclick="completeTaskPrompt(${task.id})">Complete Task</button>`);
    }
    // Allow reassignment of active tasks that aren't completed
    if (isActive && task.assigned_to) {
      statusActions.push(`<button class="btn ghost" onclick="showAssignTaskModal(${task.id})">Reassign</button>`);
    }

    // Build final actions with Back button on left, status actions on right
    const actions = `
      <div style="display: flex; justify-content: space-between; width: 100%;">
        <button class="btn ghost" onclick="closeDetailPanel()">Back</button>
        <div style="display: flex; gap: 8px;">
          ${statusActions.join(' ')}
        </div>
      </div>
    `;

    // Render to slide-out panel
    document.getElementById('panelTitle').textContent = `Task: ${task.title}`;
    document.getElementById('panelContent').innerHTML = content;
    document.getElementById('panelActions').innerHTML = actions;
  } catch (error) {
    document.getElementById('panelContent').innerHTML = `<div style="padding: 24px; color: var(--red);">Error loading task: ${error.message}</div>`;
  }
}

function toggleTaskModal(show) {
  const modal = document.getElementById('taskModal');
  if (!modal) return;

  if (show) {
    modal.classList.remove('hidden');
    // Populate customer and alert dropdowns
    const customerSelect = document.getElementById('taskCustomerSelect');
    const alertSelect = document.getElementById('taskAlertSelect');

    if (customerSelect) {
      customerSelect.innerHTML = '<option value="">Select customer...</option>' +
        state.customers.map(c => `<option value="${c.id}">${c.full_name || c.first_name + ' ' + c.last_name}</option>`).join('');
    }

    if (alertSelect) {
      alertSelect.innerHTML = '<option value="">Select alert...</option>' +
        state.alerts.filter(a => a.status === 'open').map(a => `<option value="${a.id}">#${a.id} - ${a.scenario}</option>`).join('');
    }
  } else {
    modal.classList.add('hidden');
    document.getElementById('taskForm')?.reset();
  }
}

function toggleTaskDetailModal(show) {
  const modal = document.getElementById('taskDetailModal');
  if (!modal) return;

  if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
    state.selectedTask = null;
  }
}

async function createTaskFromAlert(alertId, scenario, customerId) {
  // Pre-fill the task modal with alert context
  toggleTaskModal(true);

  const form = document.getElementById('taskForm');
  if (!form) return;

  // Set values
  form.querySelector('[name="task_type"]').value = 'investigation';
  form.querySelector('[name="title"]').value = `Investigate Alert #${alertId}: ${scenario}`;
  form.querySelector('[name="description"]').value = `Follow up on alert ${scenario} for investigation and resolution.`;

  if (customerId) {
    const customerSelect = document.getElementById('taskCustomerSelect');
    if (customerSelect) customerSelect.value = customerId;
  }

  const alertSelect = document.getElementById('taskAlertSelect');
  if (alertSelect) alertSelect.value = alertId;
}

// Task form submit handler
const taskForm = document.getElementById('taskForm');
if (taskForm) {
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const payload = {
      task_type: formData.get('task_type'),
      title: formData.get('title'),
      description: formData.get('description') || null,
      priority: formData.get('priority') || 'medium',
      due_date: formData.get('due_date') || null,
      customer_id: formData.get('customer_id') || null,
      alert_id: formData.get('alert_id') ? parseInt(formData.get('alert_id'), 10) : null,
      created_by: CURRENT_USER,
    };

    try {
      const result = await fetchJSON('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (result) {
        showToast('success', 'Task created', 'New task has been created');
        toggleTaskModal(false);
        await loadTasks();
      }
    } catch (error) {
      showToast('error', 'Create failed', error.message || 'Unable to create task');
    }
  });
}

// Task modal close buttons
const closeTaskModalBtn = document.getElementById('closeTaskModal');
if (closeTaskModalBtn) {
  closeTaskModalBtn.addEventListener('click', () => toggleTaskModal(false));
}

const closeTaskDetailModalBtn = document.getElementById('closeTaskDetailModal');
if (closeTaskDetailModalBtn) {
  closeTaskDetailModalBtn.addEventListener('click', () => toggleTaskDetailModal(false));
}

// Create task button
const createTaskBtn = document.getElementById('createTaskBtn');
if (createTaskBtn) {
  createTaskBtn.addEventListener('click', () => toggleTaskModal(true));
}

// Export task functions to window for onclick handlers
window.claimTask = claimTask;
window.releaseTask = releaseTask;
window.completeTaskPrompt = completeTaskPrompt;
window.startTaskWorkflow = startTaskWorkflow;
window.viewTaskDetail = viewTaskDetail;
window.toggleTaskModal = toggleTaskModal;
window.toggleTaskDetailModal = toggleTaskDetailModal;
window.createTaskFromAlert = createTaskFromAlert;
window.toggleNoteForm = toggleNoteForm;
window.submitTaskNote = submitTaskNote;
window.uploadTaskAttachment = uploadTaskAttachment;
window.downloadTaskAttachment = downloadTaskAttachment;
window.showAssignTaskModal = showAssignTaskModal;
window.toggleAssignModal = toggleAssignModal;
window.assignTask = assignTask;

// User management
window.showEditUserModal = showEditUserModal;
window.toggleEditUserModal = toggleEditUserModal;
window.saveUser = saveUser;
window.toggleUserStatus = toggleUserStatus;
window.filterUsers = filterUsers;
window.showUserDetail = showUserDetail;
window.closeUserDetailPanel = closeUserDetailPanel;
window.editUserFromPanel = editUserFromPanel;
window.resetPasswordFromPanel = resetPasswordFromPanel;
window.toggleUserFromPanel = toggleUserFromPanel;
window.showResetPasswordModal = showResetPasswordModal;
window.toggleResetPasswordModal = toggleResetPasswordModal;
window.resetUserPassword = resetUserPassword;

// =============================================================================
// AI ASSISTANT
// =============================================================================

let aiConversationId = null;
let aiSettings = { provider: 'anthropic', model: 'claude-sonnet-4-20250514', api_key: null };

// Load AI settings on startup
async function loadAISettings() {
  try {
    const settings = await fetchJSON('/ai/settings');
    if (settings) {
      aiSettings = settings;
      updateAIModelBadge();
      // Populate settings form if on settings page
      const providerSelect = document.getElementById('aiProvider');
      const modelSelect = document.getElementById('aiModel');
      if (providerSelect) providerSelect.value = settings.provider;
      if (modelSelect) modelSelect.value = settings.model;
    }
  } catch (e) {
    console.log('AI settings not available');
  }
}

function updateAIModelBadge() {
  const badge = document.getElementById('aiModelBadge');
  if (badge) {
    if (aiSettings.api_key) {
      const modelName = aiSettings.model.split('-').slice(0, 2).join(' ');
      badge.textContent = modelName;
      badge.className = 'badge teal';
    } else {
      badge.textContent = 'Not configured';
      badge.className = 'badge muted';
    }
  }
}

function openAISettings() {
  // Navigate to settings and open AI tab
  activatePanel('settings', '/settings');
  setTimeout(() => {
    const aiTab = document.querySelector('[data-tab="ai-settings"]');
    if (aiTab) aiTab.click();
  }, 100);
}

async function sendAIMessage() {
  const input = document.getElementById('aiChatInput');
  const message = input.value.trim();
  if (!message) return;

  // Check if AI is configured
  if (!aiSettings.api_key) {
    showToast('warning', 'AI Not Configured', 'Please configure your API key in Settings > AI Assistant');
    openAISettings();
    return;
  }

  // Clear input
  input.value = '';

  // Add user message to chat
  addChatMessage('user', message);

  // Show typing indicator
  const statusIndicator = document.getElementById('aiStatusIndicator');
  if (statusIndicator) statusIndicator.style.display = 'block';

  // Hide welcome message
  const welcomeMessage = document.querySelector('.ai-welcome-message');
  if (welcomeMessage) welcomeMessage.style.display = 'none';

  try {
    const response = await fetchJSON('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: message,
        conversation_id: aiConversationId,
      }),
    });

    if (response) {
      aiConversationId = response.conversation_id;

      // Add AI response with optional SQL info
      addChatMessage('assistant', response.response, response.sql_query, response.query_results);
    } else {
      addChatMessage('assistant', 'Sorry, I encountered an error processing your request. Please check your API settings and try again.');
    }
  } catch (error) {
    console.error('AI chat error:', error);
    addChatMessage('assistant', `Error: ${error.message || 'Failed to get response from AI'}`);
  } finally {
    if (statusIndicator) statusIndicator.style.display = 'none';
  }
}

function addChatMessage(role, content, sqlQuery = null, queryResults = null) {
  const chatMessages = document.getElementById('aiChatMessages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ${role}`;

  const avatar = role === 'user' ? '👤' : '<img src="ai-assistant-logo.png" alt="AI" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">';

  // Use marked for markdown rendering (assistant), plain text for user
  let contentHtml;
  if (role === 'assistant' && typeof marked !== 'undefined') {
    contentHtml = marked.parse(content);
  } else {
    contentHtml = `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
  }

  // Add SQL query if present
  if (sqlQuery) {
    contentHtml += `
      <details style="margin-top: 8px;">
        <summary style="cursor: pointer; color: var(--muted); font-size: 12px;">View SQL Query</summary>
        <div class="ai-sql-query">${escapeHtml(sqlQuery)}</div>
      </details>
    `;
  }

  // Add query results table if present
  if (queryResults && queryResults.length > 0) {
    const headers = Object.keys(queryResults[0]);
    let tableHtml = '<table><thead><tr>';
    headers.forEach(h => tableHtml += `<th>${escapeHtml(h)}</th>`);
    tableHtml += '</tr></thead><tbody>';

    queryResults.slice(0, 20).forEach(row => {
      tableHtml += '<tr>';
      headers.forEach(h => {
        const val = row[h];
        tableHtml += `<td>${val !== null ? escapeHtml(String(val)) : '-'}</td>`;
      });
      tableHtml += '</tr>';
    });

    if (queryResults.length > 20) {
      tableHtml += `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--muted);">... and ${queryResults.length - 20} more rows</td></tr>`;
    }

    tableHtml += '</tbody></table>';
    contentHtml += `<div class="ai-sql-result">${tableHtml}</div>`;
  }

  messageDiv.innerHTML = `
    <div class="ai-message-avatar">${avatar}</div>
    <div class="ai-message-content">${contentHtml}</div>
  `;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleAIChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendAIMessage();
  }
}

function askAISuggestion(question) {
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = question;
    sendAIMessage();
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('aiApiKey');
  const toggle = document.getElementById('apiKeyToggleIcon');
  if (input && toggle) {
    if (input.type === 'password') {
      input.type = 'text';
      toggle.textContent = 'Hide';
    } else {
      input.type = 'password';
      toggle.textContent = 'Show';
    }
  }
}

async function testAIConnection() {
  const statusEl = document.getElementById('aiConnectionStatus');
  if (statusEl) {
    statusEl.textContent = 'Testing...';
    statusEl.style.color = 'var(--muted)';
  }

  try {
    const result = await fetchJSON('/ai/test-connection', { method: 'POST' });
    if (result && result.status === 'success') {
      if (statusEl) {
        statusEl.textContent = '✓ ' + result.message;
        statusEl.style.color = 'var(--teal)';
      }
    } else {
      throw new Error('Connection test failed');
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = '✗ ' + (error.message || 'Connection failed');
      statusEl.style.color = 'var(--red)';
    }
  }
}

// AI Settings form handler
const aiSettingsForm = document.getElementById('aiSettingsForm');
if (aiSettingsForm) {
  aiSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const provider = document.getElementById('aiProvider').value;
    const model = document.getElementById('aiModel').value;
    const apiKey = document.getElementById('aiApiKey').value;

    try {
      const result = await fetchJSON('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: provider,
          model: model,
          api_key: apiKey || undefined,
        }),
      });

      if (result) {
        aiSettings = result;
        updateAIModelBadge();
        showToast('success', 'Settings Saved', 'AI Assistant settings have been updated');
      }
    } catch (error) {
      showToast('error', 'Save Failed', error.message || 'Failed to save AI settings');
    }
  });
}

// Export AI functions
window.sendAIMessage = sendAIMessage;
window.handleAIChatKeydown = handleAIChatKeydown;
window.askAISuggestion = askAISuggestion;
window.openAISettings = openAISettings;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.testAIConnection = testAIConnection;

// Load AI settings on startup
loadAISettings();

// ========================================
// Slide Panel Resize functionality
// ========================================

(function initializePanelResize() {
  const SIDEBAR_WIDTH = 260; // Width of the sidebar
  const MIN_PANEL_WIDTH = 400;

  document.querySelectorAll('.slide-panel-resize').forEach(handle => {
    let isResizing = false;
    let panel = handle.parentElement;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startWidth = panel.offsetWidth;

      function onMouseMove(e) {
        if (!isResizing) return;

        // Calculate new width (dragging left increases width since panel is on right)
        const delta = startX - e.clientX;
        let newWidth = startWidth + delta;

        // Constrain to min and max
        const maxWidth = window.innerWidth - SIDEBAR_WIDTH;
        newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxWidth));

        panel.style.width = newWidth + 'px';
      }

      function onMouseUp() {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save the width preference
        localStorage.setItem('slidePanelWidth', panel.style.width);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Visual feedback on hover
    handle.addEventListener('mouseenter', () => {
      handle.style.background = 'var(--border)';
    });

    handle.addEventListener('mouseleave', () => {
      if (!handle.matches(':active')) {
        handle.style.background = 'transparent';
      }
    });
  });

  // Restore saved width on page load
  const savedWidth = localStorage.getItem('slidePanelWidth');
  if (savedWidth) {
    document.querySelectorAll('.slide-panel').forEach(panel => {
      panel.style.width = savedWidth;
    });
  }
})();
