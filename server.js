const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const MAX_PLAYERS = 4;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
const vehicle = {
    x: 1400,
    y: 1450,
    direction: "right",
    driverId: null,
    passengerId: null
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

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
        message: "",
        hasFlower: false,
        inVehicle: ""
    };

    socket.emit("currentPlayers", players);
    io.emit("updatePlayers", players);
    socket.emit("vehicleState", vehicle);

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

        if (typeof data.hasFlower === "boolean") {
            player.hasFlower = data.hasFlower;
        }

        if (typeof data.inVehicle === "string") {
            player.inVehicle = data.inVehicle;
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
        io.emit("chatMessage", { id: socket.id, message: player.message });

        setTimeout(() => {
            const p = players[socket.id];
            if (!p) {
                return;
            }

            p.message = "";
            io.emit("updatePlayers", players);
            io.emit("chatClear", { id: socket.id });
        }, 3000);
    });

    socket.on("vehicleAction", (data) => {
        const player = players[socket.id];
        if (!player || !data || typeof data.action !== "string") {
            return;
        }

        if (data.action === "drive" && !vehicle.driverId) {
            vehicle.driverId = socket.id;
            player.inVehicle = "driver";
        }

        if (data.action === "sit" && !vehicle.passengerId && vehicle.driverId !== socket.id) {
            vehicle.passengerId = socket.id;
            player.inVehicle = "passenger";
        }

        if (data.action === "leave") {
            if (vehicle.driverId === socket.id) {
                vehicle.driverId = null;
                player.inVehicle = "";
            }
            if (vehicle.passengerId === socket.id) {
                vehicle.passengerId = null;
                player.inVehicle = "";
            }
        }

        io.emit("vehicleState", vehicle);
        io.emit("updatePlayers", players);
    });

    socket.on("driveInput", (data) => {
        if (vehicle.driverId !== socket.id || !data) {
            return;
        }

        vehicle.x = clamp(Number(data.x) || vehicle.x, 80, 2992);
        vehicle.y = clamp(Number(data.y) || vehicle.y, 80, 2992);
        vehicle.direction = typeof data.direction === "string" ? data.direction : vehicle.direction;

        const driver = players[vehicle.driverId];
        if (driver) {
            driver.x = vehicle.x;
            driver.y = vehicle.y;
            driver.inVehicle = "driver";
        }

        const passenger = players[vehicle.passengerId];
        if (passenger) {
            passenger.x = vehicle.x - 24;
            passenger.y = vehicle.y + 10;
            passenger.inVehicle = "passenger";
        }

        io.emit("vehicleState", vehicle);
        io.emit("updatePlayers", players);
    });

    socket.on("flowerOffer", (data) => {
        const player = players[socket.id];
        const toId = data?.toId;
        if (!player || !toId || !players[toId] || !player.hasFlower) {
            return;
        }

        io.to(toId).emit("flowerOffer", {
            fromId: socket.id,
            fromName: player.name
        });
    });

    socket.on("flowerResponse", (data) => {
        const toId = data?.toId;
        const accepted = Boolean(data?.accepted);
        if (!toId || !players[toId] || !players[socket.id]) {
            return;
        }

        if (accepted && players[toId].hasFlower) {
            players[toId].hasFlower = false;
            io.to(toId).emit("loveBoost", { amount: 15 });
            io.to(socket.id).emit("loveBoost", { amount: 15 });
            io.emit("chatMessage", { id: socket.id, message: "accepted a flower gift 🌹" });
            io.emit("updatePlayers", players);
        }

        io.to(toId).emit("flowerResponse", {
            fromId: socket.id,
            accepted
        });
    });

    socket.on("disconnect", () => {
        if (vehicle.driverId === socket.id) {
            vehicle.driverId = null;
        }
        if (vehicle.passengerId === socket.id) {
            vehicle.passengerId = null;
        }

        delete players[socket.id];
        io.emit("updatePlayers", players);
        io.emit("vehicleState", vehicle);
    });
});

server.listen(process.env.PORT || 3000);
