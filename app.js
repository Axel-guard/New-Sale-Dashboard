// Sales dashboard with GitHub commit on submit, date-only input, employee dropdown, enhanced doughnut (3D-ish)
// IMPORTANT: to allow commits the page prompts for a GitHub PAT (token) with repo contents permissions.
// Token is stored in sessionStorage only (so it persists for the browser session) — revoke the token after use if desired.

(async function(){
  const salesUrl = 'data/sales.json';

  // Locale / currency
  const CURRENCY_LOCALE = 'en-IN';
  const CURRENCY_CODE = 'INR';
  const CONVERSION_RATE = 1;

  // GitHub repo info (change if you rename repo)
  const GITHUB_OWNER = 'Axel-guard';
  const GITHUB_REPO = 'New-Sale-Dashboard';
  const GITHUB_PATH = 'data/sales.json';
  const GITHUB_BRANCH = 'main';
  const SESSION_TOKEN_KEY = 'gh_pat_for_sale_ui';

  // DOM
  const monthSelect = document.getElementById('monthSelect');
  const employeeListEl = document.getElementById('employeeList');
  const kpiBoxes = document.getElementById('kpiBoxes');
  const salesTableBody = document.querySelector('#salesTable tbody');
  const barCtx = document.getElementById('barChart').getContext('2d');
  const doughnutCtx = document.getElementById('doughnutChart').getContext('2d');
  const exportBtn = document.getElementById('exportCsv');
  const downloadJsonBtn = document.getElementById('downloadJson');
  const openAddSaleBtn = document.getElementById('openAddSale');
  const addSaleModal = document.getElementById('addSaleModal');
  const closeAddSale = document.getElementById('closeAddSale');
  const addSaleForm = document.getElementById('addSaleForm');
  const totalField = document.getElementById('totalField');
  const addProductRowBtn = document.getElementById('addProductRow');
  const downloadSingleBtn = document.getElementById('downloadSingle');
  const showAllPayments = document.getElementById('showAllPayments');
  const globalSearch = document.getElementById('globalSearch');
  const employeeSearch = document.getElementById('employeeSearch');

  let allSales = [];
  let filteredSales = [];
  let selectedEmployee = null;
  let selectedMonth = 'current';
  let barChart = null;
  let doughnutChart = null;

  function formatDateInputToISO(dateInputValue){
    // dateInputValue is YYYY-MM-DD from <input type="date">
    if (!dateInputValue) return new Date().toISOString();
    const d = new Date(dateInputValue + 'T00:00:00Z');
    return d.toISOString();
  }
  function formatDateDDMMYYYY(d){
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    const dd = String(dt.getDate()).padStart(2,'0');
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const yy = String(dt.getFullYear());
    return `${dd}-${mm}-${yy}`;
  }
  function currency(n){
    const val = Number(n || 0) * CONVERSION_RATE;
    return new Intl.NumberFormat(CURRENCY_LOCALE, { style: 'currency', currency: CURRENCY_CODE }).format(val);
  }

  // load remote sales.json
  async function loadRemoteSales(){
    try {
      const r = await fetch(salesUrl);
      if (!r.ok) throw new Error('Fetch failed: ' + r.status);
      return await r.json();
    } catch(e){
      console.error('Failed to load sales.json', e);
      return [];
    }
  }

  allSales = await loadRemoteSales();

  // merge local saved (optional, keeps any previously-added entries)
  const LS_KEY = 'sales_dashboard_added_sales_v1';
  function mergeLocalSaved(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const extra = JSON.parse(raw);
      if (!Array.isArray(extra)) return;
      allSales = allSales.concat(extra);
    } catch(e){ console.error('failed to merge local entries', e); }
  }
  mergeLocalSaved();

  // Build month options
  function buildMonthOptions(){
    const months = new Set();
    allSales.forEach(s => {
      const d = new Date(s.date);
      if (!isNaN(d)) months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    });
    const monthsArr = Array.from(months).sort((a,b)=>b.localeCompare(a));
    monthSelect.innerHTML = '';
    const curOption = document.createElement('option');
    curOption.value = 'current';
    const now = new Date();
    curOption.textContent = `Current month (${now.toLocaleString(undefined,{month:'long'})} ${now.getFullYear()})`;
    monthSelect.appendChild(curOption);
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All time';
    monthSelect.appendChild(allOpt);
    monthsArr.forEach(m=>{
      const [y,mm] = m.split('-');
      const opt = document.createElement('option');
      opt.value = m;
      const dt = new Date(Number(y), Number(mm)-1, 1);
      opt.textContent = `${dt.toLocaleString(undefined,{month:'long'})} ${y}`;
      monthSelect.appendChild(opt);
    });
    selectedMonth = 'current';
    monthSelect.value = 'current';
  }

  // Employee list
  function buildEmployeeList(){
    const employees = Array.from(new Set(allSales.map(s=>s.employee))).sort();
    employeeListEl.innerHTML = '';
    const allItem = document.createElement('li');
    allItem.textContent = 'All employees';
    allItem.classList.add('active');
    allItem.onclick = ()=>{
      selectedEmployee = null;
      document.querySelectorAll('#employeeList li').forEach(li=>li.classList.remove('active'));
      allItem.classList.add('active');
      refresh();
    };
    employeeListEl.appendChild(allItem);
    employees.forEach(name=>{
      const li = document.createElement('li');
      li.textContent = name;
      li.onclick = ()=>{
        selectedEmployee = name;
        document.querySelectorAll('#employeeList li').forEach(li=>li.classList.remove('active'));
        li.classList.add('active');
        refresh();
      };
      employeeListEl.appendChild(li);
    });
  }

  function paymentsSum(payments){
    return payments.reduce((s,p)=>s+(p.amount||0),0);
  }
  function paymentStatus(sale){
    const paid = paymentsSum(sale.payments||[]);
    if (paid >= sale.total) return 'paid';
    if (paid > 0) return 'partial';
    return 'due';
  }
  function filterByMonth(sales, monthKey){
    if (monthKey === 'all') return sales.slice();
    const now = new Date();
    return sales.filter(s=>{
      const d = new Date(s.date);
      if (isNaN(d)) return false;
      if (monthKey === 'current') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      const [y,mm] = monthKey.split('-');
      return d.getFullYear() === Number(y) && (d.getMonth()+1) === Number(mm);
    });
  }

  function buildKPIs(sales){
    const totalSales = sales.reduce((acc,s)=>acc+s.total,0);
    const totalOrders = sales.length;
    const totalReceived = sales.reduce((acc,s)=>acc+paymentsSum(s.payments||[]),0);
    kpiBoxes.innerHTML = '';
    const kpis = [
      {label:'Orders', val: totalOrders},
      {label:'Sales', val: currency(totalSales)},
      {label:'Received', val: currency(totalReceived)}
    ];
    kpis.forEach(k=>{
      const el = document.createElement('div');
      el.className = 'kpi';
      el.innerHTML = `<div class="val">${k.val}</div><div class="label">${k.label}</div>`;
      kpiBoxes.appendChild(el);
    });
  }

  // Aggregate by employee
  function aggregateByEmployee(sales){
    const agg = {};
    sales.forEach(s=>{
      if (!agg[s.employee]) agg[s.employee] = 0;
      agg[s.employee] += s.total;
    });
    return agg;
  }

  // simple plugin to add a light "3D" shading to doughnut
  const doughnut3DPlugin = {
    id: 'doughnut3D',
    beforeDraw(chart){
      const ctx = chart.ctx;
      const {width, height} = chart;
      ctx.save();
      // subtle vignette to give depth
      const gradient = ctx.createLinearGradient(0,0,0,height);
      gradient.addColorStop(0, 'rgba(255,255,255,0.05)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.02)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0,0,width,height);
      ctx.restore();
    },
    afterDatasetDraw(chart, args, options){
      // draw a subtle highlight on top of each arc
      const ctx = chart.ctx;
      ctx.save();
      chart.data.datasets[0].backgroundColor.forEach((c, i) => {
        const meta = chart.getDatasetMeta(0);
        const arc = meta.data[i];
        if (arc) {
          ctx.beginPath();
          // draw a small ellipse highlight near top of arc
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          const center = arc.getCenterPoint();
          ctx.ellipse(center.x, center.y - 6, (arc.outerRadius - arc.innerRadius) * 0.8, (arc.outerRadius - arc.innerRadius)*0.25, 0, 0, Math.PI*2);
          ctx.fill();
        }
      });
      ctx.restore();
    }
  };

  function buildCharts(sales){
    const agg = aggregateByEmployee(sales);
    const labels = Object.keys(agg);
    const data = labels.map(l=>agg[l] * CONVERSION_RATE);

    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Sales', data, backgroundColor: labels.map(()=> 'rgba(37,99,235,0.75)') }]},
      options:{responsive:true, plugins:{legend:{display:false}}}
    });

    const statusCounts = {paid:0,partial:0,due:0};
    sales.forEach(s=> statusCounts[paymentStatus(s)]++);

    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(doughnutCtx, {
      type:'doughnut',
      data:{
        labels:['Paid','Partial','Due'],
        datasets:[{
          data:[statusCounts.paid, statusCounts.partial, statusCounts.due],
          backgroundColor:['#10b981','#f59e0b','#ef4444']
        }]
      },
      options:{
        plugins:{legend:{position:'bottom'}},
        cutout: '35%'
      },
      plugins: [doughnut3DPlugin]
    });
  }

  // Render table
  function renderTable(sales){
    salesTableBody.innerHTML = '';
    const showPayments = showAllPayments.checked;
    const template = document.getElementById('paymentRowTemplate');
    const query = globalSearch.value.trim().toLowerCase();

    sales.forEach(s=>{
      if (query){
        const hay = `${s.customer} ${s.employee} ${s.items.map(it=>it.product).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return;
      }
      const tr = document.createElement('tr');
      const productsText = s.items.map(it=>`${it.product} x${it.qty}`).join(', ');
      const status = paymentStatus(s);
      tr.innerHTML = `
        <td><strong>${s.customer}</strong><div class="products"><small>${s.company||''} ${s.cust_code? ' | ' + s.cust_code : ''}</small></div></td>
        <td>${formatDateDDMMYYYY(s.date)}</td>
        <td>${s.employee}</td>
        <td>${productsText}</td>
        <td>${currency(s.total)}</td>
        <td><span class="badge ${status}">${status.toUpperCase()}</span></td>
        <td>${(paymentsSum(s.payments||[]))>0 ? currency(paymentsSum(s.payments||[])) : '-' } 
            ${ (s.payments && s.payments.length>0) ? `<button class="toggle-pay" data-id="${s.id}">Details</button>` : '' }
        </td>
      `;
      salesTableBody.appendChild(tr);

      if (s.payments && s.payments.length>0 && showPayments){
        const clone = template.content.cloneNode(true);
        const detailsTd = clone.querySelector('.payment-details');
        const rows = s.payments.map(p=>`<div>${formatDateDDMMYYYY(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:''}</div>`).join('');
        detailsTd.innerHTML = `<strong>Payments:</strong><div>${rows}</div>`;
        salesTableBody.appendChild(clone);
      }
    });

    document.querySelectorAll('.toggle-pay').forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute('data-id');
        const row = btn.closest('tr');
        const next = row.nextElementSibling;
        if (next && next.classList.contains('payment-row')){ next.remove(); return; }
        const sale = allSales.find(x=>String(x.id) === String(id));
        if (!sale) return;
        const tr = document.createElement('tr');
        tr.className = 'payment-row';
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'payment-details';
        td.innerHTML = `<strong>Payments:</strong>${sale.payments.map(p=>`<div>${formatDateDDMMYYYY(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:''}</div>`).join('')}`;
        row.parentNode.insertBefore(tr, row.nextSibling);
      };
    });
  }

  // Build the special CSV with requested columns (many blanks for missing fields)
  function exportDetailedCSV(sales){
    const columns = [
      'S. No','Month','Order Id','Sale Date','Cust Code','Sale Done By','Company Name','Customer Name','Mobile Number','Bill Amount','Amount Rcd','Balnc Payment','Round Off','With Bill','Billing Status'
      // then P1 Code, 1st Product, P1 Qtty, P1 Rate... through P10
    ];
    // add dynamic product columns (P1..P10): for each product: Code, Name, Qty, Rate
    for (let p=1;p<=10;p++){
      columns.push(`P${p} Code`);
      columns.push(`${p}th Product`);
      columns.push(`P${p} Qtty`);
      columns.push(`P${p} Rate`);
    }
    // add trailing payment columns and extras
    columns.push('Courier');
    columns.push('Total Sale Amount');
    columns.push('Transaction Reference Number');
    columns.push('Remarks');
    for (let i=1;i<=6;i++) columns.push(`Payment ${i} received`);

    // header
    const rows = [];
    rows.push(columns.join('\t'));

    let idx=1;
    sales.forEach(s=>{
      const month = (()=>{ const dt=new Date(s.date); return dt.toLocaleString('en-US',{month:'short',year:'2-digit'}); })();
      const orderId = s.id || '';
      const saleDate = formatDateDDMMYYYY(s.date);
      const custCode = s.cust_code || '';
      const saleBy = s.employee || '';
      const company = s.company || '';
      const custName = s.customer || '';
      const mobile = s.mobile || '';
      const billAmt = s.total || 0;
      const amtRcd = paymentsSum(s.payments||[]);
      const bal = billAmt - amtRcd;
      const roundOff = 0;
      const withBill = 'No';
      const billingStatus = s.notes || '';

      const base = [idx,month,orderId,saleDate,custCode,saleBy,company,custName,mobile,billAmt,amtRcd,bal,roundOff,withBill,billingStatus];

      // product columns up to 10
      const prods = s.items || [];
      for (let p=0;p<10;p++){
        if (prods[p]){
          base.push('', prods[p].product || '', prods[p].qty || '', prods[p].price || '');
        } else {
          base.push('','','','');
        }
      }
      base.push('', billAmt, '', s.notes || '');
      // payments 1..6
      for (let i=0;i<6;i++){
        base.push((s.payments && s.payments[i]) ? s.payments[i].amount : '');
      }

      // join by tab to handle many columns
      rows.push(base.join('\t'));
      idx++;
    });

    const tsv = rows.join('\n');
    const blob = new Blob([tsv], {type:'text/tab-separated-values'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales-report.tsv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Download merged JSON
  function downloadMergedJSON(){
    const merged = allSales.slice();
    const blob = new Blob([JSON.stringify(merged, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveAddedEntriesToLocalStorage(added){
    try {
      const raw = localStorage.getItem(LS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const merged = existing.concat(added);
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
    } catch(e){ console.error('failed to save to localStorage', e); }
  }

  // GitHub helpers
  async function githubGetFileSha(token){
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_PATH)}?ref=${GITHUB_BRANCH}`;
    const r = await fetch(url, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }});
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub GET failed: ' + r.status);
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
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`GitHub PUT failed: ${r.status} ${txt}`);
    }
    return await r.json();
  }

  // Save merged to GitHub (prompt for PAT if needed)
  async function saveMergedToGitHubFlow(merged){
    try {
      let token = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!token){
        const ok = confirm('To save to GitHub the page needs a Personal Access Token (PAT). Create one with repo/content permission (short expiry recommended). Do you want to paste a token now?');
        if (!ok) { alert('Save cancelled. Use Download JSON to save locally.'); return; }
        token = prompt('Paste your GitHub Personal Access Token (PAT) with repo permissions. It will be kept for this browser session only (sessionStorage).');
        if (!token) { alert('No token provided. Aborting.'); return; }
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      }
      // fetch remote again to reduce overwrite collisions
      const remote = await loadRemoteSales();
      // merge remote + local extras
      const rawExtra = localStorage.getItem(LS_KEY);
      const extras = rawExtra ? JSON.parse(rawExtra) : [];
      const mergedFinal = remote.concat(extras).concat(merged || []);
      const sha = await githubGetFileSha(token);
      await githubPutFile(token, JSON.stringify(mergedFinal, null, 2), sha);
      alert('Saved to GitHub successfully. Wait a minute and refresh the Pages site.');
    } catch(err){
      // if PAT invalid remove it to re-prompt next time
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      console.error(err);
      alert('Failed to save to GitHub: ' + (err.message || err));
    }
  }

  // Apply filters and refresh UI
  function refresh(){
    filteredSales = filterByMonth(allSales, selectedMonth);
    if (selectedEmployee) filteredSales = filteredSales.filter(s=>s.employee === selectedEmployee);
    const es = employeeSearch.value.trim().toLowerCase();
    if (es) filteredSales = filteredSales.filter(s=>s.employee.toLowerCase().includes(es));
    buildKPIs(filteredSales);
    buildCharts(filteredSales);
    renderTable(filteredSales);
  }

  // Event bindings
  monthSelect.onchange = e=>{ selectedMonth = e.target.value; refresh(); };
  exportBtn.onclick = ()=> exportDetailedCSV(filteredSales);
  downloadJsonBtn.onclick = ()=> downloadMergedJSON();
  showAllPayments.onchange = ()=> renderTable(filteredSales);
  globalSearch.oninput = debounce(()=> renderTable(filteredSales), 300);
  employeeSearch.oninput = debounce(()=> { buildEmployeeListFiltered(); }, 300);

  function buildEmployeeListFiltered(){
    const q = employeeSearch.value.trim().toLowerCase();
    const employees = Array.from(new Set(allSales.map(s=>s.employee))).sort();
    employeeListEl.innerHTML = '';
    const allItem = document.createElement('li');
    allItem.textContent = 'All employees';
    allItem.classList.toggle('active', selectedEmployee === null);
    allItem.onclick = ()=>{
      selectedEmployee = null;
      document.querySelectorAll('#employeeList li').forEach(li=>li.classList.remove('active'));
      allItem.classList.add('active');
      refresh();
    };
    employeeListEl.appendChild(allItem);
    employees.filter(n => n.toLowerCase().includes(q)).forEach(name=>{
      const li = document.createElement('li');
      li.textContent = name;
      li.classList.toggle('active', selectedEmployee === name);
      li.onclick = ()=>{
        selectedEmployee = name;
        document.querySelectorAll('#employeeList li').forEach(li=>li.classList.remove('active'));
        li.classList.add('active');
        refresh();
      };
      employeeListEl.appendChild(li);
    });
  }

  // small debounce
  function debounce(fn, wait=200){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }

  // ---------- Add Sale form behavior ----------
  function computeTotalFromForm(form){
    let total = 0;
    const products = form.querySelectorAll('[name^="product_"]');
    products.forEach((_, idx) => {
      const i = idx + 1;
      const qty = Number(form[`qty_${i}`]?.value || 0);
      const price = Number(form[`price_${i}`]?.value || 0);
      total += qty * price;
    });
    return total;
  }

  // add product row UI
  if (addProductRowBtn){
    addProductRowBtn.addEventListener('click', ()=>{
      const container = document.getElementById('productsContainer');
      const rowCount = container.querySelectorAll('.product-row').length;
      if (rowCount >= 10) return alert('Maximum 10 products supported for report export.');
      const next = rowCount + 1;
      const div = document.createElement('div');
      div.className = 'product-row';
      div.innerHTML = `
        <label>Product ${next} - Name<br/><input name="product_${next}" /></label>
        <label>Qty<br/><input name="qty_${next}" type="number" min="1" value="1" /></label>
        <label>Rate<br/><input name="price_${next}" type="number" min="0" value="0" /></label>
      `;
      container.appendChild(div);
    });
  }

  // modal open/close
  if (openAddSaleBtn){
    openAddSaleBtn.onclick = ()=> { addSaleModal.style.display='flex'; addSaleModal.setAttribute('aria-hidden','false'); };
    closeAddSale.onclick = ()=> { addSaleModal.style.display='none'; addSaleModal.setAttribute('aria-hidden','true'); };
    document.getElementById('cancelAdd').onclick = ()=> { addSaleModal.style.display='none'; };
    addSaleModal.addEventListener('click', (e)=>{ if (e.target === addSaleModal) { addSaleModal.style.display='none'; } });
  }

  if (addSaleForm){
    // update total live
    addSaleForm.addEventListener('input', ()=> { totalField.value = computeTotalFromForm(addSaleForm); });

    addSaleForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const form = e.target;
      const id = Date.now();
      const customer = form.customer.value.trim();
      const mobile = form.mobile.value.trim();
      const company = form.company.value.trim();
      const cust_code = form.cust_code.value.trim();
      const dateISO = formatDateInputToISO(form.date.value);
      const employee = form.employee.value.trim();
      // collect products
      const items = [];
      const rows = form.querySelectorAll('.product-row');
      rows.forEach((row, i) => {
        const idx = i+1;
        const prod = form[`product_${idx}`]?.value;
        const qty = Number(form[`qty_${idx}`]?.value || 0);
        const price = Number(form[`price_${idx}`]?.value || 0);
        if (prod && qty>0) items.push({ product: prod, qty, price });
      });
      const total = computeTotalFromForm(form);
      const payments = [];
      const p1 = Number(form.p_amount_1.value || 0);
      if (p1>0) payments.push({ date: dateISO, amount: p1, method: form.p_method_1.value || '' });

      const saleObj = {
        id, customer, mobile, company, cust_code, date: dateISO, employee, items, total, payments, notes: 'Added via UI'
      };

      allSales.push(saleObj);
      saveAddedEntriesToLocalStorage([saleObj]);

      // ensure visible
      selectedMonth = 'all'; monthSelect.value = 'all';
      selectedEmployee = null;
      document.querySelectorAll('#employeeList li').forEach(li=>li.classList.remove('active'));
      const first = document.querySelector('#employeeList li'); if (first) first.classList.add('active');

      buildMonthOptions();
      buildEmployeeList();
      refresh();

      // try to commit automatically (prompt for PAT if needed)
      const autoConfirm = confirm('Do you want to commit this change to GitHub now? (You will be asked to paste a PAT once.)');
      if (autoConfirm) {
        await saveMergedToGitHubFlow([]);
      }

      // close modal and reset
      addSaleModal.style.display='none';
      form.reset();
      totalField.value = '';
    });

    // Download single JSON entry
    if (downloadSingleBtn){
      downloadSingleBtn.addEventListener('click', ()=>{
        const form = addSaleForm;
        const id = Date.now();
        const dateISO = formatDateInputToISO(form.date.value);
        const rows = form.querySelectorAll('.product-row');
        const items = [];
        rows.forEach((row,i)=>{ const idx=i+1; const prod=form[`product_${idx}`]?.value; const qty=Number(form[`qty_${idx}`]?.value||0); const price=Number(form[`price_${idx}`]?.value||0); if(prod) items.push({product:prod,qty,price}); });
        const saleObj = { id, customer: form.customer.value.trim(), mobile: form.mobile.value.trim(), company: form.company.value.trim(), cust_code: form.cust_code.value.trim(), date: dateISO, employee: form.employee.value.trim(), items, total: computeTotalFromForm(form), payments: [], notes:'Single download from UI' };
        const blob = new Blob([JSON.stringify(saleObj, null, 2)], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sale-${id}.json`; a.click(); URL.revokeObjectURL(a.href);
      });
    }
  }

  // Initialize UI
  buildMonthOptions();
  buildEmployeeList();
  refresh();

  // Expose downloadMergedJSON to header button
  window.downloadMergedJSON = downloadMergedJSON;

})();
