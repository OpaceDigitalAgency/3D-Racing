import React from "react";
import type { TouchControlMode } from "../shared/telemetry";

export function TouchOverlay({ mode, visible }: { mode: TouchControlMode; visible: boolean }) {
  if (!visible || mode === "off") return null;

  if (mode === "zones") {
    return (
      <div className="touch-overlay" aria-hidden="true">
        <div className="touch-zones">
          <div className="touch-zone touch-zone--steerL">
            <span>STEER</span>
          </div>
          <div className="touch-zone touch-zone--steerR">
            <span>STEER</span>
          </div>
          <div className="touch-zone touch-zone--throttle">
            <span>THROTTLE</span>
          </div>
          <div className="touch-zone touch-zone--brake">
            <span>BRAKE</span>
          </div>
        </div>
      </div>
    );
  }

  // dpad
  return (
    <div className="touch-overlay" aria-hidden="true">
      <div className="touch-dpad">
        <div className="touch-dpad__ring" />
        <div className="touch-dpad__label">STEER</div>
      </div>
      <div className="touch-buttons">
        <div className="touch-btn touch-btn--throttle">GO</div>
        <div className="touch-btn touch-btn--brake">BRAKE</div>
      </div>
    </div>
  );
}

