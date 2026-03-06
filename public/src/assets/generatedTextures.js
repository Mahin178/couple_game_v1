function drawBody(ctx, frameX, frameY, bodyColor, direction, phase) {
    const ox = frameX * 32;
    const oy = frameY * 32;
    const swing = phase === 1 ? -2 : phase === 2 ? 2 : 0;
    const isWifeVariant = bodyColor.toLowerCase() === "#f06392";

    ctx.fillStyle = "#2f2f2f";
    const legOffset = swing;

    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 11, oy + 23 + legOffset, 4, 7);
        ctx.fillRect(ox + 17, oy + 23 - legOffset, 4, 7);
    } else {
        ctx.fillRect(ox + 11 + legOffset, oy + 23, 4, 7);
        ctx.fillRect(ox + 17 - legOffset, oy + 23, 4, 7);
    }

    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 8, oy + 11, 16, 13);
    ctx.fillStyle = isWifeVariant ? "#ffd7e7" : "#d5e3ff";
    ctx.fillRect(ox + 10, oy + 14, 12, 3);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(ox + 8, oy + 23, 16, 1);

    // Arms and hands for a more expressive walk cycle.
    ctx.fillStyle = bodyColor;
    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 7, oy + 12 - swing, 3, 8);
        ctx.fillRect(ox + 22, oy + 12 + swing, 3, 8);
    } else {
        ctx.fillRect(ox + 6 + swing, oy + 12, 3, 8);
        ctx.fillRect(ox + 23 - swing, oy + 12, 3, 8);
    }

    ctx.fillStyle = "#efc5a4";
    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 7, oy + 20 - swing, 3, 3);
        ctx.fillRect(ox + 22, oy + 20 + swing, 3, 3);
    } else {
        ctx.fillRect(ox + 6 + swing, oy + 20, 3, 3);
        ctx.fillRect(ox + 23 - swing, oy + 20, 3, 3);
    }

    ctx.fillStyle = "#efc5a4";
    ctx.fillRect(ox + 10, oy + 4, 12, 9);
    ctx.fillStyle = "#d7ae8d";
    ctx.fillRect(ox + 10, oy + 12, 12, 1);

    // Hair + face details.
    ctx.fillStyle = isWifeVariant ? "#3e2335" : "#2b2623";
    ctx.fillRect(ox + 9, oy + 3, 14, 3);
    if (direction === "left") {
        ctx.fillRect(ox + 9, oy + 4, 4, 8);
    } else if (direction === "right") {
        ctx.fillRect(ox + 19, oy + 4, 4, 8);
    } else {
        ctx.fillRect(ox + 9, oy + 4, 2, 7);
        ctx.fillRect(ox + 21, oy + 4, 2, 7);
    }

    ctx.fillStyle = "#1b1b1b";
    if (direction === "down") {
        ctx.fillRect(ox + 13, oy + 8, 2, 2);
        ctx.fillRect(ox + 17, oy + 8, 2, 2);
        ctx.fillStyle = isWifeVariant ? "#d7688e" : "#b9826f";
        ctx.fillRect(ox + 14, oy + 10, 4, 1);
    } else if (direction === "left") {
        ctx.fillRect(ox + 12, oy + 8, 2, 2);
    } else if (direction === "right") {
        ctx.fillRect(ox + 18, oy + 8, 2, 2);
    }

    // Small accessory accent.
    ctx.fillStyle = isWifeVariant ? "#fce3a8" : "#9fe8f8";
    if (direction === "up") {
        ctx.fillRect(ox + 15, oy + 7, 2, 2);
    } else {
        ctx.fillRect(ox + 20, oy + 7, 2, 2);
    }

    ctx.fillStyle = "#1f1f1f";
    if (direction === "up") {
        ctx.fillRect(ox + 10, oy + 4, 12, 3);
    } else if (direction === "down") {
        ctx.fillRect(ox + 10, oy + 9, 12, 3);
    } else if (direction === "left") {
        ctx.fillRect(ox + 10, oy + 4, 3, 9);
    } else {
        ctx.fillRect(ox + 19, oy + 4, 3, 9);
    }
}

export function createPlayerSpriteSheetDataURL() {
    const frameWidth = 32;
    const frameHeight = 32;
    const cols = 3;
    const rows = 8;

    const canvas = document.createElement("canvas");
    canvas.width = frameWidth * cols;
    canvas.height = frameHeight * rows;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const directions = ["down", "left", "right", "up"];

    directions.forEach((dir, i) => {
        for (let phase = 0; phase < 3; phase += 1) {
            drawBody(ctx, phase, i, "#4b8cf7", dir, phase);
            drawBody(ctx, phase, i + 4, "#f06392", dir, phase);
        }
    });

    return canvas.toDataURL("image/png");
}

export function createTilesDataURL() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size * 4;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#2d6f3a";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#3f874d";
    for (let i = 0; i < 7; i += 1) {
        ctx.fillRect(i * 9, (i * 13) % 60, 3, 3);
    }

    ctx.fillStyle = "#4b4b4f";
    ctx.fillRect(size, 0, size, size);
    ctx.fillStyle = "#f2f2d4";
    ctx.fillRect(size + 28, 0, 8, size);

    ctx.fillStyle = "#7e6b57";
    ctx.fillRect(size * 2, 0, size, size);
    ctx.fillStyle = "#8d7a63";
    for (let y = 0; y < size; y += 16) {
        ctx.fillRect(size * 2, y, size, 2);
    }

    ctx.fillStyle = "#b9a48e";
    ctx.fillRect(size * 3, 0, size, size);
    ctx.fillStyle = "#a0866c";
    ctx.fillRect(size * 3 + 10, 12, 44, 40);

    return canvas.toDataURL("image/png");
}
