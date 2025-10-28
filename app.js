// ===== GLOBAL VARIABLES =====
window.allSales = [];
let charts = {};
let currentMonth = "all";
const monthSelect = document.getElementById("monthSelect");
const salesTableBody = document.querySelector("#salesTable tbody");
const addSaleForm = document.getElementById("addSaleForm");
const addSaleModal = document.getElementById("addSaleModal");
const totalField = document.getElementById("totalField");

// ===== LOAD SALES DATA =====
async function loadSalesData() {
  try {
    // ✅ Use absolute URL for GitHub Pages (adjust if you host elsewhere)
    const res = await fetch("https://axel-guard.github.io/New-Sale-Dashboard/Data/sales.json ", { cache: "no-store" });


    if (!res.ok) throw new Error("Cannot fetch sales.json");

    const text = await res.text();
    if (!text.trim()) throw new Error("Empty JSON file");
    const data = JSON.parse(text);

    window.allSales = Array.isArray(data) ? data : data.sales || [];
    console.log("✅ Loaded", allSales.length, "records");

    renderDashboard();
  } catch (err) {
    console.error("❌ Error loading sales.json:", err);
    salesTableBody.innerHTML = `<tr><td colspan="7">Failed to load data.</td></tr>`;
  }
}

loadSalesData(); // Initial load

// ===== RENDER DASHBOARD =====
function renderDashboard() {
  const filtered =
    currentMonth === "all"
      ? allSales
      : allSales.filter(
          (s) => new Date(s.date).toISOString().slice(0, 7) === currentMonth
        );

  if (!filtered.length) {
    salesTableBody.innerHTML = `<tr><td colspan="7">No sales found for this month.</td></tr>`;
    Object.values(charts).forEach((c) => c?.destroy?.());
    document.getElementById("kpiBoxes").innerHTML = "";
    return;
  }

  renderSalesTable(filtered);
  renderCharts(filtered);
  renderKPIs(filtered);
}

// ===== RENDER SALES TABLE =====
function renderSalesTable(data) {
  salesTableBody.innerHTML = data
    .map(
      (s) => `
      <tr>
        <td>${s.customer || s.cust_code}</td>
        <td>${s.date}</td>
        <td>${s.employee}</td>
        <td>${s.items?.map((i) => i.product).join(", ")}</td>
        <td>₹${(s.total || 0).toLocaleString()}</td>
        <td>${
          (s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0) >=
          (s.total || 0)
            ? '<span class="badge paid">Full</span>'
            : '<span class="badge partial">Partial</span>'
        }</td>
        <td>${s.payments?.map((p) => p.method).join(", ")}</td>
      </tr>`
    )
    .join("");
}

// ===== RENDER KPI BOXES =====
function renderKPIs(data) {
  const totalOrders = data.length;
  const totalSales = data.reduce((a, s) => a + (s.total || 0), 0);
  const totalReceived = data.reduce(
    (a, s) =>
      a + (s.payments?.reduce((x, y) => x + (y.amount || 0), 0) || 0),
    0
  );
  document.getElementById("kpiBoxes").innerHTML = `
    <div class="kpi"><div class="val">${totalOrders}</div>Total Orders</div>
    <div class="kpi"><div class="val">₹${totalSales.toLocaleString()}</div>Total Sales</div>
    <div class="kpi"><div class="val">₹${totalReceived.toLocaleString()}</div>Received</div>`;
}

// ===== ADD SALE =====
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
    items: [
      {
        product: obj.product_1,
        qty: Number(obj.qty_1 || 1),
        price: Number(obj.price_1 || 0),
      },
    ],
    total: Number(totalField.value.replace(/,/g, "")) || 0,
    payments: [
      {
        date: new Date().toISOString().split("T")[0],
        amount: Number(obj.amount_received || 0),
        method: obj.account,
      },
    ],
  };

  allSales.push(newSale);
  renderDashboard();
  addSaleModal.style.display = "none";
  addSaleForm.reset();
  alert("✅ Sale added (temporary — not yet saved to GitHub).");
});

// ===== RENDER CHARTS =====
function renderCharts(data) {
  const ctxBar = document.getElementById("barChart")?.getContext("2d");
  const ctxPie1 = document.getElementById("pieEmployeeCurrent")?.getContext("2d");
  const ctxPie2 = document.getElementById("piePaymentStatus")?.getContext("2d");

  if (!ctxBar || !ctxPie1 || !ctxPie2) return;

  const byEmp = {};
  const payStatus = { Full: 0, Partial: 0, Pending: 0 };

  data.forEach((s) => {
    byEmp[s.employee] = (byEmp[s.employee] || 0) + (s.total || 0);
    const paid =
      s.payments?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    if (paid >= (s.total || 0)) payStatus.Full++;
    else if (paid > 0) payStatus.Partial++;
    else payStatus.Pending++;
  });

  const empLabels = Object.keys(byEmp);
  const empValues = Object.values(byEmp);

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
      plugins: {
        legend: { display: false },
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
          backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#ef4444"],
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: dark ? "#f9fafb" : "#111827",
          },
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
      cutout: "65%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: dark ? "#f9fafb" : "#111827",
          },
        },
      },
    },
  });
}

// ===== THEME TOGGLE =====
const themeToggle = document.getElementById("themeToggle");
let darkMode = localStorage.getItem("theme") === "dark";

function applyTheme() {
  document.body.classList.toggle("dark", darkMode);
  themeToggle.textContent = darkMode ? "☀️" : "🌙";
  Object.values(charts).forEach((chart) => chart?.update?.());
} // ✅ properly closed function

themeToggle?.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem("theme", darkMode ? "dark" : "light");
  applyTheme();
});

applyTheme();
