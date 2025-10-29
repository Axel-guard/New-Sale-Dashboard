/* app.js — stable build */
"use strict";

/* ==============================
   CONFIG
============================== */
const SALES_URL = "./data/sales.json";

// GitHub write-back (OFF by default for safety)
const SAVE_TO_GITHUB = true; // set true only if you really want to commit from browser
const GH_USERNAME = "axel-guard";
const GH_REPO = "New-Sale-Dashboard";
const GH_FILE_PATH = "data/sales.json";
// ⚠️ For production, DO NOT put tokens in client JS. Use a serverless function instead.
const GH_TOKEN = "YOUR_PERSONAL_ACCESS_TOKEN";

/* ==============================
   STATE & DOM
============================== */
let allSales = [];
let charts = {};
let currentMonth = "all";

const $ = (id) => document.getElementById(id);
const monthSelect = $("monthSelect");
const salesTableBody = document.querySelector("#salesTable tbody");
const kpiBoxes = $("kpiBoxes");

// Add Sale modal & form
const addSaleModal = $("addSaleModal");
const openAddSaleBtn = $("openAddSale");
const closeAddSaleBtn = $("closeAddSale");
const cancelAddBtn = $("cancelAdd");
const addSaleForm = $("addSaleForm");
const totalField = $("totalField");

/* ==============================
   UTIL
============================== */
function toINR(n = 0) {
  return `₹${Number(n || 0).toLocaleString()}`;
}
function isEl(x) {
  return x && typeof x === "object";
}

/* ==============================
   LOAD SALES
============================== */
async function loadSalesData() {
  try {
    const res = await fetch(SALES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot fetch sales.json");

    const text = await res.text();
    if (!text.trim()) throw new Error("Empty JSON file");

    const data = JSON.parse(text);
    allSales = Array.isArray(data) ? data : data.sales || [];

    console.log("✅ Loaded", allSales.length, "records");
    initMonthSelect(allSales);
    renderDashboard();
  } catch (err) {
    console.error("❌ Error loading sales.json:", err);
    if (isEl(salesTableBody)) {
      salesTableBody.innerHTML =
        `<tr><td colspan="7">Failed to load data.</td></tr>`;
    }
    if (isEl(kpiBoxes)) kpiBoxes.innerHTML = "";
  }
}

/* Build Month dropdown from data */
function initMonthSelect(data) {
  if (!isEl(monthSelect)) return;

  const months = new Set(
    data
      .filter((s) => s?.date)
      .map((s) => new Date(s.date).toISOString().slice(0, 7))
  );
  const list = ["all", ...Array.from(months).sort().reverse()];

  monthSelect.innerHTML = list
    .map((m) =>
      `<option value="${m}">${m === "all" ? "All time" : m}</option>`
    )
    .join("");

  monthSelect.value = currentMonth;
  monthSelect.onchange = () => {
    currentMonth = monthSelect.value || "all";
    renderDashboard();
  };
}

/* ==============================
   DASHBOARD RENDER
============================== */
function renderDashboard() {
  const data =
    currentMonth === "all"
      ? allSales
      : allSales.filter(
          (s) => s?.date && new Date(s.date).toISOString().slice(0, 7) === currentMonth
        );

  if (!data.length) {
    if (isEl(salesTableBody)) {
      salesTableBody.innerHTML =
        `<tr><td colspan="7">No sales found for this month.</td></tr>`;
    }
    Object.values(charts).forEach((c) => c?.destroy?.());
    if (isEl(kpiBoxes)) kpiBoxes.innerHTML = "";
    return;
  }

  renderSalesTable(data);
  renderCharts(data);
  renderKPIs(data);
}

function renderSalesTable(data) {
  if (!isEl(salesTableBody)) return;

  salesTableBody.innerHTML = data
    .map((s) => {
      const total = s.total || 0;
      const paid =
        s.payments?.reduce((a, b) => a + (Number(b.amount) || 0), 0) || 0;
      const status =
        paid >= total
          ? '<span class="badge paid">Full</span>'
          : paid > 0
          ? '<span class="badge partial">Partial</span>'
          : '<span class="badge pending">Pending</span>';

      return `<tr>
        <td>${s.customer || s.cust_code || ""}</td>
        <td>${s.date || ""}</td>
        <td>${s.employee || ""}</td>
        <td>${(s.items || []).map((i) => i.product).join(", ")}</td>
        <td>${toINR(total)}</td>
        <td>${status}</td>
        <td>${(s.payments || []).map((p) => p.method).join(", ")}</td>
      </tr>`;
    })
    .join("");
}

function renderKPIs(data) {
  if (!isEl(kpiBoxes)) return;

  const totalOrders = data.length;
  const totalSales = data.reduce((a, s) => a + (s.total || 0), 0);
  const totalReceived = data.reduce(
    (a, s) =>
      a + (s.payments?.reduce((x, y) => x + (y.amount || 0), 0) || 0),
    0
  );
  const balance = Math.max(0, totalSales - totalReceived);

  kpiBoxes.innerHTML = `
    <div class="kpi"><div class="val">${totalOrders}</div>Current Month Orders</div>
    <div class="kpi"><div class="val">${toINR(totalSales)}</div>Total Sales</div>
    <div class="kpi"><div class="val">${toINR(totalReceived)}</div>Received</div>
    <div class="kpi"><div class="val">${toINR(balance)}</div>Balance Payment</div>
  `;
}

/* ==============================
   CHARTS
============================== */
function renderCharts(data) {
  const ctxBar = $("barChart")?.getContext?.("2d");
  const ctxPie1 = $("pieEmployeeCurrent")?.getContext?.("2d");
  const ctxPie2 = $("piePaymentStatus")?.getContext?.("2d");
  if (!ctxBar || !ctxPie1 || !ctxPie2) return;

  const byEmp = {};
  const payStatus = { Full: 0, Partial: 0, Pending: 0 };

  data.forEach((s) => {
    const total = s.total || 0;
    const emp = s.employee || "Unassigned";
    byEmp[emp] = (byEmp[emp] || 0) + total;

    const paid = s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    if (paid >= total) payStatus.Full++;
    else if (paid > 0) payStatus.Partial++;
    else payStatus.Pending++;
  });

  const empLabels = Object.keys(byEmp);
  const empValues = Object.values(byEmp);

  // Clear old charts
  Object.values(charts).forEach((c) => c?.destroy?.());
  charts = {};

  const dark = document.body.classList.contains("dark");

  charts.bar = new Chart(ctxBar, {
    type: "bar",
    data: {
      labels: empLabels,
      datasets: [
        {
          label: "Sales by Employee",
          data: empValues,
          backgroundColor: dark ? "#60a5fa" : "#3b82f6",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: {
            color: dark ? "#f9fafb" : "#111827",
            font: { weight: "600", size: 13 },
          },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: dark ? "#f9fafb" : "#111827",
            font: { size: 12 },
          },
          grid: { color: dark ? "#475569" : "#d1d5db" },
        },
      },
    },
  });

  charts.pieEmp = new Chart(ctxPie1, {
    type: "pie",
    data: {
      labels: empLabels,
      datasets: [
        {
          data: empValues,
          backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#a855f7"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: dark ? "#f9fafb" : "#111827" },
        },
      },
    },
  });

  charts.piePay = new Chart(ctxPie2, {
    type: "doughnut",
    data: {
      labels: Object.keys(payStatus),
      datasets: [
        {
          data: Object.values(payStatus),
          backgroundColor: ["#10b981", "#fbbf24", "#ef4444"],
        },
      ],
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: dark ? "#f9fafb" : "#111827" },
        },
      },
    },
  });
}

/* ==============================
   ADD SALE (MODAL & SAVE)
============================== */
function openModal() {
  if (!isEl(addSaleModal)) return;
  addSaleModal.classList.add("active");
}
function closeModal() {
  if (!isEl(addSaleModal)) return;
  addSaleModal.classList.remove("active");
}

openAddSaleBtn?.addEventListener("click", openModal);
closeAddSaleBtn?.addEventListener("click", closeModal);
cancelAddBtn?.addEventListener("click", closeModal);
addSaleModal?.addEventListener("click", (e) => {
  if (e.target === addSaleModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* Auto-calc total when product qty/price change */
function bindAutoTotal() {
  if (!isEl(addSaleForm) || !isEl(totalField)) return;

  const calc = () => {
    const qty = Number(addSaleForm.querySelector('[name="qty_1"]')?.value || 1);
    const price = Number(addSaleForm.querySelector('[name="price_1"]')?.value || 0);
    const courier = Number(addSaleForm.querySelector('[name="courier_cost"]')?.value || 0);
    const total = Math.max(0, qty * price + courier);
    totalField.value = total.toLocaleString();
  };

  addSaleForm.addEventListener("input", (e) => {
    if (["qty_1", "price_1", "courier_cost"].includes(e.target.name)) calc();
  });
  calc();
}
bindAutoTotal();

addSaleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(addSaleForm);
  const obj = Object.fromEntries(formData.entries());

  const newSale = {
    id: Date.now(),
    customer: "New Customer",
    cust_code: obj.cust_code,
    date: obj.date,
    employee: obj.employee || "Unassigned",
    items: [
      {
        product: obj.product_1,
        qty: Number(obj.qty_1 || 1),
        price: Number(obj.price_1 || 0),
      },
    ],
    total: Number((totalField?.value || "0").replace(/,/g, "")) || 0,
    payments: [
      {
        date: new Date().toISOString().split("T")[0],
        amount: Number(obj.amount_received || 0),
        method: obj.account,
        ref: obj.payment_ref || "",
      },
    ],
    courier_cost: Number(obj.courier_cost || 0),
  };

  allSales.push(newSale);
  renderDashboard();
  closeModal();
  addSaleForm.reset();

  if (SAVE_TO_GITHUB) {
    try {
      await saveSalesToGitHub(allSales);
      alert("✅ Sale saved successfully to GitHub!");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to save sale to GitHub. (Check console)");
    }
  } else {
    alert("✅ Sale added (local only).\nTip: Turn on SAVE_TO_GITHUB in app.js to commit to GitHub.");
  }
});

/* Commit to GitHub via REST (requires token; client-side use not recommended) */
async function saveSalesToGitHub(updatedSales) {
  const apiUrl = `https://api.github.com/repos/${GH_USERNAME}/${GH_REPO}/contents/${GH_FILE_PATH}`;

  // 1) Get current file SHA
  const getRes = await fetch(apiUrl, {
    headers: { Authorization: `token ${GH_TOKEN}` },
  });
  if (!getRes.ok) {
    const t = await getRes.text();
    throw new Error(`Get SHA failed: ${getRes.status} ${t}`);
  }
  const fileData = await getRes.json();
  const sha = fileData?.sha;

  // 2) Update with new content
  const updatedContent = btoa(unescape(encodeURIComponent(JSON.stringify(updatedSales, null, 2))));

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Update sales.json (${new Date().toISOString()})`,
      content: updatedContent,
      sha,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`PUT failed: ${putRes.status} ${t}`);
  }
}

/* ==============================
   THEME
============================== */
const themeToggle = $("themeToggle");
let darkMode = localStorage.getItem("theme") === "dark";

function applyTheme() {
  document.body.classList.toggle("dark", darkMode);
  if (themeToggle) themeToggle.textContent = darkMode ? "☀️" : "🌙";
  Object.values(charts).forEach((c) => c?.update?.());
}
themeToggle?.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem("theme", darkMode ? "dark" : "light");
  applyTheme();
});
applyTheme();

/* ==============================
   BOOT
============================== */
loadSalesData();
