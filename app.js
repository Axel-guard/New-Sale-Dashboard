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
  monthSelect.innerHTML = `<option value="all">All</option>` + months.map(m => `<opt
