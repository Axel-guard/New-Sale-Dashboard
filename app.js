// Simple client-side sales dashboard
// Loads data/sales.json and renders charts + table
(async function(){
  const salesUrl = 'data/sales.json';

  // DOM
  const monthSelect = document.getElementById('monthSelect');
  const employeeListEl = document.getElementById('employeeList');
  const kpiBoxes = document.getElementById('kpiBoxes');
  const salesTableBody = document.querySelector('#salesTable tbody');
  const barCtx = document.getElementById('barChart').getContext('2d');
  const doughnutCtx = document.getElementById('doughnutChart').getContext('2d');
  const exportBtn = document.getElementById('exportCsv');
  const showAllPayments = document.getElementById('showAllPayments');
  const globalSearch = document.getElementById('globalSearch');
  const employeeSearch = document.getElementById('employeeSearch');

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
  function currency(n){ return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(n); }

  // Load data
  try {
    const r = await fetch(salesUrl);
    allSales = await r.json();
  } catch(e){
    console.error('Failed to load sales.json', e);
    allSales = [];
  }

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
    const data = labels.map(l=>agg[l]);

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
      const line = [s.id, `"${s.customer}"`, s.date, s.employee, `"${products}"`, s.total, paid, status, `"${payments}"`];
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

  // Initialize
  buildMonthOptions();
  buildEmployeeList();
  refresh();

})();