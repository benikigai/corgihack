# Production mechanics

Use current Monid instructions and schemas. This records workflow lessons, not permanent API contracts.

## Monid runs

Discover focused needs such as “image to video”, “music generation”, “sound effects”, or “text to speech”. Kling and ElevenLabs worked in the reference; Seedance was another catalog option. Reinspect availability, schema, price, health, retention, and duration options for each task.

- Check balance when planning paid calls and stay within the user's scope and budget. Ordinary authorized generation does not need repeated approval.
- Start with a few purposeful shots and one track; add variants only for a clear reason.
- Save request JSON before submitting and the returned run ID immediately.
- If submission times out or the response is lost, mark it unresolved and reconcile run history before retrying. A paid job may already exist.
- Submit independent shots, then poll while doing useful editing work.
- Follow Monid's handling of terminal failures, budget blocks, and non-stoppable runs. Do not keep retrying a blocked run.
- Distinguish creative defects from API failures. Reassess the cause and budget before repeated paid replacements.
- Use JSON files or subprocess argument arrays; never interpolate prompts or signed URLs into shell code.

Audio may complete immediately while video returns asynchronously. Check actual status. Avoid short process timeouts that leave paid submissions unresolved.

Inspect CLI help: the reference CLI's runs-get command lacked the run command's output-file flag. Saving returned JSON directly was necessary.

## File transfer

When an endpoint needs a public HTTPS URL:
1. Inspect SFS /put and /cat.
2. Sign an upload with the exact byte count and a unique project path.
3. PUT file bytes to the returned upload URL.
4. Mint a short-lived share URL and pass it to generation.
5. Download completed outputs into the project before retention expires.
6. Optionally remove only this job's temporary SFS inputs after downloads succeed; retain local assets.

Signed URLs are not permanent project assets. Avoid printing credentials or signed URLs unnecessarily. Retrieve generation outputs normally; do not download media to bypass display restrictions.

Inspect actual output fields. Depending on provider/version, audio can use audio.download_link or an inline base64 fallback; video can use outputs[].url.

Keep TLS verification enabled. If Python lacks OS certificates, use verified curl or an available trusted CA bundle, never disable verification.

## Assembly

Store assets, requests/results, work files, the editable script/timeline, and final outputs in the project. Do not depend on a previous chat's absolute paths.

Probe source dimensions, duration, fps, and streams. “1080p” did not guarantee 1080×1920: the reference clips were 1080×1916 at 24 fps.

A typical normalization chain:

```text
fps=30,
scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,
crop=1080:1920,
setsar=1
```

Choose crop or padding based on the subject. Normalize all concatenation branches; trim and reset timestamps. Reapply fps after speed changes, and verify duration/frame count.

ASS/libass can provide editable typography, timed entrances, and simple vector accents. Check installed fonts and their actual rendered appearance. FFmpeg can handle video compositing and frame extraction.

A beat is 60/BPM seconds, but actual generation can drift. Listen or measure before claiming synchronization. Half-second cuts worked for the actual approximately 120 BPM reference track.

If motion invades copy, change framing, typography, or timing. Slowing an earlier clean portion can avoid regenerating a shot.

## Audio and export

Trim actual returned audio to the edit. Keep effects below music unless the effect is the intentional hook. Use an instrumental when copy should lead; voiceover requires its own timing/captions.

Around −14 LUFS with true-peak headroom is a working target, not a platform rule. Measure encoded AAC; encoding can change peaks. Export H.264/yuv420p, AAC stereo when wanted, and fast start. Check aligned stream endings, unintended silence/black frames, and the final musical tail.

## Review and cost

Run the bundled check_reel.py against the agreed format. Open its contact sheet; add targeted frames where cuts or movement need closer inspection. Uniform samples cannot prove every frame is clean. A script pass is not visual or listening review.

Cost fields vary: cost.value can be USD; billing data can explicitly use MICRO_DOLLAR. Convert by the actual unit/currency and sum paid jobs. Distinguish billed cost, held funds, and estimates. Do not infer cost from balance changes that may include other activity. Report Monid cost separately from built-in image generation.
