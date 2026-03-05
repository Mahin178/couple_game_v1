export function createHudControls() {
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const emojiButtons = Array.from(document.querySelectorAll(".emojiBtn"));
    const loveFill = document.getElementById("loveFill");
    const missionBox = document.getElementById("missionBox");
    const authorTag = document.getElementById("authorTag");
    const chatToggle = document.getElementById("btnChatToggle");
    const materialCounts = {
        brick: document.getElementById("matBrickCount"),
        wood: document.getElementById("matWoodCount"),
        glass: document.getElementById("matGlassCount")
    };
    const buttons = {
        drive: document.getElementById("btnDrive"),
        sit: document.getElementById("btnSit"),
        exitCar: document.getElementById("btnExitCar"),
        openDoor: document.getElementById("btnOpenDoor"),
        pickFlower: document.getElementById("btnPickFlower"),
        giveFlower: document.getElementById("btnGiveFlower"),
        acceptFlower: document.getElementById("btnAcceptFlower"),
        buildMode: document.getElementById("btnBuildMode"),
        grabMaterial: document.getElementById("btnGrabMaterial"),
        placeBlock: document.getElementById("btnPlaceBlock"),
        removeBlock: document.getElementById("btnRemoveBlock"),
        cycleMaterial: document.getElementById("btnCycleMaterial")
    };
    const mobileBuildAction = document.getElementById("btnMobileBuildAction");
    const buildInfo = document.getElementById("buildInfo");
    const drivePad = {
        root: document.getElementById("drivePad"),
        up: document.getElementById("driveUp"),
        down: document.getElementById("driveDown"),
        left: document.getElementById("driveLeft"),
        right: document.getElementById("driveRight")
    };
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const restartButton = document.getElementById("btnRestartGame");

    return {
        chatForm,
        chatInput,
        emojiButtons,
        missionBox,
        authorTag,
        chatToggle,
        materialCounts,
        buttons,
        drivePad,
        restartButton,
        buildInfo,
        mobileBuildAction,
        setLove(value) {
            const clamped = Math.max(0, Math.min(100, value));
            loveFill.style.width = `${clamped}%`;
        },
        setMission(text) {
            missionBox.textContent = `Mission: ${text}`;
        },
        setBuildModeLabel(text) {
            if (buttons.buildMode) {
                buttons.buildMode.textContent = text;
            }
        },
        setMaterialCounts(counts) {
            if (materialCounts.brick) {
                materialCounts.brick.textContent = String(counts.brick ?? 0);
            }
            if (materialCounts.wood) {
                materialCounts.wood.textContent = String(counts.wood ?? 0);
            }
            if (materialCounts.glass) {
                materialCounts.glass.textContent = String(counts.glass ?? 0);
            }
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
        },
        showGameOver(show) {
            gameOverOverlay.style.display = show ? "flex" : "none";
            gameOverOverlay.setAttribute("aria-hidden", show ? "false" : "true");
        },
        setBuildInfo(text) {
            if (buildInfo) {
                buildInfo.textContent = text;
            }
        },
        setBuildButtonLabel(text) {
            if (buttons.cycleMaterial) {
                buttons.cycleMaterial.textContent = text;
            }
        },
        setMobileBuildLabel(text) {
            if (mobileBuildAction) {
                mobileBuildAction.textContent = text;
            }
        },
        showMobileBuildAction(show) {
            if (mobileBuildAction) {
                mobileBuildAction.style.display = show ? "inline-flex" : "none";
            }
        }
    };
}
