import PrismAtom from "./components/prism-atom/PrismAtom";
import TempleChime from "./components/temple-chime/TempleChime";
import HoloCard from "./components/holo-card/HoloCard";
import RanchNavigation from "./RanchNavigation";

export default function RanchIndex() {
  return (
    <main className="min-h-screen bg-black p-6 font-sans text-slate-100 md:p-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">
              Ranch
            </h1>
            <p className="text-slate-400">
              A collection of handcrafted components and experiments.
            </p>
          </div>
          <RanchNavigation />
        </header>

        <section aria-label="Ranch experiments" className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          <a href="/ranch/prism-atom" className="group flex flex-col gap-3 outline-none">
            <article className="overflow-hidden">
              <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-sm transition-all duration-300 group-hover:border-white/20 group-hover:shadow-md">
                <PrismAtom
                  aria-hidden="true"
                  rings={3}
                  orbitSpeed={0.9}
                  precession={0.06}
                  ringWidth={0.3}
                  aberration={0.012}
                  glow={1}
                  nucleus={1}
                  flare={0.55}
                  className="absolute inset-0 h-full w-full"
                />
              </div>
              <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-400">
                <span className="font-medium text-white group-hover:underline">
                  Prism Atom
                </span>
                <span>Jul 15, 2026</span>
              </div>
            </article>
          </a>

          <a href="/ranch/temple-chime" className="group flex flex-col gap-3 outline-none">
            <article className="overflow-hidden">
              <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-sm transition-all duration-300 group-hover:border-white/20 group-hover:shadow-md">
                <TempleChime
                  scale={0.9}
                  lengthScale={0.75}
                  coverage={0.85}
                  roofSpan={0.45}
                  mouseRadius={80}
                  muted
                  className="absolute inset-0 h-full w-full"
                />
              </div>
              <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-400">
                <span className="font-medium text-white group-hover:underline">
                  Temple Chime
                </span>
                <span>Jul 17, 2026</span>
              </div>
            </article>
          </a>

          <a href="/ranch/holo-card" className="group flex flex-col gap-3 outline-none">
            <article className="overflow-hidden">
              <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-sm transition-all duration-300 group-hover:border-white/20 group-hover:shadow-md">
                <HoloCard idle className="h-[86%]" />
              </div>
              <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-400">
                <span className="font-medium text-white group-hover:underline">
                  Holo Card
                </span>
                <span>Jul 19, 2026</span>
              </div>
            </article>
          </a>
        </section>
      </div>
    </main>
  );
}
