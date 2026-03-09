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
    socket.on("buildState", (payload) => emit("buildState", payload));
    socket.on("buildPatch", (payload) => emit("buildPatch", payload));
    socket.on("voiceSignal", (payload) => emit("voiceSignal", payload));
    socket.on("voiceState", (payload) => emit("voiceState", payload));
    socket.on("voiceStates", (payload) => emit("voiceStates", payload));
    socket.on("hearState", (payload) => emit("hearState", payload));
    socket.on("hearStates", (payload) => emit("hearStates", payload));
    socket.on("zombieKilled", (payload) => emit("zombieKilled", payload));

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
        },
        buildAction(data) {
            socket.emit("buildAction", data);
        },
        voiceSignal(data) {
            socket.emit("voiceSignal", data);
        },
        voiceState(data) {
            socket.emit("voiceState", data);
        },
        hearState(data) {
            socket.emit("hearState", data);
        },
        zombieKilled(data) {
            socket.emit("zombieKilled", data);
        },
        setProfile(data) {
            socket.emit("setProfile", data);
        }
    };
}
