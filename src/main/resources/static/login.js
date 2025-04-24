document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Login failed");
        }

        const user = await response.json();
        localStorage.setItem("user", JSON.stringify(user));
        window.location.href = "dashboard.html";
    } catch (err) {
        document.getElementById("loginError").textContent = err.message;
    }
});
