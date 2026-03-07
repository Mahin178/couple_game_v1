export function createHudControls() {
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const emojiButtons = Array.from(document.querySelectorAll(".emojiBtn"));
    const loveFill = document.getElementById("loveFill");
    const loveStatus = document.getElementById("loveStatus");
    const authorTag = document.getElementById("authorTag");
    const chatToggle = document.getElementById("btnChatToggle");
    const micToggle = document.getElementById("btnMicToggle");
    const materialCounts = {
        brick: document.getElementById("matBrickCount"),
        wood: document.getElementById("matWoodCount"),
        glass: document.getElementById("matGlassCount"),
        steel: document.getElementById("matSteelCount"),
        apple: document.getElementById("foodAppleCount"),
        strawberry: document.getElementById("foodStrawberryCount"),
        blueberry: document.getElementById("foodBlueberryCount"),
        meat: document.getElementById("foodMeatCount")
    };
    const miniMapWrap = document.getElementById("miniMapWrap");
    const miniMapCanvas = document.getElementById("miniMapCanvas");
    const fullMapModal = document.getElementById("fullMapModal");
    const fullMapCanvas = document.getElementById("fullMapCanvas");
    const closeFullMapButton = document.getElementById("btnCloseFullMap");
    const zoomInButton = document.getElementById("btnZoomIn");
    const zoomOutButton = document.getElementById("btnZoomOut");
    const buttons = {
        drive: document.getElementById("btnDrive"),
        sit: document.getElementById("btnSit"),
        exitCar: document.getElementById("btnExitCar"),
        openGate: document.getElementById("btnOpenGate"),
        collect: document.getElementById("btnCollect"),
        shoot: document.getElementById("btnShoot"),
        eat: document.getElementById("btnEat"),
        buildMode: document.getElementById("btnBuildMode"),
        placeBlock: document.getElementById("btnPlaceBlock"),
        enter: document.getElementById("btnEnter"),
        removeBlock: document.getElementById("btnRemoveBlock"),
        cycleMaterial: document.getElementById("btnCycleMaterial"),
        cycleWeapon: document.getElementById("btnCycleWeapon")
    };
    const backpackInfo = document.getElementById("backpackInfo");
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
    const gameOverTitle = document.getElementById("gameOverTitle");
    const gameOverReason = document.getElementById("gameOverReason");
    const restartButton = document.getElementById("btnRestartGame");
    const actionState = {};
    let drivePadVisible = false;
    let mobileBuildVisible = false;

    return {
        chatForm,
        chatInput,
        emojiButtons,
        authorTag,
        chatToggle,
        micToggle,
        materialCounts,
        miniMapWrap,
        miniMapCanvas,
        fullMapModal,
        fullMapCanvas,
        closeFullMapButton,
        zoomInButton,
        zoomOutButton,
        buttons,
        drivePad,
        restartButton,
        buildInfo,
        mobileBuildAction,
        backpackInfo,
        setLove(value) {
            const clamped = Math.max(0, Math.min(100, value));
            loveFill.style.width = `${clamped}%`;
            if (loveStatus) {
                loveStatus.textContent = `Love Status: ${Math.round(clamped)}%`;
            }
        },
        setMission(text) {
            return text;
        },
        setMicActive(active) {
            if (!micToggle) {
                return;
            }
            micToggle.classList.toggle("active", Boolean(active));
            micToggle.textContent = active ? "🔴" : "🎤";
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
            if (materialCounts.steel) {
                materialCounts.steel.textContent = String(counts.steel ?? 0);
            }
            if (materialCounts.apple) {
                materialCounts.apple.textContent = String(counts.apple ?? 0);
            }
            if (materialCounts.strawberry) {
                materialCounts.strawberry.textContent = String(counts.strawberry ?? 0);
            }
            if (materialCounts.blueberry) {
                materialCounts.blueberry.textContent = String(counts.blueberry ?? 0);
            }
            if (materialCounts.meat) {
                materialCounts.meat.textContent = String(counts.meat ?? 0);
            }
        },
        setBackpack(text) {
            if (backpackInfo) {
                backpackInfo.textContent = text;
            }
        },
        showAction(name, show) {
            const btn = buttons[name];
            if (!btn) {
                return;
            }
            const visible = Boolean(show);
            if (actionState[name] === visible) {
                return;
            }
            actionState[name] = visible;
            btn.style.display = visible ? "inline-block" : "none";
        },
        showDrivePad(show) {
            const visible = Boolean(show);
            if (drivePadVisible === visible) {
                return;
            }
            drivePadVisible = visible;
            drivePad.root.style.display = visible ? "block" : "none";
        },
        showGameOver(show) {
            gameOverOverlay.style.display = show ? "flex" : "none";
            gameOverOverlay.setAttribute("aria-hidden", show ? "false" : "true");
        },
        setGameOverMessage(title, reason) {
            if (gameOverTitle) {
                gameOverTitle.textContent = title || "You did not survive.";
            }
            if (gameOverReason) {
                gameOverReason.textContent = reason || "";
            }
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
                const visible = Boolean(show);
                if (mobileBuildVisible === visible) {
                    return;
                }
                mobileBuildVisible = visible;
                mobileBuildAction.style.display = visible ? "inline-flex" : "none";
            }
        },
        showFullMap(show) {
            if (!fullMapModal) {
                return;
            }

            fullMapModal.style.display = show ? "flex" : "none";
            fullMapModal.setAttribute("aria-hidden", show ? "false" : "true");
        }
    };
}
