const projectRoot = require('node:path').resolve(__dirname, '..');
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { prepareRequestPhoto, MAX_PHOTO_BYTES } = require('../src/media/request-photo');
test('phone JPEG, PNG, WebP and AVIF photos decode without reducing their dimensions', async () => {
    for (const format of ['jpeg','png','webp','avif']) {
        const input = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#176738' } }).toFormat(format).toBuffer();
        const image = await prepareRequestPhoto(`data:image/${format};base64,${input.toString('base64')}`);
        assert.equal(image.width,320); assert.equal(image.height,240);
        assert.equal((await sharp(image.content).metadata()).width,320);
        assert.equal(image.mime,format==='avif'?'image/jpeg':'image/'+format);
    }
});
test('iPhone HEIC/HEIF and empty mobile MIME types become viewable full-resolution JPEGs', async () => {
    const fs = require('node:fs'), path = require('node:path');
    const input = fs.readFileSync(path.join(projectRoot,'tests/fixtures/example.heic'));
    for (const mime of ['image/heic','image/heif','application/octet-stream']) {
        const image = await prepareRequestPhoto(`data:${mime};base64,${input.toString('base64')}`);
        assert.equal(image.mime,'image/jpeg'); assert.equal(image.width,1280); assert.equal(image.height,854);
        const metadata = await sharp(image.content).metadata(); assert.equal(metadata.width,1280); assert.equal(metadata.height,854);
    }
});
test('phone photo orientation is applied, metadata stripped and forged or oversized images rejected', async () => {
    const jpeg = await sharp({create:{width:32,height:24,channels:3,background:'green'}}).jpeg().withMetadata({orientation:6}).toBuffer();
    const image = await prepareRequestPhoto('data:image/jpeg;base64,'+jpeg.toString('base64'));
    assert.equal(image.width,24); assert.equal(image.height,32); assert.equal((await sharp(image.content).metadata()).exif,undefined);
    await assert.rejects(prepareRequestPhoto('data:image/png;base64,'+Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')),{status:400});
    await assert.rejects(prepareRequestPhoto('data:image/heic;base64,'+Buffer.from('not a photo').toString('base64')),{status:400});
    await assert.rejects(prepareRequestPhoto('data:image/png;base64,'+Buffer.alloc(MAX_PHOTO_BYTES+1).toString('base64')),{status:400});
});
