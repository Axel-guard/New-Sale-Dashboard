// --- Replace the addSaleForm submit handler with this block ---
addSaleForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const form = e.target;
  const id = Date.now(); // simple unique id
  const customer = form.customer.value.trim();
  const dateVal = form.date.value;
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

  // close modal and reset the form
  document.getElementById('closeAddSale').click();
  form.reset();
  totalField.value = '';
});
