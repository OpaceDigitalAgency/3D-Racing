import type { QualityPresetId } from "./qualityPresets";

export type CameraViewId = "chase" | "driver" | "hood" | "bumper" | "orbit" | "top";
export type TouchControlMode = "zones" | "dpad" | "off";

export const CAMERA_VIEWS: { id: CameraViewId; label: string }[] = [
  { id: "chase", label: "Chase" },
  { id: "driver", label: "Driver" },
  { id: "hood", label: "Hood" },
  { id: "bumper", label: "Bumper" },
  { id: "orbit", label: "Orbit" },
  { id: "top", label: "Top Down" },
];

export const TOUCH_CONTROL_MODES: { id: TouchControlMode; label: string }[] = [
  { id: "zones", label: "Screen Zones" },
  { id: "dpad", label: "Virtual D-Pad" },
  { id: "off", label: "Off" },
];

export type TelemetrySnapshot = {
  fps: number;
  speedKph: number;
  lapTimeSeconds: number;
  bestLapSeconds: number | null;
  laps: number;
  quality: QualityPresetId;
  renderer: "webgpu" | "webgl2";
  cameraView: CameraViewId;
  touchControlMode: TouchControlMode;
  steeringSensitivity: number;
  zoomLevel: number;
  isMobile: boolean;
  input: { throttle: number; brake: number; steer: number; handbrake: number };
  focus: { hasDocumentFocus: boolean; activeElementTag: string };
};
