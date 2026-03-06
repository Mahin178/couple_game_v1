const DIRS = ["down", "left", "right", "up"];

export class PlayerEntity {
    constructor(scene, x, y, textureKey, frameOffset, id, name, isLocal = false) {
        this.scene = scene;
        this.id = id;
        this.name = name || "Player";
        this.textureKey = textureKey;
        this.frameOffset = frameOffset;
        this.isLocal = isLocal;

        this.sprite = scene.physics.add.sprite(x, y, textureKey, frameOffset);
        this.sprite.setScale(1, 1.12);
        this.sprite.setSize(14, 11);
        this.sprite.setOffset(9, 21);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setDepth(1000 + y);
        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        const textResolution = Math.max(1.5, Math.min(3, window.devicePixelRatio || 1.5));

        this.nameText = scene.add
            .text(x, y - 30, this.name, {
                fontFamily: "\"Trebuchet MS\", \"Verdana\", sans-serif",
                fontSize: isTouch ? "17px" : "13px",
                color: "#ffffff",
                stroke: "#1a1a25",
                strokeThickness: isTouch ? 4 : 3,
                backgroundColor: "rgba(0,0,0,0.56)",
                padding: { x: isTouch ? 6 : 4, y: isTouch ? 3 : 2 }
            })
            .setOrigin(0.5)
            .setDepth(2000);
        this.nameText.setResolution(textResolution);

        this.bubble = scene.add
            .text(x, y - 48, "", {
                fontFamily: "\"Trebuchet MS\", \"Verdana\", sans-serif",
                fontSize: isTouch ? "17px" : "13px",
                color: "#fff",
                backgroundColor: "rgba(31, 19, 28, 0.82)",
                stroke: "#f6b8d6",
                strokeThickness: isTouch ? 2 : 1,
                padding: { x: isTouch ? 10 : 8, y: isTouch ? 6 : 5 },
                wordWrap: { width: isTouch ? 240 : 170 }
            })
            .setOrigin(0.5)
            .setAlpha(0)
            .setDepth(2000);
        this.bubble.setResolution(textResolution);

        this.heldFlowerPetal = scene.add.circle(x + 10, y - 8, 4, 0xee3e79).setDepth(2004).setVisible(false);
        this.heldFlowerStem = scene.add.rectangle(x + 10, y - 2, 2, 8, 0x2f8a52).setDepth(2003).setVisible(false);

        this.lastState = { x, y, direction: "down", animState: "idle", frame: frameOffset };
        this.target = { x, y, direction: "down", animState: "idle", frame: frameOffset, hasFlower: false };
        this.hasFlower = false;
        this.lastBubbleText = "";
        this.bubbleTween = null;
    }

    updateDepth() {
        this.sprite.setDepth(1000 + this.sprite.y);
        this.nameText.setDepth(2000 + this.sprite.y);
        this.bubble.setDepth(2001 + this.sprite.y);
        this.heldFlowerStem.setDepth(2003 + this.sprite.y);
        this.heldFlowerPetal.setDepth(2004 + this.sprite.y);
    }

    setName(name) {
        this.name = name || this.name;
        this.nameText.setText(this.name);
    }

    setTargetFromNetwork(state) {
        this.target.x = state.x;
        this.target.y = state.y;
        this.target.direction = state.direction || this.target.direction;
        this.target.animState = state.animState || this.target.animState;
        this.target.frame = Number.isInteger(state.frame) ? state.frame : this.target.frame;
        this.target.hasFlower = Boolean(state.hasFlower);
        this.setHasFlower(this.target.hasFlower);

        if (state.message && state.message !== this.lastBubbleText) {
            this.showChatBubble(state.message);
            this.lastBubbleText = state.message;
        }
    }

    syncVisuals() {
        this.nameText.setPosition(this.sprite.x, this.sprite.y - 30);
        this.bubble.setPosition(this.sprite.x, this.sprite.y - 48);
        this.updateFlowerInHand();
        this.updateDepth();
    }

    interpolate(delta) {
        const t = Math.min(1, delta / 100);
        this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.target.x, t);
        this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.target.y, t);

        this.applyAnimation(this.target.direction, this.target.animState);
        this.syncVisuals();
    }

    applyAnimation(direction, animState) {
        const dirIndex = Math.max(0, DIRS.indexOf(direction));

        if (animState === "walk") {
            const key = `${this.textureKey}-${this.frameOffset}-walk-${direction}`;
            if (this.scene.anims.exists(key)) {
                this.sprite.play(key, true);
                return;
            }
        }

        this.sprite.stop();
        this.sprite.setFrame(this.frameOffset + dirIndex * 3 + 1);
    }

    setVelocity(vx, vy) {
        this.sprite.body.setVelocity(vx, vy);
    }

    setHasFlower(value) {
        this.hasFlower = Boolean(value);
        this.heldFlowerPetal.setVisible(this.hasFlower);
        this.heldFlowerStem.setVisible(this.hasFlower);
    }

    updateFlowerInHand() {
        if (!this.hasFlower) {
            return;
        }

        const dir = this.target.direction || this.lastState.direction || "right";
        const side = dir === "left" ? -1 : 1;
        const handX = this.sprite.x + (dir === "up" || dir === "down" ? 8 : side * 13);
        const handY = this.sprite.y - (dir === "up" ? 10 : 6);

        this.heldFlowerPetal.setPosition(handX, handY);
        this.heldFlowerStem.setPosition(handX, handY + 6);
    }

    showChatBubble(text) {
        this.bubble.setText(text);
        this.bubble.setScale(0.85);
        this.bubble.setAlpha(0);

        if (this.bubbleTween) {
            this.bubbleTween.remove();
        }

        this.bubbleTween = this.scene.tweens.add({
            targets: this.bubble,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            ease: "Back.out",
            duration: 160,
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this.bubble,
                    alpha: 0,
                    y: this.bubble.y - 12,
                    duration: 450,
                    delay: 2600,
                    ease: "Sine.out",
                    onComplete: () => {
                        this.bubble.y = this.sprite.y - 48;
                    }
                });
            }
        });
    }

    playGiveFlowerAnimation() {
        const dir = this.lastState.direction || "right";
        const side = dir === "left" ? -1 : 1;
        const handX = this.sprite.x + (dir === "up" || dir === "down" ? 8 : side * 13);
        const handY = this.sprite.y - (dir === "up" ? 10 : 6);

        const petal = this.scene.add.circle(handX, handY, 5, 0xee3e79).setDepth(this.sprite.depth + 5);
        const stem = this.scene.add.rectangle(handX, handY + 6, 2, 10, 0x2f8a52).setDepth(this.sprite.depth + 4);
        const sparkleA = this.scene.add.circle(handX, handY, 2, 0xfff2b7).setDepth(this.sprite.depth + 6);
        const sparkleB = this.scene.add.circle(handX, handY, 2, 0xfff2b7).setDepth(this.sprite.depth + 6);

        this.scene.tweens.add({
            targets: [petal, stem, sparkleA, sparkleB],
            x: handX + side * 18,
            y: handY - 8,
            angle: side * 30,
            alpha: 0,
            duration: 420,
            ease: "Quad.out",
            onUpdate: () => {
                sparkleA.x = petal.x - 6 * side;
                sparkleA.y = petal.y - 3;
                sparkleB.x = petal.x + 5 * side;
                sparkleB.y = petal.y + 2;
            },
            onComplete: () => {
                petal.destroy();
                stem.destroy();
                sparkleA.destroy();
                sparkleB.destroy();
            }
        });
    }

    destroy() {
        this.sprite.destroy();
        this.nameText.destroy();
        this.bubble.destroy();
        this.heldFlowerPetal.destroy();
        this.heldFlowerStem.destroy();
    }
}
