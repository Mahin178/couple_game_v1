function drawBody(ctx, frameX, frameY, bodyColor, direction, phase) {
    const ox = frameX * 32;
    const oy = frameY * 32;
    const swing = phase === 1 ? -1 : phase === 2 ? 1 : 0;
    const isWifeVariant = bodyColor.toLowerCase() === "#f06392";
    const skin = isWifeVariant ? "#ffd6c5" : "#f3cdb5";
    const hair = isWifeVariant ? "#5d2c47" : "#4a3428";
    const clothMain = isWifeVariant ? "#f06392" : "#4b8cf7";
    const clothSoft = isWifeVariant ? "#ffd7e7" : "#d7e8ff";
    const shoe = "#2d2d34";

    // Legs
    ctx.fillStyle = shoe;
    const legShift = swing;

    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 11, oy + 23 + legShift, 4, 7);
        ctx.fillRect(ox + 17, oy + 23 - legShift, 4, 7);
    } else {
        ctx.fillRect(ox + 11 + legShift, oy + 23, 4, 7);
        ctx.fillRect(ox + 17 - legShift, oy + 23, 4, 7);
    }

    // Outfit
    ctx.fillStyle = clothMain;
    ctx.fillRect(ox + 8, oy + 12, 16, 10);
    ctx.fillRect(ox + 9, oy + 21, 14, 2);
    if (isWifeVariant) {
        ctx.fillStyle = "#f58eb2";
        ctx.fillRect(ox + 7, oy + 20, 18, 4);
    }
    ctx.fillStyle = clothSoft;
    ctx.fillRect(ox + 11, oy + 14, 10, 4);

    // Arms
    ctx.fillStyle = clothMain;
    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 7, oy + 13 - swing, 3, 7);
        ctx.fillRect(ox + 22, oy + 13 + swing, 3, 7);
    } else {
        ctx.fillRect(ox + 7 + swing, oy + 13, 3, 7);
        ctx.fillRect(ox + 22 - swing, oy + 13, 3, 7);
    }

    // Hands
    ctx.fillStyle = skin;
    if (direction === "left" || direction === "right") {
        ctx.fillRect(ox + 7, oy + 20 - swing, 3, 2);
        ctx.fillRect(ox + 22, oy + 20 + swing, 3, 2);
    } else {
        ctx.fillRect(ox + 7 + swing, oy + 20, 3, 2);
        ctx.fillRect(ox + 22 - swing, oy + 20, 3, 2);
    }

    // Head
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 10, oy + 4, 12, 9);
    ctx.fillStyle = "#f7e3d9";
    ctx.fillRect(ox + 11, oy + 5, 10, 2);

    // Hair and cute silhouette
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 9, oy + 3, 14, 3);
    if (direction === "left") {
        ctx.fillRect(ox + 9, oy + 4, 4, 8);
    } else if (direction === "right") {
        ctx.fillRect(ox + 19, oy + 4, 4, 8);
    } else {
        ctx.fillRect(ox + 9, oy + 4, 2, 8);
        ctx.fillRect(ox + 21, oy + 4, 2, 8);
    }
    if (isWifeVariant && direction === "down") {
        ctx.fillRect(ox + 8, oy + 7, 2, 5);
        ctx.fillRect(ox + 22, oy + 7, 2, 5);
    }

    // Face
    if (direction === "down") {
        ctx.fillStyle = "#1d1d1f";
        ctx.fillRect(ox + 13, oy + 8, 2, 2);
        ctx.fillRect(ox + 17, oy + 8, 2, 2);
        ctx.fillStyle = isWifeVariant ? "#f1a3ba" : "#efb8aa";
        ctx.fillRect(ox + 11, oy + 9, 2, 1);
        ctx.fillRect(ox + 19, oy + 9, 2, 1);
        ctx.fillStyle = isWifeVariant ? "#cf587f" : "#a86c5d";
        ctx.fillRect(ox + 14, oy + 10, 4, 1);
    } else if (direction === "left") {
        ctx.fillStyle = "#1d1d1f";
        ctx.fillRect(ox + 12, oy + 8, 2, 2);
        ctx.fillStyle = isWifeVariant ? "#cf587f" : "#a86c5d";
        ctx.fillRect(ox + 12, oy + 10, 2, 1);
    } else if (direction === "right") {
        ctx.fillStyle = "#1d1d1f";
        ctx.fillRect(ox + 18, oy + 8, 2, 2);
        ctx.fillStyle = isWifeVariant ? "#cf587f" : "#a86c5d";
        ctx.fillRect(ox + 18, oy + 10, 2, 1);
    }

    // Back-hair for top view and a tiny accessory.
    ctx.fillStyle = hair;
    if (direction === "up") {
        ctx.fillRect(ox + 10, oy + 4, 12, 3);
        ctx.fillStyle = isWifeVariant ? "#f8db7e" : "#9fe8f8";
        ctx.fillRect(ox + 15, oy + 7, 2, 2);
    } else if (direction === "down" && isWifeVariant) {
        ctx.fillStyle = "#f8db7e";
        ctx.fillRect(ox + 20, oy + 7, 2, 2);
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

    // Grass with richer 2.5D texture.
    ctx.fillStyle = "#2d6f3a";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#3f874d";
    for (let i = 0; i < 22; i += 1) {
        ctx.fillRect((i * 11) % 62, (i * 17) % 62, 2, 2);
    }
    ctx.fillStyle = "#234f2f";
    for (let i = 0; i < 11; i += 1) {
        ctx.fillRect((i * 19) % 62, (i * 23) % 62, 1, 3);
    }

    // Road with edge shading and lane line.
    ctx.fillStyle = "#4b4b4f";
    ctx.fillRect(size, 0, size, size);
    ctx.fillStyle = "#3e3e42";
    ctx.fillRect(size, 0, 4, size);
    ctx.fillRect(size + size - 4, 0, 4, size);
    ctx.fillStyle = "#f2f2d4";
    ctx.fillRect(size + 28, 0, 8, size);
    ctx.fillStyle = "#2f2f33";
    for (let y = 0; y < size; y += 8) {
        ctx.fillRect(size + 12, y, 2, 4);
        ctx.fillRect(size + 50, y + 4, 2, 4);
    }

    // Building blocker texture 1.
    ctx.fillStyle = "#7e6b57";
    ctx.fillRect(size * 2, 0, size, size);
    ctx.fillStyle = "#8d7a63";
    for (let y = 0; y < size; y += 12) {
        ctx.fillRect(size * 2, y, size, 2);
    }
    ctx.fillStyle = "#6f5e4c";
    for (let x = 0; x < size; x += 16) {
        ctx.fillRect(size * 2 + x, 0, 2, size);
    }

    // Building blocker texture 2 with faux roof highlight.
    ctx.fillStyle = "#b9a48e";
    ctx.fillRect(size * 3, 0, size, size);
    ctx.fillStyle = "#a0866c";
    ctx.fillRect(size * 3 + 10, 12, 44, 40);
    ctx.fillStyle = "#cbb7a2";
    ctx.fillRect(size * 3, 0, size, 7);
    ctx.fillStyle = "#8f775f";
    for (let i = 0; i < 6; i += 1) {
        ctx.fillRect(size * 3 + 8 + i * 9, 12, 2, 40);
    }

    return canvas.toDataURL("image/png");
}
