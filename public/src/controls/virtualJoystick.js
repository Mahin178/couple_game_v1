export class VirtualJoystick {
    constructor(root, knob) {
        this.root = root;
        this.knob = knob;
        this.vector = { x: 0, y: 0 };
        this.smoothVector = { x: 0, y: 0 };
        this.pointerId = null;
        this.center = { x: 0, y: 0 };
        this.maxRadius = 30;
        this.deadZone = 0.1;

        this.recalculate();
        this.resetKnob();
        this.bind();
    }

    recalculate() {
        const rootRadius = this.root.clientWidth / 2 || 66;
        const knobRadius = this.knob.clientWidth / 2 || 29;
        this.maxRadius = Math.max(18, rootRadius - knobRadius);
        this.center.x = rootRadius;
        this.center.y = rootRadius;
    }

    resetKnob() {
        this.recalculate();
        this.knob.style.left = `${this.center.x}px`;
        this.knob.style.top = `${this.center.y}px`;
        this.vector.x = 0;
        this.vector.y = 0;
        this.smoothVector.x = 0;
        this.smoothVector.y = 0;
    }

    bind() {
        window.addEventListener("resize", () => this.resetKnob());

        this.root.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            this.pointerId = event.pointerId;
            this.root.setPointerCapture(this.pointerId);
            this.updateVector(event.clientX, event.clientY);
        });

        this.root.addEventListener("pointermove", (event) => {
            if (event.pointerId !== this.pointerId) {
                return;
            }
            event.preventDefault();
            this.updateVector(event.clientX, event.clientY);
        });

        const stop = (event) => {
            if (event.pointerId !== this.pointerId) {
                return;
            }

            this.pointerId = null;
            this.resetKnob();
        };

        this.root.addEventListener("pointerup", stop);
        this.root.addEventListener("pointercancel", stop);
        this.root.addEventListener("lostpointercapture", () => {
            this.pointerId = null;
            this.resetKnob();
        });
    }

    updateVector(clientX, clientY) {
        const rect = this.root.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this.recalculate();

        let dx = clientX - cx;
        let dy = clientY - cy;

        const dist = Math.hypot(dx, dy);
        if (dist > this.maxRadius && dist > 0) {
            dx = (dx / dist) * this.maxRadius;
            dy = (dy / dist) * this.maxRadius;
        }

        let vx = Phaser.Math.Clamp(dx / this.maxRadius, -1, 1);
        let vy = Phaser.Math.Clamp(dy / this.maxRadius, -1, 1);

        if (Math.hypot(vx, vy) < this.deadZone) {
            vx = 0;
            vy = 0;
        }

        this.vector.x = vx;
        this.vector.y = vy;

        this.knob.style.left = `${this.center.x + dx}px`;
        this.knob.style.top = `${this.center.y + dy}px`;
    }

    getVector() {
        this.smoothVector.x = Phaser.Math.Linear(this.smoothVector.x, this.vector.x, 0.52);
        this.smoothVector.y = Phaser.Math.Linear(this.smoothVector.y, this.vector.y, 0.52);
        return this.smoothVector;
    }
}
