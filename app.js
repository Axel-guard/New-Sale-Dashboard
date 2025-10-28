// ====== GITHUB DIRECT SAVE CONFIG (no backend needed) ======
const GITHUB_TOKEN  = "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"; // your token
const GITHUB_OWNER  = "Axel-guard";          // your GitHub username/org
const GITHUB_REPO   = "New-Sale-Dashboard";  // your repo name
const GITHUB_PATH   = "data/sales.json";     // file to update
const GITHUB_BRANCH = "main";                // branch
const SESSION_TOKEN_KEY = "gh_pat_for_sale_ui"; // used only if GITHUB_TOKEN is empty

(function(){
  // ---- CONSTANTS / SETTINGS ----
  const salesUrl = "data/sales.json";

  const CURRENCY_LOCALE = "en-IN";
  const CURRENCY_CODE   = "INR";
  const CONVERSION_RATE = 1;

  // ---- DOM ----
  const monthSelect       = document.getElementById("monthSelect");
  const employeeListEl    = document.getElementById("employeeList");
  const kpiBoxes          = document.getElementById("kpiBoxes");
  const salesTableBody    = document.querySelector("#salesTable tbody");
  const barCtx            = document.getElementById("barChart")?.getContext("2d");
  // NOTE: we now only use these two pies:
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
  const downloadSingleBtn = document.getElementById("downloadSingle");
  const showAllPayments   = document.getElementById("showAllPayments");
  const globalSearch      = document.getElementById("globalSearch");
  const employeeSearch    = document.getElementById("employeeSearch");

  // --- page tabs ---
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
  function formatDateInputToISO(dateInputValue){
    // from <input type="date"> YYYY-MM-DD
    if (!dateInputValue) return new Date().toISOString();
    const d = new Date(dateInputValue + "T00:00:00Z");
    return d.toISOString();
  }
  function formatDateDDMMYYYY(d){
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    const dd = String(dt.getDate()).padStart(2,"0");
    const mm = String(dt.getMonth()+1).padStart(2,"0");
    const yy = String(dt.getFullYear());
    return `${dd}-${mm}-${yy}`;
  }
  function currency(n){
    const val = Number(n || 0) * CONVERSION_RATE;
    return new Intl.NumberFormat(CURRENCY_LOCALE, { style: "currency", currency: CURRENCY_CODE }).format(val);
  }
  async function loadRemoteSales(){
    try {
      const r = await fetch(salesUrl);
      if (!r.ok) throw new Error("Fetch failed: " + r.status);
      return await r.json();
    } catch(e){
      console.error("Failed to load sales.json", e);
      return [];
    }
  }

  const LS_KEY = "sales_dashboard_added_sales_v1";
  function mergeLocalSaved(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const extra = JSON.parse(raw);
      if (!Array.isArray(extra)) return;
      allSales = allSales.concat(extra);
    } catch(e){ console.error("failed to merge local entries", e); }
  }

  function buildMonthOptions(){
    const months = new Set();
    allSales.forEach(s => {
      const d = new Date(s.date);
      if (!isNaN(d)) months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
    });
    const monthsArr = Array.from(months).sort((a,b)=>b.localeCompare(a));
    monthSelect.innerHTML = "";
    const curOption = document.createElement("option");
    curOption.value = "current";
    const now = new Date();
    curOption.textContent = `Current month (${now.toLocaleString(undefined,{month:"long"})} ${now.getFullYear()})`;
    monthSelect.appendChild(curOption);
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All time";
    monthSelect.appendChild(allOpt);
    monthsArr.forEach(m=>{
      const [y,mm] = m.split("-");
      const opt = document.createElement("option");
      opt.value = m;
      const dt = new Date(Number(y), Number(mm)-1, 1);
      opt.textContent = `${dt.toLocaleString(undefined,{month:"long"})} ${y}`;
      monthSelect.appendChild(opt);
    });
    selectedMonth = "current";
    monthSelect.value = "current";
  }

  function buildEmployeeList(){
    const employees = Array.from(new Set(allSales.map(s=>s.employee))).sort();
    employeeListEl.innerHTML = "";
    const allItem = document.createElement("li");
    allItem.textContent = "All employees";
    allItem.classList.add("active");
    allItem.onclick = ()=>{
      selectedEmployee = null;
      document.querySelectorAll("#employeeList li").forEach(li=>li.classList.remove("active"));
      allItem.classList.add("active");
      refresh();
    };
    employeeListEl.appendChild(allItem);
    employees.forEach(name=>{
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = ()=>{
        selectedEmployee = name;
        document.querySelectorAll("#employeeList li").forEach(li=>li.classList.remove("active"));
        li.classList.add("active");
        refresh();
      };
      employeeListEl.appendChild(li);
    });
  }

  function paymentsSum(payments){
    return (payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
  }
  function paymentStatus(sale){
    const paid = paymentsSum(sale.payments||[]);
    if (paid >= sale.total) return "paid";
    if (paid > 0) return "partial";
    return "due";
  }
  function filterByMonth(sales, monthKey){
    if (monthKey === "all") return sales.slice();
    const now = new Date();
    return sales.filter(s=>{
      const d = new Date(s.date);
      if (isNaN(d)) return false;
      if (monthKey === "current") {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      const [y,mm] = monthKey.split("-");
      return d.getFullYear() === Number(y) && (d.getMonth()+1) === Number(mm);
    });
  }
  function buildKPIs(sales){
    const totalSales    = sales.reduce((acc,s)=>acc+s.total,0);
    const totalOrders   = sales.length;
    const totalReceived = sales.reduce((acc,s)=>acc+paymentsSum(s.payments||[]),0);
    kpiBoxes.innerHTML = "";
    [
      {label:"Orders",   val: totalOrders},
      {label:"Sales",    val: currency(totalSales)},
      {label:"Received", val: currency(totalReceived)},
    ].forEach(k=>{
      const el = document.createElement("div");
      el.className = "kpi";
      el.innerHTML = `<div class="val">${k.val}</div><div class="label">${k.label}</div>`;
      kpiBoxes.appendChild(el);
    });
  }
  function aggregateByEmployee(sales){
    const agg = {};
    sales.forEach(s=>{
      if (!agg[s.employee]) agg[s.employee] = 0;
      agg[s.employee] += s.total;
    });
    return agg;
  }

  // small debounce
  function debounce(fn, wait=200){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }

  // ---- 3D-ish Doughnut plugin ----
  const doughnut3DPlugin = {
    id: "doughnut3D",
    beforeDraw(chart){
      const ctx = chart.ctx;
      const {width, height} = chart;
      ctx.save();
      const gradient = ctx.createLinearGradient(0,0,0,height);
      gradient.addColorStop(0, "rgba(255,255,255,0.05)");
      gradient.addColorStop(1, "rgba(0,0,0,0.02)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0,0,width,height);
      ctx.restore();
    },
    afterDatasetDraw(chart){
      const ctx = chart.ctx;
      ctx.save();
      const meta = chart.getDatasetMeta(0);
      if (meta?.data) {
        meta.data.forEach(arc=>{
          const c = arc.getCenterPoint();
          ctx.beginPath();
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.ellipse(c.x, c.y - 6, (arc.outerRadius - arc.innerRadius)*0.8, (arc.outerRadius - arc.innerRadius)*0.25, 0, 0, Math.PI*2);
          ctx.fill();
        });
      }
      ctx.restore();
    }
  };

  // ---- Week table helpers (used by charts) ----
  function getWeekIndexInMonth(date){
    const d = new Date(date);
    if (isNaN(d)) return null;
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const day = d.getDate();
    const firstDay = first.getDay();
    return Math.floor((day + (firstDay||0) - 1) / 7) + 1;
  }
  function renderWeekByEmployeeTable(){
    const wrap = document.getElementById("weekTableWrap");
    if (!wrap) return;
    const cur = filterByMonth(allSales, "current");
    const employees = Array.from(new Set(cur.map(s=>s.employee))).sort();
    const matrix = {};
    employees.forEach(e=>{ matrix[e] = {1:0,2:0,3:0,4:0,5:0,total:0}; });
    cur.forEach(s=>{
      const w = getWeekIndexInMonth(s.date);
      if (!w) return;
      matrix[s.employee][w] += s.total;
      matrix[s.employee].total += s.total;
    });
    const weeks = [1,2,3,4,5];
    let html = `<table class="simple"><thead><tr><th>Employee</th>${weeks.map(w=>`<th>Week ${w}</th>`).join("")}<th>Total</th></tr></thead><tbody>`;
    employees.forEach(e=>{
      html += `<tr><td>${e}</td>${weeks.map(w=>`<td>${matrix[e][w]}</td>`).join("")}<td><strong>${matrix[e].total}</strong></td></tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
  }

  // ---- CHARTS ----
  function buildCharts(sales){
    // bar
    if (barCtx){
      const agg = aggregateByEmployee(sales);
      const labels = Object.keys(agg);
      const data = labels.map(l=>agg[l] * CONVERSION_RATE);
      if (barChart) barChart.destroy();
      barChart = new Chart(barCtx, {
        type: "bar",
        data: { labels, datasets: [{ label:"Sales", data, backgroundColor: labels.map(()=> "rgba(37,99,235,0.75)") }]},
        options: { responsive:true, plugins:{ legend:{ display:false } } }
      });
    }

    // pies
    const statusCounts = {paid:0,partial:0,due:0};
    sales.forEach(s=> statusCounts[paymentStatus(s)]++);

    if (pieEmpCanvasEl){
      const ctxEmp = pieEmpCanvasEl.getContext("2d");
      const currentMonthSales = filterByMonth(allSales, "current");
      const byEmpCur = aggregateByEmployee(currentMonthSales);
      const curLabels = Object.keys(byEmpCur);
      const curData = curLabels.map(l=>byEmpCur[l] * CONVERSION_RATE);
      if (pieEmpCurrent) pieEmpCurrent.destroy();
      pieEmpCurrent = new Chart(ctxEmp, {
        type: "doughnut",
        data: { labels: curLabels, datasets:[{ data: curData }]},
        options: { plugins:{ legend:{ position:"bottom"}}, cutout:"35%", maintainAspectRatio:true },
        plugins: [doughnut3DPlugin]
      });
    }

    if (piePayCanvasEl){
      const ctxPay = piePayCanvasEl.getContext("2d");
      if (piePayStatus) piePayStatus.destroy();
      piePayStatus = new Chart(ctxPay, {
        type: "doughnut",
        data: { labels:["Paid","Partial","Due"], datasets:[{ data:[statusCounts.paid, statusCounts.partial, statusCounts.due] }]},
        options: { plugins:{ legend:{ position:"bottom"}}, cutout:"35%", maintainAspectRatio:true },
        plugins: [doughnut3DPlugin]
      });
    }

    renderWeekByEmployeeTable();
  }

  // ---- TABLE ----
  function renderTable(sales){
    if (!salesTableBody) return;
    salesTableBody.innerHTML = "";
    const showPayments = !!showAllPayments?.checked;
    const template = document.getElementById("paymentRowTemplate");
    const query = (globalSearch?.value || "").trim().toLowerCase();

    sales.forEach(s=>{
      if (query){
        const hay = `${s.customer||""} ${s.employee||""} ${(s.items||[]).map(it=>it.product).join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return;
      }
      const tr = document.createElement("tr");
      const productsText = (s.items||[]).map(it=>`${it.product} x${it.qty}`).join(", ");
      const status = paymentStatus(s);
      tr.innerHTML = `
        <td><strong>${s.customer || ""}</strong><div class="products"><small>${s.company||""} ${s.cust_code? " | " + s.cust_code : ""}</small></div></td>
        <td>${formatDateDDMMYYYY(s.date)}</td>
        <td>${s.employee || ""}</td>
        <td>${productsText}</td>
        <td>${currency(s.total)}</td>
        <td><span class="badge ${status}">${status.toUpperCase()}</span></td>
        <td>${(paymentsSum(s.payments||[]))>0 ? currency(paymentsSum(s.payments||[])) : "-"} 
            ${(s.payments && s.payments.length>0) ? `<button class="toggle-pay" data-id="${s.id}">Details</button>` : ""}
        </td>
      `;
      salesTableBody.appendChild(tr);

      if (s.payments && s.payments.length>0 && showPayments && template){
        const clone = template.content.cloneNode(true);
        const detailsTd = clone.querySelector(".payment-details");
        const rows = s.payments.map(p=>`<div>${formatDateDDMMYYYY(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:""}</div>`).join("");
        detailsTd.innerHTML = `<strong>Payments:</strong><div>${rows}</div>`;
        salesTableBody.appendChild(clone);
      }
    });

    document.querySelectorAll(".toggle-pay").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute("data-id");
        const row = btn.closest("tr");
        const next = row.nextElementSibling;
        if (next && next.classList.contains("payment-row")){ next.remove(); return; }
        const sale = allSales.find(x=>String(x.id) === String(id));
        if (!sale) return;
        const tr = document.createElement("tr");
        tr.className = "payment-row";
        const td = document.createElement("td");
        td.colSpan = 7;
        td.className = "payment-details";
        td.innerHTML = `<strong>Payments:</strong>${(sale.payments||[]).map(p=>`<div>${formatDateDDMMYYYY(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:""}</div>`).join("")}`;
        tr.appendChild(td);
        row.parentNode.insertBefore(tr, row.nextSibling);
      };
    });
  }

  // ---- EXPORTS ----
  function exportDetailedCSV(sales){
    const columns = [
      "S. No","Month","Order Id","Sale Date","Cust Code","Sale Done By","Company Name","Customer Name","Mobile Number","Bill Amount","Amount Rcd","Balnc Payment","Round Off","With Bill","Billing Status"
    ];
    for (let p=1;p<=10;p++){
      columns.push(`P${p} Code`, `${p}th Product`, `P${p} Qtty`, `P${p} Rate`);
    }
    columns.push("Courier","Total Sale Amount","Transaction Reference Number","Remarks");
    for (let i=1;i<=6;i++) columns.push(`Payment ${i} received`);

    const rows = [columns.join("\t")];
    let idx=1;
    sales.forEach(s=>{
      const month = ( ()=>{ const dt=new Date(s.date); return dt.toLocaleString("en-US",{month:"short",year:"2-digit"}); } )();
      const orderId = s.id || "";
      const saleDate = formatDateDDMMYYYY(s.date);
      const custCode = s.cust_code || "";
      const saleBy   = s.employee || "";
      const company  = s.company || "";
      const custName = s.customer || "";
      const mobile   = s.mobile || "";
      const billAmt  = s.total || 0;
      const amtRcd   = paymentsSum(s.payments||[]);
      const bal      = billAmt - amtRcd;
      const roundOff = 0;
      const withBill = "No";
      const billingStatus = s.notes || "";

      const base = [idx,month,orderId,saleDate,custCode,saleBy,company,custName,mobile,billAmt,amtRcd,bal,roundOff,withBill,billingStatus];

      const prods = s.items || [];
      for (let p=0;p<10;p++){
        if (prods[p]){
          base.push("", prods[p].product || "", prods[p].qty || "", prods[p].price || "");
        } else {
          base.push("","","","");
        }
      }
      base.push("", billAmt, "", s.notes || "");
      for (let i=0;i<6;i++){
        base.push((s.payments && s.payments[i]) ? s.payments[i].amount : "");
      }
      rows.push(base.join("\t"));
      idx++;
    });

    const tsv = rows.join("\n");
    const blob = new Blob([tsv], {type:"text/tab-separated-values"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sales-report.tsv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadMergedJSON(){
    const merged = allSales.slice();
    const blob = new Blob([JSON.stringify(merged, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveAddedEntriesToLocalStorage(added){
    try {
      const raw = localStorage.getItem(LS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const merged = existing.concat(added);
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
    } catch(e){ console.error("failed to save to localStorage", e); }
  }

  // ---- GITHUB HELPERS ----
  async function githubGetFileSha(token){
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_PATH)}?ref=${GITHUB_BRANCH}`;
    const r = await fetch(url, { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" }});
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("GitHub GET failed: " + r.status);
    const data = await r.json();
    return data.sha;
  }
  async function githubPutFile(token, contentStr, sha){
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_PATH)}`;
    const body = {
      message: `Update sales.json via web UI`,
      content: btoa(unescape(encodeURIComponent(contentStr))),
      branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;
    const r = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`GitHub PUT failed: ${r.status} ${txt}`);
    }
    return await r.json();
  }

  // Uses constant token if present, else prompts once (fallback)
  async function saveMergedToGitHubFlow(merged){
    try {
      let token = (GITHUB_TOKEN && GITHUB_TOKEN.trim()) ? GITHUB_TOKEN.trim() : sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!token){
        const ok = confirm("To save to GitHub, a Personal Access Token (PAT) is needed. Paste one now?");
        if (!ok) { alert("Save cancelled. Use Download JSON to save locally."); return; }
        token = prompt("Paste your GitHub Personal Access Token (PAT) with repo permissions.");
        if (!token) { alert("No token provided. Aborting."); return; }
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      }
      const remote = await loadRemoteSales();
      const rawExtra = localStorage.getItem(LS_KEY);
      const extras = rawExtra ? JSON.parse(rawExtra) : [];
      const mergedFinal = remote.concat(extras).concat(merged || []);
      const sha = await githubGetFileSha(token);
      await githubPutFile(token, JSON.stringify(mergedFinal, null, 2), sha);
      alert("Saved to GitHub successfully. Refresh the Pages site after a minute.");
    } catch(err){
      if (!GITHUB_TOKEN) sessionStorage.removeItem(SESSION_TOKEN_KEY);
      console.error(err);
      alert("Failed to save to GitHub: " + (err.message || err));
    }
  }

  // ---- FILTER + REFRESH ----
  function refresh(){
    filteredSales = filterByMonth(allSales, selectedMonth);
    if (selectedEmployee) filteredSales = filteredSales.filter(s=>s.employee === selectedEmployee);
    const es = (employeeSearch?.value || "").trim().toLowerCase();
    if (es) filteredSales = filteredSales.filter(s=> (s.employee||"").toLowerCase().includes(es));
    buildKPIs(filteredSales);
    buildCharts(filteredSales);
    renderTable(filteredSales);
  }

  // ---- EVENTS ----
  monthSelect.onchange = e=>{ selectedMonth = e.target.value; refresh(); };
  exportBtn.onclick   = ()=> exportDetailedCSV(filteredSales);
  downloadJsonBtn.onclick = ()=> downloadMergedJSON();
  showAllPayments.onchange = ()=> renderTable(filteredSales);
  globalSearch.oninput = debounce(()=> renderTable(filteredSales), 300);
  employeeSearch.oninput = debounce(()=> { buildEmployeeListFiltered(); }, 300);

  function buildEmployeeListFiltered(){
    const q = (employeeSearch?.value || "").trim().toLowerCase();
    const employees = Array.from(new Set(allSales.map(s=>s.employee))).sort();
    employeeListEl.innerHTML = "";
    const allItem = document.createElement("li");
    allItem.textContent = "All employees";
    allItem.classList.toggle("active", selectedEmployee === null);
    allItem.onclick = ()=>{
      selectedEmployee = null;
      document.querySelectorAll("#employeeList li").forEach(li=>li.classList.remove("active"));
      allItem.classList.add("active");
      refresh();
    };
    employeeListEl.appendChild(allItem);
    employees.filter(n => (n||"").toLowerCase().includes(q)).forEach(name=>{
      const li = document.createElement("li");
      li.textContent = name;
      li.classList.toggle("active", selectedEmployee === name);
      li.onclick = ()=>{
        selectedEmployee = name;
        document.querySelectorAll("#employeeList li").forEach(li=>li.classList.remove("active"));
        li.classList.add("active");
        refresh();
      };
      employeeListEl.appendChild(li);
    });
  }

  // ---------- Add Sale form behavior ----------
  function computeTotalFromForm(form){
    let total = 0;
    const rows = form.querySelectorAll(".product-row");
    rows.forEach((row, i) => {
      const idx = i + 1;
      const qty = Number(form[`qty_${idx}`]?.value || 0);
      const price = Number(form[`price_${idx}`]?.value || 0);
      total += qty * price;
    });
    const courier = Number(form.courier_cost?.value || 0);
    return total + courier;
  }

  // keep total live
  addSaleForm?.addEventListener("input", ()=> { if (totalField) totalField.value = computeTotalFromForm(addSaleForm); });

  // Add product rows capped at 10
  addProductRowBtn?.addEventListener("click", ()=>{
    const container = document.getElementById("productsContainer");
    const rowCount = container.querySelectorAll(".product-row").length;
    if (rowCount >= 10) return alert("Maximum 10 products supported.");
    const next = rowCount + 1;
    const div = document.createElement("div");
    div.className = "product-row";
    div.innerHTML = `
      <label>Product ${next} - Name<br/><input name="product_${next}" /></label>
      <label>Qty<br/><input name="qty_${next}" type="number" min="1" value="1" /></label>
      <label>Price<br/><input name="price_${next}" type="number" min="0" value="0" /></label>
    `;
    container.appendChild(div);
  });

  // modal open/close
  if (openAddSaleBtn && addSaleModal){
    openAddSaleBtn.onclick = ()=> { addSaleModal.style.display="flex"; addSaleModal.setAttribute("aria-hidden","false"); };
    closeAddSale.onclick   = ()=> { addSaleModal.style.display="none"; addSaleModal.setAttribute("aria-hidden","true"); };
    document.getElementById("cancelAdd").onclick = ()=> { addSaleModal.style.display="none"; };
    addSaleModal.addEventListener("click", (e)=>{ if (e.target === addSaleModal) { addSaleModal.style.display="none"; } });
  }

  // --------- SINGLE (simplified) submit handler you requested ---------
  addSaleForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const form = e.target;
    const id = Date.now(); // simple order id
    const dateISO = formatDateInputToISO(form.date.value);

    // products (max 10)
    const items = [];
    const rows = form.querySelectorAll(".product-row");
    rows.forEach((row, i) => {
      const idx = i+1;
      const prod = form[`product_${idx}`]?.value;
      const qty = Number(form[`qty_${idx}`]?.value || 0);
      const price = Number(form[`price_${idx}`]?.value || 0);
      if (prod && qty>0) items.push({ product: prod, qty, price });
    });

    const total    = computeTotalFromForm(form);
    const received = Number(form.amount_received?.value || 0);

    const saleObj = {
      id,
      cust_code: form.cust_code?.value?.trim() || "",
      date: dateISO,
      employee: form.employee?.value?.trim() || "",
      items,
      courier_cost: Number(form.courier_cost?.value || 0),
      total,
      payments: [{ date: dateISO, amount: received, method: form.account?.value || "", ref: (form.payment_ref?.value || "").trim() }],
      notes: "Added via simplified form"
    };

    allSales.push(saleObj);
    saveAddedEntriesToLocalStorage([saleObj]);

    // refresh UI
    selectedMonth = "all"; monthSelect.value = "all";
    selectedEmployee = null;
    buildMonthOptions();
    buildEmployeeList();
    refresh();
    renderCustomerSummary();

    // commit to GitHub (uses your token if set)
    const autoConfirm = confirm("Commit this change to GitHub now?");
    if (autoConfirm) await saveMergedToGitHubFlow([]);

    // close modal & reset
    addSaleModal.style.display="none";
    form.reset();
    if (totalField) totalField.value = "";
  });

  // ---- INITIALIZE ----
  (async ()=>{
    allSales = await loadRemoteSales();
    mergeLocalSaved();
    buildMonthOptions();
    buildEmployeeList();
    refresh();
    // expose JSON download if needed
    window.downloadMergedJSON = downloadMergedJSON;
  })();

  // --- Order lookup ---
  document.getElementById("orderLookupBtn")?.addEventListener("click", ()=>{
    const id = (document.getElementById("orderLookupId").value||"").trim();
    const out = document.getElementById("orderResult");
    if (!id) { out.textContent = "Please enter an Order ID."; return; }
    const found = allSales.find(s => String(s.id) === id);
    out.textContent = found ? JSON.stringify(found, null, 2) : "No order found.";
  });

  // --- Courier calculator ---
  document.getElementById("ccCalcBtn")?.addEventListener("click", ()=>{
    const mode   = document.getElementById("ccMode").value;
    const weight = Number(document.getElementById("ccWeight").value||0);
    let base  = Number(document.getElementById("ccBase").value||0);
    let perKg = Number(document.getElementById("ccPerKg").value||0);
    if (mode === "air" && perKg <= 30) perKg = 60;
    if (mode === "air" && base  <= 60) base  = 120;
    const amt = base + perKg * weight;
    document.getElementById("ccResult").textContent = `Estimated ${mode.toUpperCase()} charge: ₹ ${amt.toFixed(2)}`;
  });

  // --- Customer details summary ---
  function renderCustomerSummary(){
    const byCust = {};
    allSales.forEach(s=>{
      const key = s.cust_code || "NA";
      if (!byCust[key]) byCust[key] = { cust_code: key, orders: 0, total: 0, received: 0 };
      byCust[key].orders += 1;
      byCust[key].total  += s.total;
      byCust[key].received += paymentsSum(s.payments||[]);
    });
    const arr = Object.values(byCust).sort((a,b)=>b.total-a.total);
    let html = `<table class="simple"><thead><tr><th>Customer Code</th><th>Orders</th><th>Total</th><th>Received</th><th>Balance</th></tr></thead><tbody>`;
    arr.forEach(c=>{
      html += `<tr><td>${c.cust_code}</td><td>${c.orders}</td><td>${c.total}</td><td>${c.received}</td><td>${c.total - c.received}</td></tr>`;
    });
    html += `</tbody></table>`;
    const el = document.getElementById("customerSummary");
    if (el) el.innerHTML = html;
  }

})();
