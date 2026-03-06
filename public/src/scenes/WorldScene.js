import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { VirtualJoystick } from "../controls/virtualJoystick.js";
import { createHudControls } from "../ui/hud.js";

const MAX_PLAYERS = 4;
const PLAYER_SPEED = 214;

const CAR_ACCEL = 780;
const CAR_BRAKE = 980;
const CAR_MAX_FORWARD = 520;
const CAR_MAX_REVERSE = -220;
const CAR_IDLE_DRAG = 3.6;
const CAR_STEER_BASE = 1.9;
const CAR_STEER_SPEED_FACTOR = 1.9;
const CAR_HAND_BRAKE = 1550;

const DIRECTIONS = ["down", "left", "right", "up"];
const MATERIAL_ORDER = ["brick", "wood", "glass", "steel"];
const FOOD_ORDER = ["meat", "apple", "strawberry", "blueberry"];
const MATERIAL_STYLE = {
    brick: { fill: 0xa54f3c, stroke: 0x6e2d21, preview: 0xbd6d58 },
    wood: { fill: 0x8a633b, stroke: 0x5a3d22, preview: 0xb48557 },
    glass: { fill: 0x8bcde0, stroke: 0x4b7f92, preview: 0xa8dced, alpha: 0.62 },
    steel: { fill: 0x8e9aad, stroke: 0x5a6475, preview: 0xaeb7c8 }
};

const CAR_CONFIG = [
    { id: "car_red", body: 0xd64045, roof: 0xf0e7d8 },
    { id: "car_pink", body: 0xef7db4, roof: 0xffecf4 }
];

const WEAPONS = [
    { id: "pistol", label: "Pistol", range: 460, cooldown: 290, color: 0xfff1b1 },
    { id: "rifle", label: "Rifle", range: 580, cooldown: 190, color: 0x8ff4ff }
];

const SAFE_ZONE_SIZE = 2048;
const SAFE_ZONE_HALF = SAFE_ZONE_SIZE / 2;
const SAFE_CENTER = WORLD_SIZE / 2;
const SAFE_MIN = SAFE_CENTER - SAFE_ZONE_HALF;
const SAFE_MAX = SAFE_CENTER + SAFE_ZONE_HALF;
const GATE_WIDTH = 220;
const MAP_REFRESH_MS = 180;
const FULL_MAP_REFRESH_MS = 260;
const HUD_REFRESH_MS = 240;
const AIM_REFRESH_MS = 80;
const AI_REFRESH_MS = 55;
const RESOURCE_CULL_MS = 220;
const COW_ACTIVE_RANGE = 1500;
const ZOMBIE_ACTIVE_RANGE = 1800;
const DRAW_CULL_MARGIN = 280;

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

        this.safeWallRects = [];
        this.gateCollider = null;
        this.gateOpen = false;
        this.nearGate = false;

        this.isGameOver = false;
        this.isTouchDevice = false;
        this.isChatTyping = false;
        this.mobileChatOpen = false;

        this.resourceNodes = [];
        this.zombies = [];
        this.cows = [];

        this.inventory = {
            brick: 0,
            wood: 0,
            glass: 0,
            steel: 0,
            apple: 0,
            strawberry: 0,
            blueberry: 0,
            meat: 0
        };

        this.selectedMaterial = "brick";
        this.isBuildMode = false;
        this.buildBlocks = new Map();
        this.buildBlockColliders = null;
        this.buildTarget = null;
        this.buildHoverAction = "place";

        this.weaponIndex = 0;
        this.lastShotAt = 0;
        this.currentAimTarget = null;

        this.bitesTaken = 0;
        this.lastBiteTime = 0;
        this.hunger = 100;
        this.lastHungerTick = 0;

        this.lastEmitTime = 0;
        this.lastDriveEmitTime = 0;
        this.lastSentState = null;
        this.drivePadVector = { x: 0, y: 0 };

        this.localDisplayName = "husband";

        this.audioCtx = null;
        this.lastStepSoundTime = 0;

        this.mapUi = null;
        this.isFullMapOpen = false;
        this.lastMapDrawAt = 0;
        this.lastFullMapDrawAt = 0;
        this.lastHudRefreshAt = 0;
        this.lastAimUpdateAt = 0;
        this.lastAiTickAt = 0;
        this.lastResourceCullAt = 0;
        this.lastInteractionRefreshAt = 0;
        this.lastBackpackText = "";
        this.lastUiHintKey = "";
        this.currentEnterAction = "";

        this.aiRefreshMs = AI_REFRESH_MS;
        this.resourceCullMs = RESOURCE_CULL_MS;
        this.hudRefreshMs = HUD_REFRESH_MS;
        this.mapRefreshMs = MAP_REFRESH_MS;
        this.fullMapRefreshMs = FULL_MAP_REFRESH_MS;
    }

    create() {
        this.hud = createHudControls();
        this.hud.showGameOver(false);
        this.hud.setLove(68);
        this.setMission("Safe zone ready. Open the gate, collect resources, and return alive.");

        this.createMap();
        this.createSafeZone();
        this.createBuildSystem();
        this.createVehicles();
        this.createResourceNodes();
        this.createCows();
        this.createZombies();
        this.createSoundSystem();
        this.createInput();
        this.createLocalPlayer();
        this.createPlayerIndicator();
        this.setupNetworking();
        this.createDayNightOverlay();
        this.createMapUi();

        this.bindChatInput();
        this.bindEmojiButtons();
        this.bindActionButtons();
        this.bindDrivePadButtons();
        this.bindRestartButton();
        this.bindMobileUi();
        this.bindMapUi();

        // Delay heavy decorative drawing so controls feel responsive immediately on load.
        this.time.delayedCall(120, () => this.createWorldDetails());

        this.updateBuildInfoText();
        this.updateBackpackInfo();

        this.events.once("shutdown", () => this.cleanup());
    }

    setMission(text) {
        this.lastMission = text;
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

        // Sparse roads to prevent a city/neighborhood feeling.
        for (let x = 0; x < tileCount; x += 1) {
            if (x % 17 === 0 || x % 19 === 0) {
                this.roadLayer.putTileAt(1, x, 12);
                this.roadLayer.putTileAt(1, x, 13);
                this.roadLayer.putTileAt(1, x, 114);
                this.roadLayer.putTileAt(1, x, 115);
            }
        }
        for (let y = 0; y < tileCount; y += 1) {
            if (y % 16 === 0 || y % 22 === 0) {
                this.roadLayer.putTileAt(1, 12, y);
                this.roadLayer.putTileAt(1, 13, y);
                this.roadLayer.putTileAt(1, 114, y);
                this.roadLayer.putTileAt(1, 115, y);
            }
        }

        this.blockLayer.setCollision([2, 3]);
        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    createSafeZone() {
        const decor = this.add.graphics().setDepth(700);

        decor.fillStyle(0x273541, 0.28);
        decor.fillRect(SAFE_MIN, SAFE_MIN, SAFE_ZONE_SIZE, SAFE_ZONE_SIZE);

        decor.fillStyle(0xffffff, 0.06);
        for (let y = SAFE_MIN + 20; y < SAFE_MAX - 20; y += 60) {
            decor.fillRect(SAFE_MIN + 12, y, SAFE_ZONE_SIZE - 24, 2);
        }

        this.safeWallRects = [
            { x: SAFE_MIN, y: SAFE_MIN, w: SAFE_ZONE_SIZE, h: 26 },
            { x: SAFE_MIN, y: SAFE_MIN, w: 26, h: SAFE_ZONE_SIZE },
            { x: SAFE_MAX - 26, y: SAFE_MIN, w: 26, h: SAFE_ZONE_SIZE },
            {
                x: SAFE_MIN,
                y: SAFE_MAX - 26,
                w: SAFE_ZONE_SIZE / 2 - GATE_WIDTH / 2,
                h: 26
            },
            {
                x: SAFE_CENTER + GATE_WIDTH / 2,
                y: SAFE_MAX - 26,
                w: SAFE_ZONE_SIZE / 2 - GATE_WIDTH / 2,
                h: 26
            }
        ];

        this.safeWalls = this.physics.add.staticGroup();
        for (const r of this.safeWallRects) {
            const wall = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x57758f, 0.9).setDepth(910);
            wall.setStrokeStyle(2, 0xd5e8ff, 0.25);
            this.physics.add.existing(wall, true);
            this.safeWalls.add(wall);
        }

        this.gateZone = {
            x: SAFE_CENTER - GATE_WIDTH / 2,
            y: SAFE_MAX - 26,
            w: GATE_WIDTH,
            h: 26,
            markerX: SAFE_CENTER,
            markerY: SAFE_MAX - 48
        };

        this.gateVisual = this.add
            .rectangle(SAFE_CENTER, SAFE_MAX - 13, GATE_WIDTH, 26, 0xff7f50, 0.95)
            .setDepth(915)
            .setStrokeStyle(2, 0xffd7af, 0.9);

        this.gateIndicator = this.add
            .ellipse(SAFE_CENTER, SAFE_MAX - 48, 90, 20, 0xffdb88, 0.75)
            .setDepth(905);

        this.gateCollider = this.add.rectangle(SAFE_CENTER, SAFE_MAX - 13, GATE_WIDTH, 26, 0x000000, 0);
        this.physics.add.existing(this.gateCollider, true);

        this.setGateOpen(false, false);

        this.homeCore = this.add
            .rectangle(SAFE_CENTER, SAFE_CENTER, 460, 320, 0x5c463a, 0.88)
            .setDepth(880)
            .setStrokeStyle(3, 0xdfbe9b, 0.8);
        this.add.rectangle(SAFE_CENTER, SAFE_CENTER - 110, 240, 66, 0x786357, 1).setDepth(881);
        this.add.rectangle(SAFE_CENTER, SAFE_CENTER + 132, 72, 86, 0x3c2a1e, 1).setDepth(882);
        this.add.rectangle(SAFE_CENTER, SAFE_CENTER - 2, 220, 118, 0xf2ddbd, 0.48).setDepth(879);
    }

    createWorldDetails() {
        const decor = this.add.graphics().setDepth(650);

        const tree = (x, y, scale = 1) => {
            decor.fillStyle(0x000000, 0.2);
            decor.fillEllipse(x + 3, y + 18 * scale, 28 * scale, 10 * scale);
            decor.fillStyle(0x5d3d2b, 1);
            decor.fillRect(x - 4 * scale, y + 8 * scale, 8 * scale, 18 * scale);
            decor.fillStyle(0x2d8e53, 1);
            decor.fillCircle(x, y, 16 * scale);
            decor.fillCircle(x - 10 * scale, y + 6 * scale, 10 * scale);
            decor.fillCircle(x + 10 * scale, y + 6 * scale, 10 * scale);
        };

        const treeCount = this.isTouchDevice ? 140 : 300;
        for (let i = 0; i < treeCount; i += 1) {
            const x = Phaser.Math.Between(80, WORLD_SIZE - 80);
            const y = Phaser.Math.Between(80, WORLD_SIZE - 80);
            if (this.isInsideSafeZone(x, y)) {
                continue;
            }
            tree(x, y, Phaser.Math.FloatBetween(0.76, 1.15));
        }

        // Safe zone soft lights.
        for (let i = 0; i < 12; i += 1) {
            const x = SAFE_MIN + 80 + i * 170;
            decor.fillStyle(0xfff0a6, 0.16);
            decor.fillCircle(x, SAFE_MIN + 66, 18);
            decor.fillCircle(x, SAFE_MAX - 66, 18);
        }
    }

    createBuildSystem() {
        this.buildBlockColliders = this.physics.add.staticGroup();
        this.buildPreview = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0xbd6d58, 0.24).setDepth(2110).setVisible(false);
        this.buildPreview.setStrokeStyle(2, 0xfefefe, 0.7);
        this.crosshairH = this.add.rectangle(0, 0, 14, 2, 0xfefefe, 0.9).setDepth(2111).setVisible(false);
        this.crosshairV = this.add.rectangle(0, 0, 2, 14, 0xfefefe, 0.9).setDepth(2111).setVisible(false);
    }

    createVehicles() {
        const start = {
            car_red: { x: SAFE_CENTER - 180, y: SAFE_CENTER + 90 },
            car_pink: { x: SAFE_CENTER + 180, y: SAFE_CENTER + 90 }
        };

        for (const config of CAR_CONFIG) {
            this.vehicleStates[config.id] = {
                id: config.id,
                x: start[config.id].x,
                y: start[config.id].y,
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

    createResourceNodes() {
        const addNode = (resource, type, x, y) => {
            const colorMap = {
                apple: 0xca3f38,
                strawberry: 0xe65278,
                blueberry: 0x6274d9,
                meat: 0xb7524f,
                brick: 0x9a4e3c,
                wood: 0x8a633b,
                glass: 0x8bcde0,
                steel: 0x8e9aad
            };

            const shadow = this.add.ellipse(x, y + 12, 26, 10, 0x000000, 0.2).setDepth(840);
            const core = this.add.circle(x, y, type === "food" ? 11 : 13, colorMap[resource] || 0xffffff, 0.95).setDepth(845);
            core.setStrokeStyle(2, 0xffffff, 0.28);

            const node = {
                id: `${resource}-${x.toFixed(0)}-${y.toFixed(0)}-${Math.random().toString(16).slice(2, 6)}`,
                resource,
                type,
                x,
                y,
                active: true,
                respawnAt: 0,
                shadow,
                core,
                label: null
            };

            this.resourceNodes.push(node);
            return node;
        };

        const spawnCluster = (resource, type, count) => {
            for (let i = 0; i < count; i += 1) {
                const point = this.randomOutsidePoint();
                addNode(resource, type, point.x, point.y);
            }
        };

        const mobileScale = this.isTouchDevice ? 0.46 : 1;
        spawnCluster("apple", "food", Math.floor(44 * mobileScale));
        spawnCluster("strawberry", "food", Math.floor(36 * mobileScale));
        spawnCluster("blueberry", "food", Math.floor(36 * mobileScale));
        spawnCluster("brick", "material", Math.floor(30 * mobileScale));
        spawnCluster("wood", "material", Math.floor(36 * mobileScale));
        spawnCluster("glass", "material", Math.floor(24 * mobileScale));
        spawnCluster("steel", "material", Math.floor(22 * mobileScale));
    }

    createCows() {
        const cowCount = this.isTouchDevice ? 7 : 14;
        for (let i = 0; i < cowCount; i += 1) {
            const point = this.randomOutsidePoint();
            const cow = {
                x: point.x,
                y: point.y,
                speed: Phaser.Math.Between(34, 52),
                dirX: Phaser.Math.FloatBetween(-1, 1),
                dirY: Phaser.Math.FloatBetween(-1, 1),
                turnAt: Phaser.Math.Between(900, 2200),
                lastTurnAt: 0,
                alive: true,
                respawnAt: 0
            };

            cow.shadow = this.add.ellipse(cow.x, cow.y + 12, 34, 12, 0x000000, 0.24).setDepth(900);
            cow.body = this.add.rectangle(cow.x, cow.y, 32, 18, 0xd7d2c4).setDepth(904);
            cow.head = this.add.rectangle(cow.x + 20, cow.y - 1, 12, 11, 0xe8e3d2).setDepth(905);
            cow.spotA = this.add.circle(cow.x - 6, cow.y - 1, 4, 0x4b3f37).setDepth(906);
            cow.spotB = this.add.circle(cow.x + 2, cow.y + 2, 3, 0x4b3f37).setDepth(906);

            this.cows.push(cow);
        }
    }

    createZombies() {
        const zombieCount = this.isTouchDevice ? 22 : 46;
        for (let i = 0; i < zombieCount; i += 1) {
            const point = this.randomOutsidePoint();
            const zombie = {
                x: point.x,
                y: point.y,
                speed: Phaser.Math.Between(120, 168),
                dirX: Phaser.Math.FloatBetween(-1, 1),
                dirY: Phaser.Math.FloatBetween(-1, 1),
                wanderAt: 0,
                alive: true,
                respawnAt: 0
            };

            zombie.shadow = this.add.ellipse(zombie.x, zombie.y + 10, 24, 8, 0x000000, 0.25).setDepth(920);
            zombie.body = this.add.rectangle(zombie.x, zombie.y, 20, 26, 0x406148).setDepth(922);
            zombie.head = this.add.circle(zombie.x, zombie.y - 18, 8, 0xb6dfb1).setDepth(923);
            zombie.eyeL = this.add.circle(zombie.x - 2, zombie.y - 18, 1.5, 0x111111).setDepth(924);
            zombie.eyeR = this.add.circle(zombie.x + 2, zombie.y - 18, 1.5, 0x111111).setDepth(924);

            this.zombies.push(zombie);
        }

        this.targetRing = this.add.circle(0, 0, 16, 0xffd171, 0).setDepth(2080).setVisible(false);
        this.targetRing.setStrokeStyle(2, 0xffd171, 1);

        this.shotLine = this.add.line(0, 0, 0, 0, 0, 0, 0xffffff, 0.9).setDepth(2070).setVisible(false);
        this.shotLine.setLineWidth(2, 2);
    }

    randomOutsidePoint() {
        let x = 0;
        let y = 0;
        let attempts = 0;

        do {
            x = Phaser.Math.Between(120, WORLD_SIZE - 120);
            y = Phaser.Math.Between(120, WORLD_SIZE - 120);
            attempts += 1;
        } while (this.isInsideSafeZone(x, y) && attempts < 200);

        return { x, y };
    }

    isInsideSafeZone(x, y, margin = 0) {
        return x >= SAFE_MIN + margin && x <= SAFE_MAX - margin && y >= SAFE_MIN + margin && y <= SAFE_MAX - margin;
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

    playWalkStepSound(time) {
        if (!this.audioCtx) {
            return;
        }
        if (time - this.lastStepSoundTime < 220) {
            return;
        }
        this.lastStepSoundTime = time;
        const tone = 146 + Math.random() * 48;
        this.playTone({ frequency: tone, slideTo: tone * 0.7, duration: 0.045, type: "sine", volume: 0.02 });
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
            matSteel: Phaser.Input.Keyboard.KeyCodes.FOUR,
            handBrake: Phaser.Input.Keyboard.KeyCodes.SPACE,
            shoot: Phaser.Input.Keyboard.KeyCodes.J,
            collect: Phaser.Input.Keyboard.KeyCodes.R,
            eat: Phaser.Input.Keyboard.KeyCodes.E,
            cycleWeapon: Phaser.Input.Keyboard.KeyCodes.Q,
            toggleGate: Phaser.Input.Keyboard.KeyCodes.H
        });

        this.input.keyboard.disableGlobalCapture();

        this.isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        this.aiRefreshMs = this.isTouchDevice ? 90 : AI_REFRESH_MS;
        this.resourceCullMs = this.isTouchDevice ? 320 : RESOURCE_CULL_MS;
        this.hudRefreshMs = this.isTouchDevice ? 300 : HUD_REFRESH_MS;
        this.mapRefreshMs = this.isTouchDevice ? 280 : MAP_REFRESH_MS;
        this.fullMapRefreshMs = this.isTouchDevice ? 340 : FULL_MAP_REFRESH_MS;
        this.localDisplayName = this.isTouchDevice ? "wife" : "husband";
        this.socketAdapter.setProfile({ name: this.localDisplayName });

        if (this.isTouchDevice) {
            const root = document.getElementById("mobileJoystick");
            const knob = document.getElementById("joystickKnob");
            this.joystick = new VirtualJoystick(root, knob);
        }

        this.pointerDownHandler = (pointer) => {
            if (this.isGameOver) {
                return;
            }

            const inCanvas = pointer?.event?.target?.tagName === "CANVAS";
            if (!inCanvas) {
                return;
            }

            if (this.isBuildMode && !this.isLocalInVehicle()) {
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
                } else {
                    this.tryPlaceBlock(target);
                }
                return;
            }

            this.shootWeapon();
        };

        this.input.on("pointerdown", this.pointerDownHandler);
    }

    createLocalPlayer() {
        const spawn = { x: SAFE_MIN + 220, y: SAFE_MIN + 220 };
        const frameOffset = this.getFrameOffsetForName(this.localDisplayName);

        this.localPlayer = new PlayerEntity(this, spawn.x, spawn.y, "player", frameOffset, "local", this.localDisplayName, true);
        this.localPlayer.sprite.body.setMaxVelocity(PLAYER_SPEED, PLAYER_SPEED);

        this.physics.add.collider(this.localPlayer.sprite, this.safeWalls);
        this.physics.add.collider(this.localPlayer.sprite, this.blockLayer);
        if (this.gateCollider) {
            this.physics.add.collider(this.localPlayer.sprite, this.gateCollider);
        }
        if (this.buildBlockColliders) {
            this.physics.add.collider(this.localPlayer.sprite, this.buildBlockColliders);
        }

        this.cameras.main.setZoom(this.isTouchDevice ? 1.14 : 1.24);
        this.cameras.main.startFollow(this.localPlayer.sprite, true, 1, 1);
        this.cameras.main.followOffset.set(0, 0);
    }

    createPlayerIndicator() {
        this.playerIndicator = this.add.triangle(0, 0, 0, 10, 8, -6, -8, -6, 0xffeb7a, 1).setDepth(2200);
        this.playerIndicator.setStrokeStyle(2, 0x4d2f20, 0.9);
    }

    getFrameOffsetForName(name) {
        const lower = String(name || "").toLowerCase();
        return lower === "wife" ? 12 : 0;
    }

    setupNetworking() {
        this.unsubConnect = this.socketAdapter.on("connect", () => {
            this.socketAdapter.setProfile({ name: this.localDisplayName });
        });

        this.unsubPlayers = this.socketAdapter.on("players", (players) => {
            this.playerList = players;
            this.syncRemotePlayers();
            this.updateBondMeter();
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
        this.chatFocusHandler = () => {
            this.isChatTyping = true;
        };
        this.chatBlurHandler = () => {
            this.isChatTyping = false;
        };
        this.chatForm.addEventListener("submit", this.chatHandler);
        this.chatInput.addEventListener("focus", this.chatFocusHandler);
        this.chatInput.addEventListener("blur", this.chatBlurHandler);
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
        bind("enter", () => this.performEnterAction());
        bind("openGate", () => this.toggleGate());
        bind("collect", () => this.collectNearbyResource());
        bind("shoot", () => this.shootWeapon());
        bind("eat", () => this.eatFood());
        bind("buildMode", () => this.toggleBuildMode());
        bind("placeBlock", () => {
            if (this.isTouchDevice) {
                this.performContextualBuildAction();
                return;
            }
            this.tryPlaceBlock();
        });
        bind("removeBlock", () => this.tryRemoveBlock());
        bind("cycleMaterial", () => this.cycleMaterial());
        bind("cycleWeapon", () => this.cycleWeapon());

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
        return durationMs;
    }

    createMapUi() {
        const miniCanvas = this.hud.miniMapCanvas;
        const fullCanvas = this.hud.fullMapCanvas;
        if (!miniCanvas || !fullCanvas) {
            return;
        }

        const miniCtx = miniCanvas.getContext("2d");
        const fullCtx = fullCanvas.getContext("2d");
        if (!miniCtx || !fullCtx) {
            return;
        }

        this.mapUi = {
            miniCanvas,
            fullCanvas,
            miniCtx,
            fullCtx
        };

        this.setFullMapOpen(false);
        this.renderMiniMap();
    }

    bindMapUi() {
        if (!this.mapUi) {
            return;
        }

        if (this.hud.miniMapWrap) {
            this.mapOpenHandler = () => this.setFullMapOpen(true);
            this.hud.miniMapWrap.addEventListener("click", this.mapOpenHandler);
        }
        if (this.hud.closeFullMapButton) {
            this.mapCloseHandler = () => this.setFullMapOpen(false);
            this.hud.closeFullMapButton.addEventListener("click", this.mapCloseHandler);
        }
    }

    setFullMapOpen(open) {
        this.isFullMapOpen = Boolean(open);
        this.hud.showFullMap(this.isFullMapOpen);
    }

    drawMapToContext(ctx, width, height, fullView = false) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#1d4f31";
        ctx.fillRect(0, 0, width, height);

        const sx = width / WORLD_SIZE;
        const sy = height / WORLD_SIZE;

        ctx.fillStyle = "rgba(118, 154, 181, 0.28)";
        ctx.fillRect(SAFE_MIN * sx, SAFE_MIN * sy, SAFE_ZONE_SIZE * sx, SAFE_ZONE_SIZE * sy);

        ctx.strokeStyle = "rgba(223, 236, 255, 0.55)";
        ctx.lineWidth = fullView ? 2 : 1;
        ctx.strokeRect(SAFE_MIN * sx, SAFE_MIN * sy, SAFE_ZONE_SIZE * sx, SAFE_ZONE_SIZE * sy);

        if (!this.gateOpen) {
            ctx.fillStyle = "rgba(255, 145, 99, 0.8)";
            ctx.fillRect(this.gateZone.x * sx, this.gateZone.y * sy, this.gateZone.w * sx, this.gateZone.h * sy);
        }

        for (const zombie of this.zombies) {
            if (!zombie.alive) {
                continue;
            }
            ctx.fillStyle = "#87db7b";
            ctx.fillRect(zombie.x * sx - 1, zombie.y * sy - 1, 3, 3);
        }

        const local = this.getPlayerWorldPosition(this.socketAdapter.id);
        if (local) {
            ctx.fillStyle = "#ff5f88";
            ctx.beginPath();
            ctx.arc(local.x * sx, local.y * sy, fullView ? 4.6 : 3, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const [id] of this.players.entries()) {
            const pos = this.getPlayerWorldPosition(id);
            if (!pos) {
                continue;
            }
            ctx.fillStyle = "#75f0d7";
            ctx.beginPath();
            ctx.arc(pos.x * sx, pos.y * sy, fullView ? 4 : 2.6, 0, Math.PI * 2);
            ctx.fill();
        }

        if (!fullView) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    renderMiniMap() {
        if (!this.mapUi) {
            return;
        }
        this.drawMapToContext(this.mapUi.miniCtx, this.mapUi.miniCanvas.width, this.mapUi.miniCanvas.height, false);
    }

    renderFullMap() {
        if (!this.mapUi || !this.isFullMapOpen) {
            return;
        }
        this.drawMapToContext(this.mapUi.fullCtx, this.mapUi.fullCanvas.width, this.mapUi.fullCanvas.height, true);
    }

    syncRemotePlayers() {
        const entries = Object.entries(this.playerList).slice(0, MAX_PLAYERS);
        const seen = new Set();

        for (const [id, state] of entries) {
            if (!state || id === this.socketAdapter.id) {
                continue;
            }

            seen.add(id);
            let existing = this.players.get(id);
            const frameOffset = this.getFrameOffsetForName(state.name);

            if (existing && existing.frameOffset !== frameOffset) {
                existing.destroy();
                this.players.delete(id);
                existing = null;
            }

            if (!existing) {
                const entity = new PlayerEntity(
                    this,
                    state.x ?? SAFE_MIN + 220,
                    state.y ?? SAFE_MIN + 220,
                    "player",
                    frameOffset,
                    id,
                    state.name || `P-${id.slice(0, 3)}`
                );

                this.players.set(id, entity);
                this.physics.add.collider(entity.sprite, this.safeWalls);
                this.physics.add.collider(entity.sprite, this.blockLayer);
                if (this.gateCollider) {
                    this.physics.add.collider(entity.sprite, this.gateCollider);
                }
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
                hasFlower: false
            });

            const hidden = Boolean(state.inVehicle);
            remote.sprite.setVisible(!hidden);
            remote.shadow?.setVisible(!hidden);
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
        const typingInChat = this.isTypingInChat();

        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.buildMode) && !this.isGameOver) {
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
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.matSteel)) {
            this.setMaterial("steel");
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.collect)) {
            this.collectNearbyResource();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.eat)) {
            this.eatFood();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.shoot)) {
            this.shootWeapon();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.cycleWeapon)) {
            this.cycleWeapon();
        }
        if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.toggleGate)) {
            this.toggleGate();
        }

        if (!this.isGameOver) {
            if (this.getDrivingVehicleId()) {
                this.updateDrivingMovement(dt, time);
            } else {
                this.updateLocalMovement(time, dt);
            }

            if (!typingInChat && Phaser.Input.Keyboard.JustDown(this.keys.exitCar) && this.isLocalInVehicle()) {
                this.exitCar();
            }
        }

        this.updateRemoteInterpolation(delta);
        this.updateVehicleVisual();
        this.updateGateHint();
        this.updateResourceRespawns(time);
        if (time - this.lastAiTickAt > this.aiRefreshMs) {
            const aiDt = Math.min(0.09, (time - this.lastAiTickAt) / 1000 || dt);
            this.lastAiTickAt = time;
            this.updateCows(aiDt, time);
            this.updateZombies(aiDt, time);
        }
        if (time - this.lastResourceCullAt > this.resourceCullMs) {
            this.lastResourceCullAt = time;
            this.updateResourceVisibility();
        }
        if (time - this.lastAimUpdateAt > AIM_REFRESH_MS) {
            this.lastAimUpdateAt = time;
            this.updateAimTarget(time);
        }
        this.updateBuildPreview();
        if (time - this.lastInteractionRefreshAt > 120) {
            this.lastInteractionRefreshAt = time;
            this.updateInteractionButtons();
        }
        this.updateCameraTarget();
        this.updateCameraPov();
        this.updatePlayerIndicator(time);
        this.updateDayNight(time);
        this.updateHungerAndStatus(time);
        if (time - this.lastHudRefreshAt > this.hudRefreshMs) {
            this.lastHudRefreshAt = time;
            this.updateBondMeter();
            this.updateBackpackInfo();
        }
        if (time - this.lastMapDrawAt > this.mapRefreshMs) {
            this.lastMapDrawAt = time;
            this.renderMiniMap();
        }
        if (this.isFullMapOpen && time - this.lastFullMapDrawAt > this.fullMapRefreshMs) {
            this.lastFullMapDrawAt = time;
            this.renderFullMap();
        }

        if (!this.isGameOver) {
            this.sendMoveIfNeeded(time);
        }
    }

    isTypingInChat() {
        const active = document.activeElement;
        const focusedInput =
            active === this.chatInput ||
            active?.tagName === "TEXTAREA" ||
            (active?.tagName === "INPUT" && active?.type !== "button") ||
            active?.isContentEditable;
        return this.isChatTyping || Boolean(focusedInput);
    }

    updateLocalMovement(time, dt) {
        if (this.isLocalInVehicle()) {
            this.localPlayer.setVelocity(0, 0);
            this.localPlayer.sprite.setVisible(false);
            this.localPlayer.shadow?.setVisible(false);
            this.localPlayer.nameText.setVisible(false);
            this.localPlayer.bubble.setVisible(false);
            return;
        }

        this.localPlayer.sprite.setVisible(true);
        this.localPlayer.shadow?.setVisible(true);
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

        const body = this.localPlayer.sprite.body;
        const vec = new Phaser.Math.Vector2(moveX, moveY);
        if (vec.lengthSq() > 1) {
            vec.normalize();
        }

        const targetVx = vec.x * PLAYER_SPEED;
        const targetVy = vec.y * PLAYER_SPEED;
        const moving = vec.lengthSq() > 0.01;
        const lerpRate = moving ? 12 : 16;
        const blend = 1 - Math.exp(-lerpRate * dt);
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, targetVx, blend);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, targetVy, blend);
        if (Math.abs(body.velocity.x) < 2) {
            body.velocity.x = 0;
        }
        if (Math.abs(body.velocity.y) < 2) {
            body.velocity.y = 0;
        }

        const velocitySq = body.velocity.lengthSq();
        const animState = velocitySq > 40 ? "walk" : "idle";
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

    carHitsObstacle(x, y) {
        for (const r of this.safeWallRects) {
            if (x > r.x - 34 && x < r.x + r.w + 34 && y > r.y - 24 && y < r.y + r.h + 24) {
                return true;
            }
        }

        if (!this.gateOpen) {
            const g = this.gateZone;
            if (x > g.x - 34 && x < g.x + g.w + 34 && y > g.y - 24 && y < g.y + g.h + 24) {
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

        if (!this.carHitsObstacle(nextX, nextY)) {
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
            this.localPlayer.shadow?.setVisible(true);
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
        this.localPlayer.shadow?.setVisible(false);
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

    isInsideCameraView(x, y, margin = DRAW_CULL_MARGIN) {
        const view = this.cameras.main.worldView;
        return x >= view.x - margin && x <= view.right + margin && y >= view.y - margin && y <= view.bottom + margin;
    }

    updateCows(dt, time) {
        const local = this.getPlayerWorldPosition(this.socketAdapter.id);
        const maxRange = this.isTouchDevice ? COW_ACTIVE_RANGE * 0.75 : COW_ACTIVE_RANGE;
        const maxRangeSq = maxRange * maxRange;

        for (const cow of this.cows) {
            if (!cow.alive) {
                if (time > cow.respawnAt) {
                    const p = this.randomOutsidePoint();
                    cow.x = p.x;
                    cow.y = p.y;
                    cow.alive = true;
                    cow.body.setVisible(true);
                    cow.head.setVisible(true);
                    cow.shadow.setVisible(true);
                    cow.spotA.setVisible(true);
                    cow.spotB.setVisible(true);
                }
                continue;
            }

            const dx = local ? cow.x - local.x : 0;
            const dy = local ? cow.y - local.y : 0;
            const nearPlayer = !local || (dx * dx + dy * dy) < maxRangeSq;
            if (!nearPlayer) {
                const show = this.isInsideCameraView(cow.x, cow.y, 120);
                cow.shadow.setVisible(show);
                cow.body.setVisible(show);
                cow.head.setVisible(show);
                cow.spotA.setVisible(show);
                cow.spotB.setVisible(show);
                continue;
            }

            if (time - cow.lastTurnAt > cow.turnAt) {
                cow.lastTurnAt = time;
                cow.turnAt = Phaser.Math.Between(700, 2200);
                cow.dirX = Phaser.Math.FloatBetween(-1, 1);
                cow.dirY = Phaser.Math.FloatBetween(-1, 1);
            }

            const dir = new Phaser.Math.Vector2(cow.dirX, cow.dirY);
            if (dir.lengthSq() < 0.1) {
                dir.set(1, 0);
            }
            dir.normalize();

            let nextX = clamp(cow.x + dir.x * cow.speed * dt, 50, WORLD_SIZE - 50);
            let nextY = clamp(cow.y + dir.y * cow.speed * dt, 50, WORLD_SIZE - 50);

            if (this.isInsideSafeZone(nextX, nextY, -20)) {
                const away = new Phaser.Math.Vector2(nextX - SAFE_CENTER, nextY - SAFE_CENTER).normalize();
                nextX += away.x * 80 * dt;
                nextY += away.y * 80 * dt;
            }

            cow.x = nextX;
            cow.y = nextY;

            const visible = this.isInsideCameraView(cow.x, cow.y);
            cow.shadow.setVisible(visible);
            cow.body.setVisible(visible);
            cow.head.setVisible(visible);
            cow.spotA.setVisible(visible);
            cow.spotB.setVisible(visible);

            if (!visible) {
                continue;
            }

            cow.shadow.setPosition(cow.x, cow.y + 12);
            cow.body.setPosition(cow.x, cow.y);
            cow.head.setPosition(cow.x + Math.sign(dir.x || 1) * 20, cow.y - 1);
            cow.spotA.setPosition(cow.x - 6, cow.y - 1);
            cow.spotB.setPosition(cow.x + 2, cow.y + 2);
        }
    }

    updateZombies(dt, time) {
        const localPos = this.getPlayerWorldPosition(this.socketAdapter.id);
        const maxRange = this.isTouchDevice ? ZOMBIE_ACTIVE_RANGE * 0.72 : ZOMBIE_ACTIVE_RANGE;
        const maxRangeSq = maxRange * maxRange;

        for (const zombie of this.zombies) {
            if (!zombie.alive) {
                if (time > zombie.respawnAt) {
                    const p = this.randomOutsidePoint();
                    zombie.x = p.x;
                    zombie.y = p.y;
                    zombie.alive = true;
                    zombie.shadow.setVisible(true);
                    zombie.body.setVisible(true);
                    zombie.head.setVisible(true);
                    zombie.eyeL.setVisible(true);
                    zombie.eyeR.setVisible(true);
                }
                continue;
            }

            if (localPos) {
                const dx = zombie.x - localPos.x;
                const dy = zombie.y - localPos.y;
                if (dx * dx + dy * dy > maxRangeSq) {
                    const show = this.isInsideCameraView(zombie.x, zombie.y, 100);
                    zombie.shadow.setVisible(show);
                    zombie.body.setVisible(show);
                    zombie.head.setVisible(show);
                    zombie.eyeL.setVisible(show);
                    zombie.eyeR.setVisible(show);
                    continue;
                }
            }

            let best = null;
            let bestDist = 99999;

            for (const id of this.getAllTrackedPlayerIds()) {
                const pos = this.getPlayerWorldPosition(id);
                if (!pos || this.isInsideSafeZone(pos.x, pos.y, 8)) {
                    continue;
                }
                const d = Phaser.Math.Distance.Between(zombie.x, zombie.y, pos.x, pos.y);
                if (d < bestDist) {
                    bestDist = d;
                    best = pos;
                }
            }

            if (best && bestDist < 520) {
                const toTarget = new Phaser.Math.Vector2(best.x - zombie.x, best.y - zombie.y).normalize();
                zombie.dirX = toTarget.x;
                zombie.dirY = toTarget.y;
            } else if (!zombie.wanderAt || time > zombie.wanderAt) {
                zombie.wanderAt = time + Phaser.Math.Between(700, 1600);
                zombie.dirX = Phaser.Math.FloatBetween(-1, 1);
                zombie.dirY = Phaser.Math.FloatBetween(-1, 1);
            }

            const move = new Phaser.Math.Vector2(zombie.dirX, zombie.dirY);
            if (move.lengthSq() < 0.02) {
                move.set(1, 0);
            }
            move.normalize();

            let nextX = clamp(zombie.x + move.x * zombie.speed * dt, 40, WORLD_SIZE - 40);
            let nextY = clamp(zombie.y + move.y * zombie.speed * dt, 40, WORLD_SIZE - 40);

            if (this.isInsideSafeZone(nextX, nextY, 20)) {
                const away = new Phaser.Math.Vector2(nextX - SAFE_CENTER, nextY - SAFE_CENTER).normalize();
                nextX += away.x * zombie.speed * dt * 1.8;
                nextY += away.y * zombie.speed * dt * 1.8;
            }

            zombie.x = nextX;
            zombie.y = nextY;

            const visible = this.isInsideCameraView(zombie.x, zombie.y);
            zombie.shadow.setVisible(visible);
            zombie.body.setVisible(visible);
            zombie.head.setVisible(visible);
            zombie.eyeL.setVisible(visible);
            zombie.eyeR.setVisible(visible);

            if (!visible) {
                continue;
            }

            zombie.shadow.setPosition(zombie.x, zombie.y + 10);
            zombie.body.setPosition(zombie.x, zombie.y);
            zombie.head.setPosition(zombie.x, zombie.y - 18);
            zombie.eyeL.setPosition(zombie.x - 2, zombie.y - 18);
            zombie.eyeR.setPosition(zombie.x + 2, zombie.y - 18);

            if (!this.isGameOver && localPos && !this.isInsideSafeZone(localPos.x, localPos.y, 8)) {
                const dLocal = Phaser.Math.Distance.Between(zombie.x, zombie.y, localPos.x, localPos.y);
                if (dLocal < 24 && time - this.lastBiteTime > 1300) {
                    this.lastBiteTime = time;
                    this.bitesTaken += 1;
                    this.setMission(`Zombie bite ${this.bitesTaken}/2. Retreat to safe zone now.`);
                    this.playTone({ frequency: 120, slideTo: 70, duration: 0.12, type: "square", volume: 0.06 });
                    if (this.bitesTaken >= 2) {
                        this.triggerGameOver("You took two zombie bites.");
                        return;
                    }
                }
            }
        }
    }

    updateAimTarget(_time) {
        if (this.isGameOver || this.isLocalInVehicle()) {
            this.currentAimTarget = null;
            this.targetRing?.setVisible(false);
            return;
        }

        const hit = this.findAimTarget();
        this.currentAimTarget = hit;
        if (!hit) {
            this.targetRing.setVisible(false);
            return;
        }

        const p = hit.entity;
        this.targetRing.setPosition(p.x, p.y - 10).setVisible(true);
    }

    getCurrentWeapon() {
        return WEAPONS[this.weaponIndex % WEAPONS.length];
    }

    cycleWeapon() {
        this.weaponIndex = (this.weaponIndex + 1) % WEAPONS.length;
        const weapon = this.getCurrentWeapon();
        this.hud.buttons.cycleWeapon.textContent = `Weapon: ${weapon.label}`;
        this.setMission(`Switched to ${weapon.label}.`);
    }

    findAimTarget() {
        const weapon = this.getCurrentWeapon();
        const origin = this.getPlayerWorldPosition(this.socketAdapter.id);
        if (!origin) {
            return null;
        }

        if (this.isTouchDevice) {
            let nearest = null;
            let bestDist = weapon.range;

            for (const zombie of this.zombies) {
                if (!zombie.alive) {
                    continue;
                }
                const d = Phaser.Math.Distance.Between(origin.x, origin.y, zombie.x, zombie.y);
                if (d < bestDist) {
                    bestDist = d;
                    nearest = { type: "zombie", entity: zombie, distance: d };
                }
            }

            for (const cow of this.cows) {
                if (!cow.alive) {
                    continue;
                }
                const d = Phaser.Math.Distance.Between(origin.x, origin.y, cow.x, cow.y);
                if (d < bestDist) {
                    bestDist = d;
                    nearest = { type: "cow", entity: cow, distance: d };
                }
            }

            return nearest;
        }

        const pointer = this.input.activePointer;
        const tx = Number.isFinite(pointer?.worldX) ? pointer.worldX : origin.x + 100;
        const ty = Number.isFinite(pointer?.worldY) ? pointer.worldY : origin.y;

        const ray = new Phaser.Math.Vector2(tx - origin.x, ty - origin.y);
        if (ray.lengthSq() < 1) {
            ray.set(1, 0);
        }
        ray.normalize();

        let best = null;
        let bestScore = 99999;

        const scoreTarget = (entity, type) => {
            const toEntity = new Phaser.Math.Vector2(entity.x - origin.x, entity.y - origin.y);
            const dist = toEntity.length();
            if (dist > weapon.range || dist < 4) {
                return;
            }

            const forwardDot = toEntity.clone().normalize().dot(ray);
            if (forwardDot < 0.42) {
                return;
            }

            const perp = Math.abs(ray.x * toEntity.y - ray.y * toEntity.x);
            const score = perp + dist * 0.08;
            if (score < bestScore) {
                bestScore = score;
                best = { type, entity, distance: dist };
            }
        };

        for (const zombie of this.zombies) {
            if (zombie.alive) {
                scoreTarget(zombie, "zombie");
            }
        }

        for (const cow of this.cows) {
            if (cow.alive) {
                scoreTarget(cow, "cow");
            }
        }

        return best;
    }

    shootWeapon() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const weapon = this.getCurrentWeapon();
        const now = this.time.now;
        if (now - this.lastShotAt < weapon.cooldown) {
            return;
        }

        const origin = this.getPlayerWorldPosition(this.socketAdapter.id);
        if (!origin) {
            return;
        }

        this.lastShotAt = now;

        const hit = this.currentAimTarget || this.findAimTarget();
        const targetX = hit ? hit.entity.x : (this.input.activePointer.worldX || origin.x + 40);
        const targetY = hit ? hit.entity.y : (this.input.activePointer.worldY || origin.y);

        this.shotLine.setTo(origin.x, origin.y - 6, targetX, targetY - 6);
        this.shotLine.setStrokeStyle(2, weapon.color, 0.95);
        this.shotLine.setVisible(true);
        this.tweens.add({
            targets: this.shotLine,
            alpha: 0,
            duration: 90,
            onComplete: () => {
                this.shotLine.setVisible(false);
                this.shotLine.setAlpha(1);
            }
        });

        this.playTone({ frequency: weapon.id === "rifle" ? 250 : 330, duration: 0.07, slideTo: 180, type: "square", volume: 0.06 });

        if (!hit) {
            return;
        }

        if (hit.type === "zombie") {
            this.killZombie(hit.entity);
            return;
        }

        if (hit.type === "cow") {
            this.killCow(hit.entity);
        }
    }

    killZombie(zombie) {
        if (!zombie.alive) {
            return;
        }

        zombie.alive = false;
        zombie.respawnAt = this.time.now + Phaser.Math.Between(6000, 10000);
        zombie.shadow.setVisible(false);
        zombie.body.setVisible(false);
        zombie.head.setVisible(false);
        zombie.eyeL.setVisible(false);
        zombie.eyeR.setVisible(false);
    }

    killCow(cow) {
        if (!cow.alive) {
            return;
        }

        cow.alive = false;
        cow.respawnAt = this.time.now + Phaser.Math.Between(26000, 36000);
        cow.shadow.setVisible(false);
        cow.body.setVisible(false);
        cow.head.setVisible(false);
        cow.spotA.setVisible(false);
        cow.spotB.setVisible(false);

        const drop = {
            x: cow.x + Phaser.Math.Between(-10, 10),
            y: cow.y + Phaser.Math.Between(-10, 10)
        };

        const shadow = this.add.ellipse(drop.x, drop.y + 12, 26, 10, 0x000000, 0.2).setDepth(840);
        const core = this.add.circle(drop.x, drop.y, 11, 0xb7524f, 0.95).setDepth(845);
        core.setStrokeStyle(2, 0xffffff, 0.28);

        this.resourceNodes.push({
            id: `meat-drop-${drop.x}-${drop.y}-${Math.random().toString(16).slice(2, 6)}`,
            resource: "meat",
            type: "food",
            x: drop.x,
            y: drop.y,
            active: true,
            respawnAt: 0,
            shadow,
            core,
            label: null
        });

        this.setMission("Cow hunted. Meat dropped. Collect it and return home.");
    }

    updateResourceRespawns(time) {
        for (const node of this.resourceNodes) {
            if (node.active || time < node.respawnAt) {
                continue;
            }

            node.active = true;
            node.core.setVisible(true);
            node.shadow.setVisible(true);
            node.label?.setVisible(true);
        }
    }

    updateResourceVisibility() {
        const local = this.getPlayerWorldPosition(this.socketAdapter.id);
        const maxRange = this.isTouchDevice ? 1700 : 2300;
        const maxRangeSq = maxRange * maxRange;

        for (const node of this.resourceNodes) {
            if (!node.active) {
                continue;
            }

            let nearLocal = true;
            if (local) {
                const dx = node.x - local.x;
                const dy = node.y - local.y;
                nearLocal = dx * dx + dy * dy <= maxRangeSq;
            }
            const visible = nearLocal && this.isInsideCameraView(node.x, node.y, 140);
            node.core.setVisible(visible);
            node.shadow.setVisible(visible);
            node.label?.setVisible(visible);
        }
    }

    getNearestResource(maxDistance) {
        let nearest = null;
        let best = maxDistance;

        for (const node of this.resourceNodes) {
            if (!node.active) {
                continue;
            }
            const d = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, node.x, node.y);
            if (d < best) {
                best = d;
                nearest = node;
            }
        }

        return nearest;
    }

    collectNearbyResource() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const node = this.getNearestResource(86);
        if (!node) {
            return;
        }

        let gain = 0;
        if (node.type === "food") {
            gain = node.resource === "meat" ? 2 : Phaser.Math.Between(1, 3);
        } else {
            gain = Phaser.Math.Between(2, 4);
        }

        this.inventory[node.resource] = clamp((this.inventory[node.resource] || 0) + gain, 0, 999);
        node.active = false;
        node.respawnAt = this.time.now + Phaser.Math.Between(12000, 22000);
        node.core.setVisible(false);
        node.shadow.setVisible(false);
        node.label?.setVisible(false);

        this.playTone({ frequency: 520, slideTo: 350, duration: 0.07, type: "triangle", volume: 0.046 });
        this.setMission(`Collected ${gain} ${node.resource}. Bring supplies back to the safe zone.`);
        this.updateBackpackInfo();
        this.updateBuildInfoText();
    }

    eatFood() {
        if (this.isGameOver) {
            return;
        }

        let chosen = null;
        for (const food of FOOD_ORDER) {
            if ((this.inventory[food] || 0) > 0) {
                chosen = food;
                break;
            }
        }

        if (!chosen) {
            this.setMission("No food in backpack. Collect outside first.");
            return;
        }

        this.inventory[chosen] -= 1;
        const gainMap = { meat: 30, apple: 17, strawberry: 12, blueberry: 10 };
        this.hunger = clamp(this.hunger + (gainMap[chosen] || 12), 0, 100);
        this.playTone({ frequency: 300, slideTo: 420, duration: 0.07, type: "triangle", volume: 0.045 });
        this.setMission(`Ate ${chosen}. Hunger restored.`);
        this.updateBackpackInfo();
    }

    updateHungerAndStatus(time) {
        if (this.isGameOver) {
            return;
        }

        if (time - this.lastHungerTick > 1300) {
            this.lastHungerTick = time;
            const localPos = this.getPlayerWorldPosition(this.socketAdapter.id);
            const inSafe = localPos ? this.isInsideSafeZone(localPos.x, localPos.y) : true;
            const decay = inSafe ? 0.35 : 1.1;
            this.hunger = clamp(this.hunger - decay, 0, 100);

            if (this.hunger <= 0) {
                this.triggerGameOver("You starved. Keep food in your backpack.");
                return;
            }
        }

    }

    updateBackpackInfo() {
        const order = ["apple", "strawberry", "blueberry", "meat", "brick", "wood", "glass", "steel"];
        const entries = order
            .map((name) => [name, this.inventory[name] || 0])
            .filter(([, amount]) => amount > 0)
            .map(([name, amount]) => `${name}: ${amount}`);
        const backpackText = entries.length > 0 ? entries.join(" | ") : "Backpack empty";

        if (this.lastBackpackText === backpackText) {
            return;
        }
        this.lastBackpackText = backpackText;
        this.hud.setBackpack(backpackText);
        this.hud.setMaterialCounts(this.inventory);
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

    updateGateHint() {
        const d = Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, this.gateZone.markerX, this.gateZone.markerY);
        this.nearGate = d < 120;

        const pulse = 0.62 + Math.sin(this.time.now / 230) * 0.16;
        this.gateIndicator.setAlpha(this.nearGate ? 0.95 : pulse);

        if (this.gateOpen) {
            this.gateVisual.setFillStyle(0x6fbe85, 0.86);
            this.gateVisual.setStrokeStyle(2, 0xd9ffe4, 0.85);
        } else {
            this.gateVisual.setFillStyle(0xff7f50, 0.95);
            this.gateVisual.setStrokeStyle(2, 0xffd7af, 0.9);
        }
    }

    toggleGate() {
        if (this.isGameOver || this.isLocalInVehicle() || !this.nearGate) {
            return;
        }

        this.setGateOpen(!this.gateOpen, true);
    }

    setGateOpen(open, announce = true) {
        this.gateOpen = Boolean(open);

        if (this.gateCollider?.body) {
            this.gateCollider.body.enable = !this.gateOpen;
        }

        this.gateVisual.setAlpha(this.gateOpen ? 0.34 : 1);

        if (announce) {
            this.setMission(this.gateOpen ? "Gate opened. Outside is dangerous." : "Gate closed. Safe zone secured.");
        }
    }

    performEnterAction() {
        if (this.currentEnterAction === "exit") {
            this.exitCar();
            return;
        }
        if (this.currentEnterAction === "gate") {
            this.toggleGate();
            return;
        }
        if (this.currentEnterAction === "drive") {
            this.tryDrive();
            return;
        }
        if (this.currentEnterAction === "sit") {
            this.trySit();
        }
    }

    updateInteractionButtons() {
        if (this.isGameOver) {
            this.hud.showDrivePad(false);
            this.updateBuildInfoText();
            return;
        }

        this.hud.showDrivePad(false);

        const seat = this.getLocalSeat();

        const freeCar = this.getNearestVehicle(120, (v) => !v.driverId);
        const rideCar = this.getNearestVehicle(120, (v) => v.driverId && !v.passengerId && v.driverId !== this.socketAdapter.id);

        const localPos = this.getPlayerWorldPosition(this.socketAdapter.id);
        const inSafe = localPos ? this.isInsideSafeZone(localPos.x, localPos.y) : true;
        const canBuild = !seat && inSafe;

        this.hud.showAction("drive", Boolean(freeCar) && !seat && !this.isTouchDevice);
        this.hud.showAction("sit", Boolean(rideCar) && !seat && !this.isTouchDevice);
        this.hud.showAction("exitCar", Boolean(seat) && !this.isTouchDevice);
        this.hud.showAction("openGate", Boolean(this.nearGate) && !seat && !this.isTouchDevice);
        this.hud.showAction("shoot", !seat);
        this.hud.showAction("eat", this.getFoodCount() > 0 && !seat);
        this.hud.showAction("buildMode", canBuild);
        this.hud.showAction("removeBlock", canBuild && this.isBuildMode && !this.isTouchDevice);
        this.hud.showAction("cycleMaterial", canBuild && this.isBuildMode);
        this.hud.showAction("cycleWeapon", !seat);

        if (this.isTouchDevice) {
            this.currentEnterAction = "";
            let enterLabel = "";
            if (seat) {
                this.currentEnterAction = "exit";
                enterLabel = "Exit";
            } else if (this.nearGate) {
                this.currentEnterAction = "gate";
                enterLabel = this.gateOpen ? "Close" : "Enter";
            } else if (freeCar) {
                this.currentEnterAction = "drive";
                enterLabel = "Drive";
            } else if (rideCar) {
                this.currentEnterAction = "sit";
                enterLabel = "Sit";
            }

            this.hud.showAction("enter", Boolean(this.currentEnterAction));
            if (this.hud.buttons.enter) {
                this.hud.buttons.enter.textContent = enterLabel || "Enter";
            }

            this.hud.showAction("collect", Boolean(this.getNearestResource(86)) && !seat);
            this.hud.showAction("placeBlock", canBuild && this.isBuildMode);
            if (this.hud.buttons.placeBlock) {
                this.hud.buttons.placeBlock.textContent = this.isBuildMode && this.buildHoverAction === "remove" ? "Remove" : "Place";
            }
            this.hud.showMobileBuildAction(false);
        } else {
            this.hud.showAction("enter", false);
            this.hud.showAction("collect", Boolean(this.getNearestResource(86)) && !seat);
            this.hud.showAction("placeBlock", canBuild && this.isBuildMode);
            this.hud.showMobileBuildAction(false);
        }

        if (this.isTouchDevice && this.getDrivingVehicleId() && this.lastUiHintKey !== "drive_hint") {
            this.lastUiHintKey = "drive_hint";
            this.setMission("Use joystick + arrows to drive.");
        }
        if (!this.getDrivingVehicleId() && this.lastUiHintKey === "drive_hint") {
            this.lastUiHintKey = "";
        }

        this.updateBuildInfoText();
    }

    getFoodCount() {
        return (this.inventory.apple || 0) + (this.inventory.strawberry || 0) + (this.inventory.blueberry || 0) + (this.inventory.meat || 0);
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
        this.setMission(`Driving ${vehicle.id === "car_pink" ? "pink" : "red"} car.`);
    }

    trySit() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const vehicle = this.getNearestVehicle(120, (v) => v.driverId && !v.passengerId && v.driverId !== this.socketAdapter.id);

        if (!vehicle) {
            return;
        }

        this.socketAdapter.vehicleAction({ action: "sit", vehicleId: vehicle.id });
        this.setMission("Passenger seat active.");
    }

    exitCar() {
        if (this.isGameOver || !this.isLocalInVehicle()) {
            return;
        }

        this.socketAdapter.vehicleAction({ action: "leave" });
        this.setMission("You left the car.");
    }

    triggerGameOver(reason = "You did not survive.") {
        this.isGameOver = true;
        this.hud.showGameOver(true);
        this.setMission(reason);
        this.drivePadVector.x = 0;
        this.drivePadVector.y = 0;
        this.localPlayer.setVelocity(0, 0);
        this.hud.showDrivePad(false);

        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }
        this.hud.showMobileBuildAction(false);
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

    toggleBuildMode() {
        if (this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        const localPos = this.getPlayerWorldPosition(this.socketAdapter.id);
        if (localPos && !this.isInsideSafeZone(localPos.x, localPos.y)) {
            this.setMission("Build only inside safe zone.");
            return;
        }

        this.isBuildMode = !this.isBuildMode;
        this.setMission(this.isBuildMode ? "Build mode on." : "Build mode off.");
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

    cellInsideSafeZone(gridX, gridY) {
        const x = gridX * TILE_SIZE + TILE_SIZE / 2;
        const y = gridY * TILE_SIZE + TILE_SIZE / 2;
        return this.isInsideSafeZone(x, y, 16);
    }

    isOnSafeWallOrGate(gridX, gridY) {
        const x = gridX * TILE_SIZE;
        const y = gridY * TILE_SIZE;

        for (const wall of this.safeWallRects) {
            if (x + TILE_SIZE > wall.x && x < wall.x + wall.w && y + TILE_SIZE > wall.y && y < wall.y + wall.h) {
                return true;
            }
        }

        const g = this.gateZone;
        if (x + TILE_SIZE > g.x && x < g.x + g.w && y + TILE_SIZE > g.y && y < g.y + g.h) {
            return true;
        }

        const hx = SAFE_CENTER - 230;
        const hy = SAFE_CENTER - 160;
        const hw = 460;
        const hh = 320;
        if (x + TILE_SIZE > hx && x < hx + hw && y + TILE_SIZE > hy && y < hy + hh) {
            return true;
        }

        return false;
    }

    canPlaceAt(gridX, gridY) {
        if (!this.canReachBuildCell(gridX, gridY)) {
            return false;
        }

        if (!this.cellInsideSafeZone(gridX, gridY)) {
            return false;
        }

        if ((this.inventory[this.selectedMaterial] || 0) <= 0) {
            return false;
        }

        const key = this.getBlockKey(gridX, gridY);
        if (this.buildBlocks.has(key)) {
            return false;
        }

        if (this.isOnSafeWallOrGate(gridX, gridY)) {
            return false;
        }

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        if (Phaser.Math.Distance.Between(this.localPlayer.sprite.x, this.localPlayer.sprite.y, cx, cy) < 26) {
            return false;
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
        if (!this.isBuildMode || this.isGameOver || this.isLocalInVehicle()) {
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
        if (!this.isBuildMode || this.isGameOver || this.isLocalInVehicle()) {
            return;
        }

        if ((this.inventory[this.selectedMaterial] || 0) <= 0) {
            this.setMission(`No ${this.selectedMaterial}. Mine outside the safe zone first.`);
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
        this.playTone({ frequency: 460, slideTo: 300, duration: 0.08, type: "triangle", volume: 0.045 });
        this.updateBuildInfoText();
        this.updateBackpackInfo();
    }

    tryRemoveBlock(overrideTarget = null) {
        if (!this.isBuildMode || this.isGameOver || this.isLocalInVehicle()) {
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
        this.playTone({ frequency: 260, slideTo: 130, duration: 0.1, type: "square", volume: 0.04 });
        this.updateBuildInfoText();
        this.updateBackpackInfo();
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
        const base = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, style.fill, style.alpha || 0.97);
        const topEdge = this.add.rectangle(0, -TILE_SIZE / 2 + 6, TILE_SIZE, 12, 0xffffff, material === "steel" ? 0.2 : 0.12);
        const leftShade = this.add.rectangle(-TILE_SIZE / 2 + 5, 0, 10, TILE_SIZE, 0x111111, material === "steel" ? 0.26 : 0.14);
        const rightShade = this.add.rectangle(TILE_SIZE / 2 - 4, 0, 8, TILE_SIZE, 0x000000, material === "steel" ? 0.33 : 0.18);
        const visual = this.add.container(x, y, [base, topEdge, leftShade, rightShade]).setDepth(930 + y);
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
        const weapon = this.getCurrentWeapon();
        this.hud.setBuildButtonLabel(`Material: ${label}`);
        if (this.hud.buttons.cycleWeapon) {
            this.hud.buttons.cycleWeapon.textContent = `Weapon: ${weapon.label}`;
        }
        this.hud.setMaterialCounts(this.inventory);
        this.hud.setBuildModeLabel(this.isTouchDevice ? `Build: ${this.isBuildMode ? "ON" : "OFF"}` : "Build Mode");
        const mode = this.isBuildMode ? "ON" : "OFF";
        const text =
            `Build ${mode} | ${label} ${this.inventory[this.selectedMaterial]} | ` +
            `Hunger ${Math.round(this.hunger)} | Bites ${this.bitesTaken}/2 | Keys B/F/G/R/E/J/Q/H`;
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
            hasFlower: false,
            inVehicle: seat ? `${seat.vehicleId}:${seat.role}` : ""
        };

        const includePosDelta = !seat;
        const changed =
            !this.lastSentState ||
            (includePosDelta && Math.abs(roundedState.x - this.lastSentState.x) > 1) ||
            (includePosDelta && Math.abs(roundedState.y - this.lastSentState.y) > 1) ||
            (includePosDelta && roundedState.direction !== this.lastSentState.direction) ||
            (includePosDelta && roundedState.animState !== this.lastSentState.animState) ||
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
            this.cameras.main.startFollow(target, true, 1, 1);
            this.cameras.main.followOffset.set(0, 0);
        }
    }

    updateCameraPov() {
        // Keep player centered for stable, readable gameplay on both mobile and desktop.
        this.cameras.main.followOffset.x = 0;
        this.cameras.main.followOffset.y = 0;
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
        this.atmosphereTop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x6ea6d8, 0.08);
        this.atmosphereTop.setOrigin(0, 0);
        this.atmosphereTop.setScrollFactor(0);
        this.atmosphereTop.setBlendMode(Phaser.BlendModes.SCREEN);
        this.atmosphereTop.setDepth(4998);

        this.atmosphereBottom = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d3248, 0.1);
        this.atmosphereBottom.setOrigin(0, 0);
        this.atmosphereBottom.setScrollFactor(0);
        this.atmosphereBottom.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.atmosphereBottom.setDepth(4999);

        this.dayNight = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1130, 0.1);
        this.dayNight.setOrigin(0, 0);
        this.dayNight.setScrollFactor(0);
        this.dayNight.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.dayNight.setDepth(5000);
    }

    updateDayNight(time) {
        const cycle = (Math.sin(time / 14000) + 1) / 2;
        this.atmosphereTop?.setAlpha(0.06 + cycle * 0.06);
        this.atmosphereBottom?.setAlpha(0.08 + cycle * 0.09);
        this.dayNight.setAlpha(0.06 + cycle * 0.22);
        if (this.dayNight.width !== this.scale.width || this.dayNight.height !== this.scale.height) {
            this.atmosphereTop?.setSize(this.scale.width, this.scale.height);
            this.atmosphereBottom?.setSize(this.scale.width, this.scale.height);
            this.dayNight.setSize(this.scale.width, this.scale.height);
        }
    }

    updateBondMeter() {
        const base = 100 - this.bitesTaken * 50;
        const hungerPenalty = Phaser.Math.Clamp((100 - this.hunger) * 0.35, 0, 35);
        const health = clamp(base - hungerPenalty, 0, 100);
        this.hud.setLove(Math.round(health));
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
        if (this.chatInput && this.chatFocusHandler) {
            this.chatInput.removeEventListener("focus", this.chatFocusHandler);
        }
        if (this.chatInput && this.chatBlurHandler) {
            this.chatInput.removeEventListener("blur", this.chatBlurHandler);
        }

        if (this.hud.restartButton && this.restartHandler) {
            this.hud.restartButton.removeEventListener("click", this.restartHandler);
        }
        if (this.hud.mobileBuildAction && this.mobileBuildHandler) {
            this.hud.mobileBuildAction.removeEventListener("click", this.mobileBuildHandler);
        }
        if (this.hud.miniMapWrap && this.mapOpenHandler) {
            this.hud.miniMapWrap.removeEventListener("click", this.mapOpenHandler);
        }
        if (this.hud.closeFullMapButton && this.mapCloseHandler) {
            this.hud.closeFullMapButton.removeEventListener("click", this.mapCloseHandler);
        }
        if (this.hud.chatToggle && this.mobileChatHandler) {
            this.hud.chatToggle.removeEventListener("click", this.mobileChatHandler);
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

        if (this.pointerDownHandler) {
            this.input.off("pointerdown", this.pointerDownHandler);
        }

        if (this.playerIndicator) {
            this.playerIndicator.destroy();
        }

        this.buildPreview?.destroy();
        this.crosshairH?.destroy();
        this.crosshairV?.destroy();

        for (const block of this.buildBlocks.values()) {
            block.visual?.destroy();
            block.collider?.destroy();
        }
        this.buildBlocks.clear();

        for (const node of this.resourceNodes) {
            node.shadow?.destroy();
            node.core?.destroy();
            node.label?.destroy();
        }

        for (const cow of this.cows) {
            cow.shadow?.destroy();
            cow.body?.destroy();
            cow.head?.destroy();
            cow.spotA?.destroy();
            cow.spotB?.destroy();
        }

        for (const zombie of this.zombies) {
            zombie.shadow?.destroy();
            zombie.body?.destroy();
            zombie.head?.destroy();
            zombie.eyeL?.destroy();
            zombie.eyeR?.destroy();
        }

        this.targetRing?.destroy();
        this.shotLine?.destroy();
        this.atmosphereTop?.destroy();
        this.atmosphereBottom?.destroy();

        this.hud.showDrivePad(false);
        this.hud.showMobileBuildAction(false);
        this.hud.showGameOver(false);
        this.hud.showFullMap(false);
        document.body.classList.remove("mobile-chat-open");
        for (const name of Object.keys(this.hud.buttons)) {
            this.hud.showAction(name, false);
        }

        if (this.localPlayer) {
            this.localPlayer.destroy();
        }
    }
}
