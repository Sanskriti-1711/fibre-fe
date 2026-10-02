async function handleLogin(event) {
  event.preventDefault(); // stop form reload

  const errorEl = document.getElementById("loginError");
  errorEl.style.display = "none";
  errorEl.textContent = "";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await window.FiberApi.login(email, password);
    const role = response && response.user && response.user.role ? response.user.role : null;
    if (role !== "ENGINEER") {
      if (window.FiberAuth && typeof window.FiberAuth.clear === "function") {
        window.FiberAuth.clear();
      }
      throw new Error("Not an engineer account");
    }
    window.location.href = "engineer-dashboard.html";
  } catch (e) {
    errorEl.textContent = e && FtthUI.humanize(e) ? FtthUI.humanize(e) : "Login failed";
    errorEl.style.display = "block";
  }
}
