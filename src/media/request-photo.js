const { Worker } = require('node:worker_threads');
const path = require('node:path');
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_ERROR = 'Choose a JPG, PNG, WebP, HEIC, HEIF or AVIF photo up to 10 MB.';
let active = 0;
async function prepareRequestPhoto(input) {
    const match = typeof input === 'string' && input.length <= Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 100 && input.match(/^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream)?;base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) throw Object.assign(new Error(PHOTO_ERROR), { status: 400 });
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== match[1]) throw Object.assign(new Error(PHOTO_ERROR), { status: 400 });
    if (active >= 2) throw Object.assign(new Error('Photo processing is busy. Please try again shortly.'), { status: 429 });
    active++;
    try {
        return await new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'request-photo-worker.js'), { workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 256 } });
            let finished = false;
            const finish = (error, image) => { if (finished) return; finished = true; clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(image); };
            const invalid = () => Object.assign(new Error(PHOTO_ERROR), { status: 400 });
            const timer = setTimeout(() => finish(invalid()), 30000);
            worker.once('message', result => result.error || result.content?.byteLength > 18*1024*1024 ? finish(invalid()) : finish(null, { ...result, content: Buffer.from(result.content) }));
            worker.once('error', () => finish(invalid()));
            worker.once('exit', () => { if (!finished) finish(invalid()); });
        });
    } finally { active--; }
}
async function sendPhotoPreview(req, res) {
    try {
        const image = await prepareRequestPhoto(req.body?.image);
        res.json({ image: `data:${image.mime};base64,${image.content.toString('base64')}` });
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
}
module.exports = { prepareRequestPhoto, sendPhotoPreview, MAX_PHOTO_BYTES, PHOTO_ERROR };
