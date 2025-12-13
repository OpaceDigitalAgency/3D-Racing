import { createRoot } from "react-dom/client";
import React from "react";
import type { GameAPI } from "../game/Game";
import { App } from "./App";

export function mountUI({ game, mountEl }: { game: GameAPI; mountEl: HTMLElement }) {
  const root = createRoot(mountEl);
  root.render(
    <React.StrictMode>
      <App game={game} />
    </React.StrictMode>
  );
}
