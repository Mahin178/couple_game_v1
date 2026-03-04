export function createSocketAdapter(socket) {
    const listeners = new Map();

    socket.on("connect", () => emit("connect", socket.id));
    socket.on("currentPlayers", (players) => emit("players", players));
    socket.on("updatePlayers", (players) => emit("players", players));
    socket.on("chatMessage", (payload) => emit("chat", payload));
    socket.on("chatClear", (payload) => emit("chatClear", payload));
    socket.on("vehicleState", (payload) => emit("vehicleState", payload));
    socket.on("flowerOffer", (payload) => emit("flowerOffer", payload));
    socket.on("flowerResponse", (payload) => emit("flowerResponse", payload));
    socket.on("loveBoost", (payload) => emit("loveBoost", payload));

    function emit(type, payload) {
        const set = listeners.get(type);
        if (!set) {
            return;
        }

        for (const handler of set) {
            handler(payload);
        }
    }

    return {
        socket,
        get id() {
            return socket.id;
        },
        on(type, handler) {
            if (!listeners.has(type)) {
                listeners.set(type, new Set());
            }

            listeners.get(type).add(handler);
            return () => listeners.get(type)?.delete(handler);
        },
        move(data) {
            socket.emit("move", data);
        },
        chat(message) {
            socket.emit("chat", message);
        },
        vehicleAction(data) {
            socket.emit("vehicleAction", data);
        },
        driveInput(data) {
            socket.emit("driveInput", data);
        },
        flowerOffer(data) {
            socket.emit("flowerOffer", data);
        },
        flowerResponse(data) {
            socket.emit("flowerResponse", data);
        }
    };
}
