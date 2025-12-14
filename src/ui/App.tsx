import React, { useEffect, useMemo, useState } from "react";
import type { GameAPI } from "../game/Game";
import { QUALITY_PRESETS, type QualityPresetId } from "../shared/qualityPresets";
import { CAMERA_VIEWS, TOUCH_CONTROL_MODES, type CameraViewId, type TelemetrySnapshot, type TouchControlMode } from "../shared/telemetry";
import { TouchOverlay } from "./TouchOverlay";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function dialDeg(value: number, min: number, max: number) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return -130 + t * 260;
}

export function App({ game }: { game: GameAPI }) {
  const [t, setT] = useState<TelemetrySnapshot>(() => game.getTelemetry());
  const [quality, setQuality] = useState<QualityPresetId>(t.quality);
  const [cameraView, setCameraView] = useState<CameraViewId>(t.cameraView);
  const [touchMode, setTouchMode] = useState<TouchControlMode>(t.touchControlMode);
  const [sensitivity, setSensitivity] = useState<number>(t.steeringSensitivity);
  const [zoom, setZoom] = useState<number>(t.zoomLevel);
  // On mobile, panel is collapsed by default for better gameplay experience
  const [panelExpanded, setPanelExpanded] = useState<boolean>(!t.isMobile);

  const presets = useMemo(() => QUALITY_PRESETS, []);
  const isMobile = t.isMobile;
  const speedKph = Math.round(t.speedKph);
  const speedNeedleDeg = dialDeg(speedKph, 0, 260);
  const throttlePct = Math.round(clamp(t.input.throttle, 0, 1) * 100);
  const brakePct = Math.round(clamp(t.input.brake, 0, 1) * 100);
  const driveNeedleDeg = dialDeg(throttlePct, 0, 100);
  const speedDialStyle = { ["--needle-deg" as any]: `${speedNeedleDeg}deg` } as React.CSSProperties;
  const driveDialStyle = { ["--needle-deg" as any]: `${driveNeedleDeg}deg` } as React.CSSProperties;

  const blurAndRefocusCanvas = (el: HTMLElement | null) => {
    el?.blur?.();
    const canvas = document.querySelector("#root canvas") as HTMLCanvasElement | null;
    canvas?.focus?.();
  };

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

  // Mobile compact UI - just show minimal HUD
  if (isMobile && !panelExpanded) {
    return (
      <>
        <TouchOverlay mode={touchMode} visible={true} />
        {/* Minimal mobile HUD */}
        <div className="mobile-hud">
          <div className="mobile-hud__speed">{Math.round(t.speedKph)} <span>km/h</span></div>
          <div className="mobile-hud__lap">
            <span>LAP</span> {fmtTime(t.lapTimeSeconds)}
          </div>
          {t.bestLapSeconds != null && (
            <div className="mobile-hud__best">
              <span>BEST</span> {fmtTime(t.bestLapSeconds)}
            </div>
          )}
        </div>
        {/* Settings button to expand panel */}
        <button
          className="mobile-settings-btn"
          onClick={() => setPanelExpanded(true)}
          aria-label="Open settings"
        >
          ⚙️
        </button>
        {/* Reset button for mobile */}
        <button
          className="mobile-reset-btn"
          onClick={() => game.reset()}
          aria-label="Reset car"
        >
          ↻
        </button>
      </>
    );
  }

  return (
    <>
      <TouchOverlay mode={touchMode} visible={isMobile || touchMode !== "off"} />
      <div className={`ui ui--cockpit ${isMobile ? "ui--mobile" : ""}`}>
        <div className="ui__header">
          <h1>Opace Racer</h1>
          {isMobile && (
            <button
              className="ui__close-btn"
              onClick={() => setPanelExpanded(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          )}
        </div>

        <div className="cockpit__cluster" aria-label="Diagnostics cockpit">
          <div className="dial dial--speed" style={speedDialStyle} aria-label={`Speed ${speedKph} km/h`}>
            <div className="dial__needle" />
            <div className="dial__cap" />
            <div className="dial__readout">
              <div className="dial__value">{speedKph}</div>
              <div className="dial__unit">km/h</div>
            </div>
            <div className="dial__label">SPEED</div>
          </div>

          <div className="dial dial--drive" style={driveDialStyle} aria-label={`Throttle ${throttlePct}%`}>
            <div className="dial__needle dial__needle--accent" />
            <div className="dial__cap" />
            <div className="dial__readout">
              <div className="dial__value">
                {throttlePct}<span className="dial__subunit">%</span>
              </div>
              <div className="dial__unit">THROTTLE</div>
            </div>
            <div className="dial__label">BRAKE {brakePct}%</div>
          </div>

          <div className="mfd" role="group" aria-label="Telemetry display">
            <div className="mfd__title">TELEMETRY</div>
            <div className="mfd__grid">
              <div className="mfd__row">
                <span>LAP</span>
                <span>{fmtTime(t.lapTimeSeconds)}</span>
              </div>
              <div className="mfd__row">
                <span>BEST</span>
                <span>{t.bestLapSeconds == null ? "—" : fmtTime(t.bestLapSeconds)}</span>
              </div>
              <div className="mfd__row">
                <span>LAPS</span>
                <span>{t.laps}</span>
              </div>
              {!isMobile && (
                <>
                  <div className="mfd__row">
                    <span>FPS</span>
                    <span>{t.fps}</span>
                  </div>
                  <div className="mfd__row">
                    <span>GPU</span>
                    <span>{t.renderer.toUpperCase()}</span>
                  </div>
                  <div className="mfd__row mfd__row--mono">
                    <span>IN</span>
                    <span>
                      T{t.input.throttle.toFixed(1)} B{t.input.brake.toFixed(1)} S{t.input.steer.toFixed(1)} H{t.input.handbrake.toFixed(1)}
                    </span>
                  </div>
                  <div className="mfd__row mfd__row--mono">
                    <span>FOCUS</span>
                    <span>{t.focus.hasDocumentFocus ? "yes" : "no"} / {t.focus.activeElementTag}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      <div className="controls">
        <label>
          Quality
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value as QualityPresetId);
              blurAndRefocusCanvas(e.currentTarget);
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Camera
          <select
            value={cameraView}
            onChange={(e) => {
              setCameraView(e.target.value as CameraViewId);
              blurAndRefocusCanvas(e.currentTarget);
            }}
          >
            {CAMERA_VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => game.reset()}>Reset (R)</button>
      </div>

      {/* Touch controls section - more prominent on mobile */}
      {isMobile && (
        <div className="controls">
          <label>
            Touch Controls
            <select
              value={touchMode}
              onChange={(e) => {
                setTouchMode(e.target.value as TouchControlMode);
                blurAndRefocusCanvas(e.currentTarget);
              }}
            >
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
        </div>
      )}

      {/* Desktop-only controls */}
      {!isMobile && (
        <div className="controls">
          <label>
            Touch Controls
            <select
              value={touchMode}
              onChange={(e) => {
                setTouchMode(e.target.value as TouchControlMode);
                blurAndRefocusCanvas(e.currentTarget);
              }}
            >
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
      )}

      {/* Hints - different for mobile vs desktop */}
      <div className="hint cockpit__hint">
        {!isMobile && (
          <>
            <div>
              <b>Keyboard:</b> <kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> or Arrows, <kbd>Space</kbd> handbrake, <kbd>R</kbd> reset, <kbd>C</kbd> camera
            </div>
            <div style={{ marginTop: 4 }}>
              <b>Zoom:</b> Mouse wheel to zoom in/out (see whole track at min zoom)
            </div>
          </>
        )}
        {isMobile && (
          <div>
            <b>Touch:</b> {touchMode === "zones" ? "Tap left/right to steer, top/bottom for throttle/brake" :
              touchMode === "dpad" ? "Use virtual D-pad (left) and buttons (right)" : "Touch controls disabled"}
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          {isMobile
            ? "Tip: Lower sensitivity for smoother steering."
            : "Tip: Lower sensitivity for smoother steering. WebGPU + High/Ultra looks best."}
        </div>
      </div>
      </div>
    </>
  );
}
