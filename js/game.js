// game.js  Edebug wireframes, refined vertices, and floating island design
export class GameManager {
    constructor() {
        this.Engine = Matter.Engine;
        this.Render = Matter.Render;
        this.Runner = Matter.Runner;
        this.Bodies = Matter.Bodies;
        this.Composite = Matter.Composite;
        this.Events = Matter.Events;
        this.Vertices = Matter.Vertices;
        this.Body = Matter.Body;
        this.Common = Matter.Common;

        this.engine = null;
        this.render = null;

        this.width = 600;
        this.height = 800;

        // World-space platform top (set in startNewGame)
        this.platformTopY = 0;

        // Camera Tracking
        this.viewY = 0;
        this.targetViewY = 0;
        this.cameraLerp = 0.05;

        // Fixed screen-space Y for the drop zone
        this.SCREEN_DROP_Y = 160;

        // Callbacks
        this.onGameOver = () => { };
        this.onItemDropped = () => { };
        this.onActionPerformed = () => { };
        this.onTurnChanged = () => { };

        this.isSoloMode = false;
        this.isMyTurn = false;
        this.gameActive = false;
        this.isDropBlocked = false; // Prevents rapid clicking/dropping
        this.myLastDrop = false; // Tracks who dropped the last item
        this.turnCount = 1;

        this.currentItemIndex = '00';
        this.mouseX = this.width / 2;
        this.currentScale = 1.0;
        this.currentAngle = 0;

        // Image dimensions
        this.imgAssets = {
            '00': { w: 381, h: 333 },
            '01': { w: 381, h: 333 },
            '02': { w: 381, h: 333 },
            '03': { w: 381, h: 333 },
            '04': { w: 381, h: 333 },
            '05': { w: 381, h: 333 },
            '06': { w: 381, h: 333 },
            '07': { w: 381, h: 333 },
            '08': { w: 381, h: 333 },
            '09': { w: 1680, h: 1050 },
            '10': { w: 300, h: 300 },
            '11': { w: 300, h: 300 },
            '13': { w: 300, h: 300 },
            '14': { w: 300, h: 300 }
        };

        this.itemConfigs = {
            '00': { base: 40, type: 'circle' },
            '01': { base: 50, type: 'rect' },
            '02': { base: 55, type: 'triangle' },
            '03': { base: 60, type: 'trapezoid' },
            '04': { base: 65, type: 'circle' },
            '05': { base: 70, type: 'rect' },
            '06': { base: 75, type: 'triangle' },
            '07': { base: 80, type: 'trapezoid' },
            '08': { base: 85, type: 'tall' },
            '09': { base: 95, type: 'wide' },
            '10': { base: 100, type: 'circle' },
            '11': { base: 110, type: 'rect' },
            '13': { base: 120, type: 'triangle' },
            '14': { base: 130, type: 'trapezoid' }
        };
        this.availableItems = Object.keys(this.itemConfigs);

        // Auto-generated shape data based on image alpha
        this.shapeDefinitions = {};
    }

    // ==== Ramer-Douglas-Peucker line simplification ====
    _rdp(pts, epsilon) {
        if (pts.length <= 2) return pts;
        let maxDist = 0, maxIdx = 0;
        const [first, last] = [pts[0], pts[pts.length - 1]];
        const dx = last.x - first.x, dy = last.y - first.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        for (let i = 1; i < pts.length - 1; i++) {
            const dist = len === 0
                ? Math.sqrt((pts[i].x - first.x) ** 2 + (pts[i].y - first.y) ** 2)
                : Math.abs((last.y - first.y) * pts[i].x - (last.x - first.x) * pts[i].y + last.x * first.y - last.y * first.x) / len;
            if (dist > maxDist) { maxDist = dist; maxIdx = i; }
        }
        if (maxDist > epsilon) {
            const left = this._rdp(pts.slice(0, maxIdx + 1), epsilon);
            const right = this._rdp(pts.slice(maxIdx), epsilon);
            return [...left.slice(0, -1), ...right];
        }
        return [first, last];
    }

    // ==== Graham Scan Convex Hull (fallback tier 2) ====
    _convexHull(points) {
        if (points.length < 3) return points;
        const pivot = points.reduce((a, b) => (b.y > a.y || (b.y === a.y && b.x < a.x)) ? b : a);
        const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
        const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        const sorted = points.filter(p => p !== pivot).sort((a, b) => {
            const c = cross(pivot, a, b);
            return c !== 0 ? (c > 0 ? -1 : 1) : dist2(pivot, a) - dist2(pivot, b);
        });
        const hull = [pivot];
        for (const p of sorted) {
            while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
            hull.push(p);
        }
        return hull;
    }

    // ==== Manually tuned hitbox overrides for complex/problem shapes ====
    _getManualHitboxOverrides() {
        // These points are mapped directly to the visual space of the sprite (-0.5 to 0.5)
        // Adjust these to precisely wrap the sprite visual boundaries.
        const overrides = {
            '00': [
                { x: 0.274, y: -0.245 }, { x: 0.088, y: -0.368 }, { x: -0.133, y: -0.362 }, { x: -0.256, y: -0.233 }, { x: -0.235, y: -0.047 },
                { x: -0.298, y: 0.08 }, { x: -0.442, y: 0.128 }, { x: -0.324, y: 0.173 }, { x: -0.343, y: 0.299 }, { x: -0.23, y: 0.281 },
                { x: -0.245, y: 0.224 }, { x: 0.009, y: 0.182 }, { x: 0.072, y: 0.218 }, { x: 0.051, y: 0.299 }, { x: 0.175, y: 0.305 },
                { x: 0.19, y: 0.176 }, { x: 0.395, y: 0.125 }, { x: 0.217, y: 0.08 }, { x: 0.306, y: -0.047 },
            ],
            '01': [
                { x: 0.259, y: -0.395 }, { x: 0.227, y: -0.326 }, { x: 0.193, y: -0.419 }, { x: 0.009, y: -0.431 }, { x: -0.159, y: -0.311 },
                { x: -0.14, y: -0.044 }, { x: -0.298, y: 0.068 }, { x: -0.146, y: 0.077 }, { x: -0.256, y: 0.233 }, { x: -0.188, y: 0.344 },
                { x: -0.093, y: 0.245 }, { x: -0.08, y: 0.437 }, { x: 0.014, y: 0.419 }, { x: 0.098, y: 0.137 }, { x: 0.329, y: 0.101 },
                { x: 0.193, y: 0.017 }, { x: 0.256, y: -0.062 }, { x: 0.253, y: -0.263 }, { x: 0.306, y: -0.26 },
            ],
            '02': [
                { x: -0.209, y: -0.488 }, { x: -0.365, y: -0.261 }, { x: -0.248, y: 0.185 }, { x: 0.065, y: 0.322 }, { x: -0.063, y: 0.407 },
                { x: -0.022, y: 0.465 }, { x: 0.177, y: 0.424 }, { x: 0.454, y: -0.083 }, { x: 0.193, y: 0.302 }, { x: 0.148, y: -0.025 },
                { x: 0.315, y: -0.375 }, { x: 0.106, y: -0.156 }, { x: 0.118, y: -0.261 }, { x: 0.312, y: -0.483 }, { x: 0.104, y: -0.322 },
                { x: -0.006, y: -0.474 }, { x: -0.244, y: -0.421 },
            ],
            '03': [
                { x: 0.386, y: -0.329 }, { x: 0.302, y: -0.298 }, { x: 0.321, y: -0.174 }, { x: 0.129, y: -0.133 }, { x: 0.224, y: -0.286 },
                { x: 0.061, y: -0.404 }, { x: -0.167, y: -0.357 }, { x: -0.183, y: -0.148 }, { x: -0.408, y: -0.205 }, { x: -0.467, y: -0.121 },
                { x: -0.169, y: 0.115 }, { x: -0.142, y: 0.27 }, { x: -0.316, y: 0.256 }, { x: -0.251, y: 0.345 }, { x: 0.346, y: 0.296 },
            ],
            '04': [
                { x: 0.416, y: -0.281 }, { x: 0.232, y: -0.339 }, { x: 0.112, y: 0.008 }, { x: -0.408, y: 0.401 }, { x: 0.18, y: 0.041 },
                { x: 0.107, y: 0.169 }, { x: 0.213, y: 0.161 }, { x: 0.164, y: 0.285 }, { x: -0.351, y: 0.471 }, { x: 0.446, y: 0.227 },
            ],
            '05': [
                { x: -0.389, y: -0.339 }, { x: -0.21, y: -0.269 }, { x: -0.093, y: -0.045 }, { x: -0.27, y: 0.45 }, { x: 0.009, y: 0.273 },
                { x: 0.381, y: 0.355 }, { x: 0.118, y: 0.062 }, { x: 0.253, y: 0.066 }, { x: 0.356, y: 0.227 }, { x: 0.297, y: 0.062 },
                { x: 0.389, y: 0.198 }, { x: 0.102, y: -0.095 }, { x: 0.05, y: -0.421 },
            ],
            '06': [
                { x: -0.14, y: -0.347 }, { x: -0.207, y: -0.231 }, { x: -0.251, y: -0.033 }, { x: -0.232, y: 0.149 }, { x: -0.28, y: 0.219 },
                { x: -0.248, y: 0.335 }, { x: -0.196, y: 0.347 }, { x: -0.21, y: 0.496 }, { x: 0.205, y: 0.496 }, { x: 0.213, y: 0.393 },
                { x: 0.08, y: 0.14 }, { x: 0.194, y: -0.033 }, { x: 0.188, y: -0.178 }, { x: 0.012, y: -0.368 },
            ],
            '07': [
                { x: 0.381, y: -0.372 }, { x: 0.175, y: -0.401 }, { x: -0.104, y: -0.318 }, { x: -0.161, y: -0.145 }, { x: -0.129, y: 0.054 },
                { x: -0.205, y: 0.264 }, { x: 0.11, y: 0.343 }, { x: 0.402, y: 0.231 }, { x: 0.427, y: -0.132 },
            ],
            '08': [
                { x: -0.091, y: -0.488 }, { x: -0.167, y: -0.388 }, { x: -0.102, y: -0.12 }, { x: -0.188, y: 0.058 }, { x: -0.186, y: 0.157 },
                { x: -0.018, y: 0.318 }, { x: 0.023, y: 0.174 }, { x: 0.02, y: 0.43 }, { x: 0.08, y: 0.45 }, { x: 0.112, y: 0.19 },
                { x: 0.213, y: 0.128 }, { x: 0.215, y: 0.0 }, { x: 0.085, y: -0.157 }, { x: 0.137, y: -0.281 }, { x: 0.102, y: -0.426 },
                { x: 0.039, y: -0.492 },
            ],
            '09': [
                { x: -0.457, y: -0.31 }, { x: -0.34, y: -0.244 }, { x: -0.443, y: -0.074 }, { x: -0.161, y: -0.083 }, { x: -0.356, y: 0.05 },
                { x: -0.332, y: 0.211 }, { x: 0.256, y: 0.281 }, { x: 0.405, y: 0.157 }, { x: 0.381, y: -0.037 }, { x: 0.131, y: -0.26 },
                { x: -0.028, y: -0.264 }, { x: -0.159, y: -0.099 }, { x: -0.066, y: -0.496 }, { x: -0.337, y: -0.479 }, { x: -0.308, y: -0.364 },
            ],
            '10': [
                { x: 0.348, y: -0.153 }, { x: 0.289, y: -0.198 }, { x: 0.226, y: -0.099 }, { x: 0.164, y: -0.397 }, { x: 0.085, y: -0.202 },
                { x: -0.085, y: -0.351 }, { x: -0.191, y: -0.244 }, { x: -0.207, y: -0.099 }, { x: -0.264, y: -0.124 }, { x: -0.243, y: -0.008 },
                { x: -0.329, y: 0.004 }, { x: -0.305, y: 0.079 }, { x: -0.015, y: 0.14 }, { x: -0.037, y: 0.079 }, { x: 0.289, y: 0.062 },
            ],
            '11': [
                { x: 0.337, y: -0.326 }, { x: -0.381, y: -0.116 }, { x: -0.37, y: -0.194 }, { x: -0.443, y: -0.058 }, { x: -0.058, y: -0.161 },
                { x: -0.14, y: 0.169 }, { x: -0.037, y: 0.231 }, { x: 0.007, y: 0.401 }, { x: 0.015, y: 0.223 }, { x: 0.167, y: 0.12 },
                { x: -0.026, y: -0.178 }, { x: 0.251, y: -0.256 }, { x: 0.232, y: -0.182 },
            ],
            '13': [
                { x: -0.392, y: -0.145 }, { x: -0.336, y: -0.004 }, { x: 0.002, y: 0.252 }, { x: -0.054, y: 0.368 }, { x: 0.322, y: 0.231 },
                { x: 0.308, y: 0.169 }, { x: 0.153, y: 0.186 }, { x: 0.115, y: 0.132 }, { x: 0.279, y: 0.083 }, { x: 0.153, y: 0.066 },
                { x: 0.214, y: -0.021 }, { x: 0.153, y: -0.182 }, { x: -0.092, y: -0.182 }, { x: -0.148, y: 0.05 },
            ],
            '14': [
                { x: -0.167, y: -0.492 }, { x: -0.251, y: -0.438 }, { x: -0.246, y: -0.169 }, { x: -0.462, y: -0.326 }, { x: -0.5, y: -0.236 },
                { x: -0.162, y: 0.037 }, { x: -0.054, y: 0.388 }, { x: 0.073, y: 0.471 }, { x: 0.012, y: 0.223 }, { x: 0.138, y: 0.202 },
                { x: 0.162, y: 0.409 }, { x: 0.284, y: 0.14 }, { x: 0.171, y: 0.0 }, { x: 0.453, y: -0.207 }, { x: 0.251, y: -0.174 },
                { x: 0.383, y: -0.298 }, { x: 0.35, y: -0.417 },
            ]
        };

        return overrides;
    }

    // ==== Moore Neighbor contour tracing ====
    // Returns an ordered array of boundary pixels (concave outline)
    _traceContour(imgData, cw, ch) {
        const alpha = (x, y) => {
            if (x < 0 || x >= cw || y < 0 || y >= ch) return 0;
            return imgData[(y * cw + x) * 4 + 3];
        };
        // Moore neighborhood: 8 directions starting from left, going clockwise
        const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

        // Find the topmost-leftmost non-transparent pixel
        let startX = -1, startY = -1;
        outer: for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                if (alpha(x, y) > 50) { startX = x; startY = y; break outer; }
            }
        }
        if (startX === -1) return [];

        const contour = [];
        let cx = startX, cy = startY;
        let prevDirIdx = 0; // previous entry direction
        const visited = new Set();

        for (let iter = 0; iter < cw * ch * 2; iter++) {
            const key = `${cx},${cy}`;
            if (contour.length > 2 && cx === startX && cy === startY && visited.has(key)) break;
            visited.add(key);
            contour.push({ x: cx, y: cy });

            // Search clockwise from the direction we came from (backtrack 3 steps)
            let found = false;
            const searchStart = (prevDirIdx + 5) % 8;
            for (let i = 0; i < 8; i++) {
                const d = (searchStart + i) % 8;
                const nx = cx + dirs[d][0];
                const ny = cy + dirs[d][1];
                if (alpha(nx, ny) > 50) {
                    prevDirIdx = d;
                    cx = nx; cy = ny;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }
        return contour;
    }

    // Custom image tracer: Moore neighbor contour ↁERDP simplification ↁEconcave polygon
    // Manual overrides for complex shapes like propellers and spread-limb characters.
    async generateShapesFromImages() {
        if (window.decomp) {
            Matter.Common.setDecomp(window.decomp);
            console.log('poly-decomp enabled');
        }

        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d');
        const manualOverrides = this._getManualHitboxOverrides();

        for (const [key] of Object.entries(this.imgAssets)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = `asset/Illust/${key}.png`;
            await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });

            // Store the ACTUAL dimensions dynamically so physics/rendering scales correctly
            if (img.width > 0 && img.height > 0) {
                this.imgAssets[key].w = img.width;
                this.imgAssets[key].h = img.height;
            }

            // --- Tier 0: Use hand-crafted data for complex shapes ---
            if (manualOverrides[key]) {
                this.shapeDefinitions[key] = manualOverrides[key];
                console.log(`Hitbox [${key}]: MANUAL (${manualOverrides[key].length} verts)`);
                continue;
            }

            const scaleDown = 80 / Math.max(img.width, img.height);
            const cw = Math.max(1, Math.floor(img.width * scaleDown));
            const ch = Math.max(1, Math.floor(img.height * scaleDown));
            offCanvas.width = cw; offCanvas.height = ch;
            offCtx.clearRect(0, 0, cw, ch);
            offCtx.drawImage(img, 0, 0, cw, ch);
            const imgData = offCtx.getImageData(0, 0, cw, ch).data;

            // --- Tier 1: Moore Neighbor concave trace + RDP simplify ---
            const contour = this._traceContour(imgData, cw, ch);

            let simplified = [];
            if (contour.length >= 3) {
                const normalized = contour.map(p => ({ x: (p.x / cw) - 0.5, y: (p.y / ch) - 0.5 }));
                simplified = this._rdp(normalized, 0.025);
                if (simplified.length < 3) simplified = normalized.filter((_, i) => i % 5 === 0);
                if (simplified.length > 24) {
                    const step = Math.ceil(simplified.length / 20);
                    simplified = simplified.filter((_, i) => i % step === 0);
                }

                // Check if poly-decomp considers this polygon simple (non-self-intersecting)
                let isSimple = true;
                if (window.decomp && simplified.length >= 3) {
                    try { isSimple = window.decomp.isSimple(simplified.map(p => [p.x, p.y])); }
                    catch (_) { isSimple = false; }
                }

                if (isSimple && simplified.length >= 3) {
                    this.shapeDefinitions[key] = simplified;
                    console.log(`Hitbox [${key}]: concave trace (${simplified.length} verts)`);
                    continue;
                }
            }

            // --- Tier 2: Convex Hull of all non-transparent pixels ---
            const allPoints = [];
            for (let y = 0; y < ch; y++) {
                for (let x = 0; x < cw; x++) {
                    if (imgData[(y * cw + x) * 4 + 3] > 50) {
                        allPoints.push({ x: (x / cw) - 0.5, y: (y / ch) - 0.5 });
                    }
                }
            }
            if (allPoints.length >= 3) {
                const hull = this._convexHull(allPoints);
                if (hull.length >= 3) {
                    this.shapeDefinitions[key] = hull;
                    console.log(`Hitbox [${key}]: convex hull (${hull.length} verts)`);
                    continue;
                }
            }

            // --- Tier 3: Safe rectangle fallback ---
            this.shapeDefinitions[key] = [
                { x: -0.4, y: -0.4 }, { x: 0.4, y: -0.4 },
                { x: 0.4, y: 0.4 }, { x: -0.4, y: 0.4 }
            ];
            console.log(`Hitbox [${key}]: rectangle fallback`);
        }
        console.log('All hitboxes done:', Object.fromEntries(
            Object.entries(this.shapeDefinitions).map(([k, v]) => [k, v.length])
        ));
    }

    async init(containerEl) {
        this.engine = this.Engine.create();
        this.engine.enableSleeping = true;
        this.engine.gravity.y = 0.7;

        this.render = this.Render.create({
            element: containerEl,
            engine: this.engine,
            options: {
                width: this.width,
                height: this.height,
                wireframes: false, // Turn off debug wireframes to show sprites
                background: 'transparent',
                hasBounds: true,
                showAngleIndicator: false
            }
        });

        containerEl.style.backgroundImage = "url('asset/Illust/haikei.png')";
        containerEl.style.backgroundSize = "cover";
        containerEl.style.backgroundPosition = "bottom center";
        this.containerEl = containerEl;
        this.cloudLayer = document.getElementById('cloud-layer');

        if (this.render.canvas) {
            this.render.canvas.style.position = 'relative';
            this.render.canvas.style.zIndex = '2';
        }

        this.Runner.run(this.Runner.create(), this.engine);
        this.Render.run(this.render);

        // === CAMERA TRACKING + PARALLAX + GAME-OVER ===
        this.Events.on(this.engine, 'afterUpdate', () => {
            if (!this.gameActive) return;

            const bodies = this.Composite.allBodies(this.engine.world);
            let towerTopY = this.platformTopY;

            // Find the highest settled block (or the current falling block if higher)
            let allSettled = true;

            for (const body of bodies) {
                if (body.isStatic) continue;

                if (body.speed > 0.5 || Math.abs(body.angularVelocity) > 0.05) {
                    allSettled = false;
                }

                // Game over condition (fallen off the platform)
                // Since platformTopY is the initial placement of the platform, ANY piece that goes 
                // significantly below it (e.g. +150px) is considered dropped.
                if (body.position.y > this.platformTopY + 150) {
                    this.gameActive = false;
                    // The player who dropped the last piece loses.
                    const iLost = this.myLastDrop;
                    this.onGameOver(!iLost);
                    return;
                }

                // If a body is settled and higher than the current tower height
                const isSettled = body.speed < 1.0;

                // Track the highest body overall to gently pan camera up
                if (body.position.y < towerTopY) {
                    // Only track it strictly if it's settled, OR if it's currently falling but very high
                    if (isSettled || body.position.y < this.viewY + this.height * 0.3) {
                        towerTopY = body.position.y;
                    }
                }
            }

            // Unblock dropping only when all pieces have physically settled, and at least some time has passed since drop
            if (this.gameActive && this.isDropBlocked) {
                // We need to wait a tiny bit after drop so it actually starts moving.
                // If it's been less than 500ms since drop, don't unblock.
                const timeSinceDrop = Date.now() - this.lastDropTime;
                if (timeSinceDrop > 500 && allSettled) {
                    this.isDropBlocked = false;
                }
            }

            // Target view focuses such that the highest block is placed near the bottom-middle of the screen
            // This leaves a large empty area above for the player to see where they are dropping.
            this.targetViewY = towerTopY - (this.height * 0.7);
            if (this.targetViewY > 0) this.targetViewY = 0;

            // Smoother lerp for doubutsu-like feel
            this.cameraLerp = 0.08;

            // Only move camera UP (negative Y), or very slowly back down if tower collapses
            if (this.targetViewY < this.viewY) {
                this.viewY += (this.targetViewY - this.viewY) * this.cameraLerp;
            } else {
                this.viewY += (this.targetViewY - this.viewY) * (this.cameraLerp * 0.2);
            }

            this.render.bounds.min.y = this.viewY;
            this.render.bounds.max.y = this.viewY + this.height;

            this.updateParallax();
        });

        this.Events.on(this.render, 'afterRender', () => {
            if (!this.gameActive || !this.isMyTurn) return;
            this.updatePreview();
        });

        this.setupInput(containerEl);

        // Pre-generate custom shapes from images
        await this.generateShapesFromImages();
    }

    updateParallax() {
        if (this.cloudLayer) {
            const cloudOffset = this.viewY * 0.3;
            this.cloudLayer.style.transform = `translateY(${-cloudOffset}px)`;
        }
        if (this.containerEl) {
            const bgOffset = this.viewY * 0.1;
            this.containerEl.style.backgroundPosition = `center ${100 - bgOffset}px`;
        }
    }

    startNewGame(isFirstTurn) {
        this.Composite.clear(this.engine.world);
        this.Engine.clear(this.engine);
        this.turnCount = 1;
        this.viewY = 0;
        this.targetViewY = 0;

        // ── Platform Base ──
        const platW = 340;
        const platH = 40;
        const platCenterY = this.height - 120;
        this.platformTopY = platCenterY - (platH / 2);

        // simple thin rectangle matching the green platform art
        const platform = this.Bodies.rectangle(this.width / 2, platCenterY, platW + 40, platH, {
            isStatic: true,
            friction: 1.0,           // MAX FRICTION
            frictionStatic: 1.0,     // MAX FRICTION
            restitution: 0.1,        // Slight bounce helps settle
            render: {
                sprite: {
                    texture: 'asset/Illust/Platform_cropped.png',
                    xScale: (platW + 40) / 1403,
                    yScale: platH / 88
                }
            }
        });

        this.Composite.add(this.engine.world, [platform]);

        this.gameActive = true;
        this.rollNextItem();
        this.setTurn(isFirstTurn);
    }

    setTurn(isMyTurn) {
        this.isMyTurn = isMyTurn;
        this.onTurnChanged(this.isMyTurn, this.turnCount);
    }

    incrementTurn() { this.turnCount++; }

    rollNextItem() {
        this.currentItemIndex = this.availableItems[
            Math.floor(Math.random() * this.availableItems.length)
        ];
        this.currentScale = 0.8 + Math.random() * 0.6;
        this.currentAngle = 0;
    }

    setupInput(containerEl) {
        containerEl.addEventListener('contextmenu', e => e.preventDefault());

        containerEl.addEventListener('mousemove', (e) => {
            if (!this.gameActive || !this.isMyTurn) return;
            const rect = this.render.canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) * (this.width / rect.width);
            this.mouseX = Math.max(80, Math.min(this.width - 80, this.mouseX));
        });

        containerEl.addEventListener('mousedown', (e) => {
            if (!this.gameActive || !this.isMyTurn || this.isDropBlocked) return;
            if (e.button === 2) {
                this.currentAngle += Math.PI / 4;
                this.onActionPerformed();
                return;
            }

            // --- CRITICAL: Lock input immediately ---
            this.isDropBlocked = true;
            this.myLastDrop = true; // I caused this drop

            const worldY = this.viewY + this.SCREEN_DROP_Y;
            this.dropItemLocally(this.currentItemIndex, this.mouseX, worldY, this.currentScale, this.currentAngle);
            this.onItemDropped(this.currentItemIndex, this.mouseX, worldY, this.currentScale, this.currentAngle);

            this.lastDropTime = Date.now();
            this.incrementTurn();
            this.rollNextItem();

            // In solo mode, DO NOT call setTurn(true) here!
            // isMyTurn is already true, and we only want to lift isDropBlocked later in afterUpdate.
            // Calling setTurn triggers UI updates but we don't need to force state.
            if (!this.isSoloMode) {
                this.setTurn(false);
            }
        });

        containerEl.addEventListener('wheel', (e) => {
            if (!this.gameActive || !this.isMyTurn) return;
            e.preventDefault();
            this.currentAngle += (e.deltaY > 0 ? 1 : -1) * (Math.PI / 8);
            this.onActionPerformed();
        }, { passive: false });
    }

    updatePreview() {
        const ctx = this.render.context;
        // Hide preview if blocked 
        if (!this.isMyTurn || this.isDropBlocked) return;

        const cfg = this.itemConfigs[this.currentItemIndex];
        // baseSize determines the major axis length of the sprite
        const baseSize = (cfg.base * 2) * this.currentScale;
        const drawY = this.SCREEN_DROP_Y;

        if (!this._prevImgKey || this._prevImgKey !== this.currentItemIndex) {
            this._prevImg = new Image();
            this._prevImg.src = `asset/Illust/${this.currentItemIndex}.png`;
            this._prevImgKey = this.currentItemIndex;
        }
        const img = this._prevImg;

        // Calculate aspect ratio fitting
        const w = this.imgAssets[this.currentItemIndex].w;
        const h = this.imgAssets[this.currentItemIndex].h;
        const maxDim = Math.max(w, h);
        const renderW = (w / maxDim) * baseSize;
        const renderH = (h / maxDim) * baseSize;

        ctx.globalAlpha = 0.5;
        ctx.save();
        ctx.translate(this.mouseX, drawY);
        ctx.rotate(this.currentAngle);
        ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
        ctx.restore();
        ctx.globalAlpha = 1.0;

        let pts = this.shapeDefinitions[this.currentItemIndex];
        if (!pts) pts = this.shapeDefinitions['00'];

        const scaledPts = pts.map(p => ({
            // If image is non-square, the normalized points natively assumed it was square stretched.
            // Actually, because of how we drew it onto a small square offscreen canvas,
            // the points ALREADY account for the aspect ratio. So we just scale by baseSize!
            x: p.x * renderW,
            y: p.y * renderH
        }));

        // Preview wireframe has been removed to match final graphics
    }

    dropItemLocally(itemIndex, xPos, worldY, scale, angle) {
        const cfg = this.itemConfigs[itemIndex];
        // Determine aspect‑ratio‑based sprite dimensions
        const w = this.imgAssets[itemIndex].w;
        const h = this.imgAssets[itemIndex].h;
        const maxDim = Math.max(w, h);
        const baseSize = cfg.base * 2 * scale; // Max dimension after scaling
        const renderW = (w / maxDim) * baseSize;
        const renderH = (h / maxDim) * baseSize;

        let pts = this.shapeDefinitions[itemIndex];
        if (!pts) pts = this.shapeDefinitions['00'];

        // Scale vertices using the same render dimensions as the sprite
        const scaledPts = pts.map(p => ({
            x: p.x * renderW,
            y: p.y * renderH
        }));

        const bodyOpts = {
            angle: angle,
            restitution: 0.05,        // Less bouncy, absorbs impact better
            friction: 1.0,           // Maximum friction so they don't slide off each other
            frictionStatic: 1.0,     // Maximum static friction
            frictionAir: 0.05,       // Slightly more air resistance
            sleepThreshold: 30,      // Fall asleep faster to stabilize tower
            density: 0.01 * (1 + (scale - 1) * 0.5), // Double the density (heavy)
            render: {
                fillStyle: 'transparent',
                strokeStyle: 'transparent',
                sprite: {
                    texture: `asset/Illust/${itemIndex}.png`,
                    xScale: renderW / w,
                    yScale: renderH / h
                }
            }
        };

        let body;
        try {
            body = this.Bodies.fromVertices(xPos, worldY, [scaledPts], bodyOpts);
            // Adjust sprite offset for compound bodies
            if (body.parts && body.parts.length > 1) {
                const shiftX = body.position.x - xPos;
                const shiftY = body.position.y - worldY;
                body.render.sprite.xOffset = 0.5 + (shiftX / renderW);
                body.render.sprite.yOffset = 0.5 + (shiftY / renderH);
            }
        } catch (e) {
            console.warn(`fromVertices failed for ${itemIndex}, using circle fallback`, e);
            body = this.Bodies.circle(xPos, worldY, baseSize / 2, bodyOpts);
        }

        if (!body) return;

        this.Composite.add(this.engine.world, body);
    }
}

