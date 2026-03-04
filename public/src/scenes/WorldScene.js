import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { VirtualJoystick } from "../controls/virtualJoystick.js";
import { createHudControls } from "../ui/hud.js";

const MAX_PLAYERS = 4;
const PLAYER_SPEED = 190;
const DIRECTIONS = ["down", "left", "right", "up"];

function chooseColorOffset(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash) % 2 === 0 ? 0 : 12;
}

export class WorldScene extends Phaser.Scene {
    constructor(socketAdapter) {
        super("WorldScene");
        this.socketAdapter = socketAdapter;
        this.players = new Map();
        this.playerList = {};
        this.pendingBubbles = new Map();
        this.lastEmitTime = 0;
        this.lastSentState = null;
    }

    create() {
        this.hud = createHudControls();
        this.hud.setMission("Find your partner and enter the house");
        this.hud.setLove(35);

        this.createMap();
        this.createWorldDetails();
        this.createInput();
        this.createLocalPlayer();
        this.setupNetworking();
        this.createDayNightOverlay();
        this.bindChatInput();

        this.events.once("shutdown", () => this.cleanup());
    }

    createMap() {
        const tileCount = WORLD_SIZE / TILE_SIZE;
        const map = this.make.tilemap({
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
            width: tileCount,
            height: tileCount
        });

        const tileset = map.addTilesetImage("tiles", "tiles", TILE_SIZE, TILE_SIZE, 0, 0);
        this.groundLayer = map.createBlankLayer("ground", tileset);
        this.roadLayer = map.createBlankLayer("roads", tileset);
        this.blockLayer = map.createBlankLayer("blockers", tileset);

        this.groundLayer.fill(0);

        for (let x = 0; x < tileCount; x += 1) {
            this.roadLayer.putTileAt(1, x, 22);
            this.roadLayer.putTileAt(1, x, 23);
            this.roadLayer.putTileAt(1, x, 24);
        }

        for (let y = 0; y < tileCount; y += 1) {
            this.roadLayer.putTileAt(1, 22, y);
            this.roadLayer.putTileAt(1, 23, y);
            this.roadLayer.putTileAt(1, 24, y);
        }

        for (let x = 8; x <= 14; x += 1) {
            for (let y = 8; y <= 12; y += 1) {
                this.blockLayer.putTileAt(2, x, y);
            }
        }

        for (let x = 30; x <= 36; x += 1) {
            for (let y = 10; y <= 16; y += 1) {
                this.blockLayer.putTileAt(2, x, y);
            }
        }

        for (let x = 31; x <= 35; x += 1) {
            for (let y = 30; y <= 34; y += 1) {
                this.blockLayer.putTileAt(3, x, y);
            }
        }

        this.blockLayer.setCollision([2, 3]);

        this.houseZone = this.add.zone(33 * TILE_SIZE, 35 * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
        this.physics.add.existing(this.houseZone, true);

        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    createWorldDetails() {
        const decor = this.add.graphics();

        const drawBuilding = (x, y, w, h, color, doorSide = "bottom") => {
            decor.fillStyle(color, 1);
            decor.fillRect(x, y, w, h);

            decor.lineStyle(2, 0x2f241a, 0.9);
            decor.strokeRect(x, y, w, h);

            decor.fillStyle(0xc7d6e8, 0.9);
            const windowSize = 18;
            for (let i = 0; i < 3; i += 1) {
                const wx = x + 18 + i * 26;
                const wy = y + 16;
                if (wx + windowSize < x + w - 8) {
                    decor.fillRect(wx, wy, windowSize, windowSize);
                }
            }

            decor.fillStyle(0x563620, 1);
            if (doorSide === "bottom") {
                decor.fillRect(x + w / 2 - 10, y + h - 24, 20, 24);
            } else if (doorSide === "left") {
                decor.fillRect(x, y + h / 2 - 10, 24, 20);
            } else {
                decor.fillRect(x + w - 24, y + h / 2 - 10, 24, 20);
            }
        };

        drawBuilding(8 * TILE_SIZE, 8 * TILE_SIZE, 7 * TILE_SIZE, 5 * TILE_SIZE, 0x7e6b57, "bottom");
        drawBuilding(30 * TILE_SIZE, 10 * TILE_SIZE, 7 * TILE_SIZE, 7 * TILE_SIZE, 0x6f7e65, "left");
        drawBuilding(31 * TILE_SIZE, 30 * TILE_SIZE, 5 * TILE_SIZE, 5 * TILE_SIZE, 0x8d7b66, "bottom");

        // House entry marker and door lights.
        decor.fillStyle(0xffd166, 0.8);
        decor.fillRect(33 * TILE_SIZE - 16, 35 * TILE_SIZE - 10, 32, 10);
        decor.fillStyle(0xf8f4ce, 0.65);
        decor.fillCircle(33 * TILE_SIZE - 8, 35 * TILE_SIZE - 12, 3);
        decor.fillCircle(33 * TILE_SIZE + 8, 35 * TILE_SIZE - 12, 3);

        // Sidewalk accents and trees for a more lively street.
        decor.fillStyle(0xcabfab, 0.65);
        decor.fillRect(0, 21 * TILE_SIZE, WORLD_SIZE, 6);
        decor.fillRect(0, 25 * TILE_SIZE - 6, WORLD_SIZE, 6);
        decor.fillRect(21 * TILE_SIZE, 0, 6, WORLD_SIZE);
        decor.fillRect(25 * TILE_SIZE - 6, 0, 6, WORLD_SIZE);

        const tree = (x, y) => {
            decor.fillStyle(0x5d3d2b, 1);
            decor.fillRect(x - 4, y + 8, 8, 18);
            decor.fillStyle(0x2d8e53, 1);
            decor.fillCircle(x, y, 16);
            decor.fillCircle(x - 10, y + 6, 10);
            decor.fillCircle(x + 10, y + 6, 10);
        };

        tree(17 * TILE_SIZE, 17 * TILE_SIZE);
        tree(26 * TILE_SIZE, 17 * TILE_SIZE);
        tree(17 * TILE_SIZE, 28 * TILE_SIZE);
        tree(26 * TILE_SIZE, 28 * TILE_SIZE);

        decor.setDepth(600);
    }

    createInput() {
        this.keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            up2: Phaser.Input.Keyboard.KeyCodes.UP,
            down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
            left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
            right2: Phaser.Input.Keyboard.KeyCodes.RIGHT
        });

        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        if (isTouch) {
            const root = document.getElementById("mobileJoystick");
            const knob = document.getElementById("joystickKnob");
            this.joystick = new VirtualJoystick(root, knob);
        }
    }

    createLocalPlayer() {
        const spawn = this.scene.settings.data?.spawn || { x: 500, y: 500 };

        this.localPlayer = new PlayerEntity(
            this,
            spawn.x,
            spawn.y,
            "player",
            0,
            "local",
            "You",
            true
        );

        this.physics.add.collider(this.localPlayer.sprite, this.blockLayer);
        this.physics.add.overlap(this.localPlayer.sprite, this.houseZone, () => {
            this.enterHouse();
        });

        this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.16, 0.16);
    }

    setupNetworking() {
        this.unsubPlayers = this.socketAdapter.on("players", (players) => {
            this.playerList = players;
            this.syncRemotePlayers();
            this.updateLoveMeter();
        });

        this.unsubChat = this.socketAdapter.on("chat", ({ id, message }) => {
            if (!id || !message) {
                return;
            }

            if (id === this.socketAdapter.id) {
                this.localPlayer.showChatBubble(message);
                return;
            }

            const remote = this.players.get(id);
            if (remote) {
                remote.showChatBubble(message);
            } else {
                this.pendingBubbles.set(id, message);
            }
        });
    }

    bindChatInput() {
        this.chatInput = this.hud.chatInput;
        this.chatForm = this.hud.chatForm;
        this.chatHandler = (event) => {
            event.preventDefault();
            const msg = this.chatInput.value.trim();
            if (!msg) {
                return;
            }

            this.socketAdapter.chat(msg);
            this.chatInput.value = "";
        };

        this.chatForm.addEventListener("submit", this.chatHandler);
    }

    syncRemotePlayers() {
        const entries = Object.entries(this.playerList).slice(0, MAX_PLAYERS);
        const seen = new Set();

        for (const [id, state] of entries) {
            if (!state || id === this.socketAdapter.id) {
                continue;
            }

            seen.add(id);
            const existing = this.players.get(id);

            if (!existing) {
                const entity = new PlayerEntity(
                    this,
                    state.x ?? 500,
                    state.y ?? 500,
                    "player",
                    chooseColorOffset(id),
                    id,
                    state.name || `P-${id.slice(0, 3)}`
                );

                this.players.set(id, entity);
                this.physics.add.collider(entity.sprite, this.blockLayer);

                const pending = this.pendingBubbles.get(id);
                if (pending) {
                    entity.showChatBubble(pending);
                    this.pendingBubbles.delete(id);
                }
            }

            const remote = this.players.get(id);
            remote.setName(state.name || remote.name);
            remote.setTargetFromNetwork({
                x: state.x ?? remote.sprite.x,
                y: state.y ?? remote.sprite.y,
                direction: state.direction || "down",
                animState: state.animState || "idle",
                frame: state.frame,
                message: state.message || ""
            });
        }

        for (const [id, entity] of this.players.entries()) {
            if (!seen.has(id)) {
                entity.destroy();
                this.players.delete(id);
            }
        }
    }

    update(time, delta) {
        this.updateLocalMovement();
        this.updateRemoteInterpolation(delta);
        this.updateDayNight(time);
        this.sendMoveIfNeeded(time);
    }

    updateLocalMovement() {
        let moveX = 0;
        let moveY = 0;

        if (this.keys.left.isDown || this.keys.left2.isDown) {
            moveX -= 1;
        }
        if (this.keys.right.isDown || this.keys.right2.isDown) {
            moveX += 1;
        }
        if (this.keys.up.isDown || this.keys.up2.isDown) {
            moveY -= 1;
        }
        if (this.keys.down.isDown || this.keys.down2.isDown) {
            moveY += 1;
        }

        if (this.joystick) {
            const j = this.joystick.getVector();
            moveX += j.x;
            moveY += j.y;
        }

        const vec = new Phaser.Math.Vector2(moveX, moveY);
        if (vec.lengthSq() > 1) {
            vec.normalize();
        }

        this.localPlayer.setVelocity(vec.x * PLAYER_SPEED, vec.y * PLAYER_SPEED);

        const body = this.localPlayer.sprite.body;
        const velocitySq = body.velocity.lengthSq();
        const animState = velocitySq > 4 ? "walk" : "idle";
        let direction = this.localPlayer.lastState.direction;

        if (Math.abs(body.velocity.x) > Math.abs(body.velocity.y)) {
            direction = body.velocity.x >= 0 ? "right" : "left";
        } else if (Math.abs(body.velocity.y) > 4) {
            direction = body.velocity.y >= 0 ? "down" : "up";
        }

        if (!DIRECTIONS.includes(direction)) {
            direction = "down";
        }

        this.localPlayer.lastState = {
            x: this.localPlayer.sprite.x,
            y: this.localPlayer.sprite.y,
            direction,
            animState,
            frame: this.localPlayer.sprite.frame?.name || 0
        };

        this.localPlayer.applyAnimation(direction, animState);
        this.localPlayer.syncVisuals();
    }

    updateRemoteInterpolation(delta) {
        for (const remote of this.players.values()) {
            remote.interpolate(delta);
        }
    }

    sendMoveIfNeeded(time) {
        if (!this.socketAdapter.id) {
            return;
        }

        const s = this.localPlayer.lastState;
        const roundedState = {
            x: Math.round(s.x),
            y: Math.round(s.y),
            direction: s.direction,
            animState: s.animState,
            frame: Number.isInteger(s.frame) ? s.frame : 0,
            name: "You"
        };

        const changed =
            !this.lastSentState ||
            Math.abs(roundedState.x - this.lastSentState.x) > 1 ||
            Math.abs(roundedState.y - this.lastSentState.y) > 1 ||
            roundedState.direction !== this.lastSentState.direction ||
            roundedState.animState !== this.lastSentState.animState;

        if (!changed) {
            return;
        }

        if (time - this.lastEmitTime < 66) {
            return;
        }

        this.lastEmitTime = time;
        this.lastSentState = roundedState;
        this.socketAdapter.move(roundedState);
    }

    createDayNightOverlay() {
        this.dayNight = this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x0a1130, 0.1);
        this.dayNight.setOrigin(0, 0);
        this.dayNight.setScrollFactor(1);
        this.dayNight.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.dayNight.setDepth(5000);
    }

    updateDayNight(time) {
        const cycle = (Math.sin(time / 14000) + 1) / 2;
        this.dayNight.setAlpha(0.06 + cycle * 0.22);
    }

    updateLoveMeter() {
        let nearest = 99999;

        for (const p of this.players.values()) {
            const d = Phaser.Math.Distance.Between(
                this.localPlayer.sprite.x,
                this.localPlayer.sprite.y,
                p.sprite.x,
                p.sprite.y
            );
            nearest = Math.min(nearest, d);
        }

        const meter = nearest === 99999 ? 20 : Phaser.Math.Clamp(100 - nearest / 6, 10, 100);
        this.hud.setLove(Math.round(meter));

        if (meter > 70) {
            this.hud.setMission("Stay close and enter the house");
        }
    }

    enterHouse() {
        this.scene.start("InteriorScene", {
            returnX: 33 * TILE_SIZE,
            returnY: 36 * TILE_SIZE
        });
    }

    cleanup() {
        if (this.unsubPlayers) {
            this.unsubPlayers();
        }
        if (this.unsubChat) {
            this.unsubChat();
        }

        if (this.chatForm && this.chatHandler) {
            this.chatForm.removeEventListener("submit", this.chatHandler);
        }

        for (const p of this.players.values()) {
            p.destroy();
        }
        this.players.clear();

        if (this.localPlayer) {
            this.localPlayer.destroy();
        }
    }
}
