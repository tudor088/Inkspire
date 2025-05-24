let pendingJoinCode = null;



document.addEventListener("DOMContentLoaded", () => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return window.location.href = "login.html";

    document.getElementById("currentUser").textContent = user.username;
    document.getElementById("logoutBtn").onclick = () => {
        localStorage.removeItem("user");
        window.location.href = "login.html";
    };

    const socket     = new SockJS('/ws');
    const stomp      = Stomp.over(socket);

    stomp.connect({}, () => {
        stomp.subscribe('/topic/sessions', () => {
            // any time a message comes in, re-load the list:
            loadSessions();
        });
    });

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
    const user = JSON.parse(localStorage.getItem("user"));

    fetch("/api/sessions/all")
        .then(res => res.json())
        .then(data => {
            // 1) Split into “mine” vs “others”
            const mine   = data.filter(s => s.creatorUsername === user.username);
            const others = data.filter(s => s.creatorUsername !== user.username);

            // 2) Shuffle the “others”
            for (let i = others.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [others[i], others[j]] = [others[j], others[i]];
            }

            // 3) Concatenate so yours come first
            const sorted = [...mine, ...others];

            const list = document.getElementById("sessionList");
            list.innerHTML = "";

            sorted.forEach(session => {
                const li = document.createElement("li");
                li.style.position = "relative";

                // main info
                li.innerHTML = `
          <strong>${session.name}</strong>
          ${session.passwordProtected ? "🔒" : "🔓"}<br>
          Created by: ${session.creatorUsername}<br>
          Created at: ${new Date(session.createdAt).toLocaleString()}<br>
          Connected users: ${session.connectedUsersCount}
        `;

                // Join button
                const joinBtn = document.createElement("button");
                joinBtn.textContent = "Join";
                joinBtn.onclick = () => handleJoin(session.sessionCode, session.passwordProtected);
                li.appendChild(joinBtn);

                // 4) If I’m the creator, add a delete “×” in the corner
                if (session.creatorUsername === user.username || user.id === 8) {
                    const delBtn = document.createElement("button");
                    delBtn.textContent = "×";
                    delBtn.className = "kick-btn";  // reuse the small red style
                    delBtn.style.position = "absolute";
                    delBtn.style.top  = "0px";
                    delBtn.style.right = "0px";
                    delBtn.onclick = () => {
                        if (!confirm(`Delete session "${session.name}" forever?`)) return;
                        fetch(`/api/sessions/delete/${user.id}/${session.sessionCode}`, {
                            method: "DELETE"
                        })
                            .then(() => loadSessions())
                            .catch(err => alert("Failed to delete: " + err));
                    };
                    li.appendChild(delBtn);
                }

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
