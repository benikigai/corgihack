#!/usr/bin/env python3
"""Check local reel media and emit review frames; no network or generation calls."""
import argparse
from fractions import Fraction
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys


def run(args, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def checked(args):
    result = run(args)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:] or 'Media command failed')
    return result.stdout


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--width', type=int, default=1080)
    parser.add_argument('--height', type=int, default=1920)
    parser.add_argument('--fps', type=float, default=30)
    parser.add_argument('--duration', type=float)
    parser.add_argument('--require-audio', action='store_true')
    parser.add_argument('--samples', type=int, default=8, choices=range(2, 17))
    args = parser.parse_args()
    if args.width <= 0 or args.height <= 0 or args.fps <= 0 or (args.duration is not None and args.duration <= 0):
        parser.error('Format expectations must be positive')
    video = args.video.resolve()
    if not video.is_file():
        parser.error('Input video does not exist')
    for tool in ['ffmpeg', 'ffprobe']:
        if not shutil.which(tool):
            parser.error(tool + ' is not installed')
    dest = args.out_dir.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    report = {'input': str(video), 'errors': [], 'warnings': [],
              'visual_review': 'pending: inspect contact sheet and motion',
              'listening_review': 'pending: listen if audio is intended'}
    try:
        metadata = json.loads(checked(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)]))
        (dest / 'metadata.json').write_text(json.dumps(metadata, indent=2))
        streams = metadata.get('streams', [])
        vids = [s for s in streams if s.get('codec_type') == 'video' and not s.get('disposition', {}).get('attached_pic')]
        auds = [s for s in streams if s.get('codec_type') == 'audio']
        if not vids:
            raise RuntimeError('No video stream')
        stream = vids[0]
        duration = number(stream.get('duration')) or number(metadata.get('format', {}).get('duration'))
        if not duration or duration <= 0:
            raise RuntimeError('No finite positive video duration')
        rate = stream.get('avg_frame_rate') or stream.get('r_frame_rate', '0/1')
        try:
            fps = float(Fraction(rate))
        except (ValueError, ZeroDivisionError):
            fps = 0
        report['media'] = {'width': stream.get('width'), 'height': stream.get('height'),
                           'fps': fps, 'duration_seconds': duration,
                           'video_codec': stream.get('codec_name'), 'pixel_format': stream.get('pix_fmt'),
                           'audio_streams': len(auds), 'file_bytes': video.stat().st_size}
        for field, expected in [('width', args.width), ('height', args.height)]:
            if stream.get(field) != expected:
                report['errors'].append(f'{field}: expected {expected}, got {stream.get(field)}')
        if abs(fps - args.fps) > .01:
            report['errors'].append(f'Frame rate: expected {args.fps}, got {fps}')
        if args.duration is not None and abs(duration - args.duration) > max(.06, 1 / args.fps):
            report['errors'].append(f'Duration: expected {args.duration}, got {duration}')
        if args.require_audio and not auds:
            report['errors'].append('Required audio stream is missing')
        for audio in auds:
            audio_duration = number(audio.get('duration'))
            if audio_duration is not None and abs(audio_duration - duration) > .15:
                report['errors'].append('Audio and video endings differ by more than 0.15 seconds')
        if stream.get('codec_name') != 'h264' or stream.get('pix_fmt') != 'yuv420p':
            report['warnings'].append('Export is not the usual H.264/yuv420p delivery format')
        if stream.get('sample_aspect_ratio') not in [None, '1:1']:
            report['warnings'].append('Video pixels are not explicitly square')
        command = ['ffmpeg', '-nostdin', '-hide_banner', '-xerror', '-i', str(video), '-map', f'0:{stream["index"]}']
        if auds:
            command += ['-map', f'0:{auds[0]["index"]}', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json']
        command += ['-f', 'null', '-']
        decoded = run(command, timeout=300)
        (dest / 'decode.log').write_text(decoded.stderr)
        report['full_decode'] = 'passed' if decoded.returncode == 0 else 'failed'
        if decoded.returncode:
            report['errors'].append('Full media decode failed; inspect decode.log')
        matches = re.findall(r'\{\s*"input_i".*?\}', decoded.stderr, re.S)
        if matches:
            loudness = json.loads(matches[-1])
            report['audio'] = {key: number(loudness[key]) for key in ['input_i', 'input_tp', 'input_lra']}
            if report['audio']['input_i'] is None:
                report['warnings'].append('Audio loudness is not finite; check for silence')
            peak = report['audio']['input_tp']
            if peak is not None and peak >= 0:
                report['warnings'].append('Encoded audio reaches or exceeds 0 dBTP')
        frames = dest / 'frames'
        frames.mkdir(exist_ok=True)
        report['frames'] = []
        end = max(0, duration - max(.1, 1 / max(fps, 1)))
        start = min(.1, end)
        for i in range(args.samples):
            timestamp = start + (end - start) * i / (args.samples - 1)
            path = frames / f'frame-{i:02d}.jpg'
            checked(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(timestamp), '-i', str(video),
                     '-map', f'0:{stream["index"]}', '-vf', 'scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2',
                     '-frames:v', '1', '-update', '1', str(path)])
            if not path.is_file() or not path.stat().st_size:
                raise RuntimeError(f'Frame extraction failed at {timestamp:.3f}s')
            report['frames'].append({'seconds': round(timestamp, 3), 'path': str(path)})
        columns = min(4, args.samples)
        rows = math.ceil(args.samples / columns)
        sheet = dest / 'contact-sheet.jpg'
        checked(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-framerate', '1', '-i', str(frames / 'frame-%02d.jpg'),
                 '-vf', f'trim=end_frame={args.samples},tile={columns}x{rows}:nb_frames={args.samples}', '-frames:v', '1', '-update', '1', str(sheet)])
        report['contact_sheet'] = str(sheet)
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError) as exc:
        report['errors'].append(str(exc))
    report['technical_status'] = 'passed' if not report['errors'] else 'failed'
    (dest / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False))
    print(json.dumps({'status': report['technical_status'], 'report': str(dest / 'report.json'),
                      'errors': report['errors'], 'warnings': report['warnings']}))
    return 0 if not report['errors'] else 1


if __name__ == '__main__':
    sys.exit(main())
