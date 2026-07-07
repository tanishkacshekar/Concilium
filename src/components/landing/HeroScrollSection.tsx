import { useRef } from 'react';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const HERO_PIN_VH = 150;
const SCROLL_RANGE_VH = 50;

/**
 * Pinned hero: 150vh tall wrapper, sticky inner 100vh.
 * Scroll progress 0→1 over 50vh drives chaos (messy meeting UI) → clarity (clean dashboard).
 * Opacity, scale, blur, and layout interpolated from progress.
 */
export function HeroScrollSection() {
  const wrapperRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(wrapperRef, {
    scrollRangeVh: SCROLL_RANGE_VH,
    disabled: false,
  });
  const reduceMotion = useReducedMotion();

  // When reduced motion: show clarity state only (no transition)
  const p = reduceMotion ? 1 : progress;

  // Chaos: blur, slight scale down, opacity; Clarity: no blur, scale 1, full opacity
  const chaosOpacity = 1 - p;
  const clarityOpacity = p;
  const chaosScale = 1 - 0.08 * p;
  const chaosBlur = 8 * (1 - p);
  const chaosTranslateY = 12 * (1 - p);

  return (
    <section
      ref={wrapperRef}
      className="relative"
      style={{ height: `${HERO_PIN_VH}vh` }}
      aria-label="Hero"
    >
      <div className="sticky top-0 left-0 w-full h-screen flex flex-col items-center justify-center overflow-hidden bg-background">
        {/* Headline and CTA (above the transformation) */}
        <div className="absolute top-[12%] left-0 right-0 z-10 px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground max-w-4xl mx-auto mb-4">
            Every output derived{' '}
            <span className="text-primary">only from what&apos;s spoken</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Transform your meetings into actionable insights. Automatic transcription,
            task extraction, and productivity tracking—all powered by AI.
          </p>
        </div>

        {/* Transformation viewport: chaos + clarity layers */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="relative w-full max-w-4xl h-[42vh] min-h-[280px] mx-4 flex items-center justify-center"
            aria-hidden
          >
            {/* Chaos: messy meeting UI */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: chaosOpacity,
                transform: `scale(${chaosScale}) translateY(${chaosTranslateY}px)`,
                filter: `blur(${chaosBlur}px)`,
              }}
            >
              <ChaosUI />
            </div>

            {/* Clarity: clean AI dashboard */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: clarityOpacity,
                transform: `scale(${0.92 + 0.08 * p}) translateY(${-8 * (1 - p)}px)`,
              }}
            >
              <ClarityUI />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Messy meeting UI: overlapping windows, rotation, noise (no assets) */
function ChaosUI() {
  return (
    <div className="relative w-full h-full max-w-2xl">
      <div
        className="absolute rounded-xl bg-card border border-border shadow-card p-4 text-sm"
        style={{
          width: '52%',
          top: '5%',
          left: '2%',
          transform: 'rotate(-3deg)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}
      >
        <div className="text-muted-foreground font-medium mb-2">Meeting — 10:32</div>
        <div className="space-y-1 text-muted-foreground/80 text-xs">
          <p>…who’s taking notes?</p>
          <p>— I thought you were</p>
        </div>
      </div>
      <div
        className="absolute rounded-xl bg-muted/80 border border-border p-3 text-sm"
        style={{
          width: '48%',
          top: '28%',
          right: '0%',
          transform: 'rotate(2deg)',
        }}
      >
        <div className="text-muted-foreground font-medium mb-1">Notes ???</div>
        <div className="h-12 rounded bg-background/60 border border-border" />
      </div>
      <div
        className="absolute rounded-xl bg-card border border-border shadow-card p-3"
        style={{
          width: '45%',
          bottom: '8%',
          left: '8%',
          transform: 'rotate(1.5deg)',
        }}
      >
        <div className="text-muted-foreground text-xs">Action items — ???</div>
        <div className="mt-2 h-8 w-3/4 rounded bg-muted/60" />
      </div>
    </div>
  );
}

/** Clean AI dashboard: grid, no rotation, clear structure */
function ClarityUI() {
  return (
    <div className="relative w-full max-w-2xl mx-auto grid grid-cols-3 gap-3 p-4">
      <div className="rounded-xl bg-card border border-border shadow-soft p-4 col-span-2">
        <div className="text-xs font-medium text-primary mb-2">Live transcript</div>
        <div className="h-3 w-full rounded bg-muted/50 mb-2" />
        <div className="h-3 w-4/5 rounded bg-muted/40 mb-2" />
        <div className="h-3 w-3/5 rounded bg-muted/30" />
      </div>
      <div className="rounded-xl bg-card border border-border shadow-soft p-4">
        <div className="text-xs font-medium text-primary mb-2">Tasks</div>
        <div className="space-y-2">
          <div className="h-6 rounded bg-success/10 border border-success/20" />
          <div className="h-6 rounded bg-muted/40" />
        </div>
      </div>
      <div className="rounded-xl bg-card border border-border shadow-soft p-4 col-span-3">
        <div className="text-xs font-medium text-primary mb-2">Summary</div>
        <div className="h-4 w-full rounded bg-muted/30 mb-2" />
        <div className="h-4 w-2/3 rounded bg-muted/20" />
      </div>
    </div>
  );
}
