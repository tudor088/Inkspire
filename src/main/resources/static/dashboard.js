let pendingJoinCode = null;

document.addEventListener("DOMContentLoaded", () => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return window.location.href = "login.html";

    document.getElementById("currentUser").textContent = user.username;
    document.getElementById("logoutBtn").onclick = () => {
        localStorage.removeItem("user");
        window.location.href = "login.html";
    };

    loadSessions();

    document.getElementById("createSessionBtn").onclick = () => {
        document.getElementById("createSessionModal").style.display = "block";
    };

    document.getElementById("closeModalBtn").onclick = () => {
        document.getElementById("createSessionModal").style.display = "none";
    };

    document.getElementById("confirmCreateSessionBtn").onclick = () => {
        const name = document.getElementById("sessionName").value.trim();
        const password = document.getElementById("sessionPassword").value;
        const user = JSON.parse(localStorage.getItem("user"));

        if (!name) {
            alert("Please enter a session name");
            return;
        }

        fetch(`/api/sessions/create/${user.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, password })
        })
            .then(res => res.json())
            .then(session => {
                localStorage.setItem("sessionCode", session.sessionCode);
                window.location.href = "whiteboard.html";
            });
    };

    document.getElementById("closePasswordModalBtn").onclick = () => {
        document.getElementById("passwordModal").style.display = "none";
        pendingJoinCode = null;
    };

    document.getElementById("submitPasswordBtn").onclick = () => {
        const password = document.getElementById("joinSessionPassword").value;
        const user = JSON.parse(localStorage.getItem("user"));

        fetch(`/api/sessions/join-protected?userId=${user.id}&code=${pendingJoinCode}&password=${encodeURIComponent(password)}`, {
            method: "POST"
        })
            .then(res => {
                if (!res.ok) throw new Error("Incorrect password");
                return res.json();
            })
            .then(() => {
                localStorage.setItem("sessionCode", pendingJoinCode);
                window.location.href = "whiteboard.html";
            })
            .catch(err => {
                alert("Failed to join session: " + err.message);
            });
    };
});

function loadSessions() {
    fetch("/api/sessions/all")
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById("sessionList");
            list.innerHTML = "";

            data.forEach(session => {
                const li = document.createElement("li");

                const isProtected = session.passwordProtected ? "🔒" : "🔓";
                const createdDate = new Date(session.createdAt).toLocaleString();
                const creator = session.creatorUsername || "Unknown";

                li.innerHTML = `
                    <strong>${session.name}</strong> ${isProtected}<br>
                    Created by: ${session.creatorUsername || "Unknown"}<br>
                    Created at: ${createdDate}<br>
                    Connected users: ${session.connectedUsersCount}<br>
                    <button onclick="handleJoin('${session.sessionCode}', ${session.passwordProtected})">Join</button>
                `;
                list.appendChild(li);
            });
        });
}

function handleJoin(code, isProtected) {
    const user = JSON.parse(localStorage.getItem("user"));

    if (isProtected) {
        pendingJoinCode = code;
        document.getElementById("joinSessionPassword").value = "";
        document.getElementById("passwordModal").style.display = "block";
    } else {
        fetch(`/api/sessions/join/${user.id}/${code}`, { method: "POST" })
            .then(res => res.json())
            .then(() => {
                localStorage.setItem("sessionCode", code);
                window.location.href = "whiteboard.html";
            });
    }
}
