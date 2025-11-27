const API_BASE = window.API_BASE || "http://localhost:8000";

const state = {
  customers: [],
  transactions: [],
  alerts: [],
  alertDefinitions: [],
  kyc: [],
  reports: {
    highRisk: [],
    alerts: [],
  },
};

const navButtons = document.querySelectorAll(".nav-item");
const accordionTriggers = document.querySelectorAll(".accordion-trigger");
const panels = document.querySelectorAll(".panel");
const searchInput = document.getElementById("searchInput");
const riskFilter = document.getElementById("riskFilter");
const alertStatusFilter = document.getElementById("alertStatusFilter");
const alertStatusFilter2 = document.getElementById("alertStatusFilter2");
const refreshBtn = document.getElementById("refreshBtn");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const runKycBtn = document.getElementById("runKycBtn");
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

navButtons.forEach((btn) =>
  btn.addEventListener("click", () => activatePanel(btn.dataset.target))
);

accordionTriggers.forEach((trigger) =>
  trigger.addEventListener("click", () => {
    const item = trigger.parentElement;
    item.classList.toggle("open");
  })
);

document.querySelectorAll(".btn.text").forEach((btn) => {
  btn.addEventListener("click", () => activatePanel(btn.dataset.target));
});

searchInput.addEventListener("input", () => renderAll());
riskFilter.addEventListener("change", () => loadCustomers());
alertStatusFilter.addEventListener("change", () => loadAlerts());
alertStatusFilter2.addEventListener("change", () => loadAlerts());
refreshBtn.addEventListener("click", () => loadAll());
runKycBtn.addEventListener("click", handleRunKyc);
runReportBtn.addEventListener("click", handleRunReport);
themeToggle.addEventListener("click", toggleTheme);

openModalBtn.addEventListener("click", () => toggleModal(true));
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
  const payload = {
    full_name: data.get("full_name"),
    email: data.get("email"),
    country: data.get("country"),
    id_document_expiry: data.get("id_document_expiry") || null,
    indicators: {
      geography_risk: Number(data.get("geography_risk") || 0),
      product_risk: Number(data.get("product_risk") || 0),
      behavior_risk: Number(data.get("behavior_risk") || 0),
      pep_flag: data.get("pep_flag") === "on",
      sanctions_hit: data.get("sanctions_hit") === "on",
    },
    risk_override: data.get("risk_override") || null,
  };

  const created = await fetchJSON("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (created) {
    toggleModal(false);
    customerForm.reset();
    await loadCustomers();
  } else {
    alert("Could not create customer. Check API.");
  }
});

function toggleModal(show) {
  modal.classList.toggle("hidden", !show);
}

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

function activatePanel(name) {
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.target === name));
  panels.forEach((p) => p.classList.toggle("active", p.id === name));
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
  const filter = riskFilter.value;
  const qs = filter ? `?risk_level=${filter}` : "";
  const data = await fetchJSON(`/customers${qs}`);
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
  const filter = alertStatusFilter.value || alertStatusFilter2.value;
  const qs = filter ? `?status=${filter}` : "";
  const data = await fetchJSON(`/alerts${qs}`);
  state.alerts = data ?? sampleAlerts();
  renderAlerts();
  renderOverview();
  // Sync filter values
  if (alertStatusFilter.value !== filter) alertStatusFilter.value = filter;
  if (alertStatusFilter2.value !== filter) alertStatusFilter2.value = filter;
}

async function loadAlertDefinitions() {
  const data = await fetchJSON("/alert-definitions");
  state.alertDefinitions = data ?? [];
  renderAlertDefinitions();
}

async function loadKyc() {
  const data = await fetchJSON("/kyc/tasks");
  state.kyc = data ?? sampleKycTasks();
  renderKyc();
  renderOverview();
}

async function handleRunKyc() {
  await fetchJSON("/kyc/run", { method: "POST" });
  await loadKyc();
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
  const q = searchInput.value.toLowerCase();
  const rows = state.customers.filter(
    (c) =>
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.country && c.country.toLowerCase().includes(q))
  );
  const table = `
    <table>
      <thead>
        <tr><th>Name</th><th>Email</th><th>Country</th><th>Risk</th><th>PEP</th><th>Sanctions</th><th>ID expiry</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (c) => `
          <tr>
            <td>${c.full_name}</td>
            <td>${c.email ?? "-"}</td>
            <td>${c.country ?? "-"}</td>
            <td><span class="badge ${riskBadge(c.risk_level)}">${c.risk_level} (${c.risk_score ?? "-"})</span></td>
            <td>${c.pep_flag ? "Yes" : "No"}</td>
            <td>${c.sanctions_hit ? "Yes" : "No"}</td>
            <td>${c.id_document_expiry ?? "-"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("customerTable").innerHTML = table;
}

function renderTransactions() {
  const q = searchInput.value.toLowerCase();
  const rows = state.transactions.filter(
    (t) =>
      !q ||
      (t.full_name && t.full_name.toLowerCase().includes(q)) ||
      (t.country && t.country.toLowerCase().includes(q))
  );
  const table = `
    <table>
      <thead>
        <tr><th>Customer</th><th>Amount</th><th>Currency</th><th>Country</th><th>MCC</th><th>Channel</th><th>When</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (t) => `
          <tr>
            <td>${t.full_name ?? t.customer_id}</td>
            <td>${t.amount}</td>
            <td>${t.currency}</td>
            <td>${t.country ?? "-"}</td>
            <td>${t.merchant_category ?? "-"}</td>
            <td>${t.channel ?? "-"}</td>
            <td>${new Date(t.occurred_at).toLocaleString()}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("transactionTable").innerHTML = table;
}

function renderAlerts() {
  const q = searchInput.value.toLowerCase();
  const rows = state.alerts.filter(
    (a) =>
      !q ||
      (a.scenario && a.scenario.toLowerCase().includes(q)) ||
      (a.type && a.type.toLowerCase().includes(q))
  );
  const table = `
    <table>
      <thead>
        <tr><th>Scenario</th><th>Definition</th><th>Severity</th><th>Status</th><th>Created</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (a) => `
          <tr>
            <td>${a.scenario ?? "-"}</td>
            <td>${a.details?.definition_name ?? a.details?.definition_code ?? "-"}</td>
            <td><span class="badge ${severityBadge(a.severity)}">${a.severity}</span></td>
            <td>${a.status}</td>
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

function renderKyc() {
  const rows = state.kyc;
  const table = `
    <table>
      <thead>
        <tr><th>Customer</th><th>Due date</th><th>Reason</th><th>Notified</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (t) => `
          <tr>
            <td>${t.customer_id}</td>
            <td>${t.due_date}</td>
            <td>${t.reason}</td>
            <td>${t.notified ? "Yes" : "No"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("kycTable").innerHTML = table;
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
  const upcomingKyc = state.kyc.length;
  const now = Date.now();
  const recentVolume = state.transactions
    .filter((t) => now - new Date(t.occurred_at).getTime() < 24 * 3600 * 1000)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  setText("statAlerts", openAlerts);
  setText("statHighRisk", highRisk);
  setText("statKyc", upcomingKyc);
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
            <div class="title">${t.full_name ?? t.customer_id}</div>
            <div class="subtitle">${t.amount} ${t.currency} · ${new Date(t.occurred_at).toLocaleTimeString()}</div>
          </div>
          <span class="badge ${riskBadge(t.risk_level || "low")}">${t.country ?? "-"}</span>
        </div>`
      )
      .join("") || emptyState("No transactions");
}

function renderAll() {
  renderCustomers();
  renderTransactions();
  renderAlerts();
  renderAlertDefinitions();
  renderKyc();
  renderReports();
  renderOverview();
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
    { id: "c1", full_name: "Demo High Risk", email: "hr@example.com", country: "RO", risk_score: 8.2, risk_level: "high", pep_flag: true, sanctions_hit: false, id_document_expiry: "2025-05-01" },
    { id: "c2", full_name: "Demo Medium", email: "med@example.com", country: "DE", risk_score: 5.1, risk_level: "medium", pep_flag: false, sanctions_hit: false, id_document_expiry: "2024-12-10" },
    { id: "c3", full_name: "Demo Low", email: "low@example.com", country: "FR", risk_score: 2.1, risk_level: "low", pep_flag: false, sanctions_hit: false, id_document_expiry: "2026-01-01" },
  ];
}
function sampleTransactions() {
  const now = new Date();
  return [
    { id: 1, customer_id: "c1", full_name: "Demo High Risk", amount: 12000, currency: "EUR", country: "GB", merchant_category: "7995", channel: "card", occurred_at: now.toISOString(), risk_level: "high" },
    { id: 2, customer_id: "c2", full_name: "Demo Medium", amount: 2200, currency: "EUR", country: "DE", merchant_category: "5311", channel: "app", occurred_at: now.toISOString(), risk_level: "medium" },
  ];
}
function sampleAlerts() {
  return [
    { id: 10, type: "transaction_monitoring", scenario: "large_transaction", severity: "high", status: "open", created_at: new Date().toISOString() },
    { id: 11, type: "workflow", scenario: "sanctions_match", severity: "high", status: "open", created_at: new Date().toISOString() },
  ];
}
function sampleKycTasks() {
  return [
    { id: 20, customer_id: "c1", due_date: "2024-12-01", reason: "Document expiry approaching", notified: false },
  ];
}

async function loadAll() {
  await Promise.all([
    loadCustomers(),
    loadTransactions(),
    loadAlerts(),
    loadAlertDefinitions(),
    loadKyc(),
    loadReports(),
  ]);
}

initTheme();
loadAll();
