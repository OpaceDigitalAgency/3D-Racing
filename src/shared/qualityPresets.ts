export type QualityPresetId = "low" | "medium" | "high" | "ultra";

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
 * Returns a conservative default for better initial performance
 */
export function detectOptimalQuality(): QualityPresetId {
  // Check if running in production (Netlify)
  const isProduction = import.meta.env.PROD;

  // Get GPU info if available
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  if (!gl) {
    return 'low'; // No WebGL support
  }

  // Check for mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    return 'low';
  }

  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 2;

  // Check device memory if available
  const memory = (navigator as any).deviceMemory || 4; // GB

  // Conservative defaults for production
  if (isProduction) {
    // Low-end: < 4 cores or < 4GB RAM
    if (cores < 4 || memory < 4) {
      return 'low';
    }
    // Mid-range: 4-8 cores and 4-8GB RAM
    if (cores <= 8 || memory <= 8) {
      return 'medium';
    }
    // High-end: > 8 cores and > 8GB RAM
    return 'high'; // Never default to ultra in production
  }

  // Development mode - can use higher settings
  return 'high';
}
