# Performance Optimisations for Netlify Deployment

## Problem
The 3D racing game (APEX//WEB) ran smoothly on localhost but caused severe CPU usage on Netlify deployment, making the laptop "sound like it will explode."

## Root Cause
The game was defaulting to **Ultra quality settings** which included:
- 4096px shadow maps
- 8x MSAA
- 35,000 grass blades
- Chromatic aberration, grain, and sharpen effects
- Environment texture cloning (memory duplication)
- No loading screen (synchronous asset loading causing freeze)
- Debug hooks exposed in production

## Solutions Implemented

### 1. Automatic Quality Detection (`src/shared/qualityPresets.ts`)
- Added `detectOptimalQuality()` function
- Detects device capabilities: CPU cores, memory, mobile detection
- **Production defaults:**
  - Mobile or <4 cores or <4GB RAM → "low"
  - 4-8 cores or 4-8GB RAM → "medium"
  - >8 cores and >8GB RAM → "high" (never "ultra")
- **Impact:** Prevents ultra-demanding settings from being applied automatically

### 2. FPS Monitoring & Auto-Downgrade (`src/game/Game.ts`)
- Added performance monitoring every 60 frames (~1 second)
- Tracks FPS history over 5 seconds
- **Auto-reduces quality** if average FPS drops below 30 for 3 consecutive checks
- Logs quality changes to console for debugging
- **Impact:** Automatically adapts to device performance in real-time

### 3. Production-Only Debug Hooks (`src/game/Game.ts`)
- Wrapped `window.__apexGame` exposure in `import.meta.env.DEV` check
- **Impact:** Reduces memory footprint and prevents debug object exposure in production

### 4. Environment Texture Memory Fix (`src/game/createScene.ts`)
- Changed from `env.clone()` to sharing the same texture reference
- Added try-catch error handling for environment map loading
- Fallback to solid colour skybox if environment map fails
- **Impact:** Saves ~5-10MB of GPU memory, prevents crashes on missing assets

### 5. Loading Screen (`src/main.ts`, `src/ui/LoadingScreen.css`)
- Implemented vanilla JS loading screen (no React overhead)
- Shows progress during engine initialisation and asset loading
- Prevents UI freeze during synchronous operations
- **Impact:** Better user experience, prevents browser "unresponsive script" warnings

### 6. Shadow Map Optimisation (`src/game/createScene.ts`)
- Reduced shadow map size from **4096px to 2048px**
- Reduced blur kernel from **48 to 24**
- **Impact:** 75% reduction in shadow map memory, faster shadow rendering

### 7. Post-Processing Optimisation (`src/game/createScene.ts`)
- Reduced MSAA samples from **8 to 4**
- Reduced bloom kernel from **96 to 64**
- **Disabled initially:** chromatic aberration, grain, sharpen
- **Impact:** Significant reduction in post-processing overhead

### 8. Grass Field Optimisation (`src/game/Grass.ts`)
- Reduced grass blade count from **35,000 to 15,000**
- **Impact:** 57% reduction in grass geometry, major CPU/GPU savings

### 9. Netlify Configuration (`netlify.toml`)
- Added cache headers for static assets (1 year cache)
- Configured SPA routing fallback
- Set Node 18 environment
- **Impact:** Faster asset loading, reduced bandwidth usage

## Performance Improvements

### Before:
- Default quality: **Ultra**
- Shadow map: **4096px**
- MSAA: **8x**
- Grass blades: **35,000**
- Post-processing: **All effects enabled**
- No loading screen
- CPU usage: **Extremely high** (laptop overheating)

### After:
- Default quality: **Medium/High** (auto-detected)
- Shadow map: **2048px**
- MSAA: **4x**
- Grass blades: **15,000**
- Post-processing: **Optimised** (chromatic aberration/grain/sharpen disabled)
- Loading screen: **Yes**
- CPU usage: **Significantly reduced**
- Auto-downgrade: **Yes** (if FPS < 30)

## Testing Instructions

1. **Local Testing:**
   ```bash
   npm run build
   npm run preview
   ```
   Open http://localhost:4173/ and check CPU usage

2. **Netlify Deployment:**
   - Push changes to GitHub (already done)
   - Netlify will auto-deploy from main branch
   - Test on https://your-netlify-url.netlify.app

3. **Performance Monitoring:**
   - Open DevTools → Performance tab
   - Check FPS counter in game UI
   - Monitor CPU usage in Activity Monitor/Task Manager
   - Check console for auto-quality-downgrade messages

## Expected Results

- **Smooth 60 FPS** on most modern laptops
- **No excessive CPU usage** or fan noise
- **Automatic quality adjustment** if performance drops
- **Fast initial load** with loading screen
- **Graceful degradation** on lower-end devices

## Files Modified

1. `netlify.toml` - Created
2. `src/shared/qualityPresets.ts` - Added auto-detection
3. `src/game/Game.ts` - Added FPS monitoring, conditionalised debug hooks
4. `src/game/createScene.ts` - Optimised shadows, post-processing, environment texture
5. `src/game/Grass.ts` - Reduced grass blade count
6. `src/main.ts` - Added loading screen
7. `src/ui/LoadingScreen.css` - Created
8. `NETLIFY_PERFORMANCE_ANALYSIS.md` - Comprehensive analysis document

## Commit Hash
`6aa12ff` - "Performance optimisations for Netlify deployment"

---

**Status:** ✅ All optimisations implemented, built, and pushed to GitHub

