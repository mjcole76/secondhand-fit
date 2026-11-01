# Answers for the extra Devpost questions

Paste each answer into the matching field. Every statement is based on what happened during the
build.

## If existing, explain what you updated during the submission period

Leave blank. Secondhand Fit is a new build: all of the application code was written during the
Submission Period.

## Text description (features, functionality, consumer or retail value)

Paste the "About the project" section of [`description.md`](description.md).

## URL to your code repository

https://github.com/mjcole76/secondhand-fit

## Was there a moment during the hackathon where the API surprised you?

Both kinds. The good surprise was how forgiving the Apparel Virtual Try-On API is. I ran a real try-on
with a messy mirror selfie, with my phone partly covering my face, and a T-shirt photographed
crumpled on my bed with my feet in the frame. It came back in about 16 seconds looking convincing.
That is also what worried me: the API returns a confident-looking image even when the source photo
is poor, so a buyer cannot tell a good input from a bad one. That moment shaped the product. Every
render now carries the seller photo's grade (that one was a C) and a preview-only label burned into
the image.

The frustrating part was small details I had to discover rather than read: the clothes feature costs
2 units per render, small images need to be at least 512 × 384, a failed task can put its error code
in a different field than I expected, and the unit-cost endpoint wraps its answer in `result` rather
than `data`. I made the adapter read the responses defensively and confirmed the full flow with a
live render on the deployed app.

## Are there industries or use cases you think Perfect Corp.'s API could serve that nobody is talking about yet?

Secondhand and peer-to-peer resale is the obvious one. It is the biggest part of fashion with no
studio photography, and buyers can rarely return a one-of-one item. Beyond that:

- **Charity shops and thrift stores** putting donated stock online, where volunteers photograph
  hundreds of items a day with a phone.
- **Clothing rental and swap platforms**, where the same garment is shown to many people and photo
  quality varies by lender.
- **Live-selling and social commerce**, where sellers list items in seconds and a try-on would need
  a pre-check like ours to avoid wasting units on unusable photos.

In all of these, the API is most valuable paired with an input-quality gate, because the images are
never catalogue-grade.

## Where did you hit a wall technically? How did you work around it?

The main wall was that a try-on API gives no signal about whether its input photo was good enough.
I built four deterministic photo checks that run in the seller's browser before any API call:
framing, background separation, flatness and occlusion/shadow. Flatness has no direct measurement,
so I used edge density as a proxy and learned the background colours from the border of the photo.
Both have known limits, which I document on the app's methods page.

The second wall was cost and honesty under failure. I added a unit ledger and a per-session cap that
fail closed: when either is reached, no API call is made and a stored example is offered, labelled
"Not a live result".

The third was hosting. The prototype keeps consent records and the unit ledger in memory, so a
serverless host could record consent on one instance and receive the try-on on another. I deployed
it as a single always-on Node.js service instead, with the consent check enforced on the server
before every API call.

## Share a link to any social posts about your project

Optional. Leave blank, or paste a link if you post the video on social media.
