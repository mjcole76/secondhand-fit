/**
 * Warm-up on server start.
 *
 * The seeded demo listings are drawn and graded the first time a page asks for them, which takes
 * several seconds on a small hosting CPU. Right after the server starts, it requests its own main
 * pages once, so the first real visitor gets them already built. Failures are ignored: this only
 * affects speed, never behaviour.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const port = process.env.PORT || "3000";
  const base = `http://127.0.0.1:${port}`;
  const paths = ["/", "/listings", "/listings/demo-tee", "/listings/demo-jumper", "/listings/demo-shirt", "/sell/new", "/try?listing=demo-tee", "/methods"];

  setTimeout(async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) break;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    for (const path of paths) {
      try {
        await fetch(base + path);
      } catch {
        // Ignore: a slow first page is the only consequence.
      }
    }
  }, 1000);
}
