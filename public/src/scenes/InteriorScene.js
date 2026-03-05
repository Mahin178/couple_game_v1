import { TILE_SIZE } from "../config.js";
import { PlayerEntity } from "../entities/playerEntity.js";
import { createHudControls } from "../ui/hud.js";

const ROOM_W = 16;
const ROOM_H = 12;

export class InteriorScene extends Phaser.Scene {
    constructor(socketAdapter) {
        super("InteriorScene");
        this.socketAdapter = socketAdapter;
    }

    create(data) {
        this.isTransitioning = false;
        this.returnPos = {
            x: data?.returnX || 500,
            y: data?.returnY || 500
        };
        this.interiorTheme = typeof data?.theme === "string" ? data.theme : "warm";
        this.buildingId = typeof data?.buildingId === "string" ? data.buildingId : "home_a";
        this.exitReadyAt = this.time.now + 650;

        this.hud = createHudControls();
        this.hud.setMission(`Inside ${this.buildingId.replace("home_", "building ").toUpperCase()} - walk to exit door`);
        this.hud.showGameOver(false);
        this.hud.showDrivePad(false);
        this.hud.showAction("drive", false);
        this.hud.showAction("sit", false);
        this.hud.showAction("exitCar", false);
        this.hud.showAction("openDoor", false);
        this.hud.showAction("pickFlower", false);
        this.hud.showAction("giveFlower", false);
        this.hud.showAction("acceptFlower", false);

        this.createRoom();
        this.createPlayer();
        this.bindChatInput();

        this.events.once("shutdown", () => this.cleanup());
    }

    createRoom() {
        const width = ROOM_W * TILE_SIZE;
        const height = ROOM_H * TILE_SIZE;

        const theme = {
            warm: { floor: 0xa78c74, wall: 0x4e4034, rug: 0xc36f5e },
            mint: { floor: 0x8ea89f, wall: 0x38594e, rug: 0x6cb9b1 },
            sunset: { floor: 0xb29587, wall: 0x6d4b3e, rug: 0xe07f67 }
        }[this.interiorTheme] || { floor: 0xa78c74, wall: 0x4e4034, rug: 0xc36f5e };

        this.add.rectangle(0, 0, width, height, theme.floor).setOrigin(0, 0);
        this.add.rectangle(width / 2, height / 2, width - 90, height - 120, theme.rug, 0.72);
        this.add.rectangle(width / 2, 70, 200, 38, 0x6f5645, 0.9);
        this.add.rectangle(width / 2 - 220, height / 2 + 80, 100, 36, 0x6f5645, 0.9);
        this.add.rectangle(width / 2 + 220, height / 2 + 80, 100, 36, 0x6f5645, 0.9);

        const wall = this.add.staticGroup();
        const top = this.add.rectangle(width / 2, 10, width, 20, theme.wall);
        const bottom = this.add.rectangle(width / 2, height - 10, width, 20, theme.wall);
        const left = this.add.rectangle(10, height / 2, 20, height, theme.wall);
        const right = this.add.rectangle(width - 10, height / 2, 20, height, theme.wall);

        wall.add(top);
        wall.add(bottom);
        wall.add(left);
        wall.add(right);

        this.physics.add.existing(top, true);
        this.physics.add.existing(bottom, true);
        this.physics.add.existing(left, true);
        this.physics.add.existing(right, true);

        this.exitZone = this.add.zone(width / 2, height - 40, 160, 44);
        this.physics.add.existing(this.exitZone, true);
        this.add.rectangle(width / 2, height - 28, 70, 10, 0xf8e19d, 0.85);

        this.physics.world.setBounds(0, 0, width, height);
        this.cameras.main.setBounds(0, 0, width, height);
        this.cameras.main.setBackgroundColor("#2a2520");

        this.walls = [top, bottom, left, right];
    }

    createPlayer() {
        this.player = new PlayerEntity(this, 200, 170, "player", 0, "local-interior", "You", true);
        this.player.sprite.setCollideWorldBounds(true);

        for (const w of this.walls) {
            this.physics.add.collider(this.player.sprite, w);
        }

        this.cursors = this.input.keyboard.createCursorKeys();
        this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
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
            this.player.showChatBubble(msg);
            this.chatInput.value = "";
        };

        this.chatForm.addEventListener("submit", this.chatHandler);
    }

    update() {
        const left = this.cursors.left.isDown;
        const right = this.cursors.right.isDown;
        const up = this.cursors.up.isDown;
        const down = this.cursors.down.isDown;

        const vec = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
        if (vec.lengthSq() > 1) {
            vec.normalize();
        }

        this.player.setVelocity(vec.x * 170, vec.y * 170);

        let direction = "down";
        if (Math.abs(vec.x) > Math.abs(vec.y) && Math.abs(vec.x) > 0.1) {
            direction = vec.x >= 0 ? "right" : "left";
        } else if (Math.abs(vec.y) > 0.1) {
            direction = vec.y >= 0 ? "down" : "up";
        }

        this.player.applyAnimation(direction, vec.lengthSq() > 0.01 ? "walk" : "idle");
        this.player.syncVisuals();

        if (this.time.now > this.exitReadyAt && this.physics.overlap(this.player.sprite, this.exitZone)) {
            this.leaveHouse();
        }
    }

    leaveHouse() {
        if (this.isTransitioning) {
            return;
        }

        this.isTransitioning = true;
        this.player.setVelocity(0, 0);
        this.scene.start("WorldScene", {
            spawn: this.returnPos
        });
    }

    cleanup() {
        if (this.chatForm && this.chatHandler) {
            this.chatForm.removeEventListener("submit", this.chatHandler);
        }

        if (this.player) {
            this.player.destroy();
        }
    }
}
