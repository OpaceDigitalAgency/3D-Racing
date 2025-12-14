import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { isMobileDevice } from "../shared/qualityPresets";

export type CreatedEngine = { engine: AbstractEngine; renderer: "webgpu" | "webgl2" };

export async function createEngine(canvas: HTMLCanvasElement): Promise<CreatedEngine> {
  const isMobile = isMobileDevice();

  const webgpuSupported = await WebGPUEngine.IsSupportedAsync;
  if (webgpuSupported) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: !isMobile // Disable on mobile to save memory
      });
      await engine.initAsync();
      return { engine, renderer: "webgpu" };
    } catch (e) {
      console.warn("WebGPU init failed; falling back to WebGL2.", e);
    }
  }

  // Mobile-optimised WebGL context attributes
  const contextAttributes = isMobile ? {
    alpha: false,
    antialias: false, // Use FXAA post-processing instead
    powerPreference: "high-performance" as WebGLPowerPreference,
    preserveDrawingBuffer: false,
    stencil: false, // Disable stencil buffer on mobile to save memory
    disableWebGL2Support: false
  } : {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  };

  // Match WebGPU's crispness on high-DPI displays by adapting to device ratio.
  const engine = new Engine(
    canvas,
    true,
    contextAttributes,
    !isMobile // Only adapt to device ratio on desktop
  );

  // Mobile-specific memory optimizations
  if (isMobile) {
    engine.enableOfflineSupport = false; // Reduce memory overhead
    engine.doNotHandleContextLost = true; // Let browser handle context loss
  }

  return { engine, renderer: "webgl2" };
}
