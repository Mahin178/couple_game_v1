const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const MAX_PLAYERS = 4;
const WORLD_SIZE = 4608;
const TILE_SIZE = 64;
const MATERIALS = new Set(["brick", "wood", "glass"]);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
const vehicles = {
    car_red: {
        id: "car_red",
        x: 1400,
        y: 1450,
        angle: 0,
        speed: 0,
        driverId: null,
        passengerId: null
    },
    car_pink: {
        id: "car_pink",
        x: 1530,
        y: 1520,
        angle: 0,
        speed: 0,
        driverId: null,
        passengerId: null
    }
};
const buildBlocks = {};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function vehiclePayload() {
    return {
        vehicles: Object.values(vehicles)
    };
}

function buildStatePayload() {
    return {
        blocks: Object.values(buildBlocks)
    };
}

function playerVehicleSeat(socketId) {
    for (const vehicle of Object.values(vehicles)) {
        if (vehicle.driverId === socketId) {
            return { vehicleId: vehicle.id, role: "driver" };
        }
        if (vehicle.passengerId === socketId) {
            return { vehicleId: vehicle.id, role: "passenger" };
        }
    }

    return null;
}

function clearPlayerFromVehicles(socketId) {
    for (const vehicle of Object.values(vehicles)) {
        if (vehicle.driverId === socketId) {
            vehicle.driverId = null;
            vehicle.speed = 0;
        }
        if (vehicle.passengerId === socketId) {
            vehicle.passengerId = null;
        }
    }
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
        name: "Player",
        message: "",
        hasFlower: false,
        inVehicle: ""
    };

    socket.emit("currentPlayers", players);
    io.emit("updatePlayers", players);
    socket.emit("vehicleState", vehiclePayload());
    socket.emit("buildState", buildStatePayload());

    socket.on("setProfile", (data) => {
        const player = players[socket.id];
        if (!player || !data) {
            return;
        }

        if (typeof data.name === "string" && data.name.trim()) {
            player.name = data.name.trim().slice(0, 18);
        }

        io.emit("updatePlayers", players);
    });

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

        const requestedId = typeof data.vehicleId === "string" ? data.vehicleId : "car_red";
        const vehicle = vehicles[requestedId] || vehicles.car_red;
        const currentSeat = playerVehicleSeat(socket.id);

        if (data.action === "drive" && vehicle && !vehicle.driverId && (!currentSeat || currentSeat.vehicleId === vehicle.id)) {
            clearPlayerFromVehicles(socket.id);
            vehicle.driverId = socket.id;
            player.inVehicle = `${vehicle.id}:driver`;
        }

        if (
            data.action === "sit" &&
            vehicle &&
            vehicle.driverId &&
            !vehicle.passengerId &&
            vehicle.driverId !== socket.id
        ) {
            clearPlayerFromVehicles(socket.id);
            vehicle.passengerId = socket.id;
            player.inVehicle = `${vehicle.id}:passenger`;
        }

        if (data.action === "leave") {
            clearPlayerFromVehicles(socket.id);
            player.inVehicle = "";
        }

        io.emit("vehicleState", vehiclePayload());
        io.emit("updatePlayers", players);
    });

    socket.on("driveInput", (data) => {
        if (!data || typeof data.vehicleId !== "string") {
            return;
        }

        const vehicle = vehicles[data.vehicleId];
        if (!vehicle || vehicle.driverId !== socket.id) {
            return;
        }

        vehicle.x = clamp(Number(data.x) || vehicle.x, 80, WORLD_SIZE - 80);
        vehicle.y = clamp(Number(data.y) || vehicle.y, 80, WORLD_SIZE - 80);
        vehicle.angle = Number.isFinite(data.angle) ? data.angle : vehicle.angle;
        vehicle.speed = Number.isFinite(data.speed) ? data.speed : vehicle.speed;

        const driver = players[vehicle.driverId];
        if (driver) {
            driver.x = vehicle.x;
            driver.y = vehicle.y;
            driver.inVehicle = `${vehicle.id}:driver`;
        }

        const passenger = players[vehicle.passengerId];
        if (passenger) {
            const px = vehicle.x - Math.cos(vehicle.angle) * 20 - Math.sin(vehicle.angle) * 16;
            const py = vehicle.y - Math.sin(vehicle.angle) * 20 + Math.cos(vehicle.angle) * 16;
            passenger.x = px;
            passenger.y = py;
            passenger.inVehicle = `${vehicle.id}:passenger`;
        }

        io.emit("vehicleState", vehiclePayload());
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

    socket.on("buildAction", (data) => {
        if (!data || typeof data.action !== "string") {
            return;
        }

        const gridX = Math.floor(Number(data.gridX));
        const gridY = Math.floor(Number(data.gridY));
        if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) {
            return;
        }

        const maxGrid = Math.floor(WORLD_SIZE / TILE_SIZE) - 1;
        if (gridX < 0 || gridY < 0 || gridX > maxGrid || gridY > maxGrid) {
            return;
        }

        const key = `${gridX}:${gridY}`;

        if (data.action === "place") {
            const material = typeof data.material === "string" ? data.material : "";
            if (!MATERIALS.has(material) || buildBlocks[key]) {
                return;
            }

            const block = {
                id: key,
                gridX,
                gridY,
                material,
                by: socket.id
            };

            buildBlocks[key] = block;
            io.emit("buildPatch", { action: "place", block });
            return;
        }

        if (data.action === "remove") {
            if (!buildBlocks[key]) {
                return;
            }

            delete buildBlocks[key];
            io.emit("buildPatch", { action: "remove", gridX, gridY });
        }
    });

    socket.on("disconnect", () => {
        clearPlayerFromVehicles(socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
        io.emit("vehicleState", vehiclePayload());
    });
});

server.listen(process.env.PORT || 3000);
