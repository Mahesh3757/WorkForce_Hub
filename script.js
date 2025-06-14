// script.js
const auth = firebase.auth();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = email.value;
  const password = password.value;
  const profile = profile.value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    if (profile === 'admin') {
      window.location.href = 'admin.html';
    } else {
      localStorage.setItem('workerUID', uid);
      window.location.href = 'worker.html';
    }
  } catch (error) {
    alert(error.message);
  }
});

function register() {
  const email = prompt("Enter email:");
  const password = prompt("Enter password:");

  if (email && password) {
    auth.createUserWithEmailAndPassword(email, password)
      .then(() => alert("Registered successfully!"))
      .catch((error) => alert(error.message));
  }
}
