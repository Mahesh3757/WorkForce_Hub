// Initialize Firestore
const db = firebase.firestore();

// Clean leftover modal backdrops (fixes overlay issue)
function cleanupModals() {
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

// Safe modal show helper
function showModal(modalId) {
  cleanupModals();
  const el = document.getElementById(modalId);
  if (!el) return;
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
}

// Get UID and name from localStorage
const uid = localStorage.getItem('workerUID');
const workerName = localStorage.getItem('workerName') || "Worker";

// Redirect if no UID
if (!uid) {
  alert("Please login first.");
  window.location.href = "index.html";
}

// Display worker name
document.getElementById('workerNameDisplay').textContent = `Welcome, ${workerName}!`;

// Logout function
function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

// Global variable to store worker data
let workerSalaryType = 'daily';
let workerDailyAmount = 0;
let workerMonthlyAmount = 0;

// Load worker salary type and amounts from 'salaries' collection
async function loadWorkerSalaryType() {
  try {
    const doc = await db.collection('salaries').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      workerSalaryType = data.salaryType || 'daily';
      workerDailyAmount = parseFloat(data.dailyAmount) || (workerSalaryType === 'daily' ? (parseFloat(data.monthlyAmount) || 0) : 0);
      workerMonthlyAmount = parseFloat(data.monthlyAmount) || 0;
      console.log(`Type: ${workerSalaryType}, Daily: ${workerDailyAmount}, Monthly: ${workerMonthlyAmount}`);
    }
  } catch (error) {
    console.error("Error loading salary type:", error);
  }
}

// Load event managers from Firestore
async function loadEventManagers() {
  try {
    const snapshot = await db.collection('eventManagers').orderBy('name').get();
    const select = document.getElementById('eventManager');
    const editSelect = document.getElementById('editEventManager');
    
    if (select) {
      select.innerHTML = '<option value="">Select Event Manager</option>';
      snapshot.forEach(doc => {
        const name = doc.data().name;
        select.insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`);
      });
    }
    
    if (editSelect) {
      editSelect.innerHTML = '<option value="">Select Event Manager</option>';
      snapshot.forEach(doc => {
        const name = doc.data().name;
        editSelect.insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`);
      });
    }
  } catch (error) {
    console.error("Error loading event managers:", error);
  }
}


// Delete work record
async function deleteWorkRecord(docId) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  try {
    await db.collection('workRecords').doc(docId).delete();
    alert("Record deleted successfully!");
    fetchMyWorks();
  } catch (error) {
    console.error("Error deleting record:", error);
    alert("Failed to delete record: " + error.message);
  }
}

// Open edit modal
function openEditModal(docId) {
  db.collection('workRecords').doc(docId).get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        document.getElementById('editId').value = docId;
        document.getElementById('editDate').value = data.date || '';
        document.getElementById('editWorkDetails').value = data.workDetails || '';
        document.getElementById('editSpentAmount').value = data.spent || 0;
        document.getElementById('editSpentDetails').value = data.spentDetails || '';
        document.getElementById('editEventManager').value = data.eventManager || '';
        document.getElementById('editOwnerName').value = data.ownerName || '';

        showModal('editModal');
      } else {
        alert("Record not found!");
      }
    })
    .catch(error => {
      console.error("Error fetching record:", error);
      alert("Failed to load record for editing.");
    });
}

// Save edited record
document.getElementById('saveEditBtn').addEventListener('click', async () => {
  const docId = document.getElementById('editId').value;
  const date = document.getElementById('editDate').value;
  const spent = parseFloat(document.getElementById('editSpentAmount').value) || 0;
  const workDetails = document.getElementById('editWorkDetails').value.trim();
  const spentDetails = document.getElementById('editSpentDetails').value.trim();
  const eventManager = document.getElementById('editEventManager').value;
  const ownerName = document.getElementById('editOwnerName').value;

  if (!date || !workDetails || !spentDetails || !eventManager || !ownerName) {
    alert("Please fill all required fields");
    return;
  }

  // Daily earning for daily or hybrid workers
  const earning = (workerSalaryType === 'daily' || workerSalaryType === 'hybrid') ? workerDailyAmount : 0;

  try {
   await db.collection("workRecords").doc(docId).update({
     date,
     eventManager,
     ownerName,
     spent,
     earning,
     workDetails,
     spentDetails,
     lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
   });
    alert("Record updated successfully!");
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    fetchMyWorks();
  } catch (error) {
    console.error("Error updating record:", error);
    alert("Failed to update record: " + error.message);
  }
});

// Apply & clear date filter
function applyDateFilter() { fetchMyWorks(); }
function clearDateFilter() {
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  fetchMyWorks();
}

// Fetch work records
async function fetchMyWorks() {
  try {
    const worksTableBody = document.getElementById('worksTableBody');
    worksTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Loading records...</td></tr>';
    showModal('worksModal');

    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    let query = db.collection('workRecords').where('uid', '==', uid);

    if (fromDate) query = query.where('date', '>=', fromDate);
    if (toDate) query = query.where('date', '<=', toDate);

    query = query.orderBy('date', 'desc');
    const snapshot = await query.get();

    worksTableBody.innerHTML = '';
    if (snapshot.empty) {
      worksTableBody.innerHTML = '<tr><td colspan="9" class="text-center">No work records found</td></tr>';
      return;
    }

    let totalSpent = 0, totalEarning = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      totalSpent += Number(data.spent) || 0;
      totalEarning += Number(data.earning) || 0;
      const row = document.createElement('tr');
     row.innerHTML = `
          <td>${data.date || "N/A"}</td>
          <td>${data.eventManager || "—"}</td>
          <td>${data.ownerName || "—"}</td>
          <td>${data.workDetails || ""}</td>
          <td>₹${(data.spent || 0).toFixed(2)}</td>
          <td>${data.spentDetails || ""}</td>
          <td>₹${(data.earning || 0).toFixed(2)}</td>
          <td><span class="badge ${data.isPaid ? "badge-paid" : "badge-pending"}">${data.isPaid ? "Paid" : "Pending"}</span></td>
          <td>
            <button onclick="openEditModal('${doc.id}')" class="btn btn-sm btn-outline-primary"><i class="fas fa-edit"></i></button>
            <button onclick="deleteWorkRecord('${doc.id}')" class="btn btn-sm btn-outline-danger ms-1"><i class="fas fa-trash"></i></button>
          </td>`;
      worksTableBody.appendChild(row);
    });

    document.getElementById('totalSpent').textContent = `₹${totalSpent.toFixed(2)}`;
    document.getElementById('totalEarning').textContent = `₹${totalEarning.toFixed(2)}`;

  } catch (error) {
    console.error("fetchMyWorks failed:", error);
    document.getElementById('worksTableBody').innerHTML = `<tr><td colspan="9" class="text-center text-danger">Error loading data. ${error.message}</td></tr>`;
  }
}

// Show owner-wise balance (only if > 0)
function showOwnerBalances(ownerBalances) {
  let html = '';
  for (const [owner, amount] of Object.entries(ownerBalances)) {
    if (amount > 0) {
      html += `<div class="d-flex justify-content-between mb-1">
        <span>${owner} owes:</span>
        <strong class="text-danger">₹${amount.toFixed(2)}</strong>
      </div>`;
    }
  }
  if (!html) html = '<div class="text-muted small">No pending from any owner</div>';
  
  // Find or create container
  let container = document.getElementById('ownerBalanceContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ownerBalanceContainer';
    container.className = 'mt-3 p-2 bg-light rounded';
    const balanceEl = document.getElementById('balanceAmountDisplay');
    if (balanceEl && balanceEl.parentElement) {
      balanceEl.parentElement.after(container);
    }
  }
  container.innerHTML = `<small class="text-muted d-block mb-1">Pending from:</small>${html}`;
}

// Calculate owner balances from work records and payments
async function calculateOwnerBalances() {
  const ownerBalances = { Swapnil: 0, Shubham: 0 };
  
  const [workSnap, paySnap, salDoc] = await Promise.all([
    db.collection('workRecords').where('uid', '==', uid).get(),
    db.collection('payments').where('workerId', '==', uid).get(),
    db.collection('salaries').doc(uid).get()
  ]);
  
  const salaryInfo = salDoc.exists ? salDoc.data() : {};
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const effectiveFrom = salaryInfo.periodEffectiveFrom || null;
  const salaryStarted = !effectiveFrom || effectiveFrom <= todayStr;
  
  // Add earnings and expenses to owner
  workSnap.forEach(doc => {
    const d = doc.data();
    const owner = d.ownerName || 'Swapnil';
    if (ownerBalances[owner] !== undefined) {
      ownerBalances[owner] += (parseFloat(d.earning) || 0) + (parseFloat(d.spent) || 0);
    }
  });
  
  // Add monthly salary to designated payer (only if salary has started)
  if (salaryStarted && (salaryInfo.salaryType === 'monthly' || salaryInfo.salaryType === 'hybrid') && salaryInfo.monthlyAmount > 0) {
    const payer = salaryInfo.salaryPayer || 'Swapnil';
    if (ownerBalances[payer] !== undefined) {
      ownerBalances[payer] += salaryInfo.monthlyAmount;
    }
  }
  
  // Subtract payments
  paySnap.forEach(doc => {
    const d = doc.data();
    const owner = d.owner || 'Swapnil';
    if (ownerBalances[owner] !== undefined) {
      ownerBalances[owner] -= parseFloat(d.amount) || 0;
    }
  });
  
  return ownerBalances;
}
async function showPaymentDetailsDaily() {
  const workSnapshot = await db.collection('workRecords').where('uid', '==', uid).get();
  let totalEarnings = 0;
  let totalSpent = 0;
  
  workSnapshot.forEach(doc => {
    const data = doc.data();
    totalEarnings += parseFloat(data.earning) || 0;
    totalSpent += parseFloat(data.spent) || 0;
  });
  
  // For daily workers, total compensation = earnings + expenses
  const totalCompensation = totalEarnings + totalSpent;
  
  const paymentSnapshot = await db.collection('payments').where('workerId', '==', uid).orderBy('date', 'desc').get();
  let totalReceived = 0;
  const paymentsBody = document.getElementById('paymentDetailsBody');
  paymentsBody.innerHTML = '';
  
  paymentSnapshot.forEach(doc => {
    const p = doc.data();
    totalReceived += parseFloat(p.amount) || 0;

    let formattedDate = 'N/A';
    if (p.date?.toDate) formattedDate = p.date.toDate().toISOString().split('T')[0];
    else if (typeof p.date === 'string') formattedDate = p.date;

    const row = document.createElement('tr');
    row.innerHTML = `<td>${formattedDate}</td><td>₹${(p.amount || 0).toFixed(2)}</td><td>${p.method || ''}</td><td>${p.note || ''}</td>`;
    paymentsBody.appendChild(row);
  });

  if (paymentSnapshot.empty) {
    paymentsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payments received yet</td></tr>';
  }

  // Update the UI to show the breakdown
  document.getElementById('dailyWorkerDetails').style.display = 'block';
  document.getElementById('monthlyWorkerDetails').style.display = 'none';
  
  document.getElementById('totalEarningsDisplay').textContent = `₹${totalEarnings.toFixed(2)}`;
  document.getElementById('totalSpentDisplay').textContent = `₹${totalSpent.toFixed(2)}`;
  document.getElementById('totalCompensationDisplay').textContent = `₹${totalCompensation.toFixed(2)}`;
  document.getElementById('totalReceivedDisplay').textContent = `₹${totalReceived.toFixed(2)}`;

  const balance = totalCompensation - totalReceived;
  const balanceEl = document.getElementById('balanceAmountDisplay');
  balanceEl.textContent = `₹${Math.abs(balance).toFixed(2)}`;
  document.getElementById('balanceStatus').textContent = balance > 0 ? 'Payment Due' : balance < 0 ? 'Advance Paid' : 'Fully Paid';
  balanceEl.className = balance > 0 ? 'balance-negative' : balance < 0 ? 'balance-positive' : '';

  // Show owner-wise balance
  const ownerBal = await calculateOwnerBalances();
  showOwnerBalances(ownerBal);

  showModal('paymentDetailsModal');
}

// ======= Fixed payment details logic for monthly workers =======
async function showPaymentDetailsMonthly() {
  // Hide daily worker details and show monthly worker details
  document.getElementById('dailyWorkerDetails').style.display = 'none';
  document.getElementById('monthlyWorkerDetails').style.display = 'block';
  
  const periodText = getSalaryPeriod();
  document.getElementById('salaryPeriodText').textContent = `Salary Period: ${periodText}`;
  document.getElementById('monthlySalaryText').textContent = `Monthly Salary: ₹${workerMonthlyAmount.toFixed(2)}`;

  // Define current period: 15th to next 15th
  const today = new Date();
  let startDate, endDate;
  if (today.getDate() >= 15) {
    startDate = new Date(today.getFullYear(), today.getMonth(), 15);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 15);
  } else {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    endDate = new Date(today.getFullYear(), today.getMonth(), 15);
  }
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // Get all work records and payments for this worker
  const [workSnapshot, paymentSnapshot] = await Promise.all([
    db.collection('workRecords').where('uid', '==', uid).get(),
    db.collection('payments').where('workerId', '==', uid).get()
  ]);

  // Calculate current period expenses
  let currentPeriodExpenses = 0;
  workSnapshot.forEach(doc => {
    const data = doc.data();
    const dateStr = data.date;
    if (typeof dateStr === 'string' && dateStr >= startStr && dateStr < endStr) {
      currentPeriodExpenses += parseFloat(data.spent) || 0;
    }
  });

  // Calculate cumulative balance from ALL previous periods
  let cumulativeBalance = 0;
  
  // Calculate total salary earned from all previous periods
  let totalSalaryEarned = 0;
  
  // Count how many full months of salary the worker has earned
  let earliestWorkDate = new Date();
  workSnapshot.forEach(doc => {
    const data = doc.data();
    const dateStr = data.date;
    if (typeof dateStr === 'string') {
      const workDate = new Date(dateStr);
      if (workDate < earliestWorkDate) {
        earliestWorkDate = workDate;
      }
    }
  });
  
  // Calculate number of full monthly periods from start date to current period start
  let periodCount = 0;
  let periodStart = new Date(earliestWorkDate.getFullYear(), earliestWorkDate.getMonth(), 15);
  if (earliestWorkDate.getDate() > 15) {
    periodStart = new Date(earliestWorkDate.getFullYear(), earliestWorkDate.getMonth() + 1, 15);
  }
  
  while (periodStart < startDate) {
    periodCount++;
    periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15);
  }
  
  totalSalaryEarned = periodCount * workerMonthlyAmount;
  
  // Calculate total expenses from previous periods
  let previousPeriodsExpenses = 0;
  let previousPeriodsDailyEarnings = 0;
  workSnapshot.forEach(doc => {
    const data = doc.data();
    const dateStr = data.date;
    if (typeof dateStr === 'string' && dateStr < startStr) {
      previousPeriodsExpenses += parseFloat(data.spent) || 0;
      if (workerSalaryType === 'hybrid') {
        previousPeriodsDailyEarnings += parseFloat(data.earning) || 0;
      }
    }
  });
  
  // Calculate total payments received before current period
  let totalPaymentsBeforePeriod = 0;
  paymentSnapshot.forEach(doc => {
    const p = doc.data();
    let paymentDateStr;
    
    if (p.date?.toDate) {
      paymentDateStr = p.date.toDate().toISOString().split('T')[0];
    } else if (typeof p.date === 'string') {
      paymentDateStr = p.date;
    }
    
    if (paymentDateStr && paymentDateStr < startStr) {
      totalPaymentsBeforePeriod += parseFloat(p.amount) || 0;
    }
  });
  
  // Cumulative balance = total salary earned + previous expenses + previous daily earnings - total payments received
  cumulativeBalance = totalSalaryEarned + previousPeriodsExpenses + previousPeriodsDailyEarnings - totalPaymentsBeforePeriod;
  
  // Current period earnings = monthly salary + expenses in current period
  // For hybrid, also add daily earnings from work records in this period
  let currentPeriodDailyEarnings = 0;
  if (workerSalaryType === 'hybrid') {
    workSnapshot.forEach(doc => {
      const data = doc.data();
      const dateStr = data.date;
      if (typeof dateStr === 'string' && dateStr >= startStr && dateStr < endStr) {
        currentPeriodDailyEarnings += parseFloat(data.earning) || 0;
      }
    });
  }
  const currentPeriodEarnings = workerMonthlyAmount + currentPeriodExpenses + currentPeriodDailyEarnings;
  
  // Total earnings = cumulative balance + current period earnings
  const totalEarnings = cumulativeBalance + currentPeriodEarnings;
  
  // Calculate payments received in current period
  let totalReceivedInPeriod = 0;
  const paymentsBody = document.getElementById('paymentDetailsBody');
  paymentsBody.innerHTML = '';
  
  paymentSnapshot.forEach(doc => {
    const p = doc.data();
    let paymentDateStr;
    
    if (p.date?.toDate) {
      paymentDateStr = p.date.toDate().toISOString().split('T')[0];
    } else if (typeof p.date === 'string') {
      paymentDateStr = p.date;
    }
    
    if (paymentDateStr && paymentDateStr >= startStr && paymentDateStr < endStr) {
      totalReceivedInPeriod += parseFloat(p.amount) || 0;
      
      const row = document.createElement('tr');
      row.innerHTML = `<td>${paymentDateStr}</td><td>₹${(p.amount || 0).toFixed(2)}</td><td>${p.method || ''}</td><td>${p.note || ''}</td>`;
      paymentsBody.appendChild(row);
    }
  });
  
  if (paymentsBody.innerHTML === '') {
    paymentsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payments received this period</td></tr>';
  }
  
  // Update display values for monthly workers
  document.getElementById('previousBalanceDisplay').textContent = `₹${cumulativeBalance.toFixed(2)}`;
  document.getElementById('currentEarningsDisplay').textContent = `₹${currentPeriodEarnings.toFixed(2)}`;
  document.getElementById('totalEarningsDisplayMonthly').textContent = `₹${totalEarnings.toFixed(2)}`;
  document.getElementById('totalReceivedDisplay').textContent = `₹${totalReceivedInPeriod.toFixed(2)}`;

  const balance = totalEarnings - totalReceivedInPeriod;
  const balanceEl = document.getElementById('balanceAmountDisplay');
  balanceEl.textContent = `₹${Math.abs(balance).toFixed(2)}`;
  document.getElementById('balanceStatus').textContent = balance > 0 ? 'Payment Due' : balance < 0 ? 'Advance Paid' : 'Fully Paid';
  balanceEl.className = balance > 0 ? 'balance-negative' : balance < 0 ? 'balance-positive' : '';

  // Show owner-wise balance
  const ownerBal = await calculateOwnerBalances();
  showOwnerBalances(ownerBal);

  showModal('paymentDetailsModal');
}

function getSalaryPeriod() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  let fromDate, toDate;
  if (today.getDate() >= 15) {
    fromDate = new Date(year, month, 15);
    toDate = new Date(year, month + 1, 15);
  } else {
    fromDate = new Date(year, month - 1, 15);
    toDate = new Date(year, month, 15);
  }

  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${fromDate.toLocaleDateString('en-IN', options)} to ${toDate.toLocaleDateString('en-IN', options)}`;
}

// Main showPaymentDetails decides which to use
async function showPaymentDetails() {
  await loadWorkerSalaryType();
  if (workerSalaryType === 'monthly' || workerSalaryType === 'hybrid') {
    await showPaymentDetailsMonthly();
  } else {
    await showPaymentDetailsDaily();
  }
}

// Handle work form submit
document.getElementById('workForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById("workDate").value;
  const eventManager = document.getElementById("eventManager").value;
  const ownerName = document.getElementById("ownerName").value;
  const spent = parseFloat(document.getElementById("spentAmount").value) || 0;
  const workDetails = document.getElementById("workDetails").value.trim();
  const spentDetails = document.getElementById("spentDetails").value.trim();

  if (!date || !workDetails || !spentDetails || !eventManager || !ownerName) {
    alert("Please fill all required fields");
    return;
  }

  // Daily earning for daily or hybrid workers
  const earning = (workerSalaryType === 'daily' || workerSalaryType === 'hybrid') ? workerDailyAmount : 0;

  try {
    await db.collection("workRecords").add({
      uid,
      workerName,
      date,
      eventManager,
      ownerName,
      spent,
      earning,
      workDetails,
      spentDetails,
      isPaid: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    alert("Work record added successfully!");
    document.getElementById('workForm').reset();
    fetchMyWorks();
  } catch (error) {
    console.error("Failed to add record:", error);
    alert(`Failed to add record: ${error.message}`);
  }
});

// Init page
document.addEventListener('DOMContentLoaded', async () => {
  if (!uid) { window.location.href = "index.html"; return; }
  document.getElementById('workDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('filterFromDate').value = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  await loadWorkerSalaryType();
  await loadEventManagers();
});

// Expose to global
window.logout = logout;
window.openEditModal = openEditModal;
window.deleteWorkRecord = deleteWorkRecord;
window.applyDateFilter = applyDateFilter;
window.clearDateFilter = clearDateFilter;
window.showPaymentDetails = showPaymentDetails;
window.showMyWorks = fetchMyWorks;