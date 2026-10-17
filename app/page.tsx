import Link from "next/link";
import { DemoShowcase } from "@/components/DemoShowcase";
import { servingState } from "@/lib/tryon/guard";
import { SERVING_MODES } from "@/lib/tryon/contracts";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const serving = servingState(null);
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> A second look at secondhand</p>
          <h1>Found a piece?<br /><span>Picture it on you.</span></h1>
          <p className="hero-lede">Give a resale find a closer look. Check the seller’s photo, create a personal try-on preview, and save the pieces you want to revisit.</p>
          <div className="hero-actions">
            <Link className="button-link" href="/try">Create a preview <span aria-hidden="true">↗</span></Link>
            <Link className="button-link secondary" href="/listings">Browse listings</Link>
          </div>
          <p className="hero-credit">Try-on powered by <strong>Perfect Corp. YouCam</strong></p>
          <div className="hero-note"><span>FOR SELLERS</span><p>A better listing starts with a clearer photo.</p><Link href="/sell/new">Check your garment photo →</Link></div>
        </div>
        <DemoShowcase />
      </section>
      <section className="workflow-section" aria-labelledby="workflow-heading">
        <div className="section-heading"><div><p className="eyebrow">From a photo to a possibility</p><h2 id="workflow-heading">A little less guesswork.</h2></div><Link href="/methods">How the photo checks work ↗</Link></div>
        <div className="workflow-grid">
          <article><span className="step-number">01</span><h3>Start with the piece</h3><p>Upload a garment photo or open a listing. Sellers get specific retake guidance before any API units are used.</p></article>
          <article><span className="step-number">02</span><h3>See a new possibility</h3><p>Choose your photo after consent. YouCam creates an appearance preview with clear progress and a bounded wait.</p></article>
          <article><span className="step-number">03</span><h3>Keep your shortlist</h3><p>Compare your original photo, save the preview, or download a labelled copy to revisit later.</p></article>
        </div>
      </section>
      <div className="system-strip"><span className="status-dot" /><span>Current mode: {SERVING_MODES[serving.mode].label}</span><Link href="/status">Service details ↗</Link></div>
    </>
  );
}
