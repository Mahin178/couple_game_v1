const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let position = { x: 500, y: 500 };
let frame = 0;
let speed = 3;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
if (isMobile) {
    document.getElementById("mobileJoystick").style.display = "block";
}

const house = { x: 800, y: 800, width: 200, height: 200 };

socket.on("currentPlayers", (data) => players = data);
socket.on("updatePlayers", (data) => players = data);

function drawWorld() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const camX = position.x - canvas.width / 2;
    const camY = position.y - canvas.height / 2;

    // Ground
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(-camX, -camY, 2000, 2000);

    // Buildings
    ctx.fillStyle = "gray";
    ctx.fillRect(400 - camX, 400 - camY, 150, 150);
    ctx.fillRect(1200 - camX, 600 - camY, 200, 200);

    // House
    ctx.fillStyle = "brown";
    ctx.fillRect(house.x - camX, house.y - camY, house.width, house.height);

    for (let id in players) {

        let p = players[id];

        ctx.fillStyle = (id === socket.id) ? "blue" : "pink";
        ctx.fillRect(p.x - camX, p.y - camY, 40, 40);

        // Chat bubble
        if (p.message) {
            ctx.fillStyle = "white";
            ctx.fillRect(p.x - camX, p.y - camY - 40, 120, 25);

            ctx.fillStyle = "black";
            ctx.fillText(p.message, p.x - camX + 5, p.y - camY - 22);
        }
    }

    requestAnimationFrame(drawWorld);
}

drawWorld();

document.addEventListener("keydown", (e) => {

    if (e.key === "ArrowUp") position.y -= speed;
    if (e.key === "ArrowDown") position.y += speed;
    if (e.key === "ArrowLeft") position.x -= speed;
    if (e.key === "ArrowRight") position.x += speed;

    frame = (frame + 1) % 4;

    socket.emit("move", { x: position.x, y: position.y, frame });
});

document.getElementById("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        socket.emit("chat", e.target.value);
        e.target.value = "";
    }
});