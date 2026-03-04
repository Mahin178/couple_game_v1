import { gameConfig } from "./src/config.js";
import { createSocketAdapter } from "./src/net.js";
import { BootScene } from "./src/scenes/BootScene.js";
import { WorldScene } from "./src/scenes/WorldScene.js";
import { InteriorScene } from "./src/scenes/InteriorScene.js";

const socketAdapter = createSocketAdapter(io());

new Phaser.Game({
    ...gameConfig,
    parent: "game-root",
    scene: [
        new BootScene(socketAdapter),
        new WorldScene(socketAdapter),
        new InteriorScene(socketAdapter)
    ]
});
