export const trimCanvas = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    let x, y, leftmostX, topmostY, rightmostX, bottommostY;

    leftmostX = canvas.width;
    topmostY = canvas.height;
    rightmostX = 0;
    bottommostY = 0;
    
    for (y = 0; y < canvas.height; y++) {
        for (x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            const alpha = pixels[index + 3];
    
            if (alpha > 0) {
                if (x < leftmostX) leftmostX = x;
                if (y < topmostY) topmostY = y;
                if (x > rightmostX) rightmostX = x;
                if (y > bottommostY) bottommostY = y;
            }
        }
    }

    const trimmedWidth = rightmostX - leftmostX + 1;
    const trimmedHeight = bottommostY - topmostY + 1;
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    trimmedCtx.putImageData(ctx.getImageData(leftmostX, topmostY, trimmedWidth, trimmedHeight), 0, 0);
    return trimmedCanvas;
}

export const downloadTrimmedImage = (canvas, name) => {
    // Create an offscreen canvas and draw the WebGL canvas onto it
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    offscreenCtx.drawImage(canvas, 0, 0);

    // Trim the offscreen canvas
    const trimmedCanvas = trimCanvas(offscreenCanvas);

    // Cleanup the offscreen canvas reference for garbage collection
    offscreenCanvas.width = 0;
    offscreenCanvas.height = 0;

    // Download the trimmed image
    const link = document.createElement('a');
    link.href = trimmedCanvas.toDataURL('image/png');
    link.download = `${name}.png`;
    link.click();
}

export const wait = (seconds) => {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}