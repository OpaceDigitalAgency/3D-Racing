import React, { useEffect, useMemo, useState } from "react";
import type { GameAPI } from "../game/Game";
import { QUALITY_PRESETS, type QualityPresetId } from "../shared/qualityPresets";
import type { TelemetrySnapshot } from "../shared/telemetry";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}

export function App({ game }: { game: GameAPI }) {
  const [t, setT] = useState<TelemetrySnapshot>(() => game.getTelemetry());
  const [quality, setQuality] = useState<QualityPresetId>(t.quality);

  const presets = useMemo(() => QUALITY_PRESETS, []);

  useEffect(() => {
    const id = window.setInterval(() => setT(game.getTelemetry()), 66);
    return () => window.clearInterval(id);
  }, [game]);

  useEffect(() => {
    game.setQuality(quality);
  }, [game, quality]);

  return (
    <div className="ui">
      <h1>APEX//WEB</h1>

      <div className="row">
        <span>
          <b>Renderer</b>
        </span>
        <span>{t.renderer.toUpperCase()}</span>
      </div>
      <div className="row">
        <span>
          <b>FPS</b>
        </span>
        <span>{t.fps}</span>
      </div>
      <div className="row">
        <span>
          <b>Speed</b>
        </span>
        <span>{Math.round(t.speedKph)} km/h</span>
      </div>
      <div className="row">
        <span>
          <b>Input</b>
        </span>
        <span>
          T{t.input.throttle.toFixed(1)} B{t.input.brake.toFixed(1)} S{t.input.steer.toFixed(1)} H{t.input.handbrake.toFixed(1)}
        </span>
      </div>
      <div className="row">
        <span>
          <b>Focus</b>
        </span>
        <span>
          {t.focus.hasDocumentFocus ? "yes" : "no"} / {t.focus.activeElementTag}
        </span>
      </div>
      <div className="row">
        <span>
          <b>Lap</b>
        </span>
        <span>{fmtTime(t.lapTimeSeconds)}</span>
      </div>
      <div className="row">
        <span>
          <b>Best</b>
        </span>
        <span>{t.bestLapSeconds == null ? "—" : fmtTime(t.bestLapSeconds)}</span>
      </div>
      <div className="row">
        <span>
          <b>Laps</b>
        </span>
        <span>{t.laps}</span>
      </div>

      <div className="controls">
        <label>
          Quality
          <select value={quality} onChange={(e) => setQuality(e.target.value as QualityPresetId)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => game.reset()}>Reset (R)</button>
      </div>

      <div className="hint">
        <div>
          Drive: <kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd>, Arrows, <kbd>Space</kbd> handbrake, <kbd>R</kbd> reset
        </div>
        <div style={{ marginTop: 6 }}>Tip: WebGPU + High/Ultra looks best; Medium/Low improves laptops.</div>
      </div>
    </div>
  );
}
