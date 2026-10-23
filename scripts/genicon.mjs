import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build/icon.svg'))

// 512 PNG (Linux/mac fallback icon)
await sharp(svg).resize(512, 512).png().toFile(join(root, 'build/icon.png'))

// Multi-size ICO for Windows
const bufs = []
for (const s of [16, 24, 32, 48, 64, 128, 256]) {
  bufs.push(await sharp(svg).resize(s, s).png().toBuffer())
}
writeFileSync(join(root, 'build/icon.ico'), await pngToIco(bufs))

console.log('Generated build/icon.png (512) and build/icon.ico (16-256)')
