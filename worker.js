// Initialize Firestore
const db = firebase.firestore();

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
let workerMonthlyAmount = 0;

// Load worker salary type and amount from 'salaries' collection
async function loadWorkerSalaryType() {
  try {
    const doc = await db.collection('salaries').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      workerSalaryType = data.salaryType || 'daily';
      workerMonthlyAmount = parseFloat(data.monthlyAmount) || 0;
      console.log(`Salary type: ${workerSalaryType}, Amount: ${workerMonthlyAmount}`);
    } else {
      console.warn("Salary data not found; using defaults.");
    }
  } catch (error) {
    console.error("Error loading salary type:", error);
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
        new bootstrap.Modal(document.getElementById('editModal')).show();
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

  if (!date || !workDetails || !spentDetails) {
    alert("Please fill all required fields");
    return;
  }

  const earning = workerSalaryType === 'daily' ? workerMonthlyAmount : 0;

  try {
    await db.collection('workRecords').doc(docId).update({
      date,
      spent,
      earning,
      workDetails,
      spentDetails,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
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
    worksTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading records...</td></tr>';
    new bootstrap.Modal(document.getElementById('worksModal')).show();

    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    let query = db.collection('workRecords').where('uid', '==', uid);

    if (fromDate) query = query.where('date', '>=', fromDate);
    if (toDate) query = query.where('date', '<=', toDate);

    query = query.orderBy('date', 'desc');
    const snapshot = await query.get();

    worksTableBody.innerHTML = '';
    if (snapshot.empty) {
      worksTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No work records found</td></tr>';
      return;
    }

    let totalSpent = 0, totalEarning = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      totalSpent += Number(data.spent) || 0;
      totalEarning += Number(data.earning) || 0;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${data.date || 'N/A'}</td>
        <td>${data.workDetails || ''}</td>
        <td>₹${(data.spent || 0).toFixed(2)}</td>
        <td>${data.spentDetails || ''}</td>
        <td>₹${(data.earning || 0).toFixed(2)}</td>
        <td><span class="badge ${data.isPaid ? 'badge-paid' : 'badge-pending'}">${data.isPaid ? 'Paid' : 'Pending'}</span></td>
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
    document.getElementById('worksTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error loading data. ${error.message}</td></tr>`;
  }
}

// ======= New payment details logic =======
async function showPaymentDetailsDaily() {
  const workSnapshot = await db.collection('workRecords').where('uid', '==', uid).get();
  let totalEarnings = 0;
  workSnapshot.forEach(doc => totalEarnings += parseFloat(doc.data().earning) || 0);

  await showPaymentDetailsCommon(totalEarnings);
}

async function showPaymentDetailsMonthly() {
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

  // Fetch all work records, then filter in JS
  const workSnapshot = await db.collection('workRecords')
    .where('uid', '==', uid)
    .get();

  let totalSpent = 0;
  workSnapshot.forEach(doc => {
    const data = doc.data();
    const dateStr = data.date;
    if (typeof dateStr === 'string' && dateStr >= startStr && dateStr < endStr) {
      totalSpent += parseFloat(data.spent) || 0;
    }
  });

  const totalEarnings = workerMonthlyAmount + totalSpent;
  await showPaymentDetailsCommon(totalEarnings);
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

async function showPaymentDetailsCommon(totalEarnings) {
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

  document.getElementById('totalEarningsDisplay').textContent = `₹${totalEarnings.toFixed(2)}`;
  document.getElementById('totalReceivedDisplay').textContent = `₹${totalReceived.toFixed(2)}`;

  const balance = totalEarnings - totalReceived;
  const balanceEl = document.getElementById('balanceAmountDisplay');
  balanceEl.textContent = `₹${Math.abs(balance).toFixed(2)}`;
  document.getElementById('balanceStatus').textContent = balance > 0 ? 'Payment Due' : balance < 0 ? 'Advance Paid' : 'Fully Paid';
  balanceEl.className = balance > 0 ? 'balance-negative' : balance < 0 ? 'balance-positive' : '';

  new bootstrap.Modal(document.getElementById('paymentDetailsModal')).show();
}

// Main showPaymentDetails decides which to use
async function showPaymentDetails() {
  await loadWorkerSalaryType();
  if (workerSalaryType === 'monthly') {
    await showPaymentDetailsMonthly();
  } else {
    await showPaymentDetailsDaily();
  }
}

// Handle work form submit
document.getElementById('workForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('workDate').value;
  const spent = parseFloat(document.getElementById('spentAmount').value) || 0;
  const workDetails = document.getElementById('workDetails').value.trim();
  const spentDetails = document.getElementById('spentDetails').value.trim();
  if (!date || !workDetails || !spentDetails) {
    alert("Please fill all required fields");
    return;
  }

  const earning = workerSalaryType === 'daily' ? workerMonthlyAmount : 0;

  try {
    await db.collection('workRecords').add({
      uid,
      workerName,
      date,
      spent,
      earning,
      workDetails,
      spentDetails,
      isPaid: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
});

// Expose to global
window.logout = logout;
window.openEditModal = openEditModal;
window.deleteWorkRecord = deleteWorkRecord;
window.applyDateFilter = applyDateFilter;
window.clearDateFilter = clearDateFilter;
window.showPaymentDetails = showPaymentDetails;
window.showMyWorks = fetchMyWorks;
