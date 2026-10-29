import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const source = join('Asset', 'OPG_AfterFX.mov');
const output = join('public', 'assets');
const background = '0xf7f5ef';

function run(args) {
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.error?.message || result.status}`);
}

for (const [name, width, height, foregroundWidth, foregroundHeight] of [
  ['compact', 960, 540, 960, 540],
  ['desktop', 1280, 720, 1280, 720],
  ['portrait', 540, 960, 1280, 720],
  ['wide', 1720, 720, 1280, 720],
]) {
  const filter = `[0:v]trim=duration=4,setpts=PTS-STARTPTS,format=rgba,colorkey=0xe1e1e1:0.06:0.16,scale=${foregroundWidth}:${foregroundHeight}:flags=lanczos[fg];[1:v][fg]overlay=(W-w)/2:(H-h)/2:shortest=1:format=auto,format=yuv420p[out]`;
  run(['-i', source, '-f', 'lavfi', '-i', `color=c=${background}:s=${width}x${height}:r=30:d=4`,
    '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', '4',
    join(output, `opg-afterfx-${name}.mp4`)]);
}

run(['-ss', '2', '-i', join(output, 'opg-afterfx-desktop.mp4'), '-frames:v', '1', join(output, 'opg-afterfx-poster.png')]);
run(['-i', join(output, 'opg-splash-light.png'), '-vf', 'format=rgba,lutrgb=r=39:g=35:b=29', '-frames:v', '1', join(output, 'opg-splash-ink.png')]);
console.log('Built four light splash videos, poster, and ink fallback logo.');
