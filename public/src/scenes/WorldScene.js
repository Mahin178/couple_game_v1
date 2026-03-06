import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { VirtualJoystick } from "../controls/virtualJoystick.js";
import { createHudControls } from "../ui/hud.js";

const MAX_PLAYERS = 4;
const PLAYER_SPEED = 190;
const CAR_ACCEL = 780;
const CAR_BRAKE = 980;
const CAR_MAX_FORWARD = 520;
const CAR_MAX_REVERSE = -220;
const CAR_IDLE_DRAG = 3.6;
const CAR_STEER_BASE = 1.9;
const CAR_STEER_SPEED_FACTOR = 1.9;
const CAR_HAND_BRAKE = 1550;
const DIRECTIONS = ["down", "left", "right", "up"];
const MATERIAL_ORDER = ["brick", "wood", "glass"];
const MATERIAL_STYLE = {
    brick: { fill: 0xa54f3c, stroke: 0x6e2d21, preview: 0xbd6d58 },
    wood: { fill: 0x8a633b, stroke: 0x5a3d22, preview: 0xb48557 },
    glass: { fill: 0x8bcde0, stroke: 0x4b7f92, preview: 0xa8dced, alpha: 0.62 }
};

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

function directionToVector(direction) {
    if (direction === "up") {
        return { x: 0, y: -1 };
    }
    if (direction === "down") {
        return { x: 0, y: 1 };
    }
    if (direction === "left") {
        return { x: -1, y: 0 };
    }
    return { x: 1, y: 0 };
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
        this.buildings = [];
        this.buildingRects = [];
        this.buildingDoors = [];
        this.interiors = {};
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
        this.isInInterior = false;
        this.currentInterior = null;
        this.buildBlocks = new Map();
        this.buildBlockColliders = null;
        this.materialDepots = [];
        this.inventory = { brick: 0, wood: 0, glass: 0 };
        this.selectedMaterial = "brick";
        this.isBuildMode = false;
        this.buildTarget = null;
        this.unsubBuildState = null;
        this.unsubBuildPatch = null;
        this.unsubConnect = null;
        this.pointerPlaceHandler = null;
        this.mobileBuildHandler = null;
        this.isTouchDevice = false;
        this.buildHoverAction = "place";
        this.mobileChatHandler = null;
        this.mobileMissionHandler = null;
        this.mobileMissionTimer = null;
        this.mobileChatOpen = false;
        this.audioCtx = null;
        this.lastStepSoundTime = 0;
        this.localDisplayName = "husband";
    }

    create() {
        this.hud = createHudControls();
        this.hud.showGameOver(false);
        this.setMission("Collect brick/wood/glass and build your first house");
        this.hud.setLove(35);

        this.createMap();
        this.createWorldDetails();
        this.createBuildSystem();
        this.createInteriorDistrict();
        this.createVehicles();
        this.createVillains();
        this.createFlower();
        this.createSoundSystem();
        this.createInput();
        this.createLocalPlayer();
        this.createPlayerIndicator();
        this.setupNetworking();
        this.createDayNightOverlay();
        this.bindChatInput();
        this.bindEmojiButtons();
        this.bindActionButtons();
        this.bindDrivePadButtons();
        this.bindRestartButton();
        this.bindMobileUi();

        this.events.once("shutdown", () => this.cleanup());
    }

    setMission(text) {
        this.hud.setMission(text);
        if (this.isTouchDevice) {
            this.showMissionPeek(2000);
        }
    }

    createSoundSystem() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return;
        }

        try {
            this.audioCtx = new AudioCtx();
        } catch (_error) {
            this.audioCtx = null;
        }
    }

    ensureAudioReady() {
        if (this.audioCtx && this.audioCtx.state === "suspended") {
            this.audioCtx.resume().catch(() => {});
        }
    }

    playTone({ frequency = 220, duration = 0.07, type = "sine", volume = 0.05, slideTo = null }) {
        if (!this.audioCtx) {
            return;
        }

        this.ensureAudioReady();
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);
        if (Number.isFinite(slideTo)) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
        }

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    playPlaceSound() {
        this.playTone({ frequency: 460, slideTo: 300, duration: 0.08, type: "triangle", volume: 0.045 });
    }

    playRemoveSound() {
        this.playTone({ frequency: 260, slideTo: 130, duration: 0.1, type: "square", volume: 0.04 });
    }

    playWalkStepSound(time) {
        if (!this.audioCtx) {
            return;
        }

        if (time - this.lastStepSoundTime < 220) {
            return;
        }

        this.lastStepSoundTime = time;
        const tone = 150 + (Math.random() * 45);
        this.playTone({ frequency: tone, slideTo: tone * 0.7, duration: 0.045, type: "sine", volume: 0.02 });
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
            this.roadLayer.putTileAt(1, x, 43);
            this.roadLayer.putTileAt(1, x, 44);
            this.roadLayer.putTileAt(1, x, 45);
        }

        for (let y = 0; y < tileCount; y += 1) {
            this.roadLayer.putTileAt(1, 22, y);
            this.roadLayer.putTileAt(1, 23, y);
            this.roadLayer.putTileAt(1, 24, y);
            this.roadLayer.putTileAt(1, 43, y);
            this.roadLayer.putTileAt(1, 44, y);
            this.roadLayer.putTileAt(1, 45, y);
        }

        this.buildings = [
            { id: "home_a", tx: 8, ty: 8, tw: 7, th: 5, type: 2, wall: 0x7e6b57, roof: 0x927f69, doorSide: "bottom", theme: "warm" },
            { id: "home_b", tx: 30, ty: 10, tw: 7, th: 7, type: 2, wall: 0x6f7e65, roof: 0x859179, doorSide: "left", theme: "mint" },
            { id: "home_c", tx: 31, ty: 30, tw: 5, th: 5, type: 3, wall: 0x8d7b66, roof: 0xa28f79, doorSide: "bottom", theme: "sunset" },
            { id: "home_d", tx: 12, ty: 38, tw: 6, th: 5, type: 2, wall: 0x69748d, roof: 0x7f8aa4, doorSide: "bottom", theme: "mint" },
            { id: "home_e", tx: 46, ty: 12, tw: 6, th: 5, type: 3, wall: 0x8b6f6f, roof: 0xa38484, doorSide: "right", theme: "sunset" }
        ];

        for (const b of this.buildings) {
            for (let x = b.tx; x < b.tx + b.tw; x += 1) {
                for (let y = b.ty; y < b.ty + b.th; y += 1) {
                    this.blockLayer.putTileAt(b.type, x, y);
                }
            }

            const px = b.tx * TILE_SIZE;
            const py = b.ty * TILE_SIZE;
            const pw = b.tw * TILE_SIZE;
            const ph = b.th * TILE_SIZE;
            this.buildingRects.push({ x: px, y: py, w: pw, h: ph });

            let doorX = px + pw / 2;
            let doorY = py + ph - 6;
            let returnX = doorX;
            let returnY = doorY + 26;

            if (b.doorSide === "left") {
                doorX = px + 12;
                doorY = py + ph / 2;
                returnX = doorX + 30;
                returnY = doorY + 20;
            }
            if (b.doorSide === "right") {
                doorX = px + pw - 12;
                doorY = py + ph / 2;
                returnX = doorX - 30;
                returnY = doorY + 20;
            }

            this.buildingDoors.push({
                id: b.id,
                x: doorX,
                y: doorY,
                returnX,
                returnY,
                interiorTheme: b.theme
            });
        }

        this.blockLayer.setCollision([2, 3]);
        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    createWorldDetails() {
        const decor = this.add.graphics();

        const drawBuilding3D = (b) => {
            const x = b.tx * TILE_SIZE;
            const y = b.ty * TILE_SIZE;
            const w = b.tw * TILE_SIZE;
            const h = b.th * TILE_SIZE;

            decor.fillStyle(0x000000, 0.2);
            decor.fillRect(x + 10, y + h + 8, w, 14);
            decor.fillStyle(b.wall, 1);
            decor.fillRect(x, y, w, h);
            decor.fillStyle(b.roof, 1);
            decor.fillRect(x - 6, y - 10, w + 12, 10);
            decor.lineStyle(2, 0x2f241a, 0.9);
            decor.strokeRect(x, y, w, h);

            decor.fillStyle(0xc7d6e8, 0.92);
            for (let i = 0; i < Math.max(2, Math.floor(b.tw / 2)); i += 1) {
                const wx = x + 18 + i * 26;
                const wy = y + 16;
                if (wx + 18 < x + w - 8) {
                    decor.fillRect(wx, wy, 18, 18);
                }
            }

            decor.fillStyle(0x563620, 1);
            const door = this.buildingDoors.find((d) => d.id === b.id);
            if (door) {
                decor.fillRect(door.x - 10, door.y - 24, 20, 24);
                decor.fillStyle(0xffd38a, 0.9);
                decor.fillCircle(door.x + 6, door.y - 12, 2);
                decor.fillStyle(0xfff2b0, 0.7);
                decor.fillRect(door.x - 16, door.y - 10, 32, 10);
                decor.fillCircle(door.x - 8, door.y - 12, 3);
                decor.fillCircle(door.x + 8, door.y - 12, 3);
            }
        };

        for (const b of this.buildings) {
            drawBuilding3D(b);
        }

        for (let i = 0; i < WORLD_SIZE; i += 240) {
            decor.fillStyle(0xcabfab, 0.6);
            decor.fillRect(i, 21 * TILE_SIZE, 120, 6);
            decor.fillRect(i, 25 * TILE_SIZE - 6, 120, 6);
            decor.fillRect(21 * TILE_SIZE, i, 6, 120);
            decor.fillRect(25 * TILE_SIZE - 6, i, 6, 120);

            decor.fillStyle(0xf6f0ce, 0.65);
            decor.fillRect(i + 36, 23 * TILE_SIZE - 2, 18, 4);
            decor.fillRect(23 * TILE_SIZE - 2, i + 36, 4, 18);
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

        const treePoints = [
            [17, 17], [26, 17], [17, 28], [26, 28], [38, 20], [41, 28], [10, 47], [54, 45], [48, 8]
        ];
        for (const [tx, ty] of treePoints) {
            tree(tx * TILE_SIZE, ty * TILE_SIZE);
        }

        this.drawBuildYard(decor);

        decor.setDepth(600);
    }

    drawBuildYard(decor) {
        const startX = 49 * TILE_SIZE;
        const startY = 32 * TILE_SIZE;
        const yardW = 10 * TILE_SIZE;
        const yardH = 8 * TILE_SIZE;
        decor.fillStyle(0x304028, 0.35);
        decor.fillRoundedRect(startX, startY, yardW, yardH, 18);
        decor.lineStyle(4, 0x8ea96b, 0.65);
        decor.strokeRoundedRect(startX + 2, startY + 2, yardW - 4, yardH - 4, 16);
    }

    createBuildSystem() {
        this.buildBlockColliders = this.physics.add.staticGroup();

        this.materialDepots = [
            { material: "brick", gridX: 50, gridY: 33 },
            { material: "wood", gridX: 52, gridY: 33 },
            { material: "glass", gridX: 54, gridY: 33 }
        ];

        for (const depot of this.materialDepots) {
            const style = MATERIAL_STYLE[depot.material];
            const cx = depot.gridX * TILE_SIZE + TILE_SIZE / 2;
            const cy = depot.gridY * TILE_SIZE + TILE_SIZE / 2;
            const base = this.add.rectangle(cx, cy, 48, 48, style.fill, 0.95).setDepth(910);
            base.setStrokeStyle(3, style.stroke, 1);
            const cap = this.add.rectangle(cx, cy - 10, 48, 10, 0xf5e6ca, 0.9).setDepth(911);
            const label = this.add
                .text(cx, cy + 4, depot.material[0].toUpperCase(), {
                    fontFamily: "\"Trebuchet MS\", sans-serif",
                    fontSize: "18px",
                    color: "#1d1814"
                })
                .setOrigin(0.5)
                .setDepth(912);

            depot.visuals = [base, cap, label];
            depot.x = cx;
            depot.y = cy;
        }

        this.buildPreview = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0xbd6d58, 0.24).setDepth(2110).setVisible(false);
        this.buildPreview.setStrokeStyle(2, 0xfefefe, 0.7);
        this.crosshairH = this.add.rectangle(0, 0, 14, 2, 0xfefefe, 0.9).setDepth(2111).setVisible(false);
        this.crosshairV = this.add.rectangle(0, 0, 2, 14, 0xfefefe, 0.9).setDepth(2111).setVisible(false);
        this.updateBuildInfoText();
    }

    createInteriorDistrict() {
        this.interiorWalls = this.physics.add.staticGroup();
        const baseRooms = [
            { id: "home_a", x: 3520, y: 300, w: 440, h: 320 },
            { id: "home_b", x: 4020, y: 300, w: 440, h: 320 },
            { id: "home_c", x: 3520, y: 700, w: 440, h: 320 },
            { id: "home_d", x: 4020, y: 700, w: 440, h: 320 },
            { id: "home_e", x: 3520, y: 1100, w: 440, h: 320 }
        ];

        for (const room of baseRooms) {
            const door = this.buildingDoors.find((d) => d.id === room.id);
            if (!door) {
                continue;
            }

            const floor = this.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, 0xa68d7a, 0.9).setDepth(620);
            const rug = this.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w - 90, room.h - 110, 0xc36f5e, 0.7).setDepth(621);
            const couch = this.add.rectangle(room.x + 100, room.y + 90, 120, 34, 0x5f697e).setDepth(622);
            const table = this.add.rectangle(room.x + room.w - 110, room.y + room.h - 90, 90, 44, 0x6d4f3d).setDepth(622);
            const exitGlow = this.add.rectangle(room.x + room.w / 2, room.y + room.h - 20, 76, 12, 0xffe2a1, 0.9).setDepth(623);

            const top = this.add.rectangle(room.x + room.w / 2, room.y + 8, room.w, 16, 0x4e4034).setDepth(624);
            const bottom = this.add.rectangle(room.x + room.w / 2, room.y + room.h - 8, room.w, 16, 0x4e4034).setDepth(624);
            const left = this.add.rectangle(room.x + 8, room.y + room.h / 2, 16, room.h, 0x4e4034).setDepth(624);
            const right = this.add.rectangle(room.x + room.w - 8, room.y + room.h / 2, 16, room.h, 0x4e4034).setDepth(624);

            this.physics.add.existing(top, true);
            this.physics.add.existing(bottom, true);
            this.physics.add.existing(left, true);
            this.physics.add.existing(right, true);

            this.interiorWalls.add(top);
            this.interiorWalls.add(bottom);
            this.interiorWalls.add(left);
            this.interiorWalls.add(right);

            this.interiors[room.id] = {
                id: room.id,
                spawnX: room.x + room.w / 2,
                spawnY: room.y + room.h / 2,
                exitX: room.x + room.w / 2,
                exitY: room.y + room.h - 24,
                outsideX: door.returnX,
                outsideY: door.returnY,
                visuals: [floor, rug, couch, table, exitGlow]
            };
        }
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

            this.localVehiclePhysics[config.id] = { speed: 0, angle: 0 };

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
                shadow
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
            up: Phaser.Input.Keyboard.KeyCodes.UP,
            down: Phaser.Input.Keyboard.KeyCodes.DOWN,
            left: Phaser.Input.Keyboard.KeyCodes.LEFT,
            right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            exitCar: Phaser.Input.Keyboard.KeyCodes.X,
            buildMode: Phaser.Input.Keyboard.KeyCodes.B,
            placeBlock: Phaser.Input.Keyboard.KeyCodes.F,
            removeBlock: Phaser.Input.Keyboard.KeyCodes.G,
            matBrick: Phaser.Input.Keyboard.KeyCodes.ONE,
            matWood: Phaser.Input.Keyboard.KeyCodes.TWO,
            matGlass: Phaser.Input.Keyboard.KeyCodes.THREE,
            handBrake: Phaser.Input.Keyboard.KeyCodes.SPACE
        });

        this.isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        this.localDisplayName = this.isTouchDevice ? "wife" : "husband";
        this.socketAdapter.setProfile({ name: this.localDisplayName });
        if (this.isTouchDevice) {
            const root = document.getElementById("mobileJoystick");
            const knob = document.getElementById("joystickKnob");
            this.joystick = new VirtualJoystick(root, knob);
        }

        this.pointerPlaceHandler = (pointer) => {
            if (this.isGameOver || !this.isBuildMode || this.isInInterior || this.isLocalInVehicle()) {
                return;
            }

            const inCanvas = pointer?.event?.target?.tagName === "CANVAS";
            if (!inCanvas) {
                return;
            }

            const target = this.getActiveBuildTarget();
            if (!target) {
                return;
            }

            if (pointer.rightButtonDown()) {
                this.tryRemoveBlock(target);
                return;
            }

            const key = this.getBlockKey(target.gridX, target.gridY);
            if (this.buildBlocks.has(key)) {
                this.tryRemoveBlock(target);
                return;
            }

            this.tryPlaceBlock(target);
        };
        this.input.on("pointerdown", this.pointerPlaceHandler);
    }

    createLocalPlayer() {
        const spawn = this.scene.settings.data?.spawn || { x: 500, y: 500 };
        this.localPlayer = new PlayerEntity(this, spawn.x, spawn.y, "player", 0, "local", this.localDisplayName, true);
        this.physics.add.collider(this.localPlayer.sprite, this.blockLayer);
        this.physics.add.collider(this.localPlayer.sprite, this.interiorWalls);
        if (this.buildBlockColliders) {
            this.physics.add.collider(this.localPlayer.sprite, this.buildBlockColliders);
        }
        this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.16, 0.16);
    }

    createPlayerIndicator() {
        this.playerIndicator = this.add.triangle(0, 0, 0, 10, 8, -6, -8, -6, 0xffeb7a, 1).setDepth(2200);
        this.playerIndicator.setStrokeStyle(2, 0x4d2f20, 0.9);
    }

    setupNetworking() {
        this.unsubConnect = this.socketAdapter.on("connect", () => {
            this.socketAdapter.setProfile({ name: this.localDisplayName });
        });

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
                const merged = { ...this.vehicleStates[state.id], ...state };

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
            this.setMission(`${fromName || "Partner"} sent you a flower. Tap Accept.`);

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
                this.setMission("Flower accepted. Relationship boosted.");
            } else {
                this.setMission("Flower declined. Try again later.");
            }
        });

        this.unsubLoveBoost = this.socketAdapter.on("loveBoost", ({ amount }) => {
            this.loveBonus = clamp(this.loveBonus + (Number(amount) || 0), 0, 45);
        });

        this.unsubBuildState = this.socketAdapter.on("buildState", (payload) => {
            this.replaceBuildState(Array.isArray(payload?.blocks) ? payload.blocks : []);
        });

        this.unsubBuildPatch = this.socketAdapter.on("buildPatch", (payload) => {
            if (!payload || typeof payload.action !== "string") {
                return;
            }

            if (payload.action === "place" && payload.block) {
                this.upsertBuildBlock(payload.block);
            }

            if (payload.action === "remove") {
                this.removeBuildBlock(payload.gridX, payload.gridY);
            }
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
            if (this.isTouchDevice) {
                this.setMobileChatOpen(false);
            }
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
        bind("buildMode", () => this.toggleBuildMode());
        bind("grabMaterial", () => this.grabMaterial());
        bind("placeBlock", () => this.tryPlaceBlock());
        bind("removeBlock", () => this.tryRemoveBlock());
        bind("cycleMaterial", () => this.cycleMaterial());

        if (this.hud.mobileBuildAction) {
            this.mobileBuildHandler = () => this.performContextualBuildAction();
            this.hud.mobileBuildAction.addEventListener("click", this.mobileBuildHandler);
        }
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

    bindMobileUi() {
        if (!this.isTouchDevice) {
            return;
        }

        if (this.hud.chatToggle) {
            this.mobileChatHandler = () => this.setMobileChatOpen(!this.mobileChatOpen);
            this.hud.chatToggle.addEventListener("click", this.mobileChatHandler);
        }

        if (this.hud.missionBox) {
            this.mobileMissionHandler = () => this.showMissionPeek(2000);
            this.hud.missionBox.addEventListener("click", this.mobileMissionHandler);
        }

        this.setMobileChatOpen(false);
    }

    setMobileChatOpen(open) {
        this.mobileChatOpen = Boolean(open);
        document.body.classList.toggle("mobile-chat-open", this.mobileChatOpen);
        if (this.hud.chatToggle) {
            this.hud.chatToggle.textContent = this.mobileChatOpen ? "✕" : "💬";
        }
    }

    showMissionPeek(durationMs = 2000) {
        if (!this.isTouchDevice) {
            return;
        }

        document.body.classList.add("mobile-mission-open");
        if (this.mobileMissionTimer) {
            clearTimeout(this.mobileMissionTimer);
        }

        this.mobileMissionTimer = setTimeout(() => {
            document.body.classList.remove("mobile-mission-open");
            this.mobileMissionTimer = null;
        }, durationMs);
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
                this.physics.add.collider(entity.sprite, this.interiorWalls);
                if (this.buildBlockColliders) {
                    this.physics.add.collider(entity.sprite, this.buildBlockColliders);
                }

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
        const typingInChat = this.isTypingInChat();

        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.buildMode) && !this.isGameOver && !this.isInInterior) {
            this.toggleBuildMode();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.placeBlock)) {
            this.tryPlaceBlock();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.removeBlock)) {
            this.tryRemoveBlock();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.matBrick)) {
            this.setMaterial("brick");
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.matWood)) {
            this.setMaterial("wood");
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.matGlass)) {
            this.setMaterial("glass");
        }

        if (!this.isGameOver) {
            if (this.getDrivingVehicleId()) {
                this.updateDrivingMovement(dt, time);
            } else {
                this.updateLocalMovement(time);
            }

            if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.exitCar) && this.isLocalInVehicle()) {
                this.exitCar();
            }
        }

        this.updateRemoteInterpolation(delta);
        this.updateVehicleVisual();
        this.updateVillains(dt);
        this.updateFlowerVisual();
        this.updateBuildPreview();
        this.updateInteractionButtons();
        this.updateCameraTarget();
        this.updatePlayerIndicator(time);
        this.updateDayNight(time);
        this.updateLoveMeter();

        if (!this.isGameOver) {
            this.sendMoveIfNeeded(time);
        }
    }

    isTypingInChat() {
        const active = document.activeElement;
        return active === this.chatInput;
    }

    updateLocalMovement(time) {
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

        if (this.keys.left.isDown) {
            moveX -= 1;
        }
        if (this.keys.right.isDown) {
            moveX += 1;
        }
        if (this.keys.up.isDown) {
            moveY -= 1;
        }
        if (this.keys.down.isDown) {
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

        if (animState === "walk") {
            this.playWalkStepSound(time);
        }
    }

    carHitsBuilding(x, y) {
        for (const r of this.buildingRects) {
            if (x > r.x - 34 && x < r.x + r.w + 34 && y > r.y - 24 && y < r.y + r.h + 24) {
                return true;
            }
        }

        for (const block of this.buildBlocks.values()) {
            const bx = block.gridX * TILE_SIZE;
            const by = block.gridY * TILE_SIZE;
            if (x > bx - 36 && x < bx + TILE_SIZE + 36 && y > by - 28 && y < by + TILE_SIZE + 28) {
                return true;
            }
        }
        return false;
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

        if (this.keys.up.isDown) {
            throttle += 1;
        }
        if (this.keys.down.isDown) {
            throttle -= 1;
        }
        if (this.keys.left.isDown) {
            steer -= 1;
        }
        if (this.keys.right.isDown) {
            steer += 1;
        }

        if (this.joystick) {
            const j = this.joystick.getVector();
            throttle += -j.y;
            steer += j.x;
        }

        throttle += -this.drivePadVector.y;
        steer += this.drivePadVector.x;

        throttle = clamp(throttle, -1, 1);
        steer = clamp(steer, -1, 1);

        const handBraking = this.keys.handBrake?.isDown;
        const sameDirection =
            (physics.speed >= 0 && throttle >= 0) ||
            (physics.speed < 0 && throttle <= 0);

        if (Math.abs(throttle) > 0.03) {
            if (sameDirection) {
                physics.speed += throttle * CAR_ACCEL * dt;
            } else {
                const brakeForce = (CAR_BRAKE + CAR_HAND_BRAKE * 0.35) * dt;
                physics.speed = Phaser.Math.Linear(physics.speed, 0, Math.min(1, brakeForce / Math.max(1, Math.abs(physics.speed))));
                if (Math.abs(physics.speed) < 12) {
                    physics.speed += throttle * (CAR_ACCEL * 0.8) * dt;
                }
            }
        } else {
            const drag = CAR_IDLE_DRAG * dt;
            physics.speed = Phaser.Math.Linear(physics.speed, 0, drag);
        }

        if (handBraking) {
            const brakeForce = CAR_HAND_BRAKE * dt;
            physics.speed = Phaser.Math.Linear(physics.speed, 0, Math.min(1, brakeForce / Math.max(1, Math.abs(physics.speed))));
        }

        physics.speed = clamp(physics.speed, CAR_MAX_REVERSE, CAR_MAX_FORWARD);

        const normalizedSpeed = clamp(Math.abs(physics.speed) / CAR_MAX_FORWARD, 0, 1);
        const steerStrength = (CAR_STEER_BASE + normalizedSpeed * CAR_STEER_SPEED_FACTOR) * (physics.speed >= 0 ? 1 : -1);
        physics.angle += steer * steerStrength * dt;

        const nextX = clamp(state.x + Math.cos(physics.angle) * physics.speed * dt, 60, WORLD_SIZE - 60);
        const nextY = clamp(state.y + Math.sin(physics.angle) * physics.speed * dt, 60, WORLD_SIZE - 60);

        if (!this.carHitsBuilding(nextX, nextY)) {
            state.x = nextX;
            state.y = nextY;
        } else {
            physics.speed *= -0.24;
            this.playTone({ frequency: 110, slideTo: 75, duration: 0.06, type: "square", volume: 0.018 });
        }

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
            const lerp = localDrivingThis ? 0.55 : 0.22;

            render.x = Phaser.Math.Linear(render.x, state.x, lerp);
            render.y = Phaser.Math.Linear(render.y, state.y, lerp);
            render.angle = Phaser.Math.Angle.RotateTo(render.angle, state.angle, 0.25);

            sprite.container.setPosition(render.x, render.y);
            sprite.container.setRotation(render.angle);
            sprite.shadow.setScale(1 + Math.abs(state.speed) / 560, 1);

            const bright = state.driverId ? 1 : 0.55;
            sprite.lightL.setAlpha(bright);
            sprite.lightR.setAlpha(bright);
        }
    }

    updateVillains(dt) {
        if (this.isInInterior) {
            for (const villain of this.villains) {
                villain.active = false;
                villain.targetId = null;
                const homeDist = Phaser.Math.Distance.Between(villain.x, villain.y, villain.homeX, villain.homeY);
                if (homeDist > 3) {
                    const dir = new Phaser.Math.Vector2(villain.homeX - villain.x, villain.homeY - villain.y).normalize();
                    villain.x += dir.x * 110 * dt;
                    villain.y += dir.y * 110 * dt;
                }

                villain.shadow.setPosition(villain.x, villain.y + 10);
                villain.body.setPosition(villain.x, villain.y);
                villain.head.setPosition(villain.x, villain.y - 18);
                villain.eye.setPosition(villain.x + 2, villain.y - 18);
            }
            return;
        }

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
                    if (!pos || pos.inInterior) {
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
                if (!pos || pos.inInterior) {
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

            if (!this.isGameOver && localPos && !localPos.inInterior) {
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
            if (this.isInInterior) {
                return { x: this.localPlayer.sprite.x, y: this.localPlayer.sprite.y, inVehicle: false, inInterior: true };
            }

            if (this.isLocalInVehicle()) {
                const seat = this.getLocalSeat();
                const state = seat ? this.vehicleStates[seat.vehicleId] : null;
                if (!state) {
                    return null;
                }

                if (seat.role === "driver") {
                    return { x: state.x, y: state.y, inVehicle: true, inInterior: false };
                }

                return {
                    x: state.x - Math.cos(state.angle) * 20 - Math.sin(state.angle) * 16,
                    y: state.y - Math.sin(state.angle) * 20 + Math.cos(state.angle) * 16,
                    inVehicle: true,
                    inInterior: false
                };
            }

            return { x: this.localPlayer.sprite.x, y: this.localPlayer.sprite.y, inVehicle: false, inInterior: false };
        }

        const p = this.playerList[playerId];
        if (!p) {
            return null;
        }

        return { x: p.x, y: p.y, inVehicle: Boolean(p.inVehicle), inInterior: false };
    }

    triggerGameOver() {
        this.isGameOver = true;
        this.hud.showGameOver(true);
        this.setMission("Villain caught you. Restart to try again.");
        this.drivePadVector.x = 0;
        this.drivePadVector.y = 0;
        this.localPlayer.setVelocity(0, 0);
        this.hud.showDrivePad(false);

        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }
        this.hud.showMobileBuildAction(false);
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

        if (this.isInInterior && this.currentInterior) {
            const dist = Phaser.Math.Distance.Between(
                this.localPlayer.sprite.x,
                this.localPlayer.sprite.y,
                this.currentInterior.exitX,
                this.currentInterior.exitY
            );
            return dist < maxDistance ? { id: this.currentInterior.id, interiorExit: true } : null;
        }

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
            this.updateBuildInfoText();
            return;
        }

        const coarse = window.matchMedia("(pointer: coarse)").matches;
        this.hud.showDrivePad(false);

        const seat = this.getLocalSeat();
        this.nearDoor = this.getNearbyDoor(84);

        if (this.isInInterior) {
            this.hud.showAction("drive", false);
            this.hud.showAction("sit", false);
            this.hud.showAction("exitCar", false);
            this.hud.showAction("openDoor", Boolean(this.nearDoor));
            this.hud.showAction("pickFlower", false);
            this.hud.showAction("giveFlower", false);
            this.hud.showAction("acceptFlower", false);
            this.hud.showAction("buildMode", false);
            this.hud.showAction("grabMaterial", false);
            this.hud.showAction("placeBlock", false);
            this.hud.showAction("removeBlock", false);
            this.hud.showAction("cycleMaterial", false);
            this.hud.showMobileBuildAction(false);
            this.updateBuildInfoText();
            return;
        }

        const freeCar = this.getNearestVehicle(120, (v) => !v.driverId);
        const rideCar = this.getNearestVehicle(120, (v) => v.driverId && !v.passengerId && v.driverId !== this.socketAdapter.id);

        this.hud.showAction("drive", Boolean(freeCar) && !seat);
        this.hud.showAction("sit", Boolean(rideCar) && !seat);
        this.hud.showAction("exitCar", Boolean(seat));
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

        const nearDepot = Boolean(this.getNearestDepot(90));
        const canBuild = !seat && !this.isInInterior;
        this.hud.showAction("buildMode", canBuild);
        this.hud.showAction("grabMaterial", canBuild && nearDepot);
        this.hud.showAction("placeBlock", canBuild && this.isBuildMode && !this.isTouchDevice);
        this.hud.showAction("removeBlock", canBuild && this.isBuildMode && !this.isTouchDevice);
        this.hud.showAction("cycleMaterial", canBuild && this.isBuildMode);
        this.hud.showMobileBuildAction(canBuild && this.isBuildMode && this.isTouchDevice);
        this.hud.setMobileBuildLabel(this.buildHoverAction === "remove" ? "Remove" : "Place");

        if (coarse && this.getDrivingVehicleId()) {
            this.setMission("Use joystick to drive the car");
        }

        this.updateBuildInfoText();
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
        if (this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            return;
        }

        const vehicle = this.getNearestVehicle(120, (v) => !v.driverId);
        if (!vehicle) {
            return;
        }

        this.localVehiclePhysics[vehicle.id].speed = 0;
        this.localVehiclePhysics[vehicle.id].angle = vehicle.angle;
        this.socketAdapter.vehicleAction({ action: "drive", vehicleId: vehicle.id });
        this.setMission(`Driving ${vehicle.id === "car_pink" ? "pink" : "red"} car. Use joystick/arrows.`);
    }

    trySit() {
        if (this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
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
        this.setMission("You are in passenger seat.");
    }

    exitCar() {
        if (this.isGameOver || !this.isLocalInVehicle()) {
            return;
        }

        this.socketAdapter.vehicleAction({ action: "leave" });
        this.setMission("You left the car.");
    }

    openDoor() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        if (!this.nearDoor) {
            return;
        }

        if (this.isInInterior) {
            this.exitInterior();
            return;
        }

        this.enterInterior(this.nearDoor);
    }

    enterInterior(door) {
        const interior = this.interiors[door.id];
        if (!interior) {
            return;
        }

        this.isInInterior = true;
        this.currentInterior = interior;
        this.localPlayer.setVelocity(0, 0);
        this.localPlayer.sprite.setPosition(interior.spawnX, interior.spawnY);
        this.localPlayer.lastState.x = interior.spawnX;
        this.localPlayer.lastState.y = interior.spawnY;
        this.localPlayer.syncVisuals();
        this.setMission(`Inside ${door.id.replace("home_", "building ").toUpperCase()} - find exit door`);
    }

    exitInterior() {
        if (!this.currentInterior) {
            return;
        }

        this.localPlayer.setVelocity(0, 0);
        this.localPlayer.sprite.setPosition(this.currentInterior.outsideX, this.currentInterior.outsideY);
        this.localPlayer.lastState.x = this.currentInterior.outsideX;
        this.localPlayer.lastState.y = this.currentInterior.outsideY;
        this.localPlayer.syncVisuals();
        this.isInInterior = false;
        this.currentInterior = null;
        this.setMission("Back outside. Explore the city.");
    }

    pickFlower() {
        if (this.isGameOver || this.localHasFlower || this.isInInterior) {
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
            this.setMission("Flower picked. Give it to your partner.");
        }
    }

    offerFlower() {
        if (this.isGameOver || !this.localHasFlower || !this.giveTargetId) {
            return;
        }

        this.localPlayer.playGiveFlowerAnimation();
        this.socketAdapter.flowerOffer({ toId: this.giveTargetId });
        this.setMission("Flower offer sent.");
    }

    acceptFlower() {
        if (this.isGameOver || !this.pendingFlowerOfferFrom) {
            return;
        }

        this.socketAdapter.flowerResponse({ toId: this.pendingFlowerOfferFrom, accepted: true });
        this.pendingFlowerOfferFrom = null;
        this.hud.showAction("acceptFlower", false);
    }

    getNearestDepot(maxDistance) {
        let nearest = null;
        let nearestDist = maxDistance;

        for (const depot of this.materialDepots) {
            const dist = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, depot.x, depot.y);
            if (dist < nearestDist) {
                nearest = depot;
                nearestDist = dist;
            }
        }

        return nearest;
    }

    toggleBuildMode() {
        if (this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            return;
        }

        this.isBuildMode = !this.isBuildMode;
        this.setMission(this.isBuildMode ? "Build mode on. Place your first house blocks." : "Build mode off.");
        this.updateBuildInfoText();
    }

    cycleMaterial() {
        const index = MATERIAL_ORDER.indexOf(this.selectedMaterial);
        const next = MATERIAL_ORDER[(index + 1) % MATERIAL_ORDER.length];
        this.setMaterial(next);
    }

    setMaterial(material) {
        if (!MATERIAL_STYLE[material]) {
            return;
        }

        this.selectedMaterial = material;
        this.updateBuildInfoText();
    }

    grabMaterial() {
        if (this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            return;
        }

        const depot = this.getNearestDepot(90);
        if (!depot) {
            return;
        }

        this.inventory[depot.material] = clamp((this.inventory[depot.material] || 0) + 6, 0, 999);
        this.selectedMaterial = depot.material;
        this.setMission(`Collected ${depot.material}. Inventory updated.`);
        this.updateBuildInfoText();
    }

    getBlockKey(gridX, gridY) {
        return `${gridX}:${gridY}`;
    }

    getBuildTargetFromPointer() {
        const pointer = this.input.activePointer;
        const withinCanvas =
            pointer &&
            Number.isFinite(pointer.x) &&
            Number.isFinite(pointer.y) &&
            pointer.x >= 0 &&
            pointer.y >= 0 &&
            pointer.x <= this.scale.width &&
            pointer.y <= this.scale.height;
        if (!withinCanvas) {
            return null;
        }

        const worldX = pointer.worldX;
        const worldY = pointer.worldY;
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
            return null;
        }

        const maxGrid = Math.floor(WORLD_SIZE / TILE_SIZE) - 1;
        const gridX = clamp(Math.floor(worldX / TILE_SIZE), 0, maxGrid);
        const gridY = clamp(Math.floor(worldY / TILE_SIZE), 0, maxGrid);
        const x = gridX * TILE_SIZE + TILE_SIZE / 2;
        const y = gridY * TILE_SIZE + TILE_SIZE / 2;
        return { gridX, gridY, x, y };
    }

    getBuildTargetAhead() {
        const dir = this.localPlayer?.lastState?.direction || "down";
        const vec = directionToVector(dir);
        const offset = TILE_SIZE;
        const worldX = this.localPlayer.sprite.x + vec.x * offset;
        const worldY = this.localPlayer.sprite.y + vec.y * offset;
        const maxGrid = Math.floor(WORLD_SIZE / TILE_SIZE) - 1;
        const gridX = clamp(Math.floor(worldX / TILE_SIZE), 0, maxGrid);
        const gridY = clamp(Math.floor(worldY / TILE_SIZE), 0, maxGrid);
        return {
            gridX,
            gridY,
            x: gridX * TILE_SIZE + TILE_SIZE / 2,
            y: gridY * TILE_SIZE + TILE_SIZE / 2
        };
    }

    getActiveBuildTarget() {
        if (this.isTouchDevice) {
            return this.getBuildTargetAhead();
        }

        return this.getBuildTargetFromPointer() || this.getBuildTargetAhead();
    }

    canReachBuildCell(gridX, gridY) {
        const x = gridX * TILE_SIZE + TILE_SIZE / 2;
        const y = gridY * TILE_SIZE + TILE_SIZE / 2;
        const dist = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, x, y);
        return dist < 190;
    }

    isInsideBuildingFootprint(gridX, gridY) {
        for (const building of this.buildings) {
            if (gridX >= building.tx && gridX < building.tx + building.tw && gridY >= building.ty && gridY < building.ty + building.th) {
                return true;
            }
        }

        return false;
    }

    canPlaceAt(gridX, gridY) {
        if (!this.canReachBuildCell(gridX, gridY)) {
            return false;
        }

        if ((this.inventory[this.selectedMaterial] || 0) <= 0) {
            return false;
        }

        const key = this.getBlockKey(gridX, gridY);
        if (this.buildBlocks.has(key)) {
            return false;
        }

        if (this.isInsideBuildingFootprint(gridX, gridY)) {
            return false;
        }

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        if (Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, cx, cy) < 26) {
            return false;
        }

        for (const depot of this.materialDepots) {
            if (depot.gridX === gridX && depot.gridY === gridY) {
                return false;
            }
        }

        return true;
    }

    canRemoveAt(gridX, gridY) {
        if (!this.canReachBuildCell(gridX, gridY)) {
            return false;
        }

        const key = this.getBlockKey(gridX, gridY);
        return this.buildBlocks.has(key);
    }

    updateBuildPreview() {
        if (!this.isBuildMode || this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            this.buildTarget = null;
            this.buildPreview?.setVisible(false);
            this.crosshairH?.setVisible(false);
            this.crosshairV?.setVisible(false);
            this.buildHoverAction = "place";
            return;
        }

        const target = this.getActiveBuildTarget();
        if (!target) {
            this.buildTarget = null;
            this.buildPreview?.setVisible(false);
            this.crosshairH?.setVisible(false);
            this.crosshairV?.setVisible(false);
            this.buildHoverAction = "place";
            return;
        }

        this.buildTarget = target;
        const key = this.getBlockKey(target.gridX, target.gridY);
        const hasExisting = this.buildBlocks.has(key);
        this.buildHoverAction = hasExisting ? "remove" : "place";
        const valid = hasExisting ? this.canRemoveAt(target.gridX, target.gridY) : this.canPlaceAt(target.gridX, target.gridY);
        const style = MATERIAL_STYLE[this.selectedMaterial];

        this.buildPreview.setPosition(target.x, target.y).setVisible(true);
        if (hasExisting) {
            this.buildPreview.setFillStyle(valid ? 0x5093ff : 0xcc3d47, valid ? 0.22 : 0.26);
        } else {
            this.buildPreview.setFillStyle(valid ? style.preview : 0xcc3d47, valid ? 0.24 : 0.26);
        }
        this.buildPreview.setStrokeStyle(2, valid ? 0xf8f8f8 : 0xffd5d5, 0.88);
        this.crosshairH.setPosition(target.x, target.y).setVisible(true);
        this.crosshairV.setPosition(target.x, target.y).setVisible(true);
    }

    tryPlaceBlock(overrideTarget = null) {
        if (!this.isBuildMode || this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            return;
        }

        if ((this.inventory[this.selectedMaterial] || 0) <= 0) {
            this.setMission(`No ${this.selectedMaterial}. Grab materials from depot first.`);
            return;
        }

        const target = overrideTarget || this.buildTarget || this.getActiveBuildTarget();
        if (!target || !this.canPlaceAt(target.gridX, target.gridY)) {
            return;
        }

        this.inventory[this.selectedMaterial] = Math.max(0, (this.inventory[this.selectedMaterial] || 0) - 1);
        this.upsertBuildBlock({
            gridX: target.gridX,
            gridY: target.gridY,
            material: this.selectedMaterial
        });
        this.socketAdapter.buildAction({
            action: "place",
            gridX: target.gridX,
            gridY: target.gridY,
            material: this.selectedMaterial
        });
        this.playPlaceSound();
        this.updateBuildInfoText();
    }

    tryRemoveBlock(overrideTarget = null) {
        if (!this.isBuildMode || this.isGameOver || this.isInInterior || this.isLocalInVehicle()) {
            return;
        }

        const target = overrideTarget || this.buildTarget || this.getActiveBuildTarget();
        if (!target || !this.canRemoveAt(target.gridX, target.gridY)) {
            return;
        }

        const key = this.getBlockKey(target.gridX, target.gridY);
        const existing = this.buildBlocks.get(key);
        if (!existing) {
            return;
        }

        this.inventory[existing.material] = clamp((this.inventory[existing.material] || 0) + 1, 0, 999);
        this.removeBuildBlock(target.gridX, target.gridY);
        this.socketAdapter.buildAction({
            action: "remove",
            gridX: target.gridX,
            gridY: target.gridY
        });
        this.playRemoveSound();
        this.updateBuildInfoText();
    }

    performContextualBuildAction() {
        if (!this.isBuildMode) {
            this.toggleBuildMode();
            return;
        }

        const target = this.buildTarget || this.getActiveBuildTarget();
        if (!target) {
            return;
        }

        const key = this.getBlockKey(target.gridX, target.gridY);
        if (this.buildBlocks.has(key)) {
            this.tryRemoveBlock(target);
            return;
        }

        this.tryPlaceBlock(target);
    }

    replaceBuildState(blocks) {
        const keep = new Set();

        for (const block of blocks) {
            const gridX = Math.floor(Number(block?.gridX));
            const gridY = Math.floor(Number(block?.gridY));
            const material = typeof block?.material === "string" ? block.material : "";
            if (!Number.isFinite(gridX) || !Number.isFinite(gridY) || !MATERIAL_STYLE[material]) {
                continue;
            }

            const key = this.getBlockKey(gridX, gridY);
            keep.add(key);
            this.upsertBuildBlock({ gridX, gridY, material });
        }

        for (const key of Array.from(this.buildBlocks.keys())) {
            if (!keep.has(key)) {
                const [gx, gy] = key.split(":").map((v) => Number(v));
                this.removeBuildBlock(gx, gy);
            }
        }
    }

    upsertBuildBlock(block) {
        const gridX = Math.floor(Number(block?.gridX));
        const gridY = Math.floor(Number(block?.gridY));
        const material = typeof block?.material === "string" ? block.material : "";
        if (!Number.isFinite(gridX) || !Number.isFinite(gridY) || !MATERIAL_STYLE[material]) {
            return;
        }

        const key = this.getBlockKey(gridX, gridY);
        const existing = this.buildBlocks.get(key);
        if (existing && existing.material === material) {
            return;
        }

        if (existing) {
            existing.visual?.destroy();
            existing.collider?.destroy();
        }

        const style = MATERIAL_STYLE[material];
        const x = gridX * TILE_SIZE + TILE_SIZE / 2;
        const y = gridY * TILE_SIZE + TILE_SIZE / 2;
        const visual = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, style.fill, style.alpha || 0.97).setDepth(930 + y);
        const collider = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, 0x000000, 0);
        this.physics.add.existing(collider, true);
        this.buildBlockColliders?.add(collider);

        this.buildBlocks.set(key, {
            gridX,
            gridY,
            material,
            visual,
            collider
        });
    }

    removeBuildBlock(gridX, gridY) {
        const key = this.getBlockKey(gridX, gridY);
        const block = this.buildBlocks.get(key);
        if (!block) {
            return;
        }

        block.visual?.destroy();
        block.collider?.destroy();
        this.buildBlocks.delete(key);
    }

    updateBuildInfoText() {
        const label = this.selectedMaterial[0].toUpperCase() + this.selectedMaterial.slice(1);
        this.hud.setBuildButtonLabel(`Material: ${label}`);
        this.hud.setMaterialCounts(this.inventory);
        this.hud.setBuildModeLabel(this.isTouchDevice ? `Build: ${this.isBuildMode ? "ON" : "OFF"}` : "Build Mode");
        const mode = this.isBuildMode ? "ON" : "OFF";
        const text =
            `Build: ${mode} | Selected: ${label} | Brick ${this.inventory.brick} | ` +
            `Wood ${this.inventory.wood} | Glass ${this.inventory.glass} | Hotkeys: B/F/G/1/2/3`;
        this.hud.setBuildInfo(text);
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
                baseState = { x: vehicle.x, y: vehicle.y, direction: angleToDirection(vehicle.angle), animState: "idle", frame: 0 };
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
            name: this.localDisplayName,
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

    updatePlayerIndicator(time) {
        const seat = this.getLocalSeat();
        if (seat) {
            const v = this.vehicleStates[seat.vehicleId];
            this.playerIndicator.setPosition(v.x, v.y - 44 - Math.sin(time / 180) * 3);
        } else {
            this.playerIndicator.setPosition(this.localPlayer.sprite.x, this.localPlayer.sprite.y - 44 - Math.sin(time / 180) * 3);
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
            const d = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, p.sprite.x, p.sprite.y);
            nearest = Math.min(nearest, d);
        }

        const base = nearest === 99999 ? 20 : Phaser.Math.Clamp(100 - nearest / 6, 10, 100);
        const meter = clamp(base + this.loveBonus, 10, 100);
        this.hud.setLove(Math.round(meter));

        if (meter > 70 && !this.isGameOver) {
            this.setMission(this.isInInterior ? "Safe inside building" : "Strong bond. Explore and survive together.");
        }
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
        if (this.unsubBuildState) {
            this.unsubBuildState();
        }
        if (this.unsubBuildPatch) {
            this.unsubBuildPatch();
        }
        if (this.unsubConnect) {
            this.unsubConnect();
        }

        if (this.chatForm && this.chatHandler) {
            this.chatForm.removeEventListener("submit", this.chatHandler);
        }

        if (this.hud.restartButton && this.restartHandler) {
            this.hud.restartButton.removeEventListener("click", this.restartHandler);
        }
        if (this.hud.mobileBuildAction && this.mobileBuildHandler) {
            this.hud.mobileBuildAction.removeEventListener("click", this.mobileBuildHandler);
        }
        if (this.hud.chatToggle && this.mobileChatHandler) {
            this.hud.chatToggle.removeEventListener("click", this.mobileChatHandler);
        }
        if (this.hud.missionBox && this.mobileMissionHandler) {
            this.hud.missionBox.removeEventListener("click", this.mobileMissionHandler);
        }
        if (this.mobileMissionTimer) {
            clearTimeout(this.mobileMissionTimer);
            this.mobileMissionTimer = null;
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

        if (this.pointerPlaceHandler) {
            this.input.off("pointerdown", this.pointerPlaceHandler);
        }

        if (this.playerIndicator) {
            this.playerIndicator.destroy();
        }

        this.buildPreview?.destroy();
        this.crosshairH?.destroy();
        this.crosshairV?.destroy();
        for (const depot of this.materialDepots) {
            for (const visual of depot.visuals || []) {
                visual.destroy();
            }
        }
        for (const block of this.buildBlocks.values()) {
            block.visual?.destroy();
            block.collider?.destroy();
        }
        this.buildBlocks.clear();

        this.hud.showDrivePad(false);
        this.hud.showMobileBuildAction(false);
        this.hud.showGameOver(false);
        document.body.classList.remove("mobile-chat-open");
        document.body.classList.remove("mobile-mission-open");
        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }

        if (this.localPlayer) {
            this.localPlayer.destroy();
        }
    }
}
