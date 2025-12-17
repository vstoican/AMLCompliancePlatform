const API_BASE = window.API_BASE || "http://localhost:8000";

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
};

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
  '/customers': 'customers',
  '/reports': 'reports',
  '/transactions': 'transactions',
  '/alerts': 'alerts',
  '/alert-definitions': 'alert-definitions',
  '/alert-stream': 'alert-stream',
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

// Navigate to a route
function navigate(path, queryParams = {}) {
  const panelId = routes[path] || routes['/'];

  // Build URL with query params
  let url = path;
  const params = new URLSearchParams(queryParams);
  if (params.toString()) {
    url = `${path}?${params.toString()}`;
  }

  activatePanel(panelId, path);
  window.history.pushState({ path, queryParams }, '', url);
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
  customerForm.querySelector('[name="full_name"]').value = customer.full_name || '';
  customerForm.querySelector('[name="email"]').value = customer.email || '';
  customerForm.querySelector('[name="country"]').value = customer.country || '';
  customerForm.querySelector('[name="id_document_expiry"]').value = customer.id_document_expiry || '';
  customerForm.querySelector('[name="geography_risk"]').value = customer.geography_risk || 1;
  customerForm.querySelector('[name="product_risk"]').value = customer.product_risk || 1;
  customerForm.querySelector('[name="behavior_risk"]').value = customer.behavior_risk || 1;
  customerForm.querySelector('[name="pep_flag"]').checked = customer.pep_flag || false;
  customerForm.querySelector('[name="sanctions_hit"]').checked = customer.sanctions_hit || false;
  customerForm.querySelector('[name="risk_override"]').value = customer.risk_override || '';

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
    // Case Management
    'customers': 'Customers',
    'transactions': 'Transactions',
    'alerts': 'Alerts',
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
    'users': 'Users',
    'roles': 'Roles & Permissions',
    'audit-log': 'Audit Log',
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
}

async function fetchJSON(path, opts = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
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

async function loadTransactions() {
  const data = await fetchJSON(`/transactions?limit=120`);
  state.transactions = data ?? sampleTransactions();
  renderTransactions();
  renderOverview();
}

async function loadAlerts() {
  // Load all alerts, filtering is done client-side via contextual filters
  const data = await fetchJSON(`/alerts`);
  state.alerts = data ?? sampleAlerts();
  renderAlerts();
  renderOverview();
}

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
  // Get contextual filter values
  const q = (transactionSearch?.value || '').toLowerCase();
  const financialFilter = transactionFinancialFilter?.value || '';
  const settlementFilter = transactionSettlementFilter?.value || '';
  const deliveryFilter = transactionDeliveryFilter?.value || '';

  const filteredRows = state.transactions.filter((t) => {
    // Text search
    const matchesSearch = !q ||
      (t.surrogate_id && t.surrogate_id.toLowerCase().includes(q)) ||
      (t.person_first_name && t.person_first_name.toLowerCase().includes(q)) ||
      (t.person_last_name && t.person_last_name.toLowerCase().includes(q)) ||
      (t.vendor_name && t.vendor_name.toLowerCase().includes(q)) ||
      (t.customer_name && t.customer_name.toLowerCase().includes(q));

    // Financial status filter
    const matchesFinancial = !financialFilter || t.transaction_financial_status === financialFilter;

    // Settlement status filter (client)
    const matchesSettlement = !settlementFilter || t.client_settlement_status === settlementFilter;

    // Delivery status filter
    const matchesDelivery = !deliveryFilter || t.transaction_delivery_status === deliveryFilter;

    return matchesSearch && matchesFinancial && matchesSettlement && matchesDelivery;
  });

  const rows = getSortedTransactions(filteredRows);

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
  document.getElementById("transactionTable").innerHTML = table;
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
  const total = state.transactions.length;
  const pendingFinancial = state.transactions.filter(t => t.transaction_financial_status === 'PENDING').length;
  const unpaidClient = state.transactions.filter(t => t.client_settlement_status === 'unpaid').length;
  const totalVolume = state.transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  setText("txnTotalCount", total);
  setText("txnPendingFinancial", pendingFinancial);
  setText("txnUnpaidClient", unpaidClient);
  setText("txnTotalVolume", formatCurrency(totalVolume));
}

function renderAlerts() {
  // Get contextual filter values
  const q = (alertSearch?.value || '').toLowerCase();
  const statusFilter = alertStatusFilter?.value || '';
  const severityFilter = alertSeverityFilter?.value || '';
  const typeFilter = alertTypeFilter?.value || '';

  const rows = state.alerts.filter((a) => {
    // Text search
    const matchesSearch = !q ||
      (a.scenario && a.scenario.toLowerCase().includes(q)) ||
      (a.type && a.type.toLowerCase().includes(q)) ||
      (a.details?.definition_name && a.details.definition_name.toLowerCase().includes(q)) ||
      (a.details?.definition_code && a.details.definition_code.toLowerCase().includes(q));

    // Status filter
    const matchesStatus = !statusFilter || a.status === statusFilter;

    // Severity filter
    const matchesSeverity = !severityFilter || a.severity === severityFilter;

    // Type filter
    const matchesType = !typeFilter || a.type === typeFilter;

    return matchesSearch && matchesStatus && matchesSeverity && matchesType;
  });

  // Status badge helper
  const alertStatusBadge = (status) => {
    const badges = {
      'open': 'amber',
      'investigating': 'blue',
      'resolved': 'teal',
      'dismissed': 'purple',
    };
    return badges[status] || 'purple';
  };

  const table = `
    <table>
      <thead>
        <tr><th>Scenario</th><th>Definition</th><th>Type</th><th>Severity</th><th>Status</th><th>Created</th></tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr>
            <td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">
              No alerts found
            </td>
          </tr>
        ` : rows
          .map(
            (a) => `
          <tr>
            <td>${a.scenario ?? "-"}</td>
            <td>${a.details?.definition_name ?? a.details?.definition_code ?? "-"}</td>
            <td>${a.type ?? "-"}</td>
            <td><span class="badge ${severityBadge(a.severity)}">${a.severity}</span></td>
            <td><span class="badge ${alertStatusBadge(a.status)}">${a.status}</span></td>
            <td>${new Date(a.created_at).toLocaleString()}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("alertTable").innerHTML = table;
  const el2 = document.getElementById("alertTable2");
  if (el2) el2.innerHTML = table;
}

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
  document.getElementById("alertDefinitions").innerHTML = list || emptyState("No definitions");
  const el2 = document.getElementById("alertDefinitions2");
  if (el2) el2.innerHTML = list || emptyState("No definitions");

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
  await Promise.all([
    loadCustomers(),
    loadTransactions(),
    loadAlerts(),
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

        // Re-render alerts if on alerts panel
        const alertsPanel = document.getElementById('alerts');
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
const panelId = routes[currentPath] || routes['/'];

// Check for query parameters (e.g., customer ID)
const urlParams = new URLSearchParams(window.location.search);
const customerId = urlParams.get('id');
if (customerId) {
  state.selectedCustomerId = customerId;
}

activatePanel(panelId, currentPath, false);

// Set initial history state if not present
if (!window.history.state) {
  window.history.replaceState({ path: currentPath }, '', currentPath);
}

loadAll().then(() => {
  // Start SSE streams after initial load
  createLiveIndicator();
  startTransactionStream();
  startAlertStream();
});

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
      'SanctionsScreeningWorkflow': { name: 'Sanctions Screening', icon: '🛡️', color: 'var(--red)' }
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
