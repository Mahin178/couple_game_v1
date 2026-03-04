import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { VirtualJoystick } from "../controls/virtualJoystick.js";
import { createHudControls } from "../ui/hud.js";

const MAX_PLAYERS = 4;
const PLAYER_SPEED = 190;
const CAR_ACCEL = 520;
const CAR_BRAKE = 680;
const CAR_MAX_FORWARD = 430;
const CAR_MAX_REVERSE = -190;
const DIRECTIONS = ["down", "left", "right", "up"];

const CAR_CONFIG = [
    { id: "car_red", body: 0xd64045, roof: 0xf0e7d8 },
    { id: "car_pink", body: 0xef7db4, roof: 0xffecf4 }
];

function chooseColorOffset(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash) % 2 === 0 ? 0 : 12;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function angleToDirection(angle) {
    const deg = Phaser.Math.RadToDeg(angle);
    if (deg >= -45 && deg < 45) {
        return "right";
    }
    if (deg >= 45 && deg < 135) {
        return "down";
    }
    if (deg >= -135 && deg < -45) {
        return "up";
    }
    return "left";
}

export class WorldScene extends Phaser.Scene {
    constructor(socketAdapter) {
        super("WorldScene");
        this.socketAdapter = socketAdapter;
        this.players = new Map();
        this.playerList = {};
        this.pendingBubbles = new Map();
        this.vehicleStates = {};
        this.vehicleRender = {};
        this.vehicleSprites = {};
        this.localVehiclePhysics = {};
        this.lastEmitTime = 0;
        this.lastDriveEmitTime = 0;
        this.lastSentState = null;
        this.drivePadVector = { x: 0, y: 0 };
        this.localHasFlower = false;
        this.nearDoor = null;
        this.pendingFlowerOfferFrom = null;
        this.giveTargetId = null;
        this.loveBonus = 0;
        this.isGameOver = false;
    }

    create() {
        this.hud = createHudControls();
        this.hud.showGameOver(false);
        this.hud.setMission("Explore, drive together, and avoid villains");
        this.hud.setLove(35);

        this.createMap();
        this.createWorldDetails();
        this.createVehicles();
        this.createVillains();
        this.createFlower();
        this.createInput();
        this.createLocalPlayer();
        this.setupNetworking();
        this.createDayNightOverlay();
        this.bindChatInput();
        this.bindEmojiButtons();
        this.bindActionButtons();
        this.bindDrivePadButtons();
        this.bindRestartButton();

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

        this.buildingDoors = [
            {
                id: "home_a",
                x: 11.5 * TILE_SIZE,
                y: 13 * TILE_SIZE - 6,
                returnX: 11.5 * TILE_SIZE,
                returnY: 13 * TILE_SIZE + 26,
                interiorTheme: "warm"
            },
            {
                id: "home_b",
                x: 30 * TILE_SIZE + 14,
                y: 13.5 * TILE_SIZE,
                returnX: 30 * TILE_SIZE + 44,
                returnY: 13.5 * TILE_SIZE + 20,
                interiorTheme: "mint"
            },
            {
                id: "home_c",
                x: 33.5 * TILE_SIZE,
                y: 35 * TILE_SIZE - 6,
                returnX: 33.5 * TILE_SIZE,
                returnY: 35 * TILE_SIZE + 26,
                interiorTheme: "sunset"
            }
        ];
        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    createWorldDetails() {
        const decor = this.add.graphics();

        const drawBuilding3D = (x, y, w, h, wallColor, roofColor, doorSide = "bottom") => {
            decor.fillStyle(0x000000, 0.22);
            decor.fillRect(x + 10, y + h + 8, w, 14);

            decor.fillStyle(wallColor, 1);
            decor.fillRect(x, y, w, h);

            decor.fillStyle(roofColor, 1);
            decor.fillRect(x - 6, y - 10, w + 12, 10);

            decor.lineStyle(2, 0x2f241a, 0.9);
            decor.strokeRect(x, y, w, h);

            decor.fillStyle(0xc7d6e8, 0.92);
            for (let i = 0; i < 3; i += 1) {
                const wx = x + 18 + i * 26;
                const wy = y + 16;
                if (wx + 18 < x + w - 8) {
                    decor.fillRect(wx, wy, 18, 18);
                    decor.fillStyle(0xffffff, 0.35);
                    decor.fillRect(wx + 2, wy + 2, 4, 4);
                    decor.fillStyle(0xc7d6e8, 0.92);
                }
            }

            decor.fillStyle(0x563620, 1);
            if (doorSide === "bottom") {
                decor.fillRect(x + w / 2 - 10, y + h - 24, 20, 24);
                decor.fillStyle(0xf6dd9e, 0.9);
                decor.fillCircle(x + w / 2 + 6, y + h - 12, 2);
            } else if (doorSide === "left") {
                decor.fillRect(x, y + h / 2 - 10, 24, 20);
            } else {
                decor.fillRect(x + w - 24, y + h / 2 - 10, 24, 20);
            }
        };

        drawBuilding3D(8 * TILE_SIZE, 8 * TILE_SIZE, 7 * TILE_SIZE, 5 * TILE_SIZE, 0x7e6b57, 0x927f69, "bottom");
        drawBuilding3D(30 * TILE_SIZE, 10 * TILE_SIZE, 7 * TILE_SIZE, 7 * TILE_SIZE, 0x6f7e65, 0x859179, "left");
        drawBuilding3D(31 * TILE_SIZE, 30 * TILE_SIZE, 5 * TILE_SIZE, 5 * TILE_SIZE, 0x8d7b66, 0xa28f79, "bottom");

        for (const door of this.buildingDoors) {
            decor.fillStyle(0xffd166, 0.88);
            decor.fillRect(door.x - 16, door.y - 10, 32, 10);
            decor.fillStyle(0xfff2b0, 0.7);
            decor.fillCircle(door.x - 8, door.y - 12, 3);
            decor.fillCircle(door.x + 8, door.y - 12, 3);
        }

        decor.fillStyle(0xcabfab, 0.55);
        decor.fillRect(0, 21 * TILE_SIZE, WORLD_SIZE, 6);
        decor.fillRect(0, 25 * TILE_SIZE - 6, WORLD_SIZE, 6);
        decor.fillRect(21 * TILE_SIZE, 0, 6, WORLD_SIZE);
        decor.fillRect(25 * TILE_SIZE - 6, 0, 6, WORLD_SIZE);

        for (let x = 0; x < WORLD_SIZE; x += 180) {
            decor.fillStyle(0xf6f0ce, 0.65);
            decor.fillRect(x + 36, 23 * TILE_SIZE - 2, 18, 4);
        }

        const tree = (x, y) => {
            decor.fillStyle(0x000000, 0.22);
            decor.fillEllipse(x + 3, y + 20, 24, 10);
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

    createVehicles() {
        for (const config of CAR_CONFIG) {
            this.vehicleStates[config.id] = {
                id: config.id,
                x: config.id === "car_red" ? 1400 : 1530,
                y: config.id === "car_red" ? 1450 : 1520,
                angle: 0,
                speed: 0,
                driverId: null,
                passengerId: null
            };

            this.localVehiclePhysics[config.id] = {
                speed: 0,
                angle: 0
            };

            const shadow = this.add.ellipse(0, 9, 76, 22, 0x000000, 0.28).setDepth(880);
            const body = this.add.rectangle(0, 0, 72, 36, config.body, 1).setDepth(890);
            const roof = this.add.rectangle(0, -1, 40, 22, config.roof, 1).setDepth(891);
            const windshield = this.add.rectangle(0, -6, 24, 8, 0xc5e4f9, 0.85).setDepth(892);
            const stripe = this.add.rectangle(0, 11, 52, 3, 0x111111, 0.22).setDepth(892);
            const lightL = this.add.rectangle(30, -8, 6, 6, 0xfff2b0, 1).setDepth(893);
            const lightR = this.add.rectangle(30, 8, 6, 6, 0xfff2b0, 1).setDepth(893);
            const wheelFL = this.add.rectangle(20, -16, 12, 5, 0x1b1b1d, 1).setDepth(889);
            const wheelFR = this.add.rectangle(20, 16, 12, 5, 0x1b1b1d, 1).setDepth(889);
            const wheelBL = this.add.rectangle(-20, -16, 12, 5, 0x1b1b1d, 1).setDepth(889);
            const wheelBR = this.add.rectangle(-20, 16, 12, 5, 0x1b1b1d, 1).setDepth(889);

            const container = this.add
                .container(this.vehicleStates[config.id].x, this.vehicleStates[config.id].y, [
                    shadow,
                    body,
                    roof,
                    windshield,
                    stripe,
                    wheelFL,
                    wheelFR,
                    wheelBL,
                    wheelBR,
                    lightL,
                    lightR
                ])
                .setDepth(895);

            this.vehicleRender[config.id] = {
                x: this.vehicleStates[config.id].x,
                y: this.vehicleStates[config.id].y,
                angle: 0
            };

            this.vehicleSprites[config.id] = {
                container,
                lightL,
                lightR,
                shadow,
                wheels: [wheelFL, wheelFR, wheelBL, wheelBR]
            };
        }
    }

    createVillains() {
        this.villains = [
            { homeX: 12 * TILE_SIZE, homeY: 21 * TILE_SIZE, x: 12 * TILE_SIZE, y: 21 * TILE_SIZE, targetId: null, active: false, speed: 165 },
            { homeX: 35 * TILE_SIZE, homeY: 24 * TILE_SIZE, x: 35 * TILE_SIZE, y: 24 * TILE_SIZE, targetId: null, active: false, speed: 180 }
        ];

        for (const v of this.villains) {
            v.shadow = this.add.ellipse(v.x, v.y + 10, 24, 8, 0x000000, 0.25).setDepth(900);
            v.body = this.add.rectangle(v.x, v.y, 20, 26, 0x2b2f63).setDepth(902);
            v.head = this.add.circle(v.x, v.y - 18, 8, 0xf1ccad).setDepth(903);
            v.eye = this.add.circle(v.x + 2, v.y - 18, 2, 0x111111).setDepth(904);
        }
    }

    createFlower() {
        this.flower = this.add.circle(19 * TILE_SIZE, 23 * TILE_SIZE, 10, 0xee3e79).setDepth(880);
        this.flowerStem = this.add.rectangle(19 * TILE_SIZE, 23 * TILE_SIZE + 12, 4, 16, 0x2f8a52).setDepth(879);
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
            right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            exitCar: Phaser.Input.Keyboard.KeyCodes.X
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
        this.localPlayer = new PlayerEntity(this, spawn.x, spawn.y, "player", 0, "local", "You", true);
        this.physics.add.collider(this.localPlayer.sprite, this.blockLayer);
        this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.16, 0.16);
    }

    setupNetworking() {
        this.unsubPlayers = this.socketAdapter.on("players", (players) => {
            this.playerList = players;
            const me = players[this.socketAdapter.id];
            if (me && typeof me.hasFlower === "boolean") {
                this.localHasFlower = me.hasFlower;
                this.localPlayer?.setHasFlower(this.localHasFlower);
            }
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

        this.unsubVehicle = this.socketAdapter.on("vehicleState", (payload) => {
            const vehicles = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
            for (const state of vehicles) {
                if (!state?.id || !this.vehicleStates[state.id]) {
                    continue;
                }

                const isLocalDriver = this.getDrivingVehicleId() === state.id;
                const merged = {
                    ...this.vehicleStates[state.id],
                    ...state
                };

                if (isLocalDriver) {
                    merged.x = this.vehicleStates[state.id].x;
                    merged.y = this.vehicleStates[state.id].y;
                    merged.angle = this.vehicleStates[state.id].angle;
                    merged.speed = this.vehicleStates[state.id].speed;
                }

                this.vehicleStates[state.id] = merged;
            }

            this.applyVehicleState();
        });

        this.unsubFlowerOffer = this.socketAdapter.on("flowerOffer", ({ fromId, fromName }) => {
            this.pendingFlowerOfferFrom = fromId;
            this.hud.showAction("acceptFlower", true);
            this.hud.setMission(`${fromName || "Partner"} sent you a flower. Tap Accept.`);

            this.time.delayedCall(7000, () => {
                if (this.pendingFlowerOfferFrom === fromId) {
                    this.pendingFlowerOfferFrom = null;
                    this.hud.showAction("acceptFlower", false);
                }
            });
        });

        this.unsubFlowerResponse = this.socketAdapter.on("flowerResponse", ({ accepted }) => {
            if (accepted) {
                this.localHasFlower = false;
                this.localPlayer?.setHasFlower(false);
                this.hud.setMission("Flower accepted. Relationship boosted.");
            } else {
                this.hud.setMission("Flower declined. Try again later.");
            }
        });

        this.unsubLoveBoost = this.socketAdapter.on("loveBoost", ({ amount }) => {
            this.loveBonus = clamp(this.loveBonus + (Number(amount) || 0), 0, 45);
        });
    }

    bindChatInput() {
        this.chatInput = this.hud.chatInput;
        this.chatForm = this.hud.chatForm;
        this.chatHandler = (event) => {
            event.preventDefault();
            const msg = this.chatInput.value.trim();
            if (!msg || this.isGameOver) {
                return;
            }

            this.socketAdapter.chat(msg);
            this.chatInput.value = "";
        };

        this.chatForm.addEventListener("submit", this.chatHandler);
    }

    bindEmojiButtons() {
        this.emojiHandlers = [];

        for (const button of this.hud.emojiButtons) {
            const handler = () => {
                const emoji = button.dataset.emoji;
                if (emoji && !this.isGameOver) {
                    this.socketAdapter.chat(emoji);
                }
            };

            button.addEventListener("click", handler);
            this.emojiHandlers.push({ button, handler });
        }
    }

    bindActionButtons() {
        this.actionHandlers = [];

        const bind = (name, handler) => {
            const button = this.hud.buttons[name];
            if (!button) {
                return;
            }

            button.addEventListener("click", handler);
            this.actionHandlers.push({ button, handler });
        };

        bind("drive", () => this.tryDrive());
        bind("sit", () => this.trySit());
        bind("exitCar", () => this.exitCar());
        bind("openDoor", () => this.openDoor());
        bind("pickFlower", () => this.pickFlower());
        bind("giveFlower", () => this.offerFlower());
        bind("acceptFlower", () => this.acceptFlower());
    }

    bindDrivePadButtons() {
        this.drivePadHandlers = [];
        const pad = this.hud.drivePad;

        const makeHold = (button, x, y) => {
            const onDown = (event) => {
                event.preventDefault();
                this.drivePadVector.x = x;
                this.drivePadVector.y = y;
            };

            const onUp = () => {
                if (this.drivePadVector.x === x && this.drivePadVector.y === y) {
                    this.drivePadVector.x = 0;
                    this.drivePadVector.y = 0;
                }
            };

            button.addEventListener("pointerdown", onDown);
            button.addEventListener("pointerup", onUp);
            button.addEventListener("pointercancel", onUp);
            button.addEventListener("pointerleave", onUp);
            this.drivePadHandlers.push({ button, onDown, onUp });
        };

        makeHold(pad.up, 0, -1);
        makeHold(pad.down, 0, 1);
        makeHold(pad.left, -1, 0);
        makeHold(pad.right, 1, 0);
    }

    bindRestartButton() {
        this.restartHandler = () => {
            window.location.reload();
        };

        this.hud.restartButton.addEventListener("click", this.restartHandler);
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
                message: state.message || "",
                hasFlower: Boolean(state.hasFlower)
            });

            const hidden = Boolean(state.inVehicle);
            remote.sprite.setVisible(!hidden);
            remote.nameText.setVisible(!hidden);
            remote.bubble.setVisible(!hidden);
        }

        for (const [id, entity] of this.players.entries()) {
            if (!seen.has(id)) {
                entity.destroy();
                this.players.delete(id);
            }
        }
    }

    update(time, delta) {
        const dt = delta / 1000;
        this.localPlayer.setHasFlower(this.localHasFlower);

        if (!this.isGameOver) {
            if (this.getDrivingVehicleId()) {
                this.updateDrivingMovement(dt, time);
            } else {
                this.updateLocalMovement();
            }

            if (Phaser.Input.Keyboard.JustDown(this.keys.exitCar) && this.isLocalInVehicle()) {
                this.exitCar();
            }
        }

        this.updateRemoteInterpolation(delta);
        this.updateVehicleVisual();
        this.updateVillains(dt);
        this.updateFlowerVisual();
        this.updateInteractionButtons();
        this.updateCameraTarget();
        this.updateDayNight(time);
        this.updateLoveMeter();

        if (!this.isGameOver) {
            this.sendMoveIfNeeded(time);
        }
    }

    updateLocalMovement() {
        if (this.isLocalInVehicle()) {
            this.localPlayer.setVelocity(0, 0);
            this.localPlayer.sprite.setVisible(false);
            this.localPlayer.nameText.setVisible(false);
            this.localPlayer.bubble.setVisible(false);
            return;
        }

        this.localPlayer.sprite.setVisible(true);
        this.localPlayer.nameText.setVisible(true);
        this.localPlayer.bubble.setVisible(true);

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

    updateDrivingMovement(dt, time) {
        const vehicleId = this.getDrivingVehicleId();
        if (!vehicleId) {
            return;
        }

        const state = this.vehicleStates[vehicleId];
        const physics = this.localVehiclePhysics[vehicleId];

        let throttle = 0;
        let steer = 0;

        if (this.keys.up.isDown || this.keys.up2.isDown) {
            throttle += 1;
        }
        if (this.keys.down.isDown || this.keys.down2.isDown) {
            throttle -= 1;
        }
        if (this.keys.left.isDown || this.keys.left2.isDown) {
            steer -= 1;
        }
        if (this.keys.right.isDown || this.keys.right2.isDown) {
            steer += 1;
        }

        throttle += -this.drivePadVector.y;
        steer += this.drivePadVector.x;

        throttle = clamp(throttle, -1, 1);
        steer = clamp(steer, -1, 1);

        if (Math.abs(throttle) > 0.02) {
            physics.speed += throttle * CAR_ACCEL * dt;
        } else {
            physics.speed = Phaser.Math.Linear(physics.speed, 0, Math.min(1, dt * 2.2));
        }

        if (Math.sign(throttle) !== 0 && Math.sign(throttle) !== Math.sign(physics.speed)) {
            physics.speed = Phaser.Math.Linear(physics.speed, 0, Math.min(1, dt * 3.4));
        }

        physics.speed = clamp(physics.speed, CAR_MAX_REVERSE, CAR_MAX_FORWARD);

        if (Math.abs(throttle) < 0.05 && Math.abs(physics.speed) > 0.01) {
            const drag = CAR_BRAKE * dt * Math.sign(physics.speed);
            if (Math.abs(drag) > Math.abs(physics.speed)) {
                physics.speed = 0;
            } else {
                physics.speed -= drag;
            }
        }

        const turnScale = clamp(Math.abs(physics.speed) / 240, 0.2, 1.6);
        physics.angle += steer * 2.1 * turnScale * dt * (physics.speed >= 0 ? 1 : -1);

        state.x = clamp(state.x + Math.cos(physics.angle) * physics.speed * dt, 60, WORLD_SIZE - 60);
        state.y = clamp(state.y + Math.sin(physics.angle) * physics.speed * dt, 60, WORLD_SIZE - 60);
        state.angle = physics.angle;
        state.speed = physics.speed;

        this.localPlayer.setVelocity(0, 0);
        this.localPlayer.sprite.x = state.x;
        this.localPlayer.sprite.y = state.y;
        this.localPlayer.lastState.x = state.x;
        this.localPlayer.lastState.y = state.y;
        this.localPlayer.syncVisuals();

        if (time - this.lastDriveEmitTime > 50) {
            this.lastDriveEmitTime = time;
            this.socketAdapter.driveInput({
                vehicleId,
                x: Number(state.x.toFixed(2)),
                y: Number(state.y.toFixed(2)),
                angle: Number(state.angle.toFixed(5)),
                speed: Number(state.speed.toFixed(3))
            });
        }
    }

    applyVehicleState() {
        const seat = this.getLocalSeat();
        if (!seat) {
            this.localPlayer.sprite.setVisible(true);
            this.localPlayer.nameText.setVisible(true);
            this.localPlayer.bubble.setVisible(true);
            return;
        }

        const state = this.vehicleStates[seat.vehicleId];
        if (!state) {
            return;
        }

        if (seat.role === "driver") {
            this.localVehiclePhysics[seat.vehicleId].angle = state.angle;
            this.localVehiclePhysics[seat.vehicleId].speed = state.speed;
            this.localPlayer.sprite.x = state.x;
            this.localPlayer.sprite.y = state.y;
        } else {
            const px = state.x - Math.cos(state.angle) * 20 - Math.sin(state.angle) * 16;
            const py = state.y - Math.sin(state.angle) * 20 + Math.cos(state.angle) * 16;
            this.localPlayer.sprite.x = px;
            this.localPlayer.sprite.y = py;
        }

        this.localPlayer.lastState.x = this.localPlayer.sprite.x;
        this.localPlayer.lastState.y = this.localPlayer.sprite.y;
        this.localPlayer.syncVisuals();
        this.localPlayer.sprite.setVisible(false);
        this.localPlayer.nameText.setVisible(false);
        this.localPlayer.bubble.setVisible(false);
    }

    updateVehicleVisual() {
        for (const config of CAR_CONFIG) {
            const id = config.id;
            const state = this.vehicleStates[id];
            const render = this.vehicleRender[id];
            const sprite = this.vehicleSprites[id];
            if (!state || !render || !sprite) {
                continue;
            }

            const localSeat = this.getLocalSeat();
            const localDrivingThis = localSeat?.vehicleId === id && localSeat.role === "driver";
            const lerp = localDrivingThis ? 0.5 : 0.22;

            render.x = Phaser.Math.Linear(render.x, state.x, lerp);
            render.y = Phaser.Math.Linear(render.y, state.y, lerp);
            render.angle = Phaser.Math.Angle.RotateTo(render.angle, state.angle, 0.25);

            sprite.container.setPosition(render.x, render.y);
            sprite.container.setRotation(render.angle);
            sprite.shadow.setScale(1 + Math.abs(state.speed) / 620, 1);

            const bright = state.driverId ? 1 : 0.55;
            sprite.lightL.setAlpha(bright);
            sprite.lightR.setAlpha(bright);
        }
    }

    updateVillains(dt) {
        const localPos = this.getPlayerWorldPosition(this.socketAdapter.id);

        for (const villain of this.villains) {
            const target = villain.targetId ? this.getPlayerWorldPosition(villain.targetId) : null;

            if (!target || Phaser.Math.Distance.Between(villain.x, villain.y, target.x, target.y) > 540) {
                villain.active = false;
                villain.targetId = null;
            }

            if (!villain.active) {
                let nearest = null;
                let nearestDist = 99999;

                for (const id of this.getAllTrackedPlayerIds()) {
                    const pos = this.getPlayerWorldPosition(id);
                    if (!pos) {
                        continue;
                    }

                    const dist = Phaser.Math.Distance.Between(villain.x, villain.y, pos.x, pos.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = { id, ...pos };
                    }
                }

                if (nearest && nearestDist < 230) {
                    villain.active = true;
                    villain.targetId = nearest.id;
                }
            }

            if (villain.active && villain.targetId) {
                const pos = this.getPlayerWorldPosition(villain.targetId);
                if (!pos) {
                    villain.active = false;
                    villain.targetId = null;
                } else {
                    const dist = Phaser.Math.Distance.Between(villain.x, villain.y, pos.x, pos.y);

                    if (pos.inVehicle && dist > 350) {
                        villain.active = false;
                        villain.targetId = null;
                    } else {
                        const speed = pos.inVehicle ? villain.speed + 48 : villain.speed;
                        const dir = new Phaser.Math.Vector2(pos.x - villain.x, pos.y - villain.y).normalize();
                        villain.x += dir.x * speed * dt;
                        villain.y += dir.y * speed * dt;
                    }
                }
            } else {
                const homeDist = Phaser.Math.Distance.Between(villain.x, villain.y, villain.homeX, villain.homeY);
                if (homeDist > 3) {
                    const dir = new Phaser.Math.Vector2(villain.homeX - villain.x, villain.homeY - villain.y).normalize();
                    villain.x += dir.x * 110 * dt;
                    villain.y += dir.y * 110 * dt;
                }
            }

            villain.shadow.setPosition(villain.x, villain.y + 10);
            villain.body.setPosition(villain.x, villain.y);
            villain.head.setPosition(villain.x, villain.y - 18);
            villain.eye.setPosition(villain.x + 2, villain.y - 18);

            if (!this.isGameOver && localPos) {
                const dLocal = Phaser.Math.Distance.Between(villain.x, villain.y, localPos.x, localPos.y);
                if (dLocal < 24) {
                    this.triggerGameOver();
                }
            }
        }
    }

    getAllTrackedPlayerIds() {
        const ids = [this.socketAdapter.id];
        for (const id of Object.keys(this.playerList)) {
            if (id !== this.socketAdapter.id) {
                ids.push(id);
            }
        }
        return ids;
    }

    getPlayerWorldPosition(playerId) {
        if (!playerId) {
            return null;
        }

        if (playerId === this.socketAdapter.id) {
            if (this.isLocalInVehicle()) {
                const seat = this.getLocalSeat();
                const state = seat ? this.vehicleStates[seat.vehicleId] : null;
                if (!state) {
                    return null;
                }

                if (seat.role === "driver") {
                    return { x: state.x, y: state.y, inVehicle: true };
                }

                return {
                    x: state.x - Math.cos(state.angle) * 20 - Math.sin(state.angle) * 16,
                    y: state.y - Math.sin(state.angle) * 20 + Math.cos(state.angle) * 16,
                    inVehicle: true
                };
            }

            return { x: this.localPlayer.sprite.x, y: this.localPlayer.sprite.y, inVehicle: false };
        }

        const p = this.playerList[playerId];
        if (!p) {
            return null;
        }

        return { x: p.x, y: p.y, inVehicle: Boolean(p.inVehicle) };
    }

    triggerGameOver() {
        this.isGameOver = true;
        this.hud.showGameOver(true);
        this.hud.setMission("Villain caught you. Restart to try again.");
        this.drivePadVector.x = 0;
        this.drivePadVector.y = 0;
        this.localPlayer.setVelocity(0, 0);
        this.hud.showDrivePad(false);

        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }
    }

    updateFlowerVisual() {
        const visible = !this.localHasFlower;
        this.flower.setVisible(visible);
        this.flowerStem.setVisible(visible);
    }

    updateRemoteInterpolation(delta) {
        for (const remote of this.players.values()) {
            remote.interpolate(delta);
        }
    }

    getLocalSeat() {
        const myId = this.socketAdapter.id;
        if (!myId) {
            return null;
        }

        for (const state of Object.values(this.vehicleStates)) {
            if (state.driverId === myId) {
                return { vehicleId: state.id, role: "driver" };
            }
            if (state.passengerId === myId) {
                return { vehicleId: state.id, role: "passenger" };
            }
        }

        return null;
    }

    getDrivingVehicleId() {
        const seat = this.getLocalSeat();
        return seat && seat.role === "driver" ? seat.vehicleId : null;
    }

    isLocalInVehicle() {
        return Boolean(this.getLocalSeat());
    }

    getNearestVehicle(maxDistance, filterFn) {
        let best = null;
        let bestDist = maxDistance;

        for (const state of Object.values(this.vehicleStates)) {
            if (filterFn && !filterFn(state)) {
                continue;
            }

            const dist = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, state.x, state.y);
            if (dist < bestDist) {
                bestDist = dist;
                best = state;
            }
        }

        return best;
    }

    getNearbyDoor(maxDistance) {
        let nearest = null;
        let nearestDist = maxDistance;

        for (const door of this.buildingDoors) {
            const dist = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, door.x, door.y);
            if (dist < nearestDist) {
                nearest = door;
                nearestDist = dist;
            }
        }

        return nearest;
    }

    updateInteractionButtons() {
        if (this.isGameOver) {
            this.hud.showDrivePad(false);
            return;
        }

        const coarse = window.matchMedia("(pointer: coarse)").matches;
        this.hud.showDrivePad(coarse && Boolean(this.getDrivingVehicleId()));

        const seat = this.getLocalSeat();
        const freeCar = this.getNearestVehicle(120, (v) => !v.driverId);
        const rideCar = this.getNearestVehicle(120, (v) => v.driverId && !v.passengerId && v.driverId !== this.socketAdapter.id);

        this.actionVehicleId = freeCar?.id || rideCar?.id || null;

        this.hud.showAction("drive", Boolean(freeCar) && !seat);
        this.hud.showAction("sit", Boolean(rideCar) && !seat);
        this.hud.showAction("exitCar", Boolean(seat));

        this.nearDoor = this.getNearbyDoor(84);
        this.hud.showAction("openDoor", Boolean(this.nearDoor) && !seat);

        const nearFlower = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.flower.x,
            this.flower.y
        ) < 70;

        this.hud.showAction("pickFlower", nearFlower && !this.localHasFlower && !seat);

        const targetId = this.findNearbyPlayerId(120);
        this.giveTargetId = targetId;
        this.hud.showAction("giveFlower", Boolean(targetId) && this.localHasFlower && !seat);
        this.hud.showAction("acceptFlower", Boolean(this.pendingFlowerOfferFrom));
    }

    findNearbyPlayerId(maxDistance) {
        let bestId = null;
        let bestDist = maxDistance;

        for (const [id, p] of this.players.entries()) {
            const dist = Phaser.Math.Distance.Between(
                this.localPlayer.sprite.x,
                this.localPlayer.sprite.y,
                p.sprite.x,
                p.sprite.y
            );

            if (dist < bestDist) {
                bestId = id;
                bestDist = dist;
            }
        }

        return bestId;
    }

    tryDrive() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const vehicle = this.getNearestVehicle(120, (v) => !v.driverId);
        if (!vehicle) {
            return;
        }

        this.localVehiclePhysics[vehicle.id].speed = 0;
        this.localVehiclePhysics[vehicle.id].angle = vehicle.angle;
        this.socketAdapter.vehicleAction({ action: "drive", vehicleId: vehicle.id });
        this.hud.setMission(`Driving ${vehicle.id === "car_pink" ? "pink" : "red"} car. Avoid villains.`);
    }

    trySit() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const vehicle = this.getNearestVehicle(
            120,
            (v) => v.driverId && !v.passengerId && v.driverId !== this.socketAdapter.id
        );

        if (!vehicle) {
            return;
        }

        this.socketAdapter.vehicleAction({ action: "sit", vehicleId: vehicle.id });
        this.hud.setMission("You are in passenger seat.");
    }

    exitCar() {
        if (this.isGameOver || !this.isLocalInVehicle()) {
            return;
        }

        this.socketAdapter.vehicleAction({ action: "leave" });
        this.hud.setMission("You left the car.");
    }

    openDoor() {
        if (this.isGameOver) {
            return;
        }

        if (this.nearDoor && !this.isLocalInVehicle()) {
            this.enterHouse(this.nearDoor);
        }
    }

    pickFlower() {
        if (this.isGameOver || this.localHasFlower) {
            return;
        }

        const nearFlower = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.flower.x,
            this.flower.y
        ) < 70;

        if (nearFlower) {
            this.localHasFlower = true;
            this.localPlayer.setHasFlower(true);
            this.hud.setMission("Flower picked. Give it to your partner.");
        }
    }

    offerFlower() {
        if (this.isGameOver || !this.localHasFlower || !this.giveTargetId) {
            return;
        }

        this.localPlayer.playGiveFlowerAnimation();
        this.socketAdapter.flowerOffer({ toId: this.giveTargetId });
        this.hud.setMission("Flower offer sent.");
    }

    acceptFlower() {
        if (this.isGameOver || !this.pendingFlowerOfferFrom) {
            return;
        }

        this.socketAdapter.flowerResponse({ toId: this.pendingFlowerOfferFrom, accepted: true });
        this.pendingFlowerOfferFrom = null;
        this.hud.showAction("acceptFlower", false);
    }

    sendMoveIfNeeded(time) {
        if (!this.socketAdapter.id) {
            return;
        }

        const seat = this.getLocalSeat();
        let baseState;

        if (seat) {
            const vehicle = this.vehicleStates[seat.vehicleId];
            if (seat.role === "driver") {
                baseState = {
                    x: vehicle.x,
                    y: vehicle.y,
                    direction: angleToDirection(vehicle.angle),
                    animState: "idle",
                    frame: 0
                };
            } else {
                baseState = {
                    x: vehicle.x - Math.cos(vehicle.angle) * 20 - Math.sin(vehicle.angle) * 16,
                    y: vehicle.y - Math.sin(vehicle.angle) * 20 + Math.cos(vehicle.angle) * 16,
                    direction: angleToDirection(vehicle.angle),
                    animState: "idle",
                    frame: 0
                };
            }
        } else {
            baseState = {
                x: this.localPlayer.lastState.x,
                y: this.localPlayer.lastState.y,
                direction: this.localPlayer.lastState.direction,
                animState: this.localPlayer.lastState.animState,
                frame: Number.isInteger(this.localPlayer.lastState.frame) ? this.localPlayer.lastState.frame : 0
            };
        }

        const roundedState = {
            x: Math.round(baseState.x),
            y: Math.round(baseState.y),
            direction: baseState.direction,
            animState: baseState.animState,
            frame: baseState.frame,
            name: "You",
            hasFlower: this.localHasFlower,
            inVehicle: seat ? `${seat.vehicleId}:${seat.role}` : ""
        };

        const includePosDelta = !seat;
        const changed =
            !this.lastSentState ||
            (includePosDelta && Math.abs(roundedState.x - this.lastSentState.x) > 1) ||
            (includePosDelta && Math.abs(roundedState.y - this.lastSentState.y) > 1) ||
            (includePosDelta && roundedState.direction !== this.lastSentState.direction) ||
            (includePosDelta && roundedState.animState !== this.lastSentState.animState) ||
            roundedState.hasFlower !== this.lastSentState.hasFlower ||
            roundedState.inVehicle !== this.lastSentState.inVehicle;

        if (!changed) {
            return;
        }

        const minEmitGap = seat ? 240 : 66;
        if (time - this.lastEmitTime < minEmitGap) {
            return;
        }

        this.lastEmitTime = time;
        this.lastSentState = roundedState;
        this.socketAdapter.move(roundedState);
    }

    updateCameraTarget() {
        const seat = this.getLocalSeat();
        const followVehicleId = seat ? seat.vehicleId : null;
        const target = followVehicleId ? this.vehicleSprites[followVehicleId]?.container : this.localPlayer.sprite;

        if (target && this.cameras.main._follow !== target) {
            this.cameras.main.startFollow(target, true, 0.14, 0.14);
        }
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

        const base = nearest === 99999 ? 20 : Phaser.Math.Clamp(100 - nearest / 6, 10, 100);
        const meter = clamp(base + this.loveBonus, 10, 100);
        this.hud.setLove(Math.round(meter));

        if (meter > 70 && !this.isGameOver) {
            this.hud.setMission("Strong bond. Explore and survive together.");
        }
    }

    enterHouse(door) {
        if (!door) {
            return;
        }

        this.scene.start("InteriorScene", {
            returnX: door.returnX,
            returnY: door.returnY,
            buildingId: door.id,
            theme: door.interiorTheme
        });
    }

    cleanup() {
        if (this.unsubPlayers) {
            this.unsubPlayers();
        }
        if (this.unsubChat) {
            this.unsubChat();
        }
        if (this.unsubVehicle) {
            this.unsubVehicle();
        }
        if (this.unsubFlowerOffer) {
            this.unsubFlowerOffer();
        }
        if (this.unsubFlowerResponse) {
            this.unsubFlowerResponse();
        }
        if (this.unsubLoveBoost) {
            this.unsubLoveBoost();
        }

        if (this.chatForm && this.chatHandler) {
            this.chatForm.removeEventListener("submit", this.chatHandler);
        }

        if (this.hud.restartButton && this.restartHandler) {
            this.hud.restartButton.removeEventListener("click", this.restartHandler);
        }

        for (const { button, handler } of this.emojiHandlers || []) {
            button.removeEventListener("click", handler);
        }

        for (const { button, handler } of this.actionHandlers || []) {
            button.removeEventListener("click", handler);
        }

        for (const h of this.drivePadHandlers || []) {
            h.button.removeEventListener("pointerdown", h.onDown);
            h.button.removeEventListener("pointerup", h.onUp);
            h.button.removeEventListener("pointercancel", h.onUp);
            h.button.removeEventListener("pointerleave", h.onUp);
        }

        for (const p of this.players.values()) {
            p.destroy();
        }
        this.players.clear();

        this.hud.showDrivePad(false);
        this.hud.showGameOver(false);
        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }

        if (this.localPlayer) {
            this.localPlayer.destroy();
        }
    }
}
