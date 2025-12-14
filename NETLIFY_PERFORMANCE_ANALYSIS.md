# APEX//WEB - Netlify Deployment Performance Analysis

**Generated:** 2025-12-14  
**Project:** 3D Racing Game (APEX//WEB)  
**Repository:** https://github.com/OpaceDigitalAgency/3D-Racing

---

## Executive Summary

This document provides a comprehensive technical analysis of the APEX//WEB 3D racing game deployment on Netlify, addressing performance concerns and potential optimisation opportunities.

---

## 1. Game Engine Configuration

### Engine: **Babylon.js v8.41.1**

**Renderer Strategy:**
- **Primary:** WebGPU (when browser supports it)
- **Fallback:** WebGL2
- **Implementation:** `src/game/createEngine.ts`

```typescript
// WebGPU preferred with graceful fallback
const webgpuSupported = await WebGPUEngine.IsSupportedAsync;
if (webgpuSupported) {
  engine = new WebGPUEngine(canvas, { 
    antialias: true, 
    adaptToDeviceRatio: true 
  });
} else {
  engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  });
}
```

**Key Features:**
- Fixed-timestep simulation (120Hz)
- PBR materials with HDR environment mapping
- Advanced post-processing pipeline
- Dynamic quality presets (Low, Medium, High, Ultra)

---

## 2. Performance Metrics & Monitoring

### Built-in Telemetry System

**Location:** `src/shared/telemetry.ts` & `src/game/Game.ts`

**Tracked Metrics:**
- **FPS (Frames Per Second)** - Real-time frame rate monitoring
- **Speed (km/h)** - Vehicle velocity
- **Renderer Type** - WebGPU or WebGL2
- **Quality Preset** - Current graphics quality setting
- **GPU Utilisation** - Via Babylon.js engine metrics
- **Memory Usage** - Available through browser DevTools
- **Input State** - Throttle, brake, steering values
- **Focus State** - Document focus and active element tracking

**Access Point:**
```javascript
// Available in browser console
window.__apexGame.engine.getFps()
window.__apexGame.scene.getActiveMeshes().length
```

### Recommended DevTools Checks

**When deployed on Netlify:**

1. **Frame Rate Check:**
   - Open DevTools → Performance tab
   - Record 10-15 seconds of gameplay
   - Check FPS counter in top-right of game UI
   - Compare localhost vs. Netlify FPS

2. **GPU Utilisation:**
   - Chrome: `chrome://gpu`
   - Check WebGPU/WebGL2 status
   - Monitor GPU process in Task Manager (Windows) or Activity Monitor (macOS)

3. **Memory Usage:**
   - DevTools → Memory tab
   - Take heap snapshots during gameplay
   - Look for memory leaks (continuously climbing usage)
   - Check for detached DOM nodes

4. **Network Tab Analysis:**
   - Filter by asset type (images, fonts, scripts)
   - Check for failed requests (404s)
   - Verify asset loading times
   - Look for assets loading repeatedly

---

## 3. Netlify Configuration

### Current Build Configuration

**Build Command:** `tsc -p tsconfig.json --noEmit && vite build`  
**Publish Directory:** `dist`  
**Build Tool:** Vite 7.2.7

### Missing Configuration Files

**⚠️ CRITICAL FINDING:** No Netlify-specific configuration detected

**Missing Files:**
- `netlify.toml` - Not present
- `_redirects` - Not present  
- `_headers` - Not present

### Recommended Netlify Configuration

**Create `netlify.toml` in project root:**

```toml
[build]
  command = "npm run build"
  publish = "dist"

# Optimise asset caching
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/env/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/logos/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# Enable compression
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"

# SPA routing fallback
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 4. Asset Loading Analysis

### Current Asset Structure

**Environment Maps:**
- `public/env/environmentSpecular.env` (HDR environment - Babylon .env format)
- **Size:** Typically 2-10MB (prefiltered cube map)
- **Loading:** Synchronous during scene initialisation
- **Caching:** Browser cache only (no service worker)

**Logo Assets:**
- `public/logos/New-Opace-Logo---High-Quality new.png`
- `public/logos/website design agency logo.png`
- `public/logos/Logo - Vector.png`
- `public/logos/transparent logo small.png`
- **Usage:** Track banners and car decals
- **Loading:** Via Babylon.js Texture class

**Procedural Assets:**
- Track geometry (generated at runtime)
- Car mesh (procedurally created)
- Grass field (instanced geometry)
- Water puddles (procedural materials)
- Textures (generated via RawTexture)

### Potential Asset Loading Issues

**⚠️ HIGH PRIORITY:**

1. **Environment Map Loading**
   - Large HDR file loaded synchronously
   - No loading screen or progress indicator
   - Could cause initial freeze on slower connections

2. **Texture Cloning**
   - Skybox clones environment texture: `env.clone()`
   - Potential memory duplication

3. **No Asset Preloading**
   - Assets load on-demand during scene creation
   - No asset manager or loading queue

4. **Missing Compression**
   - PNG logos not optimised
   - No WebP or AVIF variants
   - No KTX2/Basis Universal for textures

---

## 5. Code Differences: Development vs. Production

### Environment Variables

**⚠️ FINDING:** No environment-specific configuration detected

**Current State:**
- No `.env` files
- No `import.meta.env` usage
- No build-time configuration differences
- Same code runs in dev and production

### Debug Mode

**Location:** `src/game/Game.ts` (Line 696)

```typescript
// DevTools inspection hook - ALWAYS ENABLED
(window as any).__apexGame = { engine, scene, sim, track };
```

**⚠️ ISSUE:** Debug hooks exposed in production build

**Impact:**
- Minimal performance impact
- Potential security concern (exposes internal state)
- Should be conditionally enabled

### Logging

**Console Warnings:**
- WebGPU fallback warning (Line 15, `createEngine.ts`)
- Quality change errors (Line 678, `Game.ts`)

**No excessive logging detected** - Good practice maintained

---

## 6. Browser Console Errors & Warnings

### Expected Warnings

1. **WebGPU Fallback** (Non-WebGPU browsers)
   ```
   "WebGPU init failed; falling back to WebGL2."
   ```
   - **Normal behaviour** - graceful degradation

2. **Asset Loading** (Check Network tab)
   - 404 errors for missing assets
   - CORS errors for external resources
   - Slow loading times for large files

### Debugging Checklist

**Run these checks on Netlify deployment:**

```javascript
// 1. Check renderer type
console.log(window.__apexGame.engine.constructor.name);
// Expected: "WebGPUEngine" or "Engine"

// 2. Check FPS
console.log(window.__apexGame.engine.getFps());
// Expected: 60+ on decent hardware

// 3. Check active meshes
console.log(window.__apexGame.scene.getActiveMeshes().length);
// Expected: 50-200 depending on scene complexity

// 4. Check texture count
console.log(window.__apexGame.scene.textures.length);
// Expected: 10-30

// 5. Check material count
console.log(window.__apexGame.scene.materials.length);
// Expected: 15-40
```

---

## 7. Common Performance Issues & Solutions

### Issue 1: Unoptimised Assets Loading Continuously

**Symptoms:**
- High network activity during gameplay
- Assets re-downloading repeatedly
- Increasing memory usage

**Causes:**
- Missing cache headers
- Texture recreation instead of reuse
- No asset disposal

**Current Code Analysis:**

**✅ GOOD:** Textures created once and reused
```typescript
// Track textures created once (Track.ts)
const asphaltTex = createAsphaltTexture(scene, 512);
asphalt.albedoTexture = asphaltTex;
```

**⚠️ CONCERN:** Environment texture cloned
```typescript
// createScene.ts Line 113
skyboxMat.reflectionTexture = env.clone();
```

**Solution:**
- Share texture reference instead of cloning
- Implement asset manager with caching
- Add proper disposal on scene cleanup

### Issue 2: Infinite Rendering Loops

**Symptoms:**
- 100% CPU usage
- Browser tab freezes
- Unresponsive controls

**Current Protection:**

**✅ GOOD:** Fixed timestep prevents runaway simulation
```typescript
// Game.ts Line 634
fixed.step(dt, (step) => {
  tickSim(step);
  updateTelemetry(step);
});
```

**✅ GOOD:** Render loop properly managed
```typescript
// Game.ts Line 645
engine.runRenderLoop(onFrame);
```

**No infinite loop issues detected** in current codebase

### Issue 3: Missing Assets Causing Retry Loops

**Symptoms:**
- Continuous 404 errors
- Network tab shows repeated requests
- Console errors

**Current Risk:**

**⚠️ MEDIUM:** No error handling for asset loading
```typescript
// createScene.ts Line 105 - No error handling
const env = CubeTexture.CreateFromPrefilteredData("/env/environmentSpecular.env", scene);
```

**Solution:**
```typescript
// Add error handling
try {
  const env = CubeTexture.CreateFromPrefilteredData("/env/environmentSpecular.env", scene);
  scene.environmentTexture = env;
} catch (error) {
  console.error("Failed to load environment map:", error);
  // Fallback to solid colour skybox
}
```

### Issue 4: Debug Tools Left Enabled

**Current State:**

**⚠️ FOUND:** Global debug object always exposed
```typescript
// Game.ts Line 696
(window as any).__apexGame = { engine, scene, sim, track };
```

**Impact:** Minimal performance impact, but should be conditional

**Solution:**
```typescript
// Only expose in development
if (import.meta.env.DEV) {
  (window as any).__apexGame = { engine, scene, sim, track };
}
```

### Issue 5: Shader Compilation Repeatedly

**Current State:**

**✅ GOOD:** Babylon.js caches compiled shaders automatically
- No manual shader compilation detected
- Materials created once and reused
- Post-processing pipelines initialised once

**No shader recompilation issues detected**

---

## 8. Quality Presets & Performance Scaling

### Available Quality Levels

**Location:** `src/shared/qualityPresets.ts`

| Preset | Resolution | Shadows | Post-Processing | Target FPS |
|--------|-----------|---------|-----------------|------------|
| **Low** | 0.75x | Disabled | FXAA only | 60+ |
| **Medium** | 0.85x | 1024px | Bloom, FXAA, SSAO | 60 |
| **High** | 1.0x | 2048px | + SSR, Motion Blur | 45-60 |
| **Ultra** | 1.0x | 4096px | + TAA (no FXAA) | 30-60 |

### Default Setting

**⚠️ IMPORTANT:** Game defaults to **Ultra** quality
```typescript
// Game.ts Line 89
let quality: QualityPresetId = "ultra";
```

**Impact on Netlify:**
- Users with lower-end hardware may experience poor performance
- No automatic quality detection
- Requires manual adjustment via UI

**Recommendation:**
- Implement automatic quality detection based on initial FPS
- Default to "High" or "Medium" for broader compatibility
- Provide performance warning if FPS drops below 30

---

## 9. Specific Netlify Deployment Concerns

### Build Process

**Current Build:**
```bash
tsc -p tsconfig.json --noEmit && vite build
```

**✅ GOOD:**
- TypeScript type-checking before build
- Vite optimises and bundles assets
- Tree-shaking removes unused code
- Code splitting for better caching

**Build Output Analysis:**

**Dist Structure:**
```
dist/
├── assets/
│   ├── index-BFNbQoOq.css (hashed)
│   ├── index-BMfNaPfj.js (hashed)
│   └── [shader files].js (hashed)
├── env/
│   └── environmentSpecular.env
├── logos/
│   └── [logo files].png
└── index.html
```

**✅ GOOD:** Asset hashing for cache busting
**⚠️ CONCERN:** Large environment file not optimised

### CDN & Caching

**Current State:**
- Netlify CDN serves all assets
- No custom cache headers configured
- Browser cache only

**Recommendations:**

1. **Add cache headers** (via `netlify.toml`)
2. **Enable Brotli compression** (automatic on Netlify)
3. **Optimise asset sizes:**
   - Compress environment map
   - Convert PNGs to WebP
   - Implement progressive loading

### Edge Functions

**Current Usage:** None

**Potential Use Cases:**
- A/B testing quality presets
- Geo-based asset optimisation
- Analytics collection
- Leaderboard API (future)

---

## 10. Recommended Performance Optimisations

### Immediate Actions (High Priority)

1. **Create `netlify.toml`** with proper cache headers
2. **Add loading screen** during asset initialisation
3. **Implement error handling** for asset loading failures
4. **Conditionalise debug hooks** (dev-only)
5. **Change default quality** to "High" or "Medium"

### Short-term Improvements (Medium Priority)

6. **Optimise environment map** (compress or use lower resolution)
7. **Convert logo PNGs to WebP** with PNG fallbacks
8. **Add service worker** for offline caching
9. **Implement asset preloading** with progress indicator
10. **Add automatic quality detection** based on FPS

### Long-term Enhancements (Low Priority)

11. **Migrate to KTX2/Basis Universal** for textures
12. **Implement LOD system** for distant objects
13. **Add performance monitoring** (analytics)
14. **Implement lazy loading** for non-critical assets
15. **Add WebGPU compute shaders** for advanced effects

---

## 11. Testing Checklist for Netlify Deployment

### Pre-Deployment

- [ ] Run `npm run build` locally
- [ ] Test production build with `npm run preview`
- [ ] Check bundle size (should be < 5MB)
- [ ] Verify all assets in `dist/` folder
- [ ] Test on multiple browsers (Chrome, Firefox, Safari, Edge)

### Post-Deployment

- [ ] Open DevTools → Network tab
- [ ] Verify all assets load successfully (no 404s)
- [ ] Check asset sizes and load times
- [ ] Monitor FPS counter in game UI
- [ ] Test on different quality presets
- [ ] Check browser console for errors/warnings
- [ ] Test WebGPU and WebGL2 fallback
- [ ] Verify mobile responsiveness (if applicable)

### Performance Monitoring

- [ ] Record Performance profile (10-15 seconds)
- [ ] Check for memory leaks (heap snapshots)
- [ ] Monitor GPU utilisation
- [ ] Test on low-end hardware
- [ ] Compare localhost vs. Netlify performance

---

## 12. Conclusion & Next Steps

### Current State Assessment

**Strengths:**
- ✅ Well-architected codebase with clear separation of concerns
- ✅ Proper render loop and fixed timestep simulation
- ✅ Quality presets for performance scaling
- ✅ Graceful WebGPU → WebGL2 fallback
- ✅ No obvious infinite loops or memory leaks

**Weaknesses:**
- ⚠️ No Netlify-specific configuration
- ⚠️ Missing asset loading error handling
- ⚠️ No loading screen or progress indicator
- ⚠️ Debug hooks exposed in production
- ⚠️ Defaults to Ultra quality (may be too demanding)
- ⚠️ Large unoptimised environment map

### Immediate Action Items

1. **Create `netlify.toml`** (see Section 3)
2. **Add asset loading error handling** (see Section 7.3)
3. **Implement loading screen** during initialisation
4. **Change default quality to "High"** (Line 89, `Game.ts`)
5. **Conditionalise debug hooks** (Line 696, `Game.ts`)

### Performance Debugging Workflow

**If experiencing performance issues on Netlify:**

1. **Compare FPS:** Localhost vs. Netlify
2. **Check Network tab:** Look for slow/failed asset loads
3. **Monitor Memory:** Check for continuous growth
4. **Test Quality Presets:** Try "Low" to isolate GPU issues
5. **Check Console:** Look for errors or warnings
6. **Verify Renderer:** Confirm WebGPU/WebGL2 status
7. **Profile Performance:** Use DevTools Performance tab

---

## Appendix A: Useful DevTools Commands

```javascript
// Get current FPS
window.__apexGame.engine.getFps()

// Get renderer type
window.__apexGame.engine.constructor.name

// Get scene statistics
window.__apexGame.scene.getActiveMeshes().length
window.__apexGame.scene.textures.length
window.__apexGame.scene.materials.length

// Force quality change
window.__apexGame.engine.setHardwareScalingLevel(0.5) // 50% resolution

// Get telemetry snapshot
// (Access via React DevTools or game.getTelemetry() if exposed)
```

---

## Appendix B: Asset Optimisation Guide

### Environment Map Optimisation

**Current:** `environmentSpecular.env` (Babylon format, ~5-10MB)

**Options:**
1. **Reduce resolution:** 512x512 instead of 1024x1024
2. **Use compressed format:** KTX2 with Basis Universal
3. **Lazy load:** Load after initial scene render
4. **Progressive loading:** Low-res first, high-res later

### Logo Optimisation

**Current:** PNG files (various sizes)

**Recommended:**
```bash
# Convert to WebP (80% smaller)
cwebp -q 90 "New-Opace-Logo---High-Quality new.png" -o logo.webp

# Create fallback
<picture>
  <source srcset="logo.webp" type="image/webp">
  <img src="logo.png" alt="Opace Logo">
</picture>
```

---

**Document Version:** 1.0
**Last Updated:** 2025-12-14
**Author:** AI Technical Analysis
**Project:** APEX//WEB 3D Racing Game

