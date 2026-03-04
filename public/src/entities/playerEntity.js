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
        this.sprite.setSize(14, 10);
        this.sprite.setOffset(9, 22);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setDepth(1000 + y);

        this.nameText = scene.add
            .text(x, y - 26, this.name, {
                fontSize: "12px",
                color: "#ffffff",
                backgroundColor: "rgba(0,0,0,0.5)",
                padding: { x: 4, y: 2 }
            })
            .setOrigin(0.5)
            .setDepth(2000);

        this.bubble = scene.add
            .text(x, y - 44, "", {
                fontSize: "12px",
                color: "#111",
                backgroundColor: "#fff",
                padding: { x: 7, y: 4 },
                wordWrap: { width: 170 }
            })
            .setOrigin(0.5)
            .setAlpha(0)
            .setDepth(2000);

        this.lastState = { x, y, direction: "down", animState: "idle", frame: frameOffset };
        this.target = { x, y, direction: "down", animState: "idle", frame: frameOffset };
        this.lastBubbleText = "";
        this.bubbleTween = null;
    }

    updateDepth() {
        this.sprite.setDepth(1000 + this.sprite.y);
        this.nameText.setDepth(2000 + this.sprite.y);
        this.bubble.setDepth(2001 + this.sprite.y);
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

        if (state.message && state.message !== this.lastBubbleText) {
            this.showChatBubble(state.message);
            this.lastBubbleText = state.message;
        }
    }

    syncVisuals() {
        this.nameText.setPosition(this.sprite.x, this.sprite.y - 26);
        this.bubble.setPosition(this.sprite.x, this.sprite.y - 44);
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
                        this.bubble.y = this.sprite.y - 44;
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

        const petal = this.scene.add.circle(handX, handY, 4, 0xee3e79).setDepth(this.sprite.depth + 5);
        const stem = this.scene.add.rectangle(handX, handY + 5, 2, 8, 0x2f8a52).setDepth(this.sprite.depth + 4);

        this.scene.tweens.add({
            targets: [petal, stem],
            x: handX + side * 12,
            y: handY - 4,
            angle: side * 20,
            alpha: 0,
            duration: 360,
            ease: "Cubic.out",
            onComplete: () => {
                petal.destroy();
                stem.destroy();
            }
        });
    }

    destroy() {
        this.sprite.destroy();
        this.nameText.destroy();
        this.bubble.destroy();
    }
}
