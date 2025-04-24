document.getElementById("registerForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailPattern.test(email)) {
        document.getElementById("registerError").textContent = "Please enter a valid email address with a domain (e.g., example@mail.com).";
        return;
    }

    try {
        const response = await fetch("/api/users/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Registration failed");
        }

        alert("Registration successful! You can now log in.");
        window.location.href = "login.html";
    } catch (err) {
        document.getElementById("registerError").textContent = err.message;
    }
});
