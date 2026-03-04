const socket = io();
const map = document.getElementById("map");

let players = {};
let position = { x: 500, y: 500 };
let speed = 5;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);

if (isMobile) {
    document.getElementById("mobileControls").style.display = "flex";
}

socket.on("currentPlayers", (serverPlayers) => {
    players = serverPlayers;
    drawPlayers();
});

socket.on("updatePlayers", (serverPlayers) => {
    players = serverPlayers;
    drawPlayers();
});

function drawPlayers() {
    map.innerHTML = "";

    for (let id in players) {
        const player = document.createElement("div");
        player.classList.add("player");
        player.style.left = players[id].x + "px";
        player.style.top = players[id].y + "px";

        if (id === socket.id) {
            player.style.background = "blue";
        } else {
            player.style.background = "pink";
        }

        map.appendChild(player);
    }
}

document.addEventListener("keydown", (e) => {
    if (isMobile) return;

    if (e.key === "ArrowUp") position.y -= speed;
    if (e.key === "ArrowDown") position.y += speed;
    if (e.key === "ArrowLeft") position.x -= speed;
    if (e.key === "ArrowRight") position.x += speed;

    socket.emit("move", position);
});

if (isMobile) {
    const controls = {
        up: document.getElementById("up"),
        down: document.getElementById("down"),
        left: document.getElementById("left"),
        right: document.getElementById("right")
    };

    controls.up.addEventListener("touchstart", () => {
        position.y -= speed;
        socket.emit("move", position);
    });

    controls.down.addEventListener("touchstart", () => {
        position.y += speed;
        socket.emit("move", position);
    });

    controls.left.addEventListener("touchstart", () => {
        position.x -= speed;
        socket.emit("move", position);
    });

    controls.right.addEventListener("touchstart", () => {
        position.x += speed;
        socket.emit("move", position);
    });
}