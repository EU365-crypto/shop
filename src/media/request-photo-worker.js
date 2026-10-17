const { parentPort, workerData } = require('node:worker_threads');
const sharp = require('sharp');
const buffer = Buffer.from(workerData), maxPixels = 60000000;
async function convert() {
    let type;
    if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = 'png';
    else if (buffer.subarray(0,3).equals(Buffer.from([255,216,255]))) type = 'jpeg';
    else if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') type = 'webp';
    else if (buffer.subarray(4,8).toString() === 'ftyp') {
        const brands = [buffer.subarray(8,12).toString()];
        const end = Math.min(buffer.readUInt32BE(0), buffer.length, 256);
        for (let i = 16; i + 4 <= end; i += 4) brands.push(buffer.subarray(i,i+4).toString());
        if (brands.some(brand => ['avif','avis'].includes(brand))) type = 'avif';
        else if (brands.some(brand => ['heic','heix','hevc','hevx','mif1','msf1'].includes(brand))) type = 'heic';
    }
    if (!type) throw new Error('Unsupported photo');
    let pipeline;
    if (type === 'heic') {
        const images = await require('heic-decode').all({ buffer });
        try {
            const first = images[0];
            if (!first || first.width * first.height > maxPixels) throw new Error('Photo is too large');
            const decoded = await first.decode();
            pipeline = sharp(Buffer.from(decoded.data), { raw: { width: decoded.width, height: decoded.height, channels: 4 }, limitInputPixels: maxPixels });
            // Encode before freeing the HEIF decoder's pixels.
            const output = await pipeline.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
            return { content: output.data, mime: 'image/jpeg', filename: 'product-image.jpg', width: output.info.width, height: output.info.height };
        } finally { images.dispose(); }
    }
    pipeline = sharp(buffer, { limitInputPixels: maxPixels, failOn: 'error', animated: false }).autoOrient();
    // Keep full pixel dimensions; re-encode to remove metadata and decode-check the upload.
    if (type === 'png') pipeline = pipeline.png();
    else if (type === 'webp') pipeline = pipeline.webp({ quality: 95 });
    else pipeline = pipeline.jpeg({ quality: 95 });
    const output = await pipeline.toBuffer({ resolveWithObject: true });
    const mime = type === 'png' ? 'image/png' : type === 'webp' ? 'image/webp' : 'image/jpeg';
    return { content: output.data, mime, filename: 'product-image.' + (mime === 'image/jpeg' ? 'jpg' : type), width: output.info.width, height: output.info.height };
}
convert().then(result => parentPort.postMessage(result), () => parentPort.postMessage({ error: true }));
