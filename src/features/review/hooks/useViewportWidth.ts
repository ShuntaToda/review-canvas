import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

const viewportWidth = () => window.innerWidth;

/** 窓の幅（px）。窓の大きさが変わると読み直す */
export const useViewportWidth = (): number =>
  useSyncExternalStore(subscribe, viewportWidth);
