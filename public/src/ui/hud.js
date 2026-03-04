export function createHudControls() {
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const emojiButtons = Array.from(document.querySelectorAll(".emojiBtn"));
    const loveFill = document.getElementById("loveFill");
    const missionBox = document.getElementById("missionBox");
    const buttons = {
        drive: document.getElementById("btnDrive"),
        sit: document.getElementById("btnSit"),
        pickFlower: document.getElementById("btnPickFlower"),
        giveFlower: document.getElementById("btnGiveFlower"),
        acceptFlower: document.getElementById("btnAcceptFlower")
    };
    const drivePad = {
        root: document.getElementById("drivePad"),
        up: document.getElementById("driveUp"),
        down: document.getElementById("driveDown"),
        left: document.getElementById("driveLeft"),
        right: document.getElementById("driveRight")
    };

    return {
        chatForm,
        chatInput,
        emojiButtons,
        buttons,
        drivePad,
        setLove(value) {
            const clamped = Math.max(0, Math.min(100, value));
            loveFill.style.width = `${clamped}%`;
        },
        setMission(text) {
            missionBox.textContent = `Mission: ${text}`;
        },
        showAction(name, show) {
            const btn = buttons[name];
            if (!btn) {
                return;
            }
            btn.style.display = show ? "inline-block" : "none";
        },
        showDrivePad(show) {
            drivePad.root.style.display = show ? "block" : "none";
        }
    };
}
