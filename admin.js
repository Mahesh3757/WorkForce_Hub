// Initialize Firebase
const db = firebase.firestore();

// Global variables
let allWorkers = [];
let allRecords = [];
let allPayments = [];
let allSalaries = {}; // To store salary information

// Logout function
function logout() {
  localStorage.clear();
  window.location.href = "admin.html";
}

// Tab switching functionality
document.getElementById('workersTab').addEventListener('click', () => {
  document.getElementById('workersView').style.display = 'block';
  document.getElementById('recordsView').style.display = 'none';
  document.getElementById('analyticsView').style.display = 'none';
  document.getElementById('paymentsView').style.display = 'none';
  
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.getElementById('workersTab').classList.add('active');
  
  fetchAllWorkers();
});

document.getElementById('recordsTab').addEventListener('click', () => {
  document.getElementById('workersView').style.display = 'none';
  document.getElementById('recordsView').style.display = 'block';
  document.getElementById('analyticsView').style.display = 'none';
  document.getElementById('paymentsView').style.display = 'none';
  
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.getElementById('recordsTab').classList.add('active');
  
  fetchAllRecords();
});

document.getElementById('analyticsTab').addEventListener('click', () => {
  document.getElementById('workersView').style.display = 'none';
  document.getElementById('recordsView').style.display = 'none';
  document.getElementById('analyticsView').style.display = 'block';
  document.getElementById('paymentsView').style.display = 'none';
  
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.getElementById('analyticsTab').classList.add('active');
  
  updateAnalytics();
});

document.getElementById('paymentsTab').addEventListener('click', () => {
  document.getElementById('workersView').style.display = 'none';
  document.getElementById('recordsView').style.display = 'none';
  document.getElementById('analyticsView').style.display = 'none';
  document.getElementById('paymentsView').style.display = 'block';
  
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.getElementById('paymentsTab').classList.add('active');
  
  fetchAllPayments();
});

// Fetch all workers from Firestore
async function fetchAllWorkers() {
  try {
    const workersContainer = document.getElementById('workersContainer');
    workersContainer.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading workers...</p>
      </div>
    `;
    
    // First fetch all salary information
    const salariesSnapshot = await db.collection('salaries').get();
    allSalaries = {};
    salariesSnapshot.forEach(doc => {
      allSalaries[doc.id] = doc.data();
    });
    
    const snapshot = await db.collection('workers').get();
    allWorkers = [];
    
    if (snapshot.empty) {
      workersContainer.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
          <p>No workers found</p>
        </div>
      `;
      return;
    }
    
    const workerPromises = snapshot.docs.map(async (doc) => {
      const workerData = doc.data();
      const workerId = doc.id;
      const salaryInfo = allSalaries[workerId] || { salaryType: 'daily', monthlyAmount: 0 };
      
      const recordsSnapshot = await db.collection('workRecords')
        .where('uid', '==', workerId)
        .get();
      
      let totalSpent = 0;
      let totalEarning = 0;
      
      recordsSnapshot.forEach(recordDoc => {
        const recordData = recordDoc.data();
        totalSpent += parseFloat(recordData.spent) || 0;
        totalEarning += parseFloat(recordData.earning) || 0;
      });

      // For monthly workers, add their monthly salary to total earning
      if (salaryInfo.salaryType === 'monthly') {
        totalEarning += parseFloat(salaryInfo.monthlyAmount) || 0;
      }

      const paymentsSnapshot = await db.collection('payments')
        .where('workerId', '==', workerId)
        .get();
      
      let totalPayments = 0;
      paymentsSnapshot.forEach(paymentDoc => {
        totalPayments += parseFloat(paymentDoc.data().amount) || 0;
      });

      const balanceDue = totalEarning - totalPayments + totalSpent;
      
      return {
        id: workerId,
        ...workerData,
        totalSpent,
        totalEarning,
        totalPayments,
        balanceDue,
        recordCount: recordsSnapshot.size,
        salaryType: salaryInfo.salaryType,
        monthlySalary: salaryInfo.monthlyAmount || 0
      };
    });
    
    allWorkers = await Promise.all(workerPromises);
    renderWorkers(allWorkers);
    
  } catch (error) {
    console.error("Error fetching workers:", error);
    document.getElementById('workersContainer').innerHTML = `
      <div class="col-12 text-center py-5 text-danger">
        <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
        <p>Failed to load workers. Please try again.</p>
        <button class="btn btn-sm btn-primary" onclick="fetchAllWorkers()">Retry</button>
      </div>
    `;
  }
}
// Render workers in the workers view
function renderWorkers(workers) {
  const workersContainer = document.getElementById('workersContainer');
  workersContainer.innerHTML = '';
  
  if (workers.length === 0) {
    workersContainer.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
        <p>No workers found</p>
      </div>
    `;
    return;
  }
  
  workers.forEach(worker => {
    const workerCard = document.createElement('div');
    workerCard.className = 'col-md-4 mb-4';
    
    // Determine badge and icon based on salary type
    const salaryBadge = worker.salaryType === 'monthly' ? 
      `<span class="badge bg-success me-1"><i class="fas fa-calendar-alt me-1"></i>Monthly</span>` : 
      `<span class="badge bg-info me-1"><i class="fas fa-calendar-day me-1"></i>Daily</span>`;
    
    // Add monthly salary if applicable
    const monthlySalaryDisplay = worker.salaryType === 'monthly' ? 
      `<div class="mt-2">
        <small class="text-muted">Monthly Salary</small>
        <p class="mb-0">₹${worker.monthlySalary.toFixed(2)}</p>
      </div>` : '';
    
    workerCard.innerHTML = `
      <div class="card worker-card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="card-title">${worker.name || worker.id || 'Unknown Worker'}</h5>
              <p class="card-text text-muted mb-1">
                <i class="fas fa-id-card me-1"></i> ${worker.id}
              </p>
              ${salaryBadge}
              ${monthlySalaryDisplay}
            </div>
            <span class="badge bg-primary rounded-pill">${worker.recordCount} records</span>
          </div>
          <hr>
          <div class="d-flex justify-content-between">
            <div>
              <small class="text-muted">Total Spent</small>
              <p class="mb-0">₹${worker.totalSpent.toFixed(2)}</p>
            </div>
            <div>
              <small class="text-muted">Total Earnings</small>
              <p class="mb-0">₹${worker.totalEarning.toFixed(2)}</p>
            </div>
            <div>
              <small class="text-muted">Balance Due</small>
              <p class="mb-0 ${worker.balanceDue > 0 ? 'text-danger' : 'text-success'}">
                ₹${worker.balanceDue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        <div class="card-footer bg-transparent">
          <button class="btn btn-sm btn-outline-primary w-100" 
                  onclick="showWorkerDetails('${worker.id}')">
            <i class="fas fa-eye me-1"></i> View Details
          </button>
        </div>
      </div>
    `;
    workersContainer.appendChild(workerCard);
  });
}

async function showWorkerDetails(workerId) {
  try {
    const worker = allWorkers.find(w => w.id === workerId);
    if (!worker) {
      throw new Error("Worker not found");
    }

    // Set basic worker info
    const workerModalTitle = document.getElementById('workerModalTitle');
    const workerDetailName = document.getElementById('workerDetailName');
    const workerDetailContact = document.getElementById('workerDetailContact');
    
    if (workerModalTitle) workerModalTitle.textContent = worker.name || worker.id || 'Worker Details';
    if (workerDetailName) workerDetailName.textContent = worker.name || worker.id || 'Unknown Worker';
    if (workerDetailContact) workerDetailContact.textContent = worker.phone ? `Phone: ${worker.phone}` : 'No contact info';

    // Get salary info (default to daily if not set)
    const salaryInfo = allSalaries[workerId] || { salaryType: 'daily', monthlyAmount: 0, dailyAmount: 0 };
    const workerSalaryTypeEl = document.getElementById('workerSalaryType');
    const workerMonthlySalaryEl = document.getElementById('workerMonthlySalary');
    
    if (workerSalaryTypeEl) workerSalaryTypeEl.textContent = salaryInfo.salaryType === 'monthly' ? 'Monthly Salary' : 'Daily Worker';
    if (workerMonthlySalaryEl) {
      if (salaryInfo.salaryType === 'monthly') {
        workerMonthlySalaryEl.textContent = `₹${salaryInfo.monthlyAmount.toFixed(2)}`;
      } else {
        workerMonthlySalaryEl.textContent = `₹${salaryInfo.dailyAmount.toFixed(2)} per day`;
      }
    }

    // Calculate total earnings, spent, and payments
    const [workRecordsSnapshot, paymentRecordsSnapshot] = await Promise.all([
      db.collection('workRecords').where('uid', '==', workerId).get(),
      db.collection('payments').where('workerId', '==', workerId).get()
    ]);

    let totalSpent = 0;
    let totalEarnings = 0;
    let totalPayments = 0;
    let totalWorkEarnings = 0; // New variable to track work-specific earnings

    // Calculate total spent from work records
    workRecordsSnapshot.forEach(doc => {
      const data = doc.data();
      totalSpent += parseFloat(data.spent) || 0;
      
      // For daily workers, sum up the earnings from each work record
      if (salaryInfo.salaryType === 'daily') {
        totalWorkEarnings += parseFloat(data.earning) || 0;
      }
    });

    if (salaryInfo.salaryType === 'monthly') {
      // Monthly worker: Salary + Spent (unchanged)
      totalEarnings = parseFloat(salaryInfo.monthlyAmount) + totalSpent;
    } else {
      // Daily worker: Sum of earnings from each work record + Spent
      // This ensures we're using the actual recorded earnings rather than calculating
      totalEarnings = totalWorkEarnings + totalSpent;
      
      // If no earnings recorded (legacy data), fall back to calculation
      if (totalWorkEarnings === 0 && workRecordsSnapshot.size > 0) {
        totalEarnings = (parseFloat(salaryInfo.dailyAmount) * workRecordsSnapshot.size) + totalSpent;
      }
    }

    // Calculate total payments received
    paymentRecordsSnapshot.forEach(doc => {
      totalPayments += parseFloat(doc.data().amount) || 0;
    });


    // Calculate balance
    const balance = totalEarnings - totalPayments;
    // Display totals
    const workerTotalSpentEl = document.getElementById('workerTotalSpent');
    const workerTotalEarningEl = document.getElementById('workerTotalEarning');
    const netBalanceElement = document.getElementById('workerNetBalance');
    
    if (workerTotalSpentEl) workerTotalSpentEl.textContent = `₹${totalSpent.toFixed(2)}`;
    if (workerTotalEarningEl) workerTotalEarningEl.textContent = `₹${totalEarnings.toFixed(2)}`;
    
    if (netBalanceElement) {
      netBalanceElement.textContent = `₹${balance.toFixed(2)}`;
      netBalanceElement.className = balance > 0 ? 'text-danger' : 'text-success';
    }

    // Add payment button
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    if (addPaymentBtn) {
      addPaymentBtn.onclick = () => openAddPaymentModal(workerId);
    }

    // Load worker's records table
    const recordsBody = document.getElementById('workerRecordsBody');
    if (recordsBody) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center">
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            Loading records...
          </td>
        </tr>
      `;

      // Get sorted records for display
      const [sortedWorkRecords, sortedPaymentRecords] = await Promise.all([
        db.collection('workRecords')
          .where('uid', '==', workerId)
          .orderBy('date', 'desc')
          .get(),
        db.collection('payments')
          .where('workerId', '==', workerId)
          .orderBy('date', 'desc')
          .get()
      ]);

      recordsBody.innerHTML = '';

      // Add work records to table
      sortedWorkRecords.forEach(doc => {
        const data = doc.data();
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${data.date || 'N/A'}</td>
          <td><span class="badge bg-primary">Work</span></td>
          <td>${data.workDetails || ''}</td>
          <td>₹${parseFloat(data.spent || 0).toFixed(2)}</td>
          <td class="text-success">+₹${parseFloat(data.earning || 0).toFixed(2)}</td>
          <td>${data.spentDetails || ''}</td>
          <td>
            <button onclick="deleteRecord('${doc.id}')" 
                    class="btn btn-sm btn-outline-danger">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;
        recordsBody.appendChild(row);
      });

      // Add payment records to table
      sortedPaymentRecords.forEach(doc => {
        const data = doc.data();
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${data.date || 'N/A'}</td>
          <td><span class="badge bg-danger">Payment</span></td>
          <td>${data.note || 'Payment'}</td>
          <td></td>
          <td class="text-danger">-₹${parseFloat(data.amount || 0).toFixed(2)}</td>
          <td>${data.method || ''}</td>
          <td>
            <button onclick="deletePayment('${doc.id}', '${workerId}')" 
                    class="btn btn-sm btn-outline-danger">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;
        recordsBody.appendChild(row);
      });

      if (sortedWorkRecords.empty && sortedPaymentRecords.empty) {
        recordsBody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center text-muted py-4">
              No records found for this worker
            </td>
          </tr>
        `;
      }
    }

  } catch (error) {
    console.error("Error in showWorkerDetails:", error);
    const recordsBody = document.getElementById('workerRecordsBody');
    if (recordsBody) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            Error: ${error.message || "Failed to load worker details"}
          </td>
        </tr>
      `;
    }
  }

  const workerModalElement = document.getElementById('workerModal');
  if (workerModalElement) {
    const workerModal = new bootstrap.Modal(workerModalElement);
    workerModal.show();
  }
}
// Fetch all work records
async function fetchAllRecords() {
  try {
    const recordsTableBody = document.getElementById('recordsTableBody');
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          Loading records...
        </td>
      </tr>
    `;
    
    const snapshot = await db.collection('workRecords')
      .orderBy('date', 'desc')
      .get();
    
    allRecords = [];
    let totalSpent = 0;
    let totalEarning = 0;
    
    if (snapshot.empty) {
      recordsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            No work records found
          </td>
        </tr>
      `;
      return;
    }
    
    const recordPromises = snapshot.docs.map(async (doc) => {
      const recordData = doc.data();
      const workerId = recordData.uid;
      
      let workerName = 'Unknown Worker';
      try {
        const workerDoc = await db.collection('workers').doc(workerId).get();
        if (workerDoc.exists) {
          workerName = workerDoc.data().id || workerId;
        }
      } catch (error) {
        console.error("Error fetching worker name:", error);
      }
      
      return {
        id: doc.id,
        ...recordData,
        workerName,
        workerId
      };
    });
    
    allRecords = await Promise.all(recordPromises);
    renderRecords(allRecords);
    
    updateWorkerFilter();
    
  } catch (error) {
    console.error("Error fetching records:", error);
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger py-4">
          Failed to load records. Please try again.
        </td>
      </tr>
    `;
  }
}

// Render records in the records view
function renderRecords(records) {
  const recordsTableBody = document.getElementById('recordsTableBody');
  recordsTableBody.innerHTML = '';
  
  if (records.length === 0) {
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          No records found matching your criteria
        </td>
      </tr>
    `;
    return;
  }
  
  let totalSpent = 0;
  let totalEarning = 0;
  
  records.forEach(record => {
    const spent = parseFloat(record.spent) || 0;
    const earning = parseFloat(record.earning) || 0;
    
    totalSpent += spent;
    totalEarning += earning;
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${record.date || 'N/A'}</td>
      <td>
        <a href="#" onclick="showWorkerDetails('${record.workerId}'); return false;">
          ${record.workerName || record.workerId}
        </a>
      </td>
      <td>${record.workDetails || ''}</td>
      <td>₹${spent.toFixed(2)}</td>
      <td>${record.spentDetails || ''}</td>
      <td>₹${earning.toFixed(2)}</td>
      <td>
        <button onclick="openEditRecordModal('${record.id}')" 
                class="btn btn-sm btn-outline-primary">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="deleteRecord('${record.id}')" 
                class="btn btn-sm btn-outline-danger ms-1">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    recordsTableBody.appendChild(row);
  });
  
  document.getElementById('totalAllSpent').textContent = `₹${totalSpent.toFixed(2)}`;
  document.getElementById('totalAllEarning').textContent = `₹${totalEarning.toFixed(2)}`;
}

// Update worker filter dropdown
function updateWorkerFilter() {
  const filterWorker = document.getElementById('filterWorker');
  const uniqueWorkers = [...new Set(allRecords.map(record => record.workerId))];
  
  while (filterWorker.options.length > 1) {
    filterWorker.remove(1);
  }
  
  uniqueWorkers.forEach(workerId => {
    const worker = allWorkers.find(w => w.id === workerId) || 
                  allRecords.find(r => r.workerId === workerId);
    if (worker) {
      const option = document.createElement('option');
      option.value = workerId;
      option.textContent = worker.id || worker.id || 'Unknown Worker';
      filterWorker.appendChild(option);
    }
  });
}

// Filter records based on filters
function filterRecords() {
  const fromDate = document.getElementById('filterFromDate').value;
  const toDate = document.getElementById('filterToDate').value;
  const monthFilter = document.getElementById('filterMonth').value;
  const workerFilter = document.getElementById('filterWorker').value;
  
  let filteredRecords = [...allRecords];
  
  // Date range filter
  if (fromDate || toDate) {
    filteredRecords = filteredRecords.filter(record => {
      const recordDate = record.date;
      if (!recordDate) return false;
      
      const datePassesFrom = !fromDate || recordDate >= fromDate;
      const datePassesTo = !toDate || recordDate <= toDate;
      
      return datePassesFrom && datePassesTo;
    });
  }
  
  // Month filter
  if (monthFilter) {
    filteredRecords = filteredRecords.filter(record => {
      if (!record.date) return false;
      return record.date.split('-')[1] === monthFilter;
    });
  }
  
  // Worker filter
  if (workerFilter) {
    filteredRecords = filteredRecords.filter(record => record.workerId === workerFilter);
  }
  
  renderRecords(filteredRecords);
}

// Reset all filters
function resetFilters() {
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterWorker').value = '';
  
  renderRecords(allRecords);
}

// Open edit record modal
async function openEditRecordModal(recordId) {
  const record = allRecords.find(r => r.id === recordId);
  if (!record) return;
  
  document.getElementById('editRecordId').value = record.id;
  document.getElementById('editRecordDate').value = record.date || '';
  document.getElementById('editRecordWorkDetails').value = record.workDetails || '';
  document.getElementById('editRecordSpentAmount').value = record.spent || 0;
  document.getElementById('editRecordSpentDetails').value = record.spentDetails || '';
  
  const workerSelect = document.getElementById('editRecordWorker');
  workerSelect.innerHTML = '';
  
  allWorkers.forEach(worker => {
    const option = document.createElement('option');
    option.value = worker.id;
    option.textContent = worker.name || 'Unknown Worker';
    option.selected = worker.id === record.workerId;
    workerSelect.appendChild(option);
  });
  
  const editModal = new bootstrap.Modal(document.getElementById('editRecordModal'));
  editModal.show();
}

// Save edited record
document.getElementById('saveRecordEditBtn').addEventListener('click', async () => {
  const recordId = document.getElementById('editRecordId').value;
  const workerId = document.getElementById('editRecordWorker').value;
  const date = document.getElementById('editRecordDate').value;
  const workDetails = document.getElementById('editRecordWorkDetails').value.trim();
  const spentAmount = parseFloat(document.getElementById('editRecordSpentAmount').value) || 0;
  const spentDetails = document.getElementById('editRecordSpentDetails').value.trim();
  
  if (!date || !workDetails || !spentDetails) {
    alert("Please fill all required fields");
    return;
  }
  
  try {
    const workerDoc = await db.collection('workers').doc(workerId).get();
    const workerName = workerDoc.exists ? workerDoc.data().id : 'Unknown Worker';
    
    await db.collection('workRecords').doc(recordId).update({
      uid: workerId,
      workerName,
      date,
      workDetails,
      spent: spentAmount,
      spentDetails,
      earning: 500 + spentAmount,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    alert("Record updated successfully!");
    bootstrap.Modal.getInstance(document.getElementById('editRecordModal')).hide();
    fetchAllRecords();
    fetchAllWorkers();
    
  } catch (error) {
    console.error("Error updating record:", error);
    alert("Failed to update record: " + error.message);
  }
});

// Delete a record
async function deleteRecord(recordId) {
  if (!confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
    return;
  }
  
  try {
    await db.collection('workRecords').doc(recordId).delete();
    alert("Record deleted successfully!");
    fetchAllRecords();
    fetchAllWorkers();
    
  } catch (error) {
    console.error("Error deleting record:", error);
    alert("Failed to delete record: " + error.message);
  }
}

// Fetch all payments
async function fetchAllPayments() {
  try {
    const paymentsTableBody = document.getElementById('paymentsTableBody');
    paymentsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          Loading payments...
        </td>
      </tr>
    `;
    
    const snapshot = await db.collection('payments')
      .orderBy('date', 'desc')
      .get();
    
    allPayments = [];
    let totalPayments = 0;
    
    if (snapshot.empty) {
      paymentsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            No payment records found
          </td>
        </tr>
      `;
      return;
    }
    
    const paymentPromises = snapshot.docs.map(async (doc) => {
      const paymentData = doc.data();
      const workerId = paymentData.workerId;
      
      let workerName = 'Unknown Worker';
      try {
        const workerDoc = await db.collection('workers').doc(workerId).get();
        if (workerDoc.exists) {
          workerName = workerDoc.data().id || workerId;
        }
      } catch (error) {
        console.error("Error fetching worker name:", error);
      }
      
      return {
        id: doc.id,
        ...paymentData,
        workerName,
        workerId
      };
    });
    
    allPayments = await Promise.all(paymentPromises);
    renderPayments(allPayments);
    
  } catch (error) {
    console.error("Error fetching payments:", error);
    paymentsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          Failed to load payments. Please try again.
        </td>
      </tr>
    `;
  }
}

// Render payments in the payments view
function renderPayments(payments) {
  const paymentsTableBody = document.getElementById('paymentsTableBody');
  paymentsTableBody.innerHTML = '';
  
  if (payments.length === 0) {
    paymentsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          No payment records found
        </td>
      </tr>
    `;
    return;
  }
  
  let totalAmount = 0;
  
  payments.forEach(payment => {
    const amount = parseFloat(payment.amount) || 0;
    totalAmount += amount;
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${payment.date || 'N/A'}</td>
      <td>
        <a href="#" onclick="showWorkerDetails('${payment.workerId}'); return false;">
          ${payment.workerId || payment.workerId}
        </a>
      </td>
      <td class="text-danger">₹${amount.toFixed(2)}</td>
      <td>${payment.method || ''}</td>
      <td>${payment.note || ''}</td>
      <td>
        <button onclick="deletePayment('${payment.id}', '${payment.workerId}')" 
                class="btn btn-sm btn-outline-danger">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    paymentsTableBody.appendChild(row);
  });
  
  document.getElementById('totalPaymentsAmount').textContent = `₹${totalAmount.toFixed(2)}`;
}

// Open add payment modal
function openAddPaymentModal(workerId) {
  document.getElementById('paymentWorkerId').value = workerId;
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('paymentMethod').value = 'cash';
  document.getElementById('paymentNote').value = '';
  
  const paymentModal = new bootstrap.Modal(document.getElementById('addPaymentModal'));
  paymentModal.show();
}

// Save payment
async function savePayment() {
  const workerId = document.getElementById('paymentWorkerId').value;
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const date = document.getElementById('paymentDate').value;
  const method = document.getElementById('paymentMethod').value;
  const note = document.getElementById('paymentNote').value.trim();

  if (!workerId || isNaN(amount) || amount <= 0 || !date) {
    alert("Please enter valid payment details");
    return;
  }

  try {
    await db.collection('payments').add({
      workerId,
      amount,
      date,
      method,
      note,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Payment recorded successfully!");
    bootstrap.Modal.getInstance(document.getElementById('addPaymentModal')).hide();
    showWorkerDetails(workerId);
    fetchAllWorkers();
    fetchAllPayments();
    
  } catch (error) {
    console.error("Error saving payment:", error);
    alert("Failed to record payment: " + error.message);
  }
}

// Delete payment
async function deletePayment(paymentId, workerId) {
  if (!confirm("Are you sure you want to delete this payment record?")) {
    return;
  }

  try {
    await db.collection('payments').doc(paymentId).delete();
    alert("Payment record deleted successfully!");
    showWorkerDetails(workerId);
    fetchAllWorkers();
    fetchAllPayments();
    
  } catch (error) {
    console.error("Error deleting payment:", error);
    alert("Failed to delete payment: " + error.message);
  }
}

// Update analytics view
async function updateAnalytics() {
  document.getElementById('totalWorkers').textContent = allWorkers.length;
  
  const totalSpent = allWorkers.reduce((sum, worker) => sum + worker.totalSpent, 0);
  const totalEarning = allWorkers.reduce((sum, worker) => sum + worker.totalEarning, 0);
  const totalPayments = allWorkers.reduce((sum, worker) => sum + worker.totalPayments, 0);
  const netBalance = totalEarning - totalPayments;
  
  document.getElementById('totalAnalyticsSpent').textContent = `₹${totalSpent.toFixed(2)}`;
  document.getElementById('totalAnalyticsEarning').textContent = `₹${totalEarning.toFixed(2)}`;
  
  const netBalanceElement = document.getElementById('netBalance');
  netBalanceElement.textContent = `₹${netBalance.toFixed(2)}`;
  netBalanceElement.className = netBalance >= 0 ? 'text-success' : 'text-danger';
  
  prepareChartData();
}

// Prepare data for charts
function prepareChartData() {
  const monthlySpending = {};
  const monthlyEarning = {};
  const monthlyPayments = {};
  
  allRecords.forEach(record => {
    if (!record.date) return;
    
    const date = new Date(record.date);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlySpending[monthYear]) {
      monthlySpending[monthYear] = 0;
      monthlyEarning[monthYear] = 0;
    }
    
    monthlySpending[monthYear] += parseFloat(record.spent) || 0;
    monthlyEarning[monthYear] += parseFloat(record.earning) || 0;
  });

  allPayments.forEach(payment => {
    if (!payment.date) return;
    
    const date = new Date(payment.date);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyPayments[monthYear]) {
      monthlyPayments[monthYear] = 0;
    }
    
    monthlyPayments[monthYear] += parseFloat(payment.amount) || 0;
  });
  
  const sortedMonths = Object.keys(monthlySpending).sort();
  
  const spendingChartCtx = document.getElementById('spendingChart').getContext('2d');
  new Chart(spendingChartCtx, {
    type: 'bar',
    data: {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Spending',
          data: sortedMonths.map(month => monthlySpending[month]),
          backgroundColor: 'rgba(255, 99, 132, 0.7)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        },
        {
          label: 'Earnings',
          data: sortedMonths.map(month => monthlyEarning[month]),
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'Payments',
          data: sortedMonths.map(month => monthlyPayments[month] || 0),
          backgroundColor: 'rgba(255, 159, 64, 0.7)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
  
  const workersByEarning = [...allWorkers]
    .sort((a, b) => b.totalEarning - a.totalEarning)
    .slice(0, 5);
  
  const workerChartCtx = document.getElementById('workerChart').getContext('2d');
  new Chart(workerChartCtx, {
    type: 'bar',
    data: {
      labels: workersByEarning.map(worker => worker.id || 'Unknown'),
      datasets: [
        {
          label: 'Earnings',
          data: workersByEarning.map(worker => worker.totalEarning),
          backgroundColor: 'rgba(75, 192, 192, 0.7)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Payments',
          data: workersByEarning.map(worker => worker.totalPayments),
          backgroundColor: 'rgba(255, 159, 64, 0.7)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Start with workers view
  fetchAllWorkers();
  
  // Verify Firebase connection
  db.collection('test').doc('test').get()
    .then(() => console.log("Firestore connection OK"))
    .catch(err => console.error("Firestore connection failed:", err));
});

// Make functions available globally
window.showWorkerDetails = showWorkerDetails;
window.openEditRecordModal = openEditRecordModal;
window.deleteRecord = deleteRecord;
window.filterRecords = filterRecords;
window.openAddPaymentModal = openAddPaymentModal;
window.savePayment = savePayment;
window.deletePayment = deletePayment;
window.logout = logout;
