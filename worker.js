// Initialize Firestore
const db = firebase.firestore();

// Get UID and name from localStorage
const uid = localStorage.getItem('workerUID');
const workerName = localStorage.getItem('workerName') || "Worker";

// Redirect if no UID (not logged in)
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

// Function to delete a work record
async function deleteWorkRecord(docId) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  
  try {
    await db.collection('workRecords').doc(docId).delete();
    alert("Record deleted successfully!");
    fetchMyWorks(); // Refresh the list
  } catch (error) {
    console.error("Error deleting record:", error);
    alert("Failed to delete record: " + error.message);
  }
}

// Function to open edit modal
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
        
        const editModal = new bootstrap.Modal(document.getElementById('editModal'));
        editModal.show();
      } else {
        alert("Record not found!");
      }
    })
    .catch(error => {
      console.error("Error fetching record:", error);
      alert("Failed to load record for editing.");
    });
}

// Function to save edited record
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

  try {
    await db.collection('workRecords').doc(docId).update({
      date,
      spent,
      earning: 500 + spent, // Assuming fixed calculation
      workDetails,
      spentDetails,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Record updated successfully!");
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    fetchMyWorks(); // Refresh the list
  } catch (error) {
    console.error("Error updating record:", error);
    alert("Failed to update record: " + error.message);
  }
});

// Function to apply date filter
function applyDateFilter() {
  fetchMyWorks();
}

// Function to clear date filter
function clearDateFilter() {
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  fetchMyWorks();
}

// Function to fetch and display work records with optional date filtering
async function fetchMyWorks() {
  try {
    const worksTableBody = document.getElementById('worksTableBody');
    worksTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading records...</td></tr>';
    
    const modal = new bootstrap.Modal(document.getElementById('worksModal'));
    modal.show();

    // Get filter values
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;

    let query = db.collection('workRecords')
      .where('uid', '==', uid);

    // Apply date filters if provided
    if (fromDate) {
      query = query.where('date', '>=', fromDate);
    }
    if (toDate) {
      query = query.where('date', '<=', toDate);
    }

    // Add ordering
    query = query.orderBy('date', 'desc');

    const snapshot = await query.get();
    
    worksTableBody.innerHTML = '';
    
    if (snapshot.empty) {
      worksTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No work records found</td></tr>';
      return;
    }

    let totalSpent = 0;
    let totalEarning = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const date = data.date || 'N/A';
      const spent = Number(data.spent) || 0;
      const earning = Number(data.earning) || 0;
      const isPaid = data.isPaid || false;
      
      totalSpent += spent;
      totalEarning += earning;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${date}</td>
        <td>${data.workDetails || ''}</td>
        <td>₹${spent.toFixed(2)}</td>
        <td>${data.spentDetails || ''}</td>
        <td>₹${earning.toFixed(2)}</td>
        <td>
          <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">
            ${isPaid ? 'Paid' : 'Pending'}
          </span>
        </td>
        <td>
          <button onclick="openEditModal('${doc.id}')" class="btn btn-sm btn-outline-primary">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteWorkRecord('${doc.id}')" class="btn btn-sm btn-outline-danger ms-1">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      worksTableBody.appendChild(row);
    });

    document.getElementById('totalSpent').textContent = `₹${totalSpent.toFixed(2)}`;
    document.getElementById('totalEarning').textContent = `₹${totalEarning.toFixed(2)}`;

  } catch (error) {
    console.error("fetchMyWorks failed:", error);
    document.getElementById('worksTableBody').innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger">
          Error loading data. Please try again.
          ${error.code ? `<br><small>Error code: ${error.code}</small>` : ''}
        </td>
      </tr>`;
  }
}

// Function to show payment details and balance
async function showPaymentDetails() {
  try {
    // Get work records
    const workRecordsSnapshot = await db.collection('workRecords')
      .where('uid', '==', uid)
      .get();
    
    let totalEarnings = 0;
    workRecordsSnapshot.forEach(doc => {
      const data = doc.data();
      totalEarnings += parseFloat(data.earning) || 0;
    });

    // Get payment records
    const paymentsSnapshot = await db.collection('payments')
      .where('workerId', '==', uid)
      .orderBy('date', 'desc')
      .get();
    
    let totalReceived = 0;
    const paymentsBody = document.getElementById('paymentDetailsBody');
    paymentsBody.innerHTML = '';
    
    paymentsSnapshot.forEach(doc => {
      const payment = doc.data();
      const amount = parseFloat(payment.amount) || 0;
      totalReceived += amount;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${payment.paymentDate || 'N/A'}</td>
        <td>₹${amount.toFixed(2)}</td>
        <td>${payment.method || 'N/A'}</td>
        <td>${payment.note || ''}</td>
      `;
      paymentsBody.appendChild(row);
    });

    if (paymentsSnapshot.empty) {
      paymentsBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted">No payments received yet</td>
        </tr>
      `;
    }

    // Update summary displays
    document.getElementById('totalEarningsDisplay').textContent = `₹${totalEarnings.toFixed(2)}`;
    document.getElementById('totalReceivedDisplay').textContent = `₹${totalReceived.toFixed(2)}`;
    
    // Calculate and display balance
    const balance = totalEarnings - totalReceived;
    const balanceElement = document.getElementById('balanceAmountDisplay');
    balanceElement.textContent = `₹${Math.abs(balance).toFixed(2)}`;
    
    if (balance > 0) {
      balanceElement.className = 'balance-negative';
      document.getElementById('balanceStatus').textContent = 'Payment Due';
    } else if (balance < 0) {
      balanceElement.className = 'balance-positive';
      document.getElementById('balanceStatus').textContent = 'Advance Paid';
    } else {
      balanceElement.className = '';
      document.getElementById('balanceStatus').textContent = 'Fully Paid';
    }

    const paymentModal = new bootstrap.Modal(document.getElementById('paymentDetailsModal'));
    paymentModal.show();

  } catch (error) {
    console.error("Error in showPaymentDetails:", error);
    alert("Failed to load payment details: " + error.message);
  }
}

// Handle work form submission
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

  try {
    await db.collection('workRecords').add({
      uid,
      workerName,
      date,
      spent,
      earning: 500 + spent, // Assuming fixed calculation
      workDetails,
      spentDetails,
      isPaid: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Work record added successfully!");
    document.getElementById('workForm').reset();
    fetchMyWorks(); // Refresh the list if modal is open
  } catch (error) {
    console.error("Failed to add record:", error);
    alert(`Failed to add record: ${error.message}`);
  }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  if (!uid) {
    window.location.href = "index.html";
    return;
  }

  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('workDate').value = today;
  
  // Set default filter dates (current month)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  document.getElementById('filterFromDate').value = firstDay;
  
  // Verify Firebase connection
  db.collection('test').doc('test').get()
    .then(() => console.log("Firestore connection OK"))
    .catch(err => console.error("Firestore connection failed:", err));
});

// Make functions available globally
window.showMyWorks = fetchMyWorks;
window.openEditModal = openEditModal;
window.deleteWorkRecord = deleteWorkRecord;
window.logout = logout;
window.applyDateFilter = applyDateFilter;
window.clearDateFilter = clearDateFilter;
window.showPaymentDetails = showPaymentDetails;