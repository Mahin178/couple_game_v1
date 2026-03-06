export const WORLD_SIZE = 8192;
export const TILE_SIZE = 64;
const isTouchDevice = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
const deviceResolution = Math.max(1, window.devicePixelRatio || 1);

export const gameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#0a1112",
    pixelArt: true,
    roundPixels: true,
    resolution: isTouchDevice ? Math.min(1.5, deviceResolution) : Math.min(2, deviceResolution),
    fps: {
        target: 60,
        forceSetTimeOut: false
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 },
            debug: false,
            fps: 60
        }
    },
    render: {
        antialias: false,
        powerPreference: "high-performance"
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};
