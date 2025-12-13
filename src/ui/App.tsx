import React, { useEffect, useMemo, useState } from "react";
import type { GameAPI } from "../game/Game";
import { QUALITY_PRESETS, type QualityPresetId } from "../shared/qualityPresets";
import { CAMERA_VIEWS, TOUCH_CONTROL_MODES, type CameraViewId, type TelemetrySnapshot, type TouchControlMode } from "../shared/telemetry";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}

export function App({ game }: { game: GameAPI }) {
  const [t, setT] = useState<TelemetrySnapshot>(() => game.getTelemetry());
  const [quality, setQuality] = useState<QualityPresetId>(t.quality);
  const [cameraView, setCameraView] = useState<CameraViewId>(t.cameraView);
  const [touchMode, setTouchMode] = useState<TouchControlMode>(t.touchControlMode);
  const [sensitivity, setSensitivity] = useState<number>(t.steeringSensitivity);
  const [zoom, setZoom] = useState<number>(t.zoomLevel);

  const presets = useMemo(() => QUALITY_PRESETS, []);

  useEffect(() => {
    const id = window.setInterval(() => setT(game.getTelemetry()), 66);
    return () => window.clearInterval(id);
  }, [game]);

  useEffect(() => {
    game.setQuality(quality);
  }, [game, quality]);

  useEffect(() => {
    game.setCameraView(cameraView);
  }, [game, cameraView]);

  useEffect(() => {
    game.setTouchControlMode(touchMode);
  }, [game, touchMode]);

  useEffect(() => {
    game.setSteeringSensitivity(sensitivity);
  }, [game, sensitivity]);

  useEffect(() => {
    game.setZoomLevel(zoom);
  }, [game, zoom]);

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
        <label>
          Camera
          <select value={cameraView} onChange={(e) => setCameraView(e.target.value as CameraViewId)}>
            {CAMERA_VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => game.reset()}>Reset (R)</button>
      </div>

      <div className="controls">
        <label>
          Touch Controls
          <select value={touchMode} onChange={(e) => setTouchMode(e.target.value as TouchControlMode)}>
            {TOUCH_CONTROL_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sensitivity: {sensitivity.toFixed(1)}
          <input
            type="range"
            min="0.2"
            max="1.5"
            step="0.1"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label>
          Zoom: {zoom.toFixed(1)}x
          <input
            type="range"
            min="0.15"
            max="1.5"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
      </div>

      <div className="hint">
        <div>
          <b>Keyboard:</b> <kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> or Arrows, <kbd>Space</kbd> handbrake, <kbd>R</kbd> reset, <kbd>C</kbd> camera
        </div>
        <div style={{ marginTop: 4 }}>
          <b>Zoom:</b> Mouse wheel to zoom in/out (see whole track at min zoom)
        </div>
        {t.isMobile && (
          <div style={{ marginTop: 4 }}>
            <b>Touch:</b> {touchMode === "zones" ? "Tap left/right to steer, top/bottom for throttle/brake" :
              touchMode === "dpad" ? "Use virtual D-pad (left) and buttons (right)" : "Touch controls disabled"}
          </div>
        )}
        <div style={{ marginTop: 6 }}>Tip: Lower sensitivity for smoother steering. WebGPU + High/Ultra looks best.</div>
      </div>
    </div>
  );
}
