# Selected Concept — Secondhand Fit [AI Analysis, selected by the builder]

> Try-on for resale listings, where the only photo is a wrinkled flat-lay on someone's bedroom floor.

## Problem
Resale is the fastest-growing part of apparel commerce and the hardest to shop: every item is unique, non-returnable in practice, and photographed as a flat-lay on a bed or hanging on a door. Buyers cannot picture it on themselves, so they either skip the item or buy and resell again. Sellers have no studio and no model, and marketplace try-on tools assume clean e-commerce product imagery that resale listings never have.

## Target User
Buyers on peer-to-peer resale marketplaces, and the individual sellers listing one-of-one items with phone photos.

## Solution
Secondhand Fit is a listing-side and buyer-side layer for resale. On the seller side, a guided capture flow turns a phone flat-lay into a VTO-ready garment image: the app checks flatness, background separation and garment framing, auto-crops, and reports a 'try-on readiness' grade with specific retake instructions before the listing goes live. On the buyer side, one consented selfie renders the item through YouCam Apparel VTO, with a readiness badge that tells the buyer how much to trust the render given the source photo quality. Every render carries a preview-only label and a hard exclusion on fit, sizing and condition claims.

## Core Workflow
Seller uploads phone photo → readiness checks (flatness, background, framing, occlusion) with concrete retake prompts → accepted image normalised and stored with a readiness grade → listing publishes with a 'try-on ready' badge → buyer taps try-on, consents, uploads a selfie → server calls YouCam Apparel VTO with the normalised garment and the buyer photo → render returns with the readiness badge and honest label → buyer saves the render to their watchlist; seller sees how many try-ons their listing generated.

## Contest Technology
**YouCam Apparel Virtual Try-On as the render engine, with the pre-processing pipeline built specifically to satisfy its input constraints.** — The whole product exists because resale imagery fails the try-on endpoint's assumptions. The VTO endpoint is the payoff, and the readiness pipeline is engineered backwards from its documented input requirements — the integration is not a call, it is the design constraint for the entire seller flow.

## Key Features
- Seller readiness checker: flatness, background separation, framing and occlusion checks with specific retake instructions, not a generic 'bad photo' error
- Try-on readiness grade published on the listing and attached to every render as a trust badge
- Local normalisation (background suppression, crop to garment, orientation) before any API call, so units are never spent on an image that will fail
- Buyer flow: consent, selfie, single render with progress state and honest preview-only labelling
- Blocked categories (intimates, swim) and an explicit refusal to make fit, size or condition claims
- Render caching per garment+buyer pair and a per-user fair-use cap
- Seller insights: try-on count and readiness grade history, with small-sample suppression on any rate
- Labelled demo listing set with a precomputed run when the unit cap is reached

## Demo Moment
A genuinely bad flat-lay — crumpled, on a duvet, half in shadow — gets rejected with three specific retake instructions; the retake passes with a B grade; then the buyer's selfie comes back wearing it. The before/after of the input photo is as compelling as the render.

## Technical Challenge
Reverse-engineering a robust readiness heuristic from the VTO endpoint's real behaviour: running deliberately degraded inputs through the API, recording which fail or return the original clothing, and turning those observations into local checks that predict failure before spending a unit. That empirical calibration is the non-trivial engineering and makes a strong write-up.

## Risks
- Background suppression on messy photos is genuinely hard; may need a conservative approach plus honest grading rather than perfect cutouts
- The VTO endpoint may still return the original garment on difficult inputs — must be detected and reported, not hidden
- Calibrating readiness thresholds consumes API units; budget a calibration phase early
- Needs a small set of legitimately owned or openly licensed second-hand garment photos for the demo

## Differentiation
Analyzed projects all assume professional catalogue imagery. Secondhand Fit takes the position that in the fastest-growing part of apparel commerce that assumption is false, and makes the pre-flight readiness grade — plus an honest trust badge on the render — the headline of the product rather than the render itself.

## Buildability
Fits your build preferences

- ✅ Can be built as a web application: Web app
- ✅ Hardware needed: No hardware
- ✅ Proprietary data required: Works with sample data
- ✅ Expensive external APIs: Within budget
- ✅ Specialized infrastructure: Standard hosting
- ✅ Complex mobile requirements: None
- ✅ Heavy machine-learning training: Uses hosted models
- ✅ Real-time requirements: None
- ✅ Integration complexity: Medium
- ✅ Demo complexity: Medium
- ✅ Within maximum complexity: Medium vs max Medium

## Inspired by (patterns only, never copied)
- ConfidFit
- ShadeSpan
- KeepMe
