const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const MAX_PLAYERS = 4;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};

io.on("connection", (socket) => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
        socket.emit("serverFull", { maxPlayers: MAX_PLAYERS });
        socket.disconnect(true);
        return;
    }

    players[socket.id] = {
        x: 500,
        y: 500,
        frame: 0,
        direction: "down",
        animState: "idle",
        name: `P-${socket.id.slice(0, 3)}`,
        message: ""
    };

    socket.emit("currentPlayers", players);
    io.emit("updatePlayers", players);

    socket.on("move", (data) => {
        const player = players[socket.id];
        if (!player || !data) {
            return;
        }

        player.x = Number.isFinite(data.x) ? data.x : player.x;
        player.y = Number.isFinite(data.y) ? data.y : player.y;
        player.frame = Number.isFinite(data.frame) ? data.frame : player.frame;
        player.direction = typeof data.direction === "string" ? data.direction : player.direction;
        player.animState = typeof data.animState === "string" ? data.animState : player.animState;

        if (typeof data.name === "string") {
            player.name = data.name.slice(0, 18) || player.name;
        }

        io.emit("updatePlayers", players);
    });

    socket.on("chat", (msg) => {
        const player = players[socket.id];
        if (!player || typeof msg !== "string") {
            return;
        }

        player.message = msg.slice(0, 90);
        io.emit("updatePlayers", players);

        setTimeout(() => {
            const p = players[socket.id];
            if (!p) {
                return;
            }

            p.message = "";
            io.emit("updatePlayers", players);
        }, 3000);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

server.listen(process.env.PORT || 3000);
