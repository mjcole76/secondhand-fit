# ElevenLabs script: 10 clips

Generate each block below as its own clip and download it as MP3, named `01.mp3` to `10.mp3`. The
time is where the clip starts in `secondhand-fit-demo.mp4`; it is for reference only, not for reading
aloud.

---

**01 (0:00)**

This is what a resale listing photo really looks like. A crumpled T-shirt on a checked duvet, half in shadow. Send that to a virtual try-on, and you waste API units on a render nobody can trust.

**02 (0:11)**

Secondhand Fit catches it first. Four checks run right in the seller's browser: framing, background, flatness, and shadow. This photo fails three. Instead of a vague error, the seller gets three clear fixes: use a plain surface, smooth out the creases, and even out the light. Zero API units spent.

**03 (0:36)**

Here's the retake. Every check passes, and it earns an A. Then the server prepares the image for try-on. It straightens it, strips the metadata, crops to the garment, flattens the background, and sizes it to the YouCam API's input limits. The seller sees exactly what changed.

**04 (0:56)**

Categories that shouldn't go through try-on, like swimwear, are refused before a photo is even requested.

**05 (1:01)**

Every listing shows a grade for its source photo. The grade comes from the weakest check, so one bad result can never be averaged away.

**06 (1:16)**

Now the buyer's side. Before any photo leaves their device, buyers see in plain language what's uploaded, where it goes, and when it's deleted. The server refuses any try-on without that consent.

**07 (1:37)**

Now we add a photo and create a preview. The server calls the Perfect Corp YouCam Apparel Virtual Try-On API. It uploads the garment and the photo, creates the task, and checks on it with a hard time limit. Every step you see on screen is a real step on the server, not a progress bar on a timer.

**08 (2:06)**

And here's the result. Every render says exactly what it is: an AI-generated preview only, with no claim about fit, size, condition, or authenticity. It also shows how good the seller's photo was. That label is built into the image, so it stays on every download and saved item.

**09 (2:21)**

Sellers shoot on their phones, so the whole flow works in a mobile browser too.

**10 (2:27)**

A unit budget that fails safely. An offline mode, so anyone can run it from the repo. And honesty on every render. Secondhand Fit: try-on for the listings that need it most.
