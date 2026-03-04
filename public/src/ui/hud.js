export function createHudControls() {
    const chatInput = document.getElementById("chatInput");
    const loveFill = document.getElementById("loveFill");
    const missionBox = document.getElementById("missionBox");

    return {
        chatInput,
        setLove(value) {
            const clamped = Math.max(0, Math.min(100, value));
            loveFill.style.width = `${clamped}%`;
        },
        setMission(text) {
            missionBox.textContent = `Mission: ${text}`;
        }
    };
}
