import { createPlayerSpriteSheetDataURL, createTilesDataURL } from "../assets/generatedTextures.js";

function createWalkAnim(scene, texture, baseOffset, direction, rowOffset) {
    const key = `${texture}-${baseOffset}-walk-${direction}`;
    if (scene.anims.exists(key)) {
        return;
    }

    const start = baseOffset + rowOffset * 3;
    scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texture, { start, end: start + 2 }),
        frameRate: 12,
        repeat: -1
    });
}

export class BootScene extends Phaser.Scene {
    constructor(socketAdapter) {
        super("BootScene");
        this.socketAdapter = socketAdapter;
    }

    preload() {
        this.load.spritesheet("player", createPlayerSpriteSheetDataURL(), {
            frameWidth: 32,
            frameHeight: 32
        });

        this.load.spritesheet("tiles", createTilesDataURL(), {
            frameWidth: 64,
            frameHeight: 64
        });
    }

    create() {
        const dirs = ["down", "left", "right", "up"];

        dirs.forEach((dir, index) => {
            createWalkAnim(this, "player", 0, dir, index);
            createWalkAnim(this, "player", 12, dir, index);
        });

        this.scene.start("WorldScene");
    }
}
