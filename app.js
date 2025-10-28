// Simple client-side sales dashboard with a local "Add Sale" form
// Loads data/data/sales.json and renders charts + table
(async function(){
  const salesUrl = 'data/sales.json';

  // Configuration: change these to adjust currency/convert
  const CURRENCY_LOCALE = 'en-IN'; // Indian formatting
  const CURRENCY_CODE = 'INR';     // INR currency code
  const CONVERSION_RATE = 1;      // set to 1 for no conversion. Set to ~83 to convert USD -> INR

  // GitHub commit config (used only when user supplies a PAT)
  const GITHUB_OWNER = 'Axel-guard';
  const GITHUB_REPO = 'New-Sale-Dashboard';
  const GITHUB_PATH = 'data/sales.json';
  const GITHUB_BRANCH = 'main';

  // DOM
  const monthSelect = document.getElementById('monthSelect');
  const employeeListEl = document.getElementById('employeeList');
  const kpiBoxes = document.getElementById('kpiBoxes');
  const salesTableBody = document.querySelector('#salesTable tbody');
  const barCtx = document.getElementById('barChart').getContext('2d');
  const doughnutCtx = document.getElementById('doughnutChart').getContext('2d');
  const exportBtn = document.getElementById('exportCsv');
  const downloadJsonBtn = document.getElementById('downloadJson');
  const saveToGitHubBtn = document.getElementById('saveToGitHub');
  const downloadSingleBtn = document.getElementById('downloadSingle');
  const showAllPayments = document.getElementById('showAllPayments');
  const globalSearch = document.getElementById('globalSearch');
  const employeeSearch = document.getElementById('employeeSearch');
  const addSaleForm = document.getElementById('addSaleForm');
  const totalField = document.getElementById('totalField');

  let allSales = [];
  let filteredSales = [];
  let selectedEmployee = null;
  let selectedMonth = 'current';

  // Charts
  let barChart = null;
  let doughnutChart = null;

  // Utilities
  function formatDate(d){
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString();
  }
  // Currency formatter using INR. CONVERSION_RATE will convert numbers if you set it.
  function currency(n){
    const val = Number(n || 0) * CONVERSION_RATE;
    return new Intl.NumberFormat(CURRENCY_LOCALE, { style: 'currency', currency: CURRENCY_CODE }).format(val);
  }

  // Local storage key for new entries you add from the form
  const LS_KEY = 'sales_dashboard_added_sales_v1';

  // Load data
  async function loadRemoteSales(){
    try {
      const r = await fetch(salesUrl);
      if (!r.ok) throw new Error('Fetch failed: ' + r.status);
      const json = await r.json();
      return json;
    } catch(e){
      console.error('Failed to load sales.json', e);
      return [];
    }
  }

  allSales = await loadRemoteSales();

  // merge saved entries from localStorage so they show up in UI
  function mergeLocalSaved(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const extra = JSON.parse(raw);
      if (!Array.isArray(extra)) return;
      // append extra entries
      allSales = allSales.concat(extra);
    } catch(e){ console.error('failed to merge local entries', e); }
  }

  mergeLocalSaved();

  // Build month options from data (plus "current" default)
  function buildMonthOptions(){
    const months = new Set();
    allSales.forEach(s => {
      const d = new Date(s.date);
      if (!isNaN(d)) months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    });
    const monthsArr = Array.from(months).sort((a,b)=>b.localeCompare(a)); // newest first
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

    // set default to current
    selectedMonth = 'current';
    monthSelect.value = 'current';
  }

  // Employees list
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

  // Charts data
  function aggregateByEmployee(sales){
    const agg = {};
    sales.forEach(s=>{
      if (!agg[s.employee]) agg[s.employee] = 0;
      agg[s.employee] += s.total;
    });
    return agg;
  }

  function buildCharts(sales){
    const agg = aggregateByEmployee(sales);
    const labels = Object.keys(agg);
    const data = labels.map(l=>agg[l] * CONVERSION_RATE);

    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
      type:'bar',
      data:{
        labels,
        datasets:[{
          label:'Sales',
          data,
          backgroundColor: labels.map(()=> 'rgba(37,99,235,0.75)'),
        }]
      },
      options:{
        responsive:true,
        plugins:{legend:{display:false}}
      }
    });

    const statusCounts = {paid:0,partial:0,due:0};
    sales.forEach(s=>{
      statusCounts[paymentStatus(s)]++;
    });

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
      options:{plugins:{legend:{position:'bottom'}}}
    });
  }

  // Table rendering
  function renderTable(sales){
    salesTableBody.innerHTML = '';
    const showPayments = showAllPayments.checked;
    const template = document.getElementById('paymentRowTemplate');

    const query = globalSearch.value.trim().toLowerCase();

    sales.forEach(s=>{
      // search filter
      if (query){
        const hay = `${s.customer} ${s.employee} ${s.items.map(it=>it.product).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return;
      }

      const tr = document.createElement('tr');
      const productsText = s.items.map(it=>`${it.product} x${it.qty}`).join(', ');
      const status = paymentStatus(s);
      tr.innerHTML = `
        <td><strong>${s.customer}</strong><div class="products"><small>${s.notes||''}</small></div></td>
        <td>${formatDate(s.date)}</td>
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
        const paymentRow = clone.querySelector('.payment-row');
        const detailsTd = clone.querySelector('.payment-details');
        const rows = s.payments.map(p=>`<div>${formatDate(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:''}</div>`).join('');
        detailsTd.innerHTML = `<strong>Payments:</strong><div>${rows}</div>`;
        salesTableBody.appendChild(clone);
      }
    });

    // attach toggles for inline expand/collapse of payments
    document.querySelectorAll('.toggle-pay').forEach(btn=>{
      btn.onclick = (e)=>{
        const id = btn.getAttribute('data-id');
        // find the sale row to toggle a detail row beneath
        const row = btn.closest('tr');
        const next = row.nextElementSibling;
        if (next && next.classList.contains('payment-row')){
          // toggle remove
          next.remove();
          return;
        }
        const sale = sales.find(x=>String(x.id) === String(id));
        if (!sale) return;
        const tr = document.createElement('tr');
        tr.className = 'payment-row';
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'payment-details';
        td.innerHTML = `<strong>Payments:</strong>${sale.payments.map(p=>`<div>${formatDate(p.date)} — ${currency(p.amount)} ${p.method?`(${p.method})`:''}</div>`).join('')}`;
        row.parentNode.insertBefore(tr, row.nextSibling);
      };
    });
  }

  // Export CSV
  function exportCSV(sales){
    const rows = [];
    const header = ['id','customer','date','employee','products','total','paid','status','payments'];
    rows.push(header.join(','));
    sales.forEach(s=>{
      const products = s.items.map(it=>`${it.product} x${it.qty}`).join(' | ').replace(/,/g,'');
      const paid = paymentsSum(s.payments||[]);
      const status = paymentStatus(s);
      const payments = (s.payments||[]).map(p=>`${p.date}::${p.amount}::${p.method||''}`).join('|');
      const line = [s.id, `"${s.customer}"`, s.date, s.employee, `"${products}"`, s.total * CONVERSION_RATE, paid * CONVERSION_RATE, status, `"${payments}"`];
      rows.push(line.join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Download entire merged JSON (original + local added entries)
  function downloadMergedJSON(){
    const merged = allSales.slice(); // allSales already has merged local entries on load
    const blob = new Blob([JSON.stringify(merged, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Save added entries to localStorage (keeps them across reloads)
  function saveAddedEntriesToLocalStorage(added){
    try {
      // read existing local saved ones
      const raw = localStorage.getItem(LS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const merged = existing.concat(added);
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
    } catch(e){ console.error('failed to save to localStorage', e); }
  }

  // ---------- GitHub commit helpers (requires PAT) ----------
  // Note: Using a PAT in the browser is sensitive. Create a short-lived PAT with 'repo' scope, paste it when prompted, and revoke it after use.
  async function githubGetFileSha(token){
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_PATH)}?ref=${GITHUB_BRANCH}`;
    const r = await fetch(url, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }});
    if (r.status === 404) return null; // file doesn't exist yet
    if (!r.ok) throw new Error(`GitHub GET failed: ${r.status}`);
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

  // Handler invoked when user wants to save merged JSON directly to GitHub
  async function saveMergedToGitHubFlow(){
    try {
      // confirm intention
      const proceed = confirm('This will update data/sales.json in your GitHub repository. You will be prompted to paste a Personal Access Token (PAT) with repo permissions. Do you want to continue?');
      if (!proceed) return;

      const token = prompt('Paste a GitHub Personal Access Token (PAT) with repo scope. This token will NOT be stored. Create one at https://github.com/settings/tokens');
      if (!token) {
        alert('No token provided. Aborting save.');
        return;
      }

      // prepare merged JSON (reload remote one to reduce collisions)
      const remote = await loadRemoteSales();
      // also merge localStorage extras
      const rawExtra = localStorage.getItem(LS_KEY);
      const extras = rawExtra ? JSON.parse(rawExtra) : [];
      const merged = remote.concat(extras);

      // get existing file sha (if any)
      const sha = await githubGetFileSha(token);
      const contentStr = JSON.stringify(merged, null, 2);
      // push the file
      await githubPutFile(token, contentStr, sha);
      alert('Saved to GitHub successfully. The Pages site will update after GitHub publishes the change (give it a minute).');
    } catch (err) {
      console.error(err);
      alert('Failed to save to GitHub: ' + err.message);
    }
  }

  // Apply filters and refresh UI
  function refresh(){
    // month filter
    filteredSales = filterByMonth(allSales, selectedMonth);
    // employee filter
    if (selectedEmployee) filteredSales = filteredSales.filter(s=>s.employee === selectedEmployee);
    // employeeSearch filter
    const es = employeeSearch.value.trim().toLowerCase();
    if (es){
      filteredSales = filteredSales.filter(s=>s.employee.toLowerCase().includes(es));
    }

    buildKPIs(filteredSales);
    buildCharts(filteredSales);
    renderTable(filteredSales);
  }

  // Event bindings
  monthSelect.onchange = (e)=>{
    selectedMonth = e.target.value;
    refresh();
  };
  exportBtn.onclick = ()=> exportCSV(filteredSales);
  downloadJsonBtn.onclick = ()=> downloadMergedJSON();
  saveToGitHubBtn.onclick = ()=> saveMergedToGitHubFlow();
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
  function debounce(fn, wait=200){
    let t;
    return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
  }

  // ------------ Add Sale form handling ------------
  // compute total when qty/price changes
  function computeTotalFromForm(form){
    const qty = Number(form.qty.value || 0);
    const price = Number(form.price.value || 0);
    return qty * price;
  }

  if (addSaleForm){
    addSaleForm.qty.addEventListener('input', ()=> { totalField.value = computeTotalFromForm(addSaleForm); });
    addSaleForm.price.addEventListener('input', ()=> { totalField.value = computeTotalFromForm(addSaleForm); });
    // initialize total
    totalField.value = computeTotalFromForm(addSaleForm);

    addSaleForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const form = e.target;
      const id = Date.now(); // simple unique id
      const customer = form.customer.value.trim();
      const dateVal = form.date.value;
      // convert datetime-local to ISO (append Z if no timezone)
      const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      const employee = form.employee.value.trim();
      const item = {
        product: form.product.value.trim(),
        qty: Number(form.qty.value || 0),
        price: Number(form.price.value || 0)
      };
      const total = computeTotalFromForm(form);
      const payments = [];
      const p1 = Number(form.p_amount_1.value || 0);
      if (p1 > 0) payments.push({date: isoDate, amount: p1, method: form.p_method_1.value || ''});

      const saleObj = {
        id,
        customer,
        date: isoDate,
        employee,
        items: [item],
        total,
        payments,
        notes: 'Added via UI'
      };

      // add to runtime and save to localStorage
      allSales.push(saleObj);
      saveAddedEntriesToLocalStorage([saleObj]);

      // ensure newly added sale is visible immediately: show all months & employees
      selectedMonth = 'all';
      monthSelect.value = 'all';
      selectedEmployee = null;
      // remove active class from employee items and set the first (All employees) active
      document.querySelectorAll('#employeeList li').forEach(li => li.classList.remove('active'));
      const first = document.querySelector('#employeeList li');
      if (first) first.classList.add('active');

      // update UI
      buildMonthOptions();
      buildEmployeeList();
      refresh();

      // close modal (simple approach)
      document.getElementById('closeAddSale').click();
      // reset form
      form.reset();
      totalField.value = '';
    });

    // immediate download of a single JSON object (useful for quick upload)
    downloadSingleBtn.addEventListener('click', ()=>{
      const form = addSaleForm;
      const id = Date.now();
      const dateVal = form.date.value;
      const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      const item = { product: form.product.value.trim(), qty: Number(form.qty.value||0), price: Number(form.price.value||0) };
      const total = computeTotalFromForm(form);
      const payments = [];
      const p1 = Number(form.p_amount_1.value || 0);
      if (p1 > 0) payments.push({date: isoDate, amount: p1, method: form.p_method_1.value || ''});
      const saleObj = { id, customer: form.customer.value.trim(), date: isoDate, employee: form.employee.value.trim(), items:[item], total, payments, notes: 'Single download from UI' };
      const blob = new Blob([JSON.stringify(saleObj, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sale-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Initialize
  buildMonthOptions();
  buildEmployeeList();
  refresh();

  // expose downloadMergedJSON for the button in index.html
  window.downloadMergedJSON = downloadMergedJSON;

})();
