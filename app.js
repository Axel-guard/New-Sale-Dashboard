// ====== CONFIG (GitHub + App Settings) ======
const GITHUB_OWNER = "Axel-guard";
const GITHUB_REPO = "New-Sale-Dashboard";
const GITHUB_PATH = "data/sales.json";

// Hosted JSON file (for GitHub Pages direct load)
const salesUrl = `https://${GITHUB_OWNER.toLowerCase()}.github.io/${GITHUB_REPO}/data/sales.json`;

// Currency settings
const CURRENCY_LOCALE = "en-IN";
const CURRENCY_CODE = "INR";

// ====== DOM ELEMENTS ======
const monthSelect = document.getElementById("monthSelect");
const employeeSearch = document.getElementById("employeeSearch");
const employeeList = document.getElementById("employeeList");
const kpiBoxes = document.getElementById("kpiBoxes");
const salesTableBody = document.querySelector("#salesTable tbody");

const barChartEl = document.getElementById("barChart");
const pieEmployeeEl = document.getElementById("pieEmployeeCurrent");
const piePaymentEl = document.getElementById("piePaymentStatus");

const exportCsvBtn = document.getElementById("exportCsv");
const downloadJsonBtn = document.getElementById("downloadJson");
const openAddSaleBtn = document.getElementById("openAddSale");

const addSaleModal = document.getElementById("addSaleModal");
const closeAddSale = document.getElementById("closeAddSale");
const cancelAdd = document.getElementById("cancelAdd");
const addSaleForm = document.getElementById("addSaleForm");
const addProductRowBtn = document.getElementById("addProductRow");
const totalField = document.getElementById("totalField");

const pages = {
  dashboard: document.getElementById("page-dashboard"),
  order: document.getElementById("page-order"),
  courier: document.getElementById("page-courier"),
  customers: document.getElementById("page-customers")
};

// ====== GLOBAL VARIABLES ======
window.allSales = []; // accessible from console
let currentMonth = "all";
let charts = {};

// ====== INIT APP ======
(async function init() {
  try {
    const res = await fetch(salesUrl);
    const data = await res.json();

    if (!Array.isArray(data)) {
      alert("⚠️ sales.json format invalid — should be an array []");
      return;
    }

    window.allSales = data;
    console.log("✅ Loaded sales.json:", allSales.length, "records");
    buildMonthOptions();
    buildEmployeeList();
    renderDashboard();
  } catch (err) {
    console.error("❌ Failed to load sales.json", err);
    alert("Could not load sales.json. Check file path or permissions.");
  }
})();

// ====== FUNCTIONS ======
function buildMonthOptions() {
  const months = [...new Set(allSales.map(s => new Date(s.date).toISOString().slice(0, 7)))];
  monthSelect.innerHTML = `<option value="all">All</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
  monthSelect.value = "all";
}

function buildEmployeeList() {
  const employees = [...new Set(allSales.map(s => s.employee))].filter(Boolean);
  employeeList.innerHTML = employees.map(emp => `<li>${emp}</li>`).join("");
}

function renderDashboard() {
  const filtered = currentMonth === "all"
    ? allSales
    : allSales.filter(s => new Date(s.date).toISOString().slice(0, 7) === currentMonth);

  if (!filtered.length) {
    salesTableBody.innerHTML = `<tr><td colspan="7">No sales found for this month.</td></tr>`;
    if (charts.bar) charts.bar.destroy();
    if (charts.pieEmp) charts.pieEmp.destroy();
    if (charts.piePay) charts.piePay.destroy();
    return;
  }

  renderSalesTable(filtered);
  renderCharts(filtered);
  renderKPIs(filtered);
}

// When Add Sale form submits, refresh the dashboard
addSaleForm?.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(addSaleForm);
  const obj = Object.fromEntries(formData.entries());

  const newSale = {
    id: Date.now(),
    customer: "New Customer",
    cust_code: obj.cust_code,
    date: obj.date,
    employee: obj.employee || "Unassigned",
    items: [{
      product: obj.product_1,
      qty: Number(obj.qty_1 || 1),
      price: Number(obj.price_1 || 0)
    }],
    total: Number(totalField.value.replace(/,/g, "")) || 0,
    payments: [{
      date: new Date().toISOString().split("T")[0],
      amount: Number(obj.amount_received || 0),
      method: obj.account
    }]
  };

  allSales.push(newSale); // Add in-memory
  renderDashboard(); // Refresh charts + tables instantly

  addSaleModal.style.display = "none";
  addSaleForm.reset();
  alert("✅ Sale added successfully (temporary until GitHub save is enabled).");
});

function renderCharts(data) {
  const ctxBar = barChartEl.getContext("2d");
  const ctxPie1 = pieEmployeeEl.getContext("2d");
  const ctxPie2 = piePaymentEl.getContext("2d");

  const byEmp = {};
  const payStatus = { Full: 0, Partial: 0, Pending: 0 };

  data.forEach(s => {
    byEmp[s.employee] = (byEmp[s.employee] || 0) + s.total;
    const paid = s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    if (paid >= s.total) payStatus.Full++;
    else if (paid > 0) payStatus.Partial++;
    else payStatus.Pending++;
  });

  const empLabels = Object.keys(byEmp);
  const empValues = Object.values(byEmp);

  Object.values(charts).forEach(c => c.destroy());
  charts = {};

  // Bar Chart (more readable labels)
  charts.bar = new Chart(ctxBar, {
    type: "bar",
    data: {
      labels: empLabels,
      datasets: [{
        label: "Sales by Employee",
        data: empValues,
        backgroundColor: "#3b82f6"
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          ticks: {
            color: document.body.classList.contains("dark") ? "#f9fafb" : "#111",
            font: { weight: "600", size: 13 }
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: document.body.classList.contains("dark") ? "#f9fafb" : "#111",
            font: { size: 12 }
          },
          grid: { color: document.body.classList.contains("dark") ? "#475569" : "#d1d5db" }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      }
    }
  });

  // Pie charts: closer alignment and smaller size
  charts.pieEmp = new Chart(ctxPie1, {
    type: "pie",
    data: {
      labels: empLabels,
      datasets: [{
        data: empValues,
        backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"]
      }]
    },
    options: {
      responsive: true,
      layout: { padding: 0 },
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { size: 12, weight: "500" },
            color: document.body.classList.contains("dark") ? "#f9fafb" : "#111"
          }
        }
      }
    }
  });

  charts.piePay = new Chart(ctxPie2, {
    type: "doughnut",
    data: {
      labels: Object.keys(payStatus),
      datasets: [{
        data: Object.values(payStatus),
        backgroundColor: ["#10b981", "#fbbf24", "#ef4444"]
      }]
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { size: 12, weight: "500" },
            color: document.body.classList.contains("dark") ? "#f9fafb" : "#111"
          }
        }
      }
    }
  });
}

  renderSalesTable(filtered);
  renderCharts(filtered);
  renderKPIs(filtered);
}

function renderSalesTable(data) {
  salesTableBody.innerHTML = data.map(s => {
    const products = s.items?.map(i => `${i.product} (${i.qty}×${i.price})`).join(", ") || "";
    const payments = s.payments?.map(p => `${p.method}: ₹${p.amount}`).join(", ") || "";
    const paid = s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    const status = paid >= s.total ? "Full" : paid > 0 ? "Part" : "Pending";

    return `
      <tr>
        <td>${s.customer}</td>
        <td>${new Date(s.date).toLocaleDateString("en-IN")}</td>
        <td>${s.employee}</td>
        <td>${products}</td>
        <td>₹${s.total.toLocaleString(CURRENCY_LOCALE)}</td>
        <td>${status}</td>
        <td>${payments}</td>
      </tr>
    `;
  }).join("");
}

function renderCharts(data) {
  const ctxBar = barChartEl.getContext("2d");
  const ctxPie1 = pieEmployeeEl.getContext("2d");
  const ctxPie2 = piePaymentEl.getContext("2d");

  const byEmp = {};
  const payStatus = { Full: 0, Partial: 0, Pending: 0 };

  data.forEach(s => {
    byEmp[s.employee] = (byEmp[s.employee] || 0) + s.total;
    const paid = s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    if (paid >= s.total) payStatus.Full++;
    else if (paid > 0) payStatus.Partial++;
    else payStatus.Pending++;
  });

  const empLabels = Object.keys(byEmp);
  const empValues = Object.values(byEmp);

  // Destroy old charts before re-render
  Object.values(charts).forEach(c => c.destroy());
  charts = {};

  charts.bar = new Chart(ctxBar, {
    type: "bar",
    data: {
      labels: empLabels,
      datasets: [{ label: "Sales by Employee", data: empValues, backgroundColor: "#007bff" }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  charts.pieEmp = new Chart(ctxPie1, {
    type: "pie",
    data: {
      labels: empLabels,
      datasets: [{ data: empValues, backgroundColor: ["#007bff", "#ffc107", "#28a745", "#dc3545"] }]
    },
    options: { responsive: true }
  });

  charts.piePay = new Chart(ctxPie2, {
    type: "doughnut",
    data: {
      labels: Object.keys(payStatus),
      datasets: [{ data: Object.values(payStatus), backgroundColor: ["#28a745", "#ffc107", "#dc3545"] }]
    },
    options: { responsive: true }
  });
}

function renderKPIs(data) {
  const totalSales = data.reduce((a, s) => a + s.total, 0);
  const totalPaid = data.reduce((a, s) => a + (s.payments?.reduce((x, y) => x + (y.amount || 0), 0) || 0), 0);
  const totalOrders = data.length;

  kpiBoxes.innerHTML = `
    <div class="kpi">Total Orders<br/><strong>${totalOrders}</strong></div>
    <div class="kpi">Total Sales<br/><strong>₹${totalSales.toLocaleString(CURRENCY_LOCALE)}</strong></div>
    <div class="kpi">Received<br/><strong>₹${totalPaid.toLocaleString(CURRENCY_LOCALE)}</strong></div>
  `;
}

// ====== EVENT LISTENERS ======
monthSelect.addEventListener("change", e => {
  currentMonth = e.target.value;
  renderDashboard();
});

employeeSearch.addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  const filtered = allSales.filter(s => s.employee.toLowerCase().includes(q));
  renderSalesTable(filtered);
});

openAddSaleBtn.addEventListener("click", () => addSaleModal.style.display = "block");
closeAddSale.addEventListener("click", () => addSaleModal.style.display = "none");
cancelAdd?.addEventListener("click", () => addSaleModal.style.display = "none");

addProductRowBtn?.addEventListener("click", () => {
  const count = addSaleForm.querySelectorAll(".product-row").length + 1;
  const div = document.createElement("div");
  div.classList.add("product-row");
  div.innerHTML = `
    <label>Product ${count}: <input name="product_${count}" /></label>
    <label>Qty: <input type="number" name="qty_${count}" value="1" min="1" /></label>
    <label>Price: <input type="number" name="price_${count}" value="0" min="0" /></label>
  `;
  addSaleForm.querySelector("#productsContainer").appendChild(div);
});

addSaleForm?.addEventListener("input", () => {
  let total = 0;
  const rows = addSaleForm.querySelectorAll(".product-row");
  rows.forEach(r => {
    const qty = +r.querySelector(`[name^="qty_"]`).value || 0;
    const price = +r.querySelector(`[name^="price_"]`).value || 0;
    total += qty * price;
  });
  totalField.value = total.toLocaleString(CURRENCY_LOCALE);
});
// ===== THEME TOGGLE (Light/Dark) =====
const themeToggle = document.getElementById("themeToggle");
let darkMode = localStorage.getItem("theme") === "dark";

function applyTheme() {
  document.body.classList.toggle("dark", darkMode);
  themeToggle.textContent = darkMode ? "☀️" : "🌙";

  // Update chart colors dynamically
  Object.values(charts).forEach(chart => {
    if (!chart?.options) return;
    chart.options.plugins.legend.labels.color = darkMode ? "#f9fafb" : "#111827";
    chart.options.scales?.x && (chart.options.scales.x.grid.color = darkMode ? "#475569" : "#d1d5db");
    chart.options.scales?.y && (chart.options.scales.y.grid.color = darkMode ? "#475569" : "#d1d5db");
    chart.update();
  });
}

themeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem("theme", darkMode ? "dark" : "light");
  applyTheme();
});

applyTheme(); // Apply saved theme on load
