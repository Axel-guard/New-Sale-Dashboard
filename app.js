// ====== GITHUB DIRECT SAVE CONFIG (no backend needed) ======
const GITHUB_TOKEN  = "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";
const GITHUB_OWNER  = "Axel-guard";
const GITHUB_REPO   = "New-Sale-Dashboard";
const GITHUB_PATH   = "data/sales.json";
const GITHUB_BRANCH = "main";
const SESSION_TOKEN_KEY = "gh_pat_for_sale_ui";

(async function(){
  // ---- CONSTANTS ----
  // ✅ Use absolute URL for GitHub Pages fetch
const salesUrl = "./data/sales.json";

  const CURRENCY_LOCALE = "en-IN";
  const CURRENCY_CODE   = "INR";
  const CONVERSION_RATE = 1;

  // ---- DOM REFERENCES ----
  const monthSelect       = document.getElementById("monthSelect");
  const employeeListEl    = document.getElementById("employeeList");
  const kpiBoxes          = document.getElementById("kpiBoxes");
  const salesTableBody    = document.querySelector("#salesTable tbody");
  const barCtx            = document.getElementById("barChart")?.getContext("2d");
  const pieEmpCanvasEl    = document.getElementById("pieEmployeeCurrent");
  const piePayCanvasEl    = document.getElementById("piePaymentStatus");
  const exportBtn         = document.getElementById("exportCsv");
  const downloadJsonBtn   = document.getElementById("downloadJson");
  const openAddSaleBtn    = document.getElementById("openAddSale");
  const addSaleModal      = document.getElementById("addSaleModal");
  const closeAddSale      = document.getElementById("closeAddSale");
  const addSaleForm       = document.getElementById("addSaleForm");
  const totalField        = document.getElementById("totalField");
  const addProductRowBtn  = document.getElementById("addProductRow");
  const showAllPayments   = document.getElementById("showAllPayments");
  const globalSearch      = document.getElementById("globalSearch");
  const employeeSearch    = document.getElementById("employeeSearch");

  const pages = {
    dashboard: document.getElementById("page-dashboard"),
    order:     document.getElementById("page-order"),
    courier:   document.getElementById("page-courier"),
    customers: document.getElementById("page-customers"),
  };

  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.page;
      Object.values(pages).forEach(p=>p?.classList.remove("visible"));
      pages[key]?.classList.add("visible");
    };
  });

  // ---- STATE ----
  let allSales = [];
  let filteredSales = [];
  let selectedEmployee = null;
  let selectedMonth = "current";
  let barChart = null, pieEmpCurrent = null, piePayStatus = null;

  // ---- HELPERS ----
  const currency = n => new Intl.NumberFormat(CURRENCY_LOCALE, { style: "currency", currency: CURRENCY_CODE }).format(Number(n||0));
  const paymentsSum = arr => (arr||[]).reduce((s,p)=>s+(+p.amount||0),0);
  const paymentStatus = s => {
    const paid = paymentsSum(s.payments||[]);
    if (paid >= s.total) return "paid";
    if (paid > 0) return "partial";
    return "due";
  };
  const formatDateDDMMYYYY = d=>{
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    const dd = String(dt.getDate()).padStart(2,"0");
    const mm = String(dt.getMonth()+1).padStart(2,"0");
    const yy = String(dt.getFullYear());
    return `${dd}-${mm}-${yy}`;
  };

  // ---- LOAD SALES ----
  async function loadRemoteSales(){
    try {
      const res = await fetch(salesUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      console.log("✅ Loaded sales:", data.length);
      return data;
    } catch(err){
      console.error("❌ Failed to load sales.json:", err);
      alert("Failed to load sales.json. Check console.");
      return [];
    }
  }

  // ---- UI BUILD ----
  if (!allSales.length) { alert("JSON loaded but array empty"); return; }
    function buildEmployeeList(){
    const employees = [...new Set(allSales.map(s=>s.employee))].filter(Boolean).sort();
    employeeListEl.innerHTML = "";
    const allLi = document.createElement("li");
    allLi.textContent = "All employees";
    allLi.classList.add("active");
    allLi.onclick = ()=>{ selectedEmployee=null; refresh(); };
    employeeListEl.appendChild(allLi);
    employees.forEach(emp=>{
      const li = document.createElement("li");
      li.textContent = emp;
      li.onclick = ()=>{ selectedEmployee=emp; refresh(); };
      employeeListEl.appendChild(li);
    });
  }

  function buildKPIs(sales){
    const totalSales = sales.reduce((a,b)=>a+b.total,0);
    const totalOrders = sales.length;
    const totalReceived = sales.reduce((a,b)=>a+paymentsSum(b.payments),0);
    kpiBoxes.innerHTML = `
      <div class="kpi"><div class="val">${totalOrders}</div><div class="label">Orders</div></div>
      <div class="kpi"><div class="val">${currency(totalSales)}</div><div class="label">Sales</div></div>
      <div class="kpi"><div class="val">${currency(totalReceived)}</div><div class="label">Received</div></div>
    `;
  }

  function buildCharts(sales){
    if (!barCtx) return;
    const byEmp = {};
    sales.forEach(s=> byEmp[s.employee]=(byEmp[s.employee]||0)+s.total);
    const labels = Object.keys(byEmp);
    const data = Object.values(byEmp);
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
      type:"bar",
      data:{ labels, datasets:[{ data, label:"Sales", backgroundColor:"rgba(37,99,235,0.7)" }] },
      options:{ plugins:{legend:{display:false}} }
    });

    const payStats={paid:0,partial:0,due:0};
    sales.forEach(s=>payStats[paymentStatus(s)]++);
    const ctxPie = piePayCanvasEl.getContext("2d");
    if (piePayStatus) piePayStatus.destroy();
    piePayStatus = new Chart(ctxPie,{
      type:"doughnut",
      data:{ labels:["Paid","Partial","Due"], datasets:[{data:Object.values(payStats)}]},
      options:{ plugins:{legend:{position:"bottom"}}, cutout:"35%" }
    });
  }

  function renderTable(sales){
    if (!salesTableBody) return;
    salesTableBody.innerHTML = "";
    sales.forEach(s=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.customer||""}</td>
        <td>${formatDateDDMMYYYY(s.date)}</td>
        <td>${s.employee||""}</td>
        <td>${(s.items||[]).map(i=>i.product+" x"+i.qty).join(", ")}</td>
        <td>${currency(s.total)}</td>
        <td>${paymentStatus(s)}</td>
        <td>${currency(paymentsSum(s.payments))}</td>
      `;
      salesTableBody.appendChild(tr);
    });
  }

  function refresh(){
    filteredSales = [...allSales];
    if (selectedEmployee) filteredSales = filteredSales.filter(s=>s.employee===selectedEmployee);
    buildKPIs(filteredSales);
    buildCharts(filteredSales);
    renderTable(filteredSales);
  }

  // ---- INITIALIZE ----
  allSales = await loadRemoteSales();
  allSales = await loadRemoteSales();
console.log("Fetched data →", allSales);
alert("Loaded " + allSales.length + " sales records");
  buildEmployeeList();
  buildKPIs(allSales);
  buildCharts(allSales);
  renderTable(allSales);

  // Buttons
  exportBtn.onclick = ()=>alert("Export feature working soon");
  downloadJsonBtn.onclick = ()=>{
    const blob = new Blob([JSON.stringify(allSales,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="sales.json";
    a.click();
  };

})();
