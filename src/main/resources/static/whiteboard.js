let drawing = false;
let points = [];
const myClientId = crypto.randomUUID();

let currentColor = "#000000";
let currentSize = 2;
let currentTool = "brush";

const socket = new SockJS('/ws');
const stomp = Stomp.over(socket);

let shiftKeyPressed = false;
let shapeStart = null;

let canvas, ctx, previewCanvas, previewCtx;

let history = [];
let redoStack = [];

let isCreator = false;

document.addEventListener("DOMContentLoaded", () => {
    const user = JSON.parse(localStorage.getItem("user"));
    const code = localStorage.getItem("sessionCode");

    if (!user || !code) {
        return window.location.href = "login.html";
    }

    // Fill hidden inputs
    document.getElementById("userId").value = user.id;
    document.getElementById("sessionCode").value = code;



    // Set session name
    fetch(`/api/sessions/code/${code}`)
        .then(res => res.json())
        .then(session => {
            document.getElementById("sessionName").textContent = session.name;

            // Only the creator sees the CLEAR button
            if (session.creator.id === user.id) {
                isCreator = true;
                document.getElementById("clearBtn").style.display = "inline-block";
            }

            loadUserList();

        });

    // Initialize canvas *AFTER DOM is loaded*
    canvas = document.getElementById("board");
    ctx = canvas.getContext("2d");
    previewCanvas = document.getElementById("preview");
    previewCtx = previewCanvas.getContext("2d");

    // Event bindings NOW
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);

    // Color/size
    document.getElementById("colorPicker").addEventListener("input", (e) => {
        currentColor = e.target.value;
    });
    document.getElementById("brushSize").addEventListener("input", (e) => {
        currentSize = parseInt(e.target.value);
    });

    // Resize fix
    window.addEventListener("resize", () => {
        scaleCanvasForHiDPI(canvas, ctx);
        scaleCanvasForHiDPI(previewCanvas, previewCtx);
        redrawCanvas();
    });

    // WebSocket
    stomp.connect({}, () => {
        stomp.subscribe(`/topic/session.${code}`, (msg) => {
            const data = JSON.parse(msg.body);
            if (data.clientId === myClientId) return;

            switch (data.action) {
                case "draw":
                    history.push(JSON.parse(data.dataJson));
                    redrawCanvas();
                    break;
                case "undo":
                    history = history.filter(s => s.id !== data.strokeId);
                    redrawCanvas();
                    break;
                case "clear":
                    history = [];
                    redoStack = [];
                    redrawCanvas();
                    break;
                case "joined":
                case "left":
                    loadUserList();
                    const me = parseInt(document.getElementById("userId").value, 10);
                    if (data.userId === me) {
                        alert("You have been removed from this session.");
                        // clean up local state & go back
                        localStorage.removeItem("sessionCode");
                        window.location.href = "dashboard.html";
                    }
                    break;
            }
        });

        loadUserList();

        loadDrawings(); // only after connect
    });

    //loadUserList();
});






document.getElementById("colorPicker").addEventListener("input", (e) => {
    currentColor = e.target.value;
});

document.getElementById("brushSize").addEventListener("input", (e) => {
    currentSize = parseInt(e.target.value);
});

function sendDrawing(rawPoints) {
    const userId = parseInt(document.getElementById("userId").value);
    const strokeId = crypto.randomUUID();

    let enhancedPoints = rawPoints;

    if (currentTool === "pen") {
        enhancedPoints = rawPoints.map((p, i) => {
            const pressure = i / (rawPoints.length - 1 || 1);
            const dynamicWidth = 1 + pressure * (currentSize - 1);
            return [p[0], p[1], dynamicWidth];
        });
    } else if (currentTool === "brush") {
        const beziers = catmullRomToBezier(rawPoints);
        const flattened = [rawPoints[0]];
        for (let b of beziers) {
            const flat = flattenBezier([b[0], b[1]], [b[2], b[3]], [b[4], b[5]], [b[6], b[7]]);
            flattened.push(...flat.slice(1));
        }
        enhancedPoints = flattened; // ✅ now truly flat [x, y] coords
    }

    const stroke = {
        id: strokeId,
        points: enhancedPoints,
        color: currentTool === "highlighter" ? hexToRgba(currentColor, 0.25) : currentColor,
        size: currentSize,
        type: currentTool,
        userId
    };

    history.push(stroke);
    redoStack = [];

    stomp.send('/app/draw', {}, JSON.stringify({
        sessionCode: document.getElementById("sessionCode").value,
        userId,
        type: currentTool,
        clientId: myClientId,
        action: "draw",
        dataJson: JSON.stringify(stroke)
    }));
}




function clearCanvas() {
    const sessionCode = document.getElementById("sessionCode").value;

    // Delete strokes from DB
    fetch(`/api/drawings/code/${sessionCode}`, { method: 'DELETE' })
        .then(() => {
            history = [];
            redoStack = [];
            redrawCanvas();

            // Broadcast to others
            stomp.send('/app/draw', {}, JSON.stringify({
                sessionCode,
                userId: parseInt(document.getElementById("userId").value),
                clientId: myClientId,
                action: "clear"
            }));
        });
}

function undo() {
    const userId = parseInt(document.getElementById("userId").value);

    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].userId === userId) {
            const [removed] = history.splice(i, 1);

            // Broadcast to everyone
            stomp.send('/app/draw', {}, JSON.stringify({
                sessionCode: document.getElementById("sessionCode").value,
                userId,
                clientId: myClientId,
                action: "undo",
                strokeId: removed.id // 👈 used by all clients to remove the right stroke
            }));

            redrawCanvas();
            break;
        }
    }
}


function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history.forEach(stroke => drawFromData(JSON.stringify(stroke)));
}

async function loadDrawings() {
    const sessionCode = document.getElementById("sessionCode").value;
    const userId = parseInt(document.getElementById("userId").value);

    const res = await fetch(`/api/drawings/code/${sessionCode}`);
    const drawings = await res.json();
    drawings.forEach(d => {
        const stroke = JSON.parse(d.dataJson);
        stroke.userId = d.author.id;
        stroke.id = d.id; // ✅ THIS is what lets global undo work
        history.push(stroke);
        drawFromData(d.dataJson);
    });
}


function handleMouseDown(e){
    if (currentTool === "eraser") {
        drawing = true;
        return;
    }

    if (["line", "rectangle", "circle"].includes(currentTool)) {
        shapeStart = [e.offsetX, e.offsetY];
        return;
    }

    if (currentTool === "text") {
        e.preventDefault();
        shapeStart = [e.offsetX, e.offsetY];
        return;
    }

    // Fallback: drawing begins for other tools
    drawing = true;
    points = [[e.offsetX, e.offsetY]];
}



function handleMouseMove(e) {
    const x = e.offsetX, y = e.offsetY;

    if (drawing && currentTool === "eraser") {
        const eraserX = e.offsetX;
        const eraserY = e.offsetY;
        const threshold = currentSize * 2;

        for (let i = history.length - 1; i >= 0; i--) {
            const stroke = history[i];
            const { type } = stroke;

            let isHit = false;

            if (type === "brush" || type === "pen" || type === "highlighter") {
                const pts = stroke.points;
                for (let j = 1; j < pts.length; j++) {
                    const [x1, y1] = pts[j - 1].slice(0, 2);
                    const [x2, y2] = pts[j].slice(0, 2);
                    if (pointToSegmentDistance(eraserX, eraserY, x1, y1, x2, y2) < threshold) {
                        isHit = true;
                        break;
                    }
                }
            } else if (type === "line") {
                if (pointToSegmentDistance(eraserX, eraserY, stroke.x0, stroke.y0, stroke.x1, stroke.y1) < threshold) {
                    isHit = true;
                }
            } else if (type === "rectangle") {
                const { x0, y0, x1, y1 } = stroke;
                if (eraserX >= Math.min(x0, x1) - threshold && eraserX <= Math.max(x0, x1) + threshold &&
                    eraserY >= Math.min(y0, y1) - threshold && eraserY <= Math.max(y0, y1) + threshold) {
                    isHit = true;
                }
            } else if (type === "circle") {
                const cx = stroke.x + stroke.rx;
                const cy = stroke.y + stroke.ry;
                const dx = eraserX - cx;
                const dy = eraserY - cy;
                const dist = Math.sqrt((dx * dx) / (stroke.rx * stroke.rx) + (dy * dy) / (stroke.ry * stroke.ry));
                if (Math.abs(dist - 1) * Math.max(stroke.rx, stroke.ry) < threshold) {
                    isHit = true;
                }
            }

            if (type === "text") {
                const tx = stroke.x;
                const ty = stroke.y - stroke.size * 4; // estimate top
                const tw = stroke.width || 100;
                const th = stroke.height || stroke.size * 4;
                if (eraserX >= tx && eraserX <= tx + tw && eraserY >= ty && eraserY <= ty + th) {
                    isHit = true;
                }
            }


            if (isHit) {
                const removed = history.splice(i, 1)[0];
                stomp.send('/app/draw', {}, JSON.stringify({
                    sessionCode: document.getElementById("sessionCode").value,
                    userId: removed.userId,
                    clientId: myClientId,
                    action: "undo",
                    strokeId: removed.id
                }));
                redrawCanvas();
                break;
            }
        }

        return;
    }



    if (drawing && ["pen", "brush", "highlighter"].includes(currentTool)) {
        points.push([x, y]);

        if (currentTool === "pen") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            redrawCanvas();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = currentColor;

            for (let i = 1; i < points.length; i++) {
                const pressure = i / (points.length - 1 || 1);
                const width = 1 + pressure * (currentSize - 1);
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(points[i - 1][0], points[i - 1][1]);
                ctx.lineTo(points[i][0], points[i][1]);
                ctx.stroke();
            }
        } else if (currentTool === "brush") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            redrawCanvas();
            smoothStroke(points, { color: currentColor, width: currentSize });
        } else if (currentTool === "highlighter") {
            if (points.length < 2) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            redrawCanvas();
            smoothStroke(points, {
                color: hexToRgba(currentColor, 0.25),
                width: currentSize,
                cap: "butt",
                join: "miter"
            });
        }



    }

    if (shapeStart && currentTool === "text") {
        const [x0, y0] = shapeStart;
        const x1 = e.offsetX;
        const y1 = e.offsetY;

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.strokeStyle = "gray";
        previewCtx.setLineDash([4, 2]);
        previewCtx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        previewCtx.setLineDash([]);
        return;
    }



    // 👇 Always allow preview logic if shape tool is active
    if (shapeStart && ["line", "rectangle", "circle"].includes(currentTool)) {
        const [x0, y0] = shapeStart;

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.strokeStyle = currentColor;
        previewCtx.lineWidth = currentSize;
        previewCtx.lineCap = "round";
        previewCtx.lineJoin = "round";

        previewCtx.beginPath();
        switch (currentTool) {
            case "line":
                previewCtx.moveTo(x0, y0);
                previewCtx.lineTo(x, y);
                break;
            case "rectangle":
                previewCtx.rect(x0, y0, x - x0, y - y0);
                break;
            case "circle":
                const left = Math.min(x, x0);
                const top = Math.min(y, y0);
                const width = Math.abs(x - x0);
                const height = Math.abs(y - y0);

                previewCtx.beginPath();
                if (shiftKeyPressed) {
                    const size = Math.max(width, height);
                    previewCtx.ellipse(
                        left + size / 2,
                        top + size / 2,
                        size / 2,
                        size / 2,
                        0, 0, Math.PI * 2
                    );
                } else {
                    previewCtx.ellipse(
                        left + width / 2,
                        top + height / 2,
                        width / 2,
                        height / 2,
                        0, 0, Math.PI * 2
                    );
                }
                break;



        }
        previewCtx.stroke();
    }
}



function handleMouseUp(e) {
    if (currentTool === "eraser") {
        drawing = false;
        return;
    }

    if (shapeStart && ["line", "rectangle", "circle"].includes(currentTool)) {
        const x0 = shapeStart[0];
        const y0 = shapeStart[1];
        const x1 = event.offsetX;
        const y1 = event.offsetY;

        shapeStart = null;
        previewCtx.clearRect(0, 0, canvas.width, canvas.height);

        let stroke = {
            id: crypto.randomUUID(),
            userId: parseInt(document.getElementById("userId").value),
            type: currentTool,
            color: currentColor,
            size: currentSize,
        };

        // this is inside mouseup when text tool is selected




        if (currentTool === "circle") {
            const left = Math.min(x0, x1);
            const top = Math.min(y0, y1);
            const width = Math.abs(x1 - x0);
            const height = Math.abs(y1 - y0);

            if (shiftKeyPressed) {
                const size = Math.max(width, height);
                stroke.x = left;
                stroke.y = top;
                stroke.rx = size / 2;
                stroke.ry = size / 2;
            } else {
                stroke.x = left;
                stroke.y = top;
                stroke.rx = width / 2;
                stroke.ry = height / 2;
            }
        } else {
            // for line and rectangle
            stroke.x0 = x0;
            stroke.y0 = y0;
            stroke.x1 = x1;
            stroke.y1 = y1;
        }



        history.push(stroke);
        stomp.send('/app/draw', {}, JSON.stringify({
            sessionCode: document.getElementById("sessionCode").value,
            userId: stroke.userId,
            clientId: myClientId,
            action: "draw",
            dataJson: JSON.stringify(stroke)
        }));

        if (currentTool !== "highlighter") {
            redrawCanvas();
        }

        return;
    }

    if (shapeStart && currentTool === "text") {
        const [x0, y0] = shapeStart;
        const x1 = event.offsetX;
        const y1 = event.offsetY;
        shapeStart = null;

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        const left = Math.min(x0, x1);
        const top = Math.min(y0, y1);
        const width = Math.abs(x1 - x0);
        const height = Math.abs(y1 - y0);

        const input = document.getElementById("textToolInput");
        input.style.display = "block";
        input.style.left = `${canvas.offsetLeft + left}px`;
        input.style.top = `${canvas.offsetTop + top}px`;
        input.style.width = `${width}px`;
        input.style.height = `${height}px`;
        input.style.font = `${currentSize * 4}px Arial`;
        input.style.color = currentColor;
        input.value = "";
        input.focus();

        const blurOnClickOutside = (event) => {
            if (event.target !== input) {
                input.blur();
                document.removeEventListener("mousedown", blurOnClickOutside);
            }
        };

        input.onkeydown = (ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault(); // ⛔ prevent newline
                input.blur();        // ✅ submit on Enter
            }
        };

        input.onblur = () => {
            const text = input.value.trim();
            input.style.display = "none";

            if (text) {
                const userId = parseInt(document.getElementById("userId").value);
                const stroke = {
                    id: crypto.randomUUID(),
                    userId,
                    type: "text",
                    text,
                    x: left,
                    y: top + currentSize * 4,
                    size: currentSize,
                    color: currentColor,
                    width,
                    height
                };

                history.push(stroke);
                stomp.send('/app/draw', {}, JSON.stringify({
                    sessionCode: document.getElementById("sessionCode").value,
                    userId,
                    clientId: myClientId,
                    action: "draw",
                    dataJson: JSON.stringify(stroke)
                }));

                redrawCanvas();
            }
        };

        return;
    }
    drawing = false;
    if (points.length > 1 && ["brush", "pen", "highlighter"].includes(currentTool)) {
        const simplified = smoothPoints(points);
        points = simplified;
        sendDrawing(simplified);

// draw it locally with same smoothing as others
        const userId = parseInt(document.getElementById("userId").value);
        const strokeId = crypto.randomUUID();

        let enhancedPoints;
        if (currentTool === "pen") {
            enhancedPoints = simplified.map((p, i) => {
                const pressure = i / (simplified.length - 1 || 1);
                const width = 1 + pressure * (currentSize - 1);
                return [p[0], p[1], width];
            });
        } else {
            enhancedPoints = simplified;
        }

        if (currentTool !== "highlighter") {
            const localStroke = {
                id: strokeId,
                points: enhancedPoints,
                color: currentColor,
                size: currentSize,
                type: currentTool,
                userId: userId
            };

            history.push(localStroke);
            redrawCanvas();
        }


    }
}

function liveStroke(points) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = currentColor;

    for (let i = 1; i < points.length; i++) {
        const pressure = i / (points.length - 1 || 1);
        const width = 1 + pressure * (currentSize - 1);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(points[i - 1][0], points[i - 1][1]);
        ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
    }
}

function catmullRomToBezier(points) {
    if (points.length < 4) return points;

    const path = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

        path.push([p1[0], p1[1], cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]]);
    }
    return path;
}

function smoothStroke(points, { color, width, cap = "round", join = "round" }) {
    ctx.lineCap = cap;
    ctx.lineJoin = join;

    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    if (points.length === 1) {
        // 🟡 Draw a dot
        ctx.beginPath();
        ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        return;
    }

    if (points.length === 2) {
        // 🟡 Draw a straight line
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        ctx.stroke();
        return;
    }

    const beziers = catmullRomToBezier(points);
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);

    for (let b of beziers) {
        ctx.bezierCurveTo(b[2], b[3], b[4], b[5], b[6], b[7]);
    }

    ctx.stroke();
}

function drawFromData(json) {
    const stroke = JSON.parse(json);
    const {
        type = "brush",
        points = [],
        color = "#000000",
        size = 2,
        text,
        x,
        y
    } = stroke;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    switch (type) {
        case "brush":
            smoothStroke(points, { color, width: size });
            break;


        case "pen":
            if (points.length < 2) return;
            for (let i = 1; i < points.length; i++) {
                const [x1, y1, w1] = points[i - 1];
                const [x2, y2, w2] = points[i];

                ctx.beginPath();
                ctx.lineWidth = (w1 + w2) / 2; // average width
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            break;

        case "text":
            ctx.font = `${stroke.size * 4}px Arial`;
            ctx.fillStyle = stroke.color;

            const lines = [];
            const rawLines = stroke.text.split("\n"); // preserve manual newlines

            for (const raw of rawLines) {
                let currentLine = "";
                for (let char of raw) {
                    const testLine = currentLine + char;
                    const metrics = ctx.measureText(testLine);
                    if (stroke.width && metrics.width > stroke.width) {
                        lines.push(currentLine);
                        currentLine = char;
                    } else {
                        currentLine = testLine;
                    }
                }
                lines.push(currentLine);
            }

            let lineY = stroke.y;
            for (const line of lines) {
                ctx.fillText(line, stroke.x, lineY);
                lineY += stroke.size * 4;
            }

            break;


        case "line":
            ctx.lineWidth = size;
            ctx.beginPath();
            ctx.moveTo(stroke.x0, stroke.y0);
            ctx.lineTo(stroke.x1, stroke.y1);
            ctx.stroke();
            break;

        case "rectangle":
            ctx.lineWidth = size;
            ctx.strokeRect(stroke.x0, stroke.y0, stroke.x1 - stroke.x0, stroke.y1 - stroke.y0);
            break;

        case "highlighter":
            if (points.length < 2) return;
            ctx.lineCap = "butt";
            ctx.lineJoin = "miter";
            ctx.strokeStyle = color; // already includes rgba(...)
            ctx.lineWidth = size;
            smoothStroke(points, {
                color,
                width: size,
                cap: "butt",
                join: "miter"
            });

            break;



        case "circle":
            ctx.lineWidth = size;
            ctx.beginPath();
            if (typeof stroke.rx !== "undefined" && typeof stroke.ry !== "undefined") {
                ctx.ellipse(
                    stroke.x + stroke.rx, // centerX
                    stroke.y + stroke.ry, // centerY
                    stroke.rx,
                    stroke.ry,
                    0,
                    0,
                    Math.PI * 2
                );
            }
            ctx.stroke();
            break;



    }
}


function smoothPoints(pts, epsilon = 1.5) {
    if (pts.length < 3) return pts;

    const sq = x => x * x;

    const getSqDist = (p1, p2) => sq(p1[0] - p2[0]) + sq(p1[1] - p2[1]);

    const getSqSegDist = (p, p1, p2) => {
        let x = p1[0], y = p1[1];
        let dx = p2[0] - x, dy = p2[1] - y;

        if (dx !== 0 || dy !== 0) {
            const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2[0];
                y = p2[1];
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = p[0] - x;
        dy = p[1] - y;
        return dx * dx + dy * dy;
    };

    const simplifyDP = (points, first, last, sqEpsilon, simplified) => {
        let maxSqDist = sqEpsilon;
        let index = -1;

        for (let i = first + 1; i < last; i++) {
            const sqDist = getSqSegDist(points[i], points[first], points[last]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (index > -1) {
            if (index - first > 1) simplifyDP(points, first, index, sqEpsilon, simplified);
            simplified.push(points[index]);
            if (last - index > 1) simplifyDP(points, index, last, sqEpsilon, simplified);
        }
    };

    const out = [pts[0]];
    simplifyDP(pts, 0, pts.length - 1, epsilon * epsilon, out);
    out.push(pts[pts.length - 1]);
    return out;
}


document.querySelectorAll('input[name="tool"]').forEach(input => {
    input.addEventListener("change", (e) => {
        currentTool = e.target.value;
        console.log("Tool changed to:", currentTool);
    });
});

window.addEventListener("keydown", e => {
    if (e.key === "Shift") shiftKeyPressed = true;
});
window.addEventListener("keyup", e => {
    if (e.key === "Shift") shiftKeyPressed = false;
});

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function hexToRgba(hex, alpha) {
    hex = hex.replace("#", "");
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

function scaleCanvasForHiDPI(canvas, ctx) {
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Resize canvas for actual drawing pixels
    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;

    // Scale all drawings
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}


window.addEventListener("resize", () => {
    scaleCanvasForHiDPI(canvas, ctx);
    scaleCanvasForHiDPI(previewCanvas, previewCtx);
    redrawCanvas();
});

function flattenBezier(p0, cp1, cp2, p1, segments = 10) {
    const points = [];
    for (let t = 0; t <= 1; t += 1 / segments) {
        const x = Math.pow(1 - t, 3) * p0[0] +
            3 * Math.pow(1 - t, 2) * t * cp1[0] +
            3 * (1 - t) * t * t * cp2[0] +
            t * t * t * p1[0];
        const y = Math.pow(1 - t, 3) * p0[1] +
            3 * Math.pow(1 - t, 2) * t * cp1[1] +
            3 * (1 - t) * t * t * cp2[1] +
            t * t * t * p1[1];
        points.push([x, y]);
    }
    return points;
}

function leaveSessionAndReturn() {
    const user = JSON.parse(localStorage.getItem("user"));
    const sessionCode = localStorage.getItem("sessionCode");

    // 1) broadcast that you're leaving
    stomp.send(
        "/app/leave",
        {},
        JSON.stringify({ sessionCode, userId: user.id })
    );

    // 2) then actually remove you on the server and redirect
    fetch(`/api/sessions/leave/${user.id}/${sessionCode}`, { method: "DELETE" })
        .finally(() => {
            localStorage.removeItem("sessionCode");
            window.location.href = "dashboard.html";
        });
}


// Function to update the user list dynamically when someone joins or leaves
function updateUserList(username, action) {
    const userList = document.getElementById("userList");

    if (action === "joined") {
        const userItem = document.createElement("li");
        userItem.textContent = username;
        userList.appendChild(userItem);
    } else if (action === "left") {
        const allUsers = Array.from(userList.children);
        const userToRemove = allUsers.find(user => user.textContent === username);
        if (userToRemove) {
            userList.removeChild(userToRemove);
        }
    }
}

// Function to load all users connected to the session
function loadUserList() {
    const sessionCode = document.getElementById("sessionCode").value;
    fetch(`/api/sessions/code/${sessionCode}`)
        .then(res => res.json())
        .then(session => {
            const ul = document.getElementById("userList");
            ul.innerHTML = "";

            session.participants.forEach(u => {
                const li = document.createElement("li");
                li.textContent = u.username;

                // only if I’m the creator do I inject the “×” kick button
                if (isCreator && u.id !== parseInt(document.getElementById("userId").value)) {
                    const btn = document.createElement("button");
                    btn.textContent = "×";
                    btn.className = "kick-btn";
                    btn.onclick = () => {
                        fetch(
                            `/api/sessions/kick/${ /* using the hidden input now */
                                document.getElementById("userId").value
                            }/${u.id}/${sessionCode}`,
                            { method: "POST" }
                        ).catch(console.error);
                    };
                    li.appendChild(btn);
                }

                ul.appendChild(li);
            });
        });
}



function leaveSessionAndReturn() {
    const user = JSON.parse(localStorage.getItem("user"));
    const sessionCode = localStorage.getItem("sessionCode");

    fetch(`/api/sessions/leave/${user.id}/${sessionCode}`, { method: "DELETE" })
        .finally(() => {
            localStorage.removeItem("sessionCode");
            window.location.href = "dashboard.html";
        });
}



