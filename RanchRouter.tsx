import RanchIndex from "./RanchIndex";
import PrismAtomPreview from "./components/prism-atom/PrismAtomPreview";
import TempleChimePreview from "./components/temple-chime/TempleChimePreview";
import HoloCardPreview from "./components/holo-card/HoloCardPreview";

export default function RanchRouter() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const slug = pathname.replace(/^\/ranch\/?/, "");

  if (slug === "") {
    return <RanchIndex />;
  }

  if (slug === "prism-atom") {
    return <PrismAtomPreview />;
  }

  if (slug === "temple-chime") {
    return <TempleChimePreview />;
  }

  if (slug === "holo-card") {
    return <HoloCardPreview />;
  }

  // Not found
  return (
    <div className="flex flex-col items-center justify-center min-h-screen font-sans text-slate-500 bg-gray-50 dark:bg-black">
      <h2 className="text-2xl font-bold mb-4">404 - Not Found</h2>
      <p className="mb-6">Experiment "{slug}" was not found in Ranch.</p>
      <a href="/ranch" className="text-blue-600 hover:underline">
        Return to Ranch
      </a>
    </div>
  );
}
