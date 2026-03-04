export function createSocketAdapter(socket) {
    const listeners = new Map();

    socket.on("connect", () => emit("connect", socket.id));
    socket.on("currentPlayers", (players) => emit("players", players));
    socket.on("updatePlayers", (players) => emit("players", players));

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
        }
    };
}
