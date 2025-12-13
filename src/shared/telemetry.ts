import type { QualityPresetId } from "./qualityPresets";

export type TelemetrySnapshot = {
  fps: number;
  speedKph: number;
  lapTimeSeconds: number;
  bestLapSeconds: number | null;
  laps: number;
  quality: QualityPresetId;
  renderer: "webgpu" | "webgl2";
  input: { throttle: number; brake: number; steer: number; handbrake: number };
  focus: { hasDocumentFocus: boolean; activeElementTag: string };
};
