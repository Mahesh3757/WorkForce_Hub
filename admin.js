// Initialize Firebase
const db = firebase.firestore();

// Global variables
let allWorkers = [];
let allRecords = [];
let allPayments = [];
let allSalaries = {}; // To store salary information

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
      let totalWorkEarnings = 0;
      
      recordsSnapshot.forEach(recordDoc => {
        const recordData = recordDoc.data();
        totalSpent += parseFloat(recordData.spent) || 0;
        totalWorkEarnings += parseFloat(recordData.earning) || 0;
      });

      const paymentsSnapshot = await db.collection('payments')
        .where('workerId', '==', workerId)
        .get();
      
      let totalPayments = 0;
      paymentsSnapshot.forEach(paymentDoc => {
        totalPayments += parseFloat(paymentDoc.data().amount) || 0;
      });

      // Calculate balance using period logic for monthly / hybrid workers
      // Period type (1 or 15) and effective date from salary settings
      let balanceDue = 0;
      
      if (salaryInfo.salaryType === 'monthly' || salaryInfo.salaryType === 'hybrid') {
        const today = new Date();
        const periodDay = parseInt(salaryInfo.periodType) || 15;
        const effectiveFrom = salaryInfo.periodEffectiveFrom || null;
        
        // Define current period based on periodDay (1 or 15)
        let startDate, endDate;
        if (today.getDate() >= periodDay) {
          startDate = new Date(today.getFullYear(), today.getMonth(), periodDay);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, periodDay);
        } else {
          startDate = new Date(today.getFullYear(), today.getMonth() - 1, periodDay);
          endDate = new Date(today.getFullYear(), today.getMonth(), periodDay);
        }
        const startStr = startDate.toISOString().split('T')[0];

        // Calculate current period expenses
        let currentPeriodExpenses = 0;
        recordsSnapshot.forEach(recordDoc => {
          const recordData = recordDoc.data();
          const dateStr = recordData.date;
          if (typeof dateStr === 'string' && dateStr >= startStr && dateStr < endDate.toISOString().split('T')[0]) {
            currentPeriodExpenses += parseFloat(recordData.spent) || 0;
          }
        });

        // Calculate cumulative balance from previous periods
        // Count salary periods from earliest work date (record-based)
        let cumulativeBalance = 0;
        
        let earliestWorkDate = new Date();
        recordsSnapshot.forEach(recordDoc => {
          const recordData = recordDoc.data();
          const dateStr = recordData.date;
          if (typeof dateStr === 'string') {
            const workDate = new Date(dateStr);
            if (workDate < earliestWorkDate) earliestWorkDate = workDate;
          }
        });

        let periodCount = 0;
        // Start counting from effectiveFrom date (if set), otherwise from earliest work
        let countFromDate = earliestWorkDate;
        if (effectiveFrom) {
          const effDate = new Date(effectiveFrom);
          if (effDate > earliestWorkDate) countFromDate = effDate;
        }
        
        let periodStart = new Date(countFromDate.getFullYear(), countFromDate.getMonth(), periodDay);
        if (countFromDate.getDate() > periodDay) {
          periodStart = new Date(countFromDate.getFullYear(), countFromDate.getMonth() + 1, periodDay);
        }
        while (periodStart < startDate) {
          periodCount++;
          periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, periodDay);
        }

        const totalSalaryEarned = periodCount * (salaryInfo.monthlyAmount || 0);

        // Previous periods expenses
        let previousPeriodsExpenses = 0;
        recordsSnapshot.forEach(recordDoc => {
          const recordData = recordDoc.data();
          const dateStr = recordData.date;
          if (typeof dateStr === 'string' && dateStr < startStr) {
            previousPeriodsExpenses += parseFloat(recordData.spent) || 0;
          }
        });
        
        // Payments before current period
        let totalPaymentsBeforePeriod = 0;
        paymentsSnapshot.forEach(paymentDoc => {
          const p = paymentDoc.data();
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
        
        cumulativeBalance = totalSalaryEarned + previousPeriodsExpenses - totalPaymentsBeforePeriod;
        
        // Current period earnings = monthly salary + expenses
        // Only add monthly salary if effectiveFrom is today or in the past
        const todayStr = today.toISOString().split('T')[0];
        const salaryStarted = !effectiveFrom || effectiveFrom <= todayStr;
        const currentPeriodSalary = salaryStarted ? (salaryInfo.monthlyAmount || 0) : 0;
        const currentPeriodEarnings = currentPeriodSalary + currentPeriodExpenses;
        
        // Total earnings = cumulative balance + current period earnings
        const totalEarnings = cumulativeBalance + currentPeriodEarnings;
        
        // Calculate payments received in current period
        let totalReceivedInPeriod = 0;
        paymentsSnapshot.forEach(paymentDoc => {
          const p = paymentDoc.data();
          let paymentDateStr;
          
          if (p.date?.toDate) {
            paymentDateStr = p.date.toDate().toISOString().split('T')[0];
          } else if (typeof p.date === 'string') {
            paymentDateStr = p.date;
          }
          
          if (paymentDateStr && paymentDateStr >= startStr && paymentDateStr < endDate.toISOString().split('T')[0]) {
            totalReceivedInPeriod += parseFloat(p.amount) || 0;
          }
        });
        
        // Calculate final balance
        // For hybrid, also include daily earnings from work records
        const dailyPart = salaryInfo.salaryType === 'hybrid' ? totalWorkEarnings : 0;
        balanceDue = totalEarnings + dailyPart - totalReceivedInPeriod;
      } else {
        // For daily workers, use simple calculation
        balanceDue = totalWorkEarnings + totalSpent - totalPayments;
      }
      
      return {
        id: workerId,
        ...workerData,
        totalSpent,
        totalEarning: (salaryInfo.salaryType === 'monthly' || salaryInfo.salaryType === 'hybrid')
          ? (totalWorkEarnings + (salaryInfo.monthlyAmount || 0))
          : totalWorkEarnings,
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
    
    // Determine badge based on salary type
    let salaryBadge = '';
    if (worker.salaryType === 'monthly') {
      salaryBadge = `<span class="badge bg-success me-1"><i class="fas fa-calendar-alt me-1"></i>Monthly</span>`;
    } else if (worker.salaryType === 'hybrid') {
      salaryBadge = `<span class="badge bg-warning text-dark me-1"><i class="fas fa-layer-group me-1"></i>Daily+Monthly</span>`;
    } else {
      salaryBadge = `<span class="badge bg-info me-1"><i class="fas fa-calendar-day me-1"></i>Daily</span>`;
    }
    
    const monthlySalaryDisplay = (worker.salaryType === 'monthly' || worker.salaryType === 'hybrid') ? 
      `<div class="mt-2">
        <small class="text-muted">Monthly Fixed</small>
        <p class="mb-0">₹${(worker.monthlySalary || 0).toFixed(2)}</p>
      </div>` : '';
    
    workerCard.innerHTML = `
      <div class="card worker-card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="card-title">${worker.name || worker.id || "Unknown Worker"}</h5>
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
              <p class="mb-0 ${worker.balanceDue > 0 ? "text-danger" : "text-success"}">
                ₹${worker.balanceDue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        <div class="card-footer bg-transparent d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary flex-fill" 
              onclick="showWorkerDetails('${worker.id}')">
              <i class="fas fa-eye me-1"></i> View
            </button>
           <button class="btn btn-sm btn-outline-danger flex-fill" 
               onclick="deleteWorker('${worker.id}')">
               <i class="fas fa-trash me-1"></i> Delete
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

    // Get salary info
    const salaryInfo = allSalaries[workerId] || { salaryType: 'daily', monthlyAmount: 0, dailyAmount: 0 };
    const workerSalaryTypeEl = document.getElementById('workerSalaryType');
    const workerMonthlySalaryEl = document.getElementById('workerMonthlySalary');
    
    if (workerSalaryTypeEl) {
      if (salaryInfo.salaryType === 'monthly') workerSalaryTypeEl.textContent = 'Monthly Salary';
      else if (salaryInfo.salaryType === 'hybrid') workerSalaryTypeEl.textContent = 'Daily + Monthly Fixed';
      else workerSalaryTypeEl.textContent = 'Daily Worker';
    }
    if (workerMonthlySalaryEl) {
      if (salaryInfo.salaryType === 'monthly' || salaryInfo.salaryType === 'hybrid') {
        workerMonthlySalaryEl.textContent = `₹${(salaryInfo.monthlyAmount || 0).toFixed(2)} fixed`;
      } else {
        workerMonthlySalaryEl.textContent = `₹${(salaryInfo.dailyAmount || salaryInfo.monthlyAmount || 0).toFixed(2)} per day`;
      }
    }

    // Fetch records
    const [workRecordsSnapshot, paymentRecordsSnapshot] = await Promise.all([
      db.collection('workRecords').where('uid', '==', workerId).get(),
      db.collection('payments').where('workerId', '==', workerId).get()
    ]);

    let totalSpent = 0;
    let totalPayments = 0;
    let totalWorkEarnings = 0;

    // Owner-wise balance calculation
    const ownerBalances = { Swapnil: 0, Shubham: 0 };

    workRecordsSnapshot.forEach(doc => {
      const data = doc.data();
      const spent = parseFloat(data.spent) || 0;
      const earning = parseFloat(data.earning) || 0;
      totalSpent += spent;
      totalWorkEarnings += earning;

      const owner = data.ownerName;
      if (owner && ownerBalances.hasOwnProperty(owner)) {
        ownerBalances[owner] += earning + spent;
      } else {
        // No owner → assign to Swapnil
        ownerBalances.Swapnil += earning + spent;
      }
    });

    paymentRecordsSnapshot.forEach(doc => {
      const data = doc.data();
      const amount = parseFloat(data.amount) || 0;
      totalPayments += amount;

      const owner = data.owner;
      if (owner && ownerBalances.hasOwnProperty(owner)) {
        ownerBalances[owner] -= amount;
      } else {
        ownerBalances.Swapnil -= amount;
      }
    });

    // Add monthly salary to designated payer (for monthly/hybrid)
    if ((salaryInfo.salaryType === 'monthly' || salaryInfo.salaryType === 'hybrid') && salaryInfo.monthlyAmount > 0) {
      const payer = salaryInfo.salaryPayer || 'Swapnil';
      if (ownerBalances.hasOwnProperty(payer)) {
        ownerBalances[payer] += salaryInfo.monthlyAmount;
      }
    }

    const balance = worker.balanceDue;

    // Display totals
    const workerTotalSpentEl = document.getElementById('workerTotalSpent');
    const workerTotalEarningEl = document.getElementById('workerTotalEarning');
    const netBalanceElement = document.getElementById('workerNetBalance');
    
    if (workerTotalSpentEl) workerTotalSpentEl.textContent = `₹${totalSpent.toFixed(2)}`;
    if (workerTotalEarningEl) workerTotalEarningEl.textContent = `₹${worker.totalEarning.toFixed(2)}`;
    
    if (netBalanceElement) {
      netBalanceElement.textContent = `₹${balance.toFixed(2)}`;
      netBalanceElement.className = balance > 0 ? 'text-danger' : 'text-success';
    }

    // Show owner-wise balances
    const balanceContainer = document.querySelector('#workerModal .col-md-6.text-end .d-flex.flex-column');
    if (balanceContainer) {
      const old = balanceContainer.querySelector('.owner-balance');
      if (old) old.remove();

      const ownerDiv = document.createElement('div');
      ownerDiv.className = 'owner-balance mt-3 small';
      ownerDiv.innerHTML = `
        <div class="d-flex justify-content-between">
          <span>Swapnil Balance:</span>
          <strong class="${ownerBalances.Swapnil > 0 ? 'text-danger' : 'text-success'}">
            ₹${ownerBalances.Swapnil.toFixed(2)}
          </strong>
        </div>
        <div class="d-flex justify-content-between">
          <span>Shubham Balance:</span>
          <strong class="${ownerBalances.Shubham > 0 ? 'text-danger' : 'text-success'}">
            ₹${ownerBalances.Shubham.toFixed(2)}
          </strong>
        </div>
      `;
      balanceContainer.appendChild(ownerDiv);
    }

    // Add payment button
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    if (addPaymentBtn) {
      addPaymentBtn.onclick = () => openAddPaymentModal(workerId);
    }

    // Load records with tabs and pagination
    const PER_PAGE = 15;
    let workRecords = [];
    let paymentRecords = [];
    let workPage = 1;
    let paymentPage = 1;

    const [sortedWorkRecords, sortedPaymentRecords] = await Promise.all([
      db.collection('workRecords').where('uid', '==', workerId).orderBy('date', 'desc').get(),
      db.collection('payments').where('workerId', '==', workerId).orderBy('date', 'desc').get()
    ]);

    workRecords = sortedWorkRecords.docs.map(d => ({ id: d.id, ...d.data() }));
    paymentRecords = sortedPaymentRecords.docs.map(d => ({ id: d.id, ...d.data() }));

    function renderWorkPage() {
      const start = (workPage - 1) * PER_PAGE;
      const items = workRecords.slice(start, start + PER_PAGE);
      const body = document.getElementById('workRecordsBody');
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No work records</td></tr>';
      } else {
        body.innerHTML = items.map(r => `
          <tr>
            <td>${r.date || '—'}</td>
            <td>${r.workDetails || ''}</td>
            <td>${r.ownerName || '—'}</td>
            <td>₹${(r.spent || 0).toFixed(2)}</td>
            <td class="text-success">+₹${(r.earning || 0).toFixed(2)}</td>
            <td><button onclick="deleteRecord('${r.id}')" class="btn btn-sm btn-outline-danger"><i class="fas fa-trash"></i></button></td>
          </tr>
        `).join('');
      }
      renderPagination('workPagination', workPage, Math.ceil(workRecords.length / PER_PAGE), (p) => {
        workPage = p;
        renderWorkPage();
      });
    }

    function renderPaymentPage() {
      const start = (paymentPage - 1) * PER_PAGE;
      const items = paymentRecords.slice(start, start + PER_PAGE);
      const body = document.getElementById('paymentRecordsBody');
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No payments</td></tr>';
      } else {
        body.innerHTML = items.map(p => `
          <tr>
            <td>${p.date || '—'}</td>
            <td class="text-danger">-₹${(p.amount || 0).toFixed(2)}</td>
            <td>${p.method || ''}</td>
            <td>${p.owner || '—'}</td>
            <td>${p.note || ''}</td>
            <td><button onclick="deletePayment('${p.id}', '${workerId}')" class="btn btn-sm btn-outline-danger"><i class="fas fa-trash"></i></button></td>
          </tr>
        `).join('');
      }
      renderPagination('paymentPagination', paymentPage, Math.ceil(paymentRecords.length / PER_PAGE), (p) => {
        paymentPage = p;
        renderPaymentPage();
      });
    }

    function renderPagination(containerId, current, total, onChange) {
      const container = document.getElementById(containerId);
      if (!container || total <= 1) {
        if (container) container.innerHTML = '';
        return;
      }
      let html = '<ul class="pagination pagination-sm mb-0">';
      for (let i = 1; i <= total; i++) {
        html += `<li class="page-item ${i === current ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
      }
      html += '</ul>';
      container.innerHTML = html;
      container.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          onChange(parseInt(link.dataset.page));
        });
      });
    }

    renderWorkPage();
    renderPaymentPage();

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
    showModal('workerModal');
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
        <td colspan="9" class="text-center text-muted py-4">
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
      <td>${record.ownerName || '—'}</td>
      <td>${record.eventManager || '—'}</td>
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

  const totalSpentEl = document.getElementById('totalAllSpent');
  const totalEarningEl = document.getElementById('totalAllEarning');
  if (totalSpentEl) totalSpentEl.textContent = `₹${totalSpent.toFixed(2)}`;
  if (totalEarningEl) totalEarningEl.textContent = `₹${totalEarning.toFixed(2)}`;
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
  const ownerFilter = document.getElementById('filterOwner')?.value || '';

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

  // Owner filter
  if (ownerFilter) {
    filteredRecords = filteredRecords.filter(record => record.ownerName === ownerFilter);
  }

  renderRecords(filteredRecords);
}


// Reset all filters
function resetFilters() {
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterWorker').value = '';
  const ownerEl = document.getElementById('filterOwner');
  if (ownerEl) ownerEl.value = '';

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
  
  const editModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editRecordModal'));
  editModal.show();
}

// Save edited record
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveRecordEditBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
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

    // Determine earning based on salary type
    let earning = 0;
    const salaryInfo = allSalaries[workerId] || {};
    if (salaryInfo.salaryType === 'daily' || salaryInfo.salaryType === 'hybrid') {
      earning = parseFloat(salaryInfo.dailyAmount) || parseFloat(salaryInfo.monthlyAmount) || 0;
    }
    
    await db.collection('workRecords').doc(recordId).update({
      uid: workerId,
      workerName,
      date,
      workDetails,
      spent: spentAmount,
      spentDetails,
      earning,
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

// Delete worker and all related data
async function deleteWorker(workerId) {
  if (!confirm("Are you sure you want to delete this worker?\n\nThis will permanently delete:\n- Worker profile\n- All work records\n- All payment records\n- Salary data\n\nThis action cannot be undone!")) {
    return;
  }

  try {
    // Delete all work records
    const workRecords = await db.collection('workRecords').where('uid', '==', workerId).get();
    const workDeletePromises = workRecords.docs.map(doc => doc.ref.delete());
    await Promise.all(workDeletePromises);

    // Delete all payment records
    const payments = await db.collection('payments').where('workerId', '==', workerId).get();
    const paymentDeletePromises = payments.docs.map(doc => doc.ref.delete());
    await Promise.all(paymentDeletePromises);

    // Delete salary data
    await db.collection('salaries').doc(workerId).delete();

    // Delete worker document
    await db.collection('workers').doc(workerId).delete();

    alert("Worker and all related data deleted successfully!");
    fetchAllWorkers();
  } catch (error) {
    console.error("Error deleting worker:", error);
    alert("Failed to delete worker: " + error.message);
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
  
  const totalPaymentsEl = document.getElementById('totalPaymentsAmount');
  if (totalPaymentsEl) totalPaymentsEl.textContent = `₹${totalAmount.toFixed(2)}`;
}

// Open add payment modal
function openAddPaymentModal(workerId) {
  document.getElementById('paymentWorkerId').value = workerId;
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('paymentMethod').value = 'cash';
  document.getElementById('paymentNote').value = '';
  document.getElementById('paymentOwner').value = '';   // new
  const paymentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addPaymentModal'));
  paymentModal.show();
}

// Save payment
async function savePayment() {
  const workerId = document.getElementById('paymentWorkerId').value;
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const date = document.getElementById('paymentDate').value;
  const method = document.getElementById('paymentMethod').value;
  const note = document.getElementById('paymentNote').value.trim();
  const owner = document.getElementById('paymentOwner').value;   // new

  if (!workerId || isNaN(amount) || amount <= 0 || !date || !owner) {
    alert("Please enter valid payment details (including Owner)");
    return;
  }

  try {
    await db.collection('payments').add({
      workerId,
      amount,
      date,
      method,
      note,
      owner,          // new field
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
