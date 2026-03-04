function drawBody(ctx, frameX, frameY, bodyColor, direction, phase) {
    const ox = frameX * 32;
    const oy = frameY * 32;

    ctx.fillStyle = "#2f2f2f";
    const legOffset = phase === 1 ? -2 : phase === 2 ? 2 : 0;

    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 11, oy + 23 + legOffset, 4, 7);
        ctx.fillRect(ox + 17, oy + 23 - legOffset, 4, 7);
    } else {
        ctx.fillRect(ox + 11 + legOffset, oy + 23, 4, 7);
        ctx.fillRect(ox + 17 - legOffset, oy + 23, 4, 7);
    }

    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 8, oy + 11, 16, 13);

    ctx.fillStyle = "#efc5a4";
    ctx.fillRect(ox + 10, oy + 4, 12, 9);

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
