import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { VirtualJoystick } from "../controls/virtualJoystick.js";
import { createHudControls } from "../ui/hud.js";

const MAX_PLAYERS = 4;
const PLAYER_SPEED = 190;
const CAR_SPEED = 330;
const DIRECTIONS = ["down", "left", "right", "up"];

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

export class WorldScene extends Phaser.Scene {
    constructor(socketAdapter) {
        super("WorldScene");
        this.socketAdapter = socketAdapter;
        this.players = new Map();
        this.playerList = {};
        this.pendingBubbles = new Map();
        this.vehicleState = {
            x: 1400,
            y: 1450,
            direction: "right",
            driverId: null,
            passengerId: null
        };
        this.carVelocity = { x: 0, y: 0 };
        this.carRender = { x: 1400, y: 1450 };
        this.lastEmitTime = 0;
        this.lastDriveEmitTime = 0;
        this.lastSentState = null;
        this.drivePadVector = { x: 0, y: 0 };
        this.localHasFlower = false;
        this.pendingFlowerOfferFrom = null;
        this.loveBonus = 0;
    }

    create() {
        this.hud = createHudControls();
        this.hud.setMission("Find your partner, drive around, and share a flower");
        this.hud.setLove(35);

        this.createMap();
        this.createWorldDetails();
        this.createVehicleAndFlower();
        this.createInput();
        this.createLocalPlayer();
        this.setupNetworking();
        this.createDayNightOverlay();
        this.bindChatInput();
        this.bindEmojiButtons();
        this.bindActionButtons();
        this.bindDrivePadButtons();

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
        this.houseDoorPoint = { x: 33 * TILE_SIZE, y: 35 * TILE_SIZE + 8 };

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
                decor.fillStyle(0xf6dd9e, 0.9);
                decor.fillCircle(x + w / 2 + 6, y + h - 12, 2);
            } else if (doorSide === "left") {
                decor.fillRect(x, y + h / 2 - 10, 24, 20);
            } else {
                decor.fillRect(x + w - 24, y + h / 2 - 10, 24, 20);
            }
        };

        drawBuilding(8 * TILE_SIZE, 8 * TILE_SIZE, 7 * TILE_SIZE, 5 * TILE_SIZE, 0x7e6b57, "bottom");
        drawBuilding(30 * TILE_SIZE, 10 * TILE_SIZE, 7 * TILE_SIZE, 7 * TILE_SIZE, 0x6f7e65, "left");
        drawBuilding(31 * TILE_SIZE, 30 * TILE_SIZE, 5 * TILE_SIZE, 5 * TILE_SIZE, 0x8d7b66, "bottom");

        decor.fillStyle(0xffd166, 0.8);
        decor.fillRect(33 * TILE_SIZE - 16, 35 * TILE_SIZE - 10, 32, 10);
        decor.fillStyle(0xf8f4ce, 0.65);
        decor.fillCircle(33 * TILE_SIZE - 8, 35 * TILE_SIZE - 12, 3);
        decor.fillCircle(33 * TILE_SIZE + 8, 35 * TILE_SIZE - 12, 3);

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

    createVehicleAndFlower() {
        this.carBody = this.add.rectangle(this.vehicleState.x, this.vehicleState.y, 74, 38, 0xd64045).setDepth(890);
        this.carTop = this.add.rectangle(this.vehicleState.x, this.vehicleState.y - 2, 42, 24, 0xf0e7d8).setDepth(891);
        this.carLightL = this.add.rectangle(this.vehicleState.x - 30, this.vehicleState.y - 9, 6, 6, 0xfff2b0).setDepth(892);
        this.carLightR = this.add.rectangle(this.vehicleState.x - 30, this.vehicleState.y + 9, 6, 6, 0xfff2b0).setDepth(892);

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
        this.carRender.x = this.vehicleState.x;
        this.carRender.y = this.vehicleState.y;

        this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.16, 0.16);
    }

    setupNetworking() {
        this.unsubPlayers = this.socketAdapter.on("players", (players) => {
            this.playerList = players;
            const me = players[this.socketAdapter.id];
            if (me && typeof me.hasFlower === "boolean") {
                this.localHasFlower = me.hasFlower;
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

        this.unsubVehicle = this.socketAdapter.on("vehicleState", (state) => {
            const drivingLocalNow = this.isDrivingLocal();
            const merged = {
                ...this.vehicleState,
                ...state
            };

            if (drivingLocalNow) {
                merged.x = this.vehicleState.x;
                merged.y = this.vehicleState.y;
            }

            this.vehicleState = merged;
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
            if (!msg) {
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
                if (emoji) {
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

            const hidden = state.inVehicle === "driver" || state.inVehicle === "passenger";
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

        if (this.isDrivingLocal()) {
            this.updateDrivingMovement(dt, time);
        } else {
            this.updateLocalMovement();
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.exitCar) && this.isLocalInVehicle()) {
            this.socketAdapter.vehicleAction({ action: "leave" });
        }

        this.updateRemoteInterpolation(delta);
        this.updateVehicleVisual();
        this.updateFlowerVisual();
        this.updateInteractionButtons();
        this.updateCameraTarget();
        this.updateDayNight(time);
        this.updateLoveMeter();
        this.sendMoveIfNeeded(time);
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
        const car = this.vehicleState;
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

        moveX += this.drivePadVector.x;
        moveY += this.drivePadVector.y;

        const vec = new Phaser.Math.Vector2(moveX, moveY);
        if (vec.lengthSq() > 1) {
            vec.normalize();
        }

        const targetVx = vec.x * CAR_SPEED;
        const targetVy = vec.y * CAR_SPEED;
        const accelRate = 7;
        const brakeRate = 8.5;

        this.carVelocity.x = Phaser.Math.Linear(
            this.carVelocity.x,
            targetVx,
            Math.min(1, dt * (vec.lengthSq() > 0.01 ? accelRate : brakeRate))
        );
        this.carVelocity.y = Phaser.Math.Linear(
            this.carVelocity.y,
            targetVy,
            Math.min(1, dt * (vec.lengthSq() > 0.01 ? accelRate : brakeRate))
        );

        car.x = clamp(car.x + this.carVelocity.x * dt, 60, WORLD_SIZE - 60);
        car.y = clamp(car.y + this.carVelocity.y * dt, 60, WORLD_SIZE - 60);

        if (Math.abs(this.carVelocity.x) > Math.abs(this.carVelocity.y) && Math.abs(this.carVelocity.x) > 8) {
            car.direction = this.carVelocity.x >= 0 ? "right" : "left";
        } else if (Math.abs(this.carVelocity.y) > 8) {
            car.direction = this.carVelocity.y >= 0 ? "down" : "up";
        }

        this.localPlayer.setVelocity(0, 0);
        this.localPlayer.sprite.x = car.x;
        this.localPlayer.sprite.y = car.y;
        this.localPlayer.syncVisuals();

        if (time - this.lastDriveEmitTime > 55) {
            this.lastDriveEmitTime = time;
            this.socketAdapter.driveInput({
                x: Number(car.x.toFixed(1)),
                y: Number(car.y.toFixed(1)),
                direction: car.direction
            });
        }
    }

    applyVehicleState() {
        const isLocalDriver = this.isDrivingLocal();
        const isLocalPassenger = this.vehicleState.passengerId === this.socketAdapter.id;

        if (isLocalDriver || isLocalPassenger) {
            const px = this.vehicleState.x + (isLocalPassenger ? -22 : 0);
            const py = this.vehicleState.y + (isLocalPassenger ? 10 : 0);
            this.localPlayer.sprite.x = this.vehicleState.x + (isLocalPassenger ? -22 : 0);
            this.localPlayer.sprite.y = this.vehicleState.y + (isLocalPassenger ? 10 : 0);
            this.localPlayer.lastState.x = px;
            this.localPlayer.lastState.y = py;
            this.localPlayer.syncVisuals();
            this.localPlayer.sprite.setVisible(false);
            this.localPlayer.nameText.setVisible(false);
            this.localPlayer.bubble.setVisible(false);
        } else {
            this.localPlayer.sprite.setVisible(true);
            this.localPlayer.nameText.setVisible(true);
            this.localPlayer.bubble.setVisible(true);
        }
    }

    updateVehicleVisual() {
        const { x, y, direction, driverId, passengerId } = this.vehicleState;
        this.carRender.x = Phaser.Math.Linear(this.carRender.x, x, this.isDrivingLocal() ? 0.45 : 0.22);
        this.carRender.y = Phaser.Math.Linear(this.carRender.y, y, this.isDrivingLocal() ? 0.45 : 0.22);

        this.carBody.setPosition(this.carRender.x, this.carRender.y);
        this.carTop.setPosition(this.carRender.x, this.carRender.y - 2);

        const lightForward = direction === "right" ? 1 : direction === "left" ? -1 : 0;
        const ly = direction === "down" ? 9 : direction === "up" ? -9 : 0;
        this.carLightL.setPosition(this.carRender.x + lightForward * 30, this.carRender.y + ly - 5);
        this.carLightR.setPosition(this.carRender.x + lightForward * 30, this.carRender.y + ly + 5);

        const occupied = Boolean(driverId || passengerId);
        this.carBody.setFillStyle(occupied ? 0xf1555a : 0xd64045, 1);
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

    updateInteractionButtons() {
        const nearCar = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.vehicleState.x,
            this.vehicleState.y
        ) < 110;

        const coarse = window.matchMedia("(pointer: coarse)").matches;
        this.hud.showDrivePad(coarse && this.isDrivingLocal());

        const showExit = this.isLocalInVehicle();
        const showDrive = nearCar && !this.vehicleState.driverId && !this.isLocalInVehicle();
        const showSit =
            nearCar &&
            Boolean(this.vehicleState.driverId) &&
            !this.vehicleState.passengerId &&
            this.vehicleState.driverId !== this.socketAdapter.id &&
            !this.isLocalInVehicle();

        this.hud.showAction("exitCar", showExit);
        this.hud.showAction("drive", showDrive);
        this.hud.showAction("sit", showSit);

        const nearHouseDoor = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.houseDoorPoint.x,
            this.houseDoorPoint.y
        ) < 78;
        this.hud.showAction("openDoor", nearHouseDoor && !this.isLocalInVehicle());

        const nearFlower = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.flower.x,
            this.flower.y
        ) < 70;

        this.hud.showAction("pickFlower", nearFlower && !this.localHasFlower && !this.isLocalInVehicle());

        const targetId = this.findNearbyPlayerId(120);
        this.giveTargetId = targetId;
        this.hud.showAction("giveFlower", Boolean(targetId) && this.localHasFlower && !this.isLocalInVehicle());
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
        if (!this.vehicleState.driverId) {
            this.socketAdapter.vehicleAction({ action: "drive" });
            this.carVelocity.x = 0;
            this.carVelocity.y = 0;
            this.hud.setMission("You are driving. Use arrows or pad. Press X to exit car.");
        }
    }

    trySit() {
        if (this.vehicleState.driverId && !this.vehicleState.passengerId) {
            this.socketAdapter.vehicleAction({ action: "sit" });
            this.hud.setMission("You are in passenger seat.");
        }
    }

    exitCar() {
        if (this.isLocalInVehicle()) {
            this.socketAdapter.vehicleAction({ action: "leave" });
            this.carVelocity.x = 0;
            this.carVelocity.y = 0;
            this.hud.setMission("You left the car.");
        }
    }

    openDoor() {
        const nearHouseDoor = Phaser.Math.Distance.Between(
            this.localPlayer.sprite.x,
            this.localPlayer.sprite.y,
            this.houseDoorPoint.x,
            this.houseDoorPoint.y
        ) < 78;

        if (nearHouseDoor && !this.isLocalInVehicle()) {
            this.enterHouse();
        }
    }

    pickFlower() {
        if (this.localHasFlower) {
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
            this.hud.setMission("Flower picked. Go near your partner and tap Give Flower.");
        }
    }

    offerFlower() {
        if (!this.localHasFlower || !this.giveTargetId) {
            return;
        }

        this.localPlayer.playGiveFlowerAnimation();
        this.socketAdapter.flowerOffer({ toId: this.giveTargetId });
        this.hud.setMission("Flower offer sent. Waiting for accept.");
    }

    acceptFlower() {
        if (!this.pendingFlowerOfferFrom) {
            return;
        }

        this.socketAdapter.flowerResponse({
            toId: this.pendingFlowerOfferFrom,
            accepted: true
        });

        this.pendingFlowerOfferFrom = null;
        this.hud.showAction("acceptFlower", false);
    }

    sendMoveIfNeeded(time) {
        if (!this.socketAdapter.id) {
            return;
        }

        const isDriver = this.isDrivingLocal();
        const isPassenger = this.vehicleState.passengerId === this.socketAdapter.id;

        const baseState = isDriver
            ? {
                  x: this.vehicleState.x,
                  y: this.vehicleState.y,
                  direction: this.vehicleState.direction,
                  animState: "idle",
                  frame: 0
              }
            : isPassenger
              ? {
                    x: this.vehicleState.x - 22,
                    y: this.vehicleState.y + 10,
                    direction: this.vehicleState.direction,
                    animState: "idle",
                    frame: 0
                }
            : {
                  x: this.localPlayer.lastState.x,
                  y: this.localPlayer.lastState.y,
                  direction: this.localPlayer.lastState.direction,
                  animState: this.localPlayer.lastState.animState,
                  frame: Number.isInteger(this.localPlayer.lastState.frame) ? this.localPlayer.lastState.frame : 0
              };

        const roundedState = {
            x: Math.round(baseState.x),
            y: Math.round(baseState.y),
            direction: baseState.direction,
            animState: baseState.animState,
            frame: baseState.frame,
            name: "You",
            hasFlower: this.localHasFlower,
            inVehicle: isDriver ? "driver" : isPassenger ? "passenger" : ""
        };

        const includePosDelta = !(isDriver || isPassenger);
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

        const minEmitGap = isDriver || isPassenger ? 240 : 66;
        if (time - this.lastEmitTime < minEmitGap) {
            return;
        }

        this.lastEmitTime = time;
        this.lastSentState = roundedState;
        this.socketAdapter.move(roundedState);
    }

    isDrivingLocal() {
        return this.vehicleState.driverId === this.socketAdapter.id;
    }

    isLocalInVehicle() {
        return this.vehicleState.driverId === this.socketAdapter.id || this.vehicleState.passengerId === this.socketAdapter.id;
    }

    updateCameraTarget() {
        const followCar = this.isLocalInVehicle();
        const target = followCar ? this.carBody : this.localPlayer.sprite;

        if (this.cameras.main._follow !== target) {
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

        if (meter > 70) {
            this.hud.setMission("Strong bond. Explore the city together.");
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
        this.hud.showAction("drive", false);
        this.hud.showAction("sit", false);
        this.hud.showAction("exitCar", false);
        this.hud.showAction("openDoor", false);
        this.hud.showAction("pickFlower", false);
        this.hud.showAction("giveFlower", false);
        this.hud.showAction("acceptFlower", false);

        if (this.localPlayer) {
            this.localPlayer.destroy();
        }
    }
}
