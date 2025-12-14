export type QualityPresetId = "low" | "mobile" | "medium" | "high" | "ultra";

export type QualityPreset = {
  id: QualityPresetId;
  label: string;
  resolutionScale: number;
  shadows: { enabled: boolean; mapSize: number; blurKernel: number };
  post: {
    bloom: boolean;
    fxaa: boolean;
    taa: boolean;
    ssao: boolean;
    ssr: boolean;
    motionBlur: boolean;
  };
};

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  {
    id: "low",
    label: "Low (fast)",
    resolutionScale: 0.75,
    shadows: { enabled: false, mapSize: 512, blurKernel: 0 },
    post: { bloom: false, fxaa: true, taa: false, ssao: false, ssr: false, motionBlur: false }
  },
  {
    id: "mobile",
    label: "Mobile Optimised",
    resolutionScale: 0.65,
    shadows: { enabled: true, mapSize: 512, blurKernel: 8 },
    post: { bloom: true, fxaa: true, taa: false, ssao: false, ssr: true, motionBlur: false }
  },
  {
    id: "medium",
    label: "Medium",
    resolutionScale: 0.85,
    shadows: { enabled: true, mapSize: 1024, blurKernel: 16 },
    post: { bloom: true, fxaa: true, taa: false, ssao: true, ssr: false, motionBlur: false }
  },
  {
    id: "high",
    label: "High",
    resolutionScale: 1.0,
    shadows: { enabled: true, mapSize: 2048, blurKernel: 24 },
    post: { bloom: true, fxaa: true, taa: false, ssao: true, ssr: true, motionBlur: true }
  },
  {
    id: "ultra",
    label: "Ultra",
    resolutionScale: 1.0,
    shadows: { enabled: true, mapSize: 4096, blurKernel: 32 },
    post: { bloom: true, fxaa: false, taa: true, ssao: true, ssr: true, motionBlur: true }
  }
] as const;

/**
 * Detect optimal quality preset based on device capabilities
 * Desktop gets ultra quality, mobile gets optimised mobile preset
 */
export function detectOptimalQuality(): QualityPresetId {
  // Check for mobile devices - use mobile-optimised preset for phones
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    return 'mobile'; // Mobile gets optimised preset with effects but lower resource usage
  }

  // Desktop always gets ultra quality for best visuals
  return 'ultra';
}

/**
 * Check if the current device is mobile
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
