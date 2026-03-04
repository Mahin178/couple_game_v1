export class VirtualJoystick {
    constructor(root, knob) {
        this.root = root;
        this.knob = knob;
        this.vector = { x: 0, y: 0 };
        this.pointerId = null;
        this.center = { x: 0, y: 0 };
        this.maxRadius = root.clientWidth / 2 - knob.clientWidth / 2;
        this.deadZone = 0.18;

        this.bind();
    }

    bind() {
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
            this.vector.x = 0;
            this.vector.y = 0;
            this.knob.style.transform = "translate(-50%, -50%)";
        };

        this.root.addEventListener("pointerup", stop);
        this.root.addEventListener("pointercancel", stop);
    }

    updateVector(clientX, clientY) {
        const rect = this.root.getBoundingClientRect();
        this.center.x = rect.left + rect.width / 2;
        this.center.y = rect.top + rect.height / 2;

        let dx = clientX - this.center.x;
        let dy = clientY - this.center.y;

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

        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    getVector() {
        return this.vector;
    }
}
