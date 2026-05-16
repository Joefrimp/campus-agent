/**
 * Mesh gradient backdrop.
 *
 * Six layered radial gradients with hand-tuned hues blend into the
 * dark navy base. CSS-only; ~3kb shipped. Layers drift slowly via
 * the existing animate-drift-slow / animate-drift-fast keyframes so
 * the colors feel alive without being distracting.
 */
export function MeshGradient() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        background:
          'radial-gradient(at 18% 22%, hsla(225, 95%, 55%, 0.45) 0px, transparent 55%),' +
          'radial-gradient(at 82% 18%, hsla(280, 85%, 55%, 0.35) 0px, transparent 50%),' +
          'radial-gradient(at 12% 78%, hsla(195, 90%, 50%, 0.30) 0px, transparent 50%),' +
          'radial-gradient(at 88% 84%, hsla(320, 80%, 55%, 0.30) 0px, transparent 50%),' +
          'radial-gradient(at 50% 50%, hsla(240, 70%, 35%, 0.25) 0px, transparent 60%),' +
          '#070d1a',
      }}
    >
      {/* drifting accent orbs for subtle motion */}
      <div className="absolute top-[15%] left-[10%] h-[420px] w-[520px] bg-fuchsia-500/15 blur-[140px] rounded-full animate-drift-slow" />
      <div className="absolute top-[55%] right-[8%] h-[380px] w-[480px] bg-cyan-400/10 blur-[130px] rounded-full animate-drift-fast" />
      <div className="absolute bottom-[10%] left-[35%] h-[360px] w-[460px] bg-violet-500/15 blur-[130px] rounded-full animate-drift-slow" />
      {/* faint grain via SVG noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  )
}
