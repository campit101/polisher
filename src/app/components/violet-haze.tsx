"use client";

// Violet haze (Cam, 17 Oct): three soft violet glows drifting behind the front page's hero.
// CSS transforms only (globals.css); this script only pauses them while the tab is hidden.
import { useEffect, useRef } from "react";

export function VioletHaze() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const updateVisibility = () => {
      layer.dataset.paused = String(document.hidden);
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return (
    <div ref={layerRef} className="polisher-violet-haze" aria-hidden="true">
      <span className="polisher-violet-haze__a" />
      <span className="polisher-violet-haze__b" />
      <span className="polisher-violet-haze__c" />
    </div>
  );
}
