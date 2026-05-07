// src/FluidBackground.jsx
// WebGL fluid noise shader background — theme-shifting based on scroll progress
function FluidBackground() {
  const canvasRef = React.useRef(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      canvas.style.display = 'none';
      return;
    }
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl) {
      // fallback: CSS gradient is already under canvas
      canvas.style.display = 'none';
      return;
    }
    const vs = `
      attribute vec2 p;
      void main() { gl_Position = vec4(p, 0.0, 1.0); }
    `;
    const fs = `
      precision highp float;
      uniform vec2 uRes;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uScroll;      // 0..1 through page
      uniform float uThemeBlue;   // weights
      uniform float uThemeWarm;
      uniform float uThemeYellow;

      // classic simplex-ish noise
      vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x+0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * snoise(p);
          p = p * 2.05;
          a *= 0.55;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= uRes.x / uRes.y;

        // Slow drift + subtle mouse bend
        vec2 m = (uMouse / uRes) * 2.0 - 1.0;
        m.x *= uRes.x / uRes.y;
        vec2 off = vec2(uTime * 0.015, uTime * 0.021);

        float n1 = fbm(p * 0.9 + off + m * 0.15);
        float n2 = fbm(p * 1.7 - off * 0.8 + vec2(n1 * 0.4));
        float n = n1 * 0.6 + n2 * 0.4;

        // Three colored fog sources, blended by theme weights + scroll drift
        vec2 cBlue = vec2(-0.6 + sin(uTime*0.08)*0.1, 0.3 + cos(uTime*0.1)*0.08);
        vec2 cWarm = vec2(0.7 + cos(uTime*0.07)*0.12, -0.2 - sin(uTime*0.09)*0.1);
        vec2 cYell = vec2(0.1 + cos(uTime*0.06)*0.15, 0.5);

        float dBlue = 1.0 - smoothstep(0.2, 1.4, length(p - cBlue - n * 0.3));
        float dWarm = 1.0 - smoothstep(0.2, 1.3, length(p - cWarm - n * 0.25));
        float dYell = 1.0 - smoothstep(0.2, 1.2, length(p - cYell - n * 0.2));

        dBlue *= uThemeBlue;
        dWarm *= uThemeWarm;
        dYell *= uThemeYellow;

        vec3 colBg = vec3(0.012, 0.025, 0.05);
        vec3 colBlue = vec3(0.18, 0.41, 1.0);
        vec3 colWarm = vec3(0.8, 0.56, 0.345);
        vec3 colYell = vec3(0.957, 0.835, 0.424);

        vec3 col = colBg;
        col = mix(col, colBlue, dBlue * 0.55);
        col = mix(col, colWarm, dWarm * 0.52);
        col = mix(col, colYell, dYell * 0.4);

        // soft noise haze
        col += (n * 0.015);

        // subtle cursor halo
        float mouseDist = length(uv - uMouse / uRes);
        col += vec3(0.35, 0.55, 1.0) * 0.07 * (1.0 - smoothstep(0.0, 0.25, mouseDist));

        // edge vignette baked into dark baseline
        float vig = smoothstep(1.1, 0.3, length(p));
        col *= mix(0.7, 1.05, vig);

        gl_FragColor = vec4(col, 1.0);
      }
    `;
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Shader error:', gl.getShaderInfoLog(s));
      }
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Shader program error:', gl.getProgramInfoLog(prog));
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    const uScroll = gl.getUniformLocation(prog, 'uScroll');
    const uThemeBlue = gl.getUniformLocation(prog, 'uThemeBlue');
    const uThemeWarm = gl.getUniformLocation(prog, 'uThemeWarm');
    const uThemeYellow = gl.getUniformLocation(prog, 'uThemeYellow');
    let w = 0,
      h = 0,
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);
    let mx = 0.5,
      my = 0.5,
      mxT = 0.5,
      myT = 0.5;
    function onMove(e) {
      const x = e.clientX ?? (e.touches && e.touches[0]?.clientX);
      const y = e.clientY ?? (e.touches && e.touches[0]?.clientY);
      if (x == null) return;
      mxT = x / window.innerWidth;
      myT = 1 - y / window.innerHeight;
    }
    window.addEventListener('mousemove', onMove, {
      passive: true
    });
    window.addEventListener('touchmove', onMove, {
      passive: true
    });

    // Theme weights based on scroll position — will be updated each frame from window.__scrollProgress
    window.__scrollProgress = 0;
    window.__themeWeights = [1, 0.4, 0.25]; // blue, warm, yellow default

    const start = performance.now();
    let running = true;
    function frame() {
      if (!running) return;
      if (document.visibilityState === 'hidden') {
        requestAnimationFrame(frame);
        return;
      }
      const t = (performance.now() - start) / 1000;
      // ease mouse
      mx += (mxT - mx) * 0.05;
      my += (myT - my) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mx * canvas.width, my * canvas.height);
      gl.uniform1f(uScroll, window.__scrollProgress || 0);
      const w = window.__themeWeights || [1, 0.4, 0.25];
      gl.uniform1f(uThemeBlue, w[0]);
      gl.uniform1f(uThemeWarm, w[1]);
      gl.uniform1f(uThemeYellow, w[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }
    frame();
    return () => {
      running = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, []);
  return /*#__PURE__*/React.createElement("canvas", {
    id: "fluid-canvas",
    ref: canvasRef
  });
}
window.FluidBackground = FluidBackground;

// src/WaveSpine.jsx
// Cursor glow particles
function CursorParticles() {
  const layerRef = React.useRef(null);
  React.useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (reduceMotion || coarsePointer) return;
    const dots = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div');
      d.className = 'cursor-dot';
      d.style.width = 10 - i * 0.5 + 'px';
      d.style.height = 10 - i * 0.5 + 'px';
      d.style.opacity = String(1 - i / N);
      layer.appendChild(d);
      dots.push({
        el: d,
        x: -100,
        y: -100
      });
    }
    let tx = -100,
      ty = -100;
    function onMove(e) {
      tx = e.clientX;
      ty = e.clientY;
    }
    window.addEventListener('mousemove', onMove, {
      passive: true
    });
    let running = true;
    function tick() {
      if (!running) return;
      let x = tx,
        y = ty;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += (x - d.x) * (0.22 - i * 0.01);
        d.y += (y - d.y) * (0.22 - i * 0.01);
        d.el.style.left = d.x + 'px';
        d.el.style.top = d.y + 'px';
        x = d.x;
        y = d.y;
      }
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      running = false;
      window.removeEventListener('mousemove', onMove);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    id: "cursor-layer",
    ref: layerRef
  });
}

// Elliott Wave spine — SVG path drawn based on scroll
function WaveSpine() {
  const pathRef = React.useRef(null);
  const svgRef = React.useRef(null);
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len + ' ' + len;
    path.style.strokeDashoffset = len;
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      path.style.strokeDashoffset = String(len * (1 - p));

      // Shift wave color along progress
      const hue = p < 0.33 ? '#2f68ff' : p < 0.66 ? '#cc8f58' : '#f4d56c';
      path.setAttribute('stroke', hue);

      // Update global theme weights for fluid bg
      // p: 0-0.2 blue hero, 0.2-0.45 BingX blue, 0.45-0.7 C1K warm, 0.7-0.9 Waves yellow, 0.9-1 access mix
      const blue = Math.max(0, 1 - Math.abs(p - 0.22) * 3);
      const warm = Math.max(0, 1 - Math.abs(p - 0.55) * 3);
      const yell = Math.max(0, 1 - Math.abs(p - 0.82) * 3);
      const total = blue + warm + yell + 0.35; // baseline glow
      window.__themeWeights = [Math.max(0.35, blue + 0.1), warm * 1.1, yell * 1.1];
      window.__scrollProgress = p;
    }
    onScroll();
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    id: "wave-spine-container"
  }, /*#__PURE__*/React.createElement("svg", {
    ref: svgRef,
    viewBox: "0 0 100 800",
    preserveAspectRatio: "none",
    style: {
      position: 'absolute',
      right: 'max(24px, calc((100vw - 1320px)/2 - 60px))',
      top: 0,
      bottom: 0,
      width: '60px',
      height: '100%',
      opacity: 0.55,
      mixBlendMode: 'screen'
    }
  }, /*#__PURE__*/React.createElement("path", {
    ref: pathRef,
    d: "M 50,0 L 55,60 L 45,110 L 62,150 L 38,200 L 58,245 L 42,290 L 65,340 L 35,390 L 58,440 L 40,490 L 62,540 L 38,590 L 60,640 L 45,690 L 55,740 L 50,800",
    stroke: "#2f68ff",
    strokeWidth: "1.2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      filter: 'drop-shadow(0 0 6px currentColor)'
    }
  })));
}
window.CursorParticles = CursorParticles;
window.WaveSpine = WaveSpine;

// src/SectionAnchor.jsx
// Volumetric section anchor — a 3D tilted disc + orbit rings + floor shadow.
// Sits inside each stage's media column behind the logo/video so sections
// feel planted in space. Parallax-driven by scroll progress within-section.
function SectionAnchor({
  tone = 'blue',
  ringCount = 3,
  children
}) {
  const rootRef = React.useRef(null);
  const tiltRef = React.useRef(null);
  React.useEffect(() => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (!root || !tilt) return;
    let running = true;
    let rx = 0,
      ry = 0,
      rxT = 0,
      ryT = 0; // tilt from hover
    let cy = 0,
      cyT = 0; // vertical travel from scroll
    let spin = 0; // cumulative ring spin

    function onMove(e) {
      const r = root.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      rxT = -y * 6;
      ryT = x * 10;
    }
    function onLeave() {
      rxT = 0;
      ryT = 0;
    }
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    function onScroll() {
      const r = root.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      // -1 when section well above viewport, 0 centered, +1 well below
      const p = Math.max(-1, Math.min(1, mid / (window.innerHeight * 0.9)));
      cyT = -p * 60; // gentle parallax rise/fall
    }
    onScroll();
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    window.addEventListener('resize', onScroll);
    function tick() {
      if (!running) return;
      rx += (rxT - rx) * 0.08;
      ry += (ryT - ry) * 0.08;
      cy += (cyT - cy) * 0.08;
      spin += 0.04 + (window.__scrollVelocity || 0) * 0.005;
      tilt.style.transform = `translate3d(0, ${cy.toFixed(2)}px, 0) ` + `rotateX(${(62 + rx).toFixed(2)}deg) rotateZ(${ry.toFixed(2)}deg)`;
      const rings = tilt.querySelectorAll('.anchor-ring');
      rings.forEach((r, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = 1 + i * 0.35;
        r.style.transform = `rotate(${(spin * speed * dir).toFixed(2)}deg)`;
      });
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      running = false;
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  const rings = [];
  for (let i = 0; i < ringCount; i++) {
    const pct = 100 - i * 16;
    rings.push(/*#__PURE__*/React.createElement("div", {
      key: i,
      className: "anchor-ring",
      style: {
        width: pct + '%',
        height: pct + '%',
        borderWidth: 1 + i * 0.4 + 'px',
        opacity: 0.7 - i * 0.18
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: `section-anchor tone-${tone}`,
    ref: rootRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "anchor-stage",
    ref: tiltRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "anchor-disc"
  }), rings, /*#__PURE__*/React.createElement("div", {
    className: "anchor-spokes"
  })), /*#__PURE__*/React.createElement("div", {
    className: "anchor-floor"
  }), /*#__PURE__*/React.createElement("div", {
    className: "anchor-content"
  }, children));
}
window.SectionAnchor = SectionAnchor;

// src/Interactive.jsx
// Interactivity layer: magnetic buttons, draggable spin, scroll-scrubbed tilt.
// These are auto-wired via DOM attributes so components stay clean.

// Magnetic hover for elements with [data-magnetic]
(function initMagnetic() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
  let running = true;
  const targets = new Map(); // el -> {tx,ty,cx,cy}

  function scan() {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      if (targets.has(el)) return;
      targets.set(el, {
        tx: 0,
        ty: 0,
        cx: 0,
        cy: 0
      });
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        const strength = Number(el.dataset.magnetic) || 0.25;
        const s = targets.get(el);
        s.tx = x * strength;
        s.ty = y * strength;
      });
      el.addEventListener('mouseleave', () => {
        const s = targets.get(el);
        s.tx = 0;
        s.ty = 0;
      });
    });
  }
  function tick() {
    if (!running) return;
    targets.forEach((s, el) => {
      s.cx += (s.tx - s.cx) * 0.18;
      s.cy += (s.ty - s.cy) * 0.18;
      const inner = el.querySelector('[data-magnetic-inner]') || el;
      inner.style.transform = `translate3d(${s.cx.toFixed(2)}px, ${s.cy.toFixed(2)}px, 0)`;
    });
    requestAnimationFrame(tick);
  }
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  requestAnimationFrame(tick);
  window.addEventListener('beforeunload', () => {
    running = false;
    observer.disconnect();
  });
})();

// Scroll-scrubbed tilt for [data-scrub-tilt]
(function initScrubTilt() {
  function onScroll() {
    document.querySelectorAll('[data-scrub-tilt]').forEach(el => {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const p = (center - window.innerHeight / 2) / window.innerHeight; // -0.5..0.5 ish
      const axis = el.dataset.scrubTilt || 'x';
      const mag = Number(el.dataset.scrubStrength) || 14;
      const rx = axis.includes('x') ? -p * mag : 0;
      const ry = axis.includes('y') ? p * mag : 0;
      const scale = 1 - Math.min(0.06, Math.abs(p) * 0.06);
      el.style.transform = `perspective(1400px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    });
  }
  onScroll();
  window.addEventListener('scroll', onScroll, {
    passive: true
  });
  window.addEventListener('resize', onScroll);
})();

// Draggable / spin-inertia wrapper for media elements
function SpinWrap({
  children,
  className = ''
}) {
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let angle = 0;
    let vel = 0;
    let dragging = false;
    let lastX = 0,
      lastT = 0;
    let running = true;

    // Idle breathing rotation; cursor proximity adds bias
    let bias = 0;
    function onMove(e) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const dx = (e.clientX - cx) / r.width;
      bias = dx * 12; // deg
    }
    window.addEventListener('mousemove', onMove, {
      passive: true
    });
    function onDown(e) {
      dragging = true;
      vel = 0;
      lastX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
      lastT = performance.now();
      el.classList.add('grabbing');
      e.preventDefault();
    }
    function onMoveDrag(e) {
      if (!dragging) return;
      const x = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
      const dx = x - lastX;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      angle += dx * 0.4;
      vel = dx * 0.4 / dt * 16; // per ~frame
      lastX = x;
      lastT = now;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('grabbing');
    }
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, {
      passive: false
    });
    window.addEventListener('mousemove', onMoveDrag);
    window.addEventListener('touchmove', onMoveDrag, {
      passive: true
    });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    let idle = 0;
    function tick() {
      if (!running) return;
      if (!dragging) {
        // inertia + slow breathing
        angle += vel;
        vel *= 0.94;
        if (Math.abs(vel) < 0.01) vel = 0;
        idle += 0.006;
        const breathe = Math.sin(idle) * 4;
        // ease angle toward (bias + breathe) when no inertia
        if (vel === 0) {
          const targetAngle = angle * 0.995 + bias * 0.02;
          angle += (targetAngle - angle) * 0.08;
          angle = angle * 0.9995 + breathe * 0.0005;
        }
      }
      el.style.setProperty('--spin', angle.toFixed(2) + 'deg');
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return () => {
      running = false;
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove', onMoveDrag);
      window.removeEventListener('touchmove', onMoveDrag);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    className: `spin-wrap ${className}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "spin-wrap-inner"
  }, children), /*#__PURE__*/React.createElement("div", {
    className: "spin-hint",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", null, "drag"), /*#__PURE__*/React.createElement("span", {
    className: "arc"
  })));
}
window.SpinWrap = SpinWrap;

// src/Sections.jsx
// Shared UI utilities + Header + Hero + Stage + Access + Footer
const {
  useState,
  useEffect,
  useRef
} = React;

// Helper: wrap text in word-spans for reveal animation
function RevealText({
  text,
  tag = 'span',
  className = ''
}) {
  const Tag = tag;
  const parts = text.split(' ');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) el.classList.add('in');
      });
    }, {
      threshold: 0.3
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement(Tag, {
    ref: ref,
    className: `reveal-words ${className}`
  }, parts.map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: `${w}-${i}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "word",
    style: {
      '--i': i
    }
  }, w), i < parts.length - 1 ? ' ' : null)));
}
function ChapterSpine({
  active,
  onNav
}) {
  const trackRef = useRef(null);
  const chapters = [{
    id: 'hero',
    label: 'I',
    name: 'Profile'
  }, {
    id: 'bingx',
    label: 'II',
    name: 'BingX'
  }, {
    id: 'c1k',
    label: 'III',
    name: 'C1K'
  }, {
    id: 'waves',
    label: 'IV',
    name: 'Waves'
  }, {
    id: 'access',
    label: 'V',
    name: 'Access'
  }];
  useEffect(() => {
    let raf = 0;
    let last = '';
    function tick() {
      const header = document.querySelector('.site-header');
      const offset = header ? header.getBoundingClientRect().height + 16 : 40;
      const positions = chapters.map(chapter => {
        const el = document.getElementById(chapter.id);
        return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset) : 0;
      });
      const y = window.scrollY;
      let p = 0;
      const lastIndex = positions.length - 1;
      if (lastIndex > 0 && y >= positions[lastIndex]) {
        p = 1;
      } else {
        for (let i = 0; i < lastIndex; i += 1) {
          const start = positions[i];
          const end = Math.max(start + 1, positions[i + 1]);
          if (y >= start && y < end) {
            p = (i + (y - start) / (end - start)) / lastIndex;
            break;
          }
        }
      }
      const next = p.toFixed(4);
      const track = trackRef.current;
      if (track && next !== last) {
        track.style.setProperty('--spine-progress', next);
        track.style.setProperty('--spine-progress-pct', `${(p * 100).toFixed(2)}%`);
        track.style.setProperty('--spine-progress-y', `${(track.clientHeight * p).toFixed(2)}px`);
        last = next;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return /*#__PURE__*/React.createElement("aside", {
    id: "chapter-spine",
    "aria-label": "Chapter spine"
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    className: "spine-track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spine-fill"
  }), /*#__PURE__*/React.createElement("div", {
    className: "spine-thumb",
    "aria-hidden": "true"
  }), chapters.map((c, i) => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    className: `spine-dot ${active === c.id ? 'active' : ''}`,
    style: {
      top: `calc(${i / (chapters.length - 1) * 100}% - 6px)`
    },
    onClick: () => onNav(c.id),
    "aria-label": `Go to ${c.name}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "spine-roman"
  }, c.label), /*#__PURE__*/React.createElement("span", {
    className: "spine-name"
  }, c.name)))));
}
window.ChapterSpine = ChapterSpine;
const SOCIAL_LINKS = [{
  id: 'youtube',
  label: 'YouTube',
  href: 'https://www.youtube.com/@sobaleu'
}, {
  id: 'telegram',
  label: 'Telegram',
  href: 'https://t.me/sobaleu'
}, {
  id: 'instagram',
  label: 'Instagram',
  href: 'https://www.instagram.com/sobaleu/'
}, {
  id: 'dm',
  label: 'DM',
  href: 'https://t.me/sobaleu'
}];
function SocialIcon({
  id
}) {
  if (id === 'youtube') {
    return /*#__PURE__*/React.createElement("svg", {
      className: "social-icon",
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "3.5",
      y: "6.5",
      width: "17",
      height: "11",
      rx: "3.2"
    }), /*#__PURE__*/React.createElement("path", {
      className: "solid",
      d: "M10.4 9.3v5.4l4.8-2.7-4.8-2.7z"
    }));
  }
  if (id === 'telegram') {
    return /*#__PURE__*/React.createElement("svg", {
      className: "social-icon",
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M20.5 4.6 3.9 11.1c-1 .4-.9 1.8.2 2.1l4.1 1.2 1.7 4.8c.3.9 1.4 1.1 2 .3l2.4-2.8 4.4 3.2c.8.6 1.9.1 2.1-.9l2.1-12.6c.2-1.1-.9-2-2.4-1.4Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m8.5 14.2 8.1-5.5-5.8 6.6-.3 3.6"
    }));
  }
  if (id === 'instagram') {
    return /*#__PURE__*/React.createElement("svg", {
      className: "social-icon",
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "5",
      y: "5",
      width: "14",
      height: "14",
      rx: "4.2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3.2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "16.1",
      cy: "7.9",
      r: "1"
    }));
  }
  return /*#__PURE__*/React.createElement("svg", {
    className: "social-icon",
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5.3 6.2h13.4c1.2 0 2.1.9 2.1 2.1v7.1c0 1.2-.9 2.1-2.1 2.1h-6l-4.2 3v-3H5.3c-1.2 0-2.1-.9-2.1-2.1V8.3c0-1.2.9-2.1 2.1-2.1Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6.9 9 5.1 3.8L17.1 9"
  }));
}
function SocialLinks({
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `social-links ${className}`.trim(),
    "aria-label": "Sobolev contacts"
  }, SOCIAL_LINKS.map(link => /*#__PURE__*/React.createElement("a", {
    key: link.id,
    href: link.href,
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": link.ariaLabel || link.label,
    className: "social-link"
  }, /*#__PURE__*/React.createElement(SocialIcon, {
    id: link.id
  }), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, link.label))));
}
function Header({
  active,
  onNav
}) {
  const [scrolled, setScrolled] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      setPct(p * 100);
      setScrolled(window.scrollY > 40);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const items = [{
    id: 'hero',
    label: 'Profile'
  }, {
    id: 'bingx',
    label: 'BingX'
  }, {
    id: 'c1k',
    label: 'C1K'
  }, {
    id: 'waves',
    label: 'Waves'
  }, {
    id: 'access',
    label: 'Access'
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    id: "scroll-progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar",
    style: {
      width: pct + '%'
    }
  })), /*#__PURE__*/React.createElement("header", {
    className: `site-header ${scrolled ? 'scrolled' : ''}`
  }, /*#__PURE__*/React.createElement("a", {
    href: "#hero",
    className: "brand",
    onClick: e => {
      e.preventDefault();
      onNav('hero');
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sig"
  }, /*#__PURE__*/React.createElement("img", {
    src: "assets/bingx-growth-poster.jpg",
    alt: "BingX",
    draggable: "false",
    decoding: "async"
  })), "Sobolev"), /*#__PURE__*/React.createElement("nav", {
    className: "site-nav"
  }, items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.id,
    href: `#${it.id}`,
    className: active === it.id ? 'active' : '',
    onClick: e => {
      e.preventDefault();
      onNav(it.id);
    }
  }, it.label)))));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    id: "hero",
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kicker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wave-label"
  }, "Wave I"), " \xB7 Andrei Sobolev"), /*#__PURE__*/React.createElement("h1", {
    className: "display xl"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: "Andrei Sobolev.",
    tag: "span"
  })), /*#__PURE__*/React.createElement("p", {
    className: "role"
  }, "Market operator \xB7 Portugal-based \xB7 BingX CIS partner \xB7 Private exchange \xB7 Since 2017"), /*#__PURE__*/React.createElement("p", {
    className: "lede"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: "One entrance for partner growth, private exchange routes, and Elliott Wave education \u2014 direct contact, no agency layer."
  })), /*#__PURE__*/React.createElement("div", {
    className: "cta-row"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn primary",
    "data-magnetic": "0.25",
    href: "https://t.me/sobolev_c1k",
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    "data-magnetic-inner": true
  }, "Contact direct ", /*#__PURE__*/React.createElement("span", {
    className: "arrow"
  }, "\u2192"))), /*#__PURE__*/React.createElement("a", {
    className: "btn ghost",
    "data-magnetic": "0.2",
    href: "https://t.me/p4m_premium_bot",
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    "data-magnetic-inner": true
  }, "Open premium ", /*#__PURE__*/React.createElement("span", {
    className: "arrow"
  }, "\u2192")))), /*#__PURE__*/React.createElement("ul", {
    className: "hero-proof",
    "aria-label": "Profile highlights"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "proof-value"
  }, "2017"), /*#__PURE__*/React.createElement("span", {
    className: "proof-label"
  }, "market cycle start")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "proof-value"
  }, "BingX"), /*#__PURE__*/React.createElement("span", {
    className: "proof-label"
  }, "CIS partner route")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "proof-value"
  }, "C1K"), /*#__PURE__*/React.createElement("span", {
    className: "proof-label"
  }, "private exchange")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "proof-value"
  }, "Waves"), /*#__PURE__*/React.createElement("span", {
    className: "proof-label"
  }, "education and setups")))), /*#__PURE__*/React.createElement("div", {
    className: "hero-portrait"
  }, /*#__PURE__*/React.createElement("div", {
    className: "layer photo"
  }, /*#__PURE__*/React.createElement("img", {
    src: "assets/andrei-hero-crop.jpg",
    alt: "Andrei Sobolev",
    draggable: "false",
    fetchpriority: "high",
    decoding: "async"
  }))));
}
function Stage({
  id,
  ch,
  waveLabel,
  kicker,
  title,
  italics,
  body,
  metrics,
  cta,
  ctaTarget = 'access',
  href,
  flip,
  theme,
  image,
  media,
  align,
  onRoute
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) el.classList.add('in-view');
      });
    }, {
      threshold: 0.35
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: `stage ${flip ? 'flip' : ''} theme-${theme}`,
    id: id,
    "data-screen-label": `${ch} ${title.replace(/\./g, '')}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "stage-copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kicker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wave-label"
  }, waveLabel), " \xB7 ", kicker), /*#__PURE__*/React.createElement("h2", {
    className: "display l"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: title
  }), italics && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement(RevealText, {
    text: italics,
    className: "italic"
  }))), /*#__PURE__*/React.createElement("p", {
    className: "lede"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: body
  })), /*#__PURE__*/React.createElement("ul", {
    className: "metrics"
  }, metrics.map((m, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("span", null, m)))), href ? /*#__PURE__*/React.createElement("a", {
    className: "btn",
    "data-magnetic": "0.25",
    href: href,
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    "data-magnetic-inner": true
  }, cta, " ", /*#__PURE__*/React.createElement("span", {
    className: "arrow"
  }, "\u2192"))) : /*#__PURE__*/React.createElement("button", {
    className: "btn",
    "data-magnetic": "0.25",
    onClick: () => onRoute && onRoute(ctaTarget)
  }, /*#__PURE__*/React.createElement("span", {
    "data-magnetic-inner": true
  }, cta, " ", /*#__PURE__*/React.createElement("span", {
    className: "arrow"
  }, "\u2192")))), /*#__PURE__*/React.createElement("div", {
    className: "stage-media"
  }, media ? media : /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: title,
    loading: "lazy",
    decoding: "async"
  }), /*#__PURE__*/React.createElement("div", {
    className: "scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "corner-tag"
  }, waveLabel, " \xB7 ", kicker), /*#__PURE__*/React.createElement("div", {
    className: "overlay-title"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, kicker, " \xB7 ", ch))));
}
function Interlude({
  quote,
  em,
  sig
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "interlude"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("blockquote", null, /*#__PURE__*/React.createElement(RevealText, {
    text: quote
  }), em && /*#__PURE__*/React.createElement(React.Fragment, null, " ", /*#__PURE__*/React.createElement("em", null, /*#__PURE__*/React.createElement(RevealText, {
    text: em
  })))), /*#__PURE__*/React.createElement("div", {
    className: "sig"
  }, "\u2014 ", sig)));
}
function Access({
  onRoute
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "access",
    id: "access",
    "data-screen-label": "05 Access"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kicker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wave-label"
  }, "Wave V"), " \xB7 Choose the route"), /*#__PURE__*/React.createElement("h2", {
    className: "display xl"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: "Direct access."
  })), /*#__PURE__*/React.createElement("p", {
    className: "lede"
  }, /*#__PURE__*/React.createElement(RevealText, {
    text: "Choose the route: partner access, private exchange, or premium market education."
  })), /*#__PURE__*/React.createElement("div", {
    className: "doors"
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://bingx.com/partner/andreisobolev",
    className: "door bingx",
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    className: "door-no"
  }, "01 \xB7 BingX"), /*#__PURE__*/React.createElement("div", {
    className: "door-title"
  }, "Partner", /*#__PURE__*/React.createElement("br", null), "growth."), /*#__PURE__*/React.createElement("p", {
    className: "door-desc"
  }, "CIS expansion, creator network, regional partner structure. Public-facing."), /*#__PURE__*/React.createElement("div", {
    className: "door-cta"
  }, /*#__PURE__*/React.createElement("span", null, "Open BingX"), /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192"))), /*#__PURE__*/React.createElement("a", {
    href: "https://t.me/sobolev_c1k",
    className: "door c1k",
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    className: "door-no"
  }, "02 \xB7 C1K"), /*#__PURE__*/React.createElement("div", {
    className: "door-title"
  }, "Private", /*#__PURE__*/React.createElement("br", null), "exchange."), /*#__PURE__*/React.createElement("p", {
    className: "door-desc"
  }, "Crypto \u2194 cash across Lisbon \xB7 Kyiv \xB7 Dubai \xB7 CH. Discretion + timing."), /*#__PURE__*/React.createElement("div", {
    className: "door-cta"
  }, /*#__PURE__*/React.createElement("span", null, "Message C1K"), /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192"))), /*#__PURE__*/React.createElement("a", {
    href: "https://t.me/p4m_premium_bot",
    className: "door waves",
    target: "_blank",
    rel: "noopener noreferrer"
  }, /*#__PURE__*/React.createElement("span", {
    className: "door-no"
  }, "03 \xB7 Waves"), /*#__PURE__*/React.createElement("div", {
    className: "door-title"
  }, "Premium", /*#__PURE__*/React.createElement("br", null), "setups."), /*#__PURE__*/React.createElement("p", {
    className: "door-desc"
  }, "Wave counts \xB7 scenario logic \xB7 timing discipline. Education for operators."), /*#__PURE__*/React.createElement("div", {
    className: "door-cta"
  }, /*#__PURE__*/React.createElement("span", null, "Open Premium"), /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192")))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "site-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "foot-mark"
  }, "Sobolev", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("small", null, "\xA9 ", new Date().getFullYear())), /*#__PURE__*/React.createElement(SocialLinks, {
    className: "footer-social"
  }));
}
window.RevealText = RevealText;
window.Header = Header;
window.Hero = Hero;
window.Stage = Stage;
window.Interlude = Interlude;
window.Access = Access;
window.Footer = Footer;
window.SocialLinks = SocialLinks;

// src/App.jsx
// Spinning brand mark for BingX stage (no bg, just the rotating logo)
function SpinningLogo({
  label = 'BingX'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "spinning-logo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spin-3d"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 200",
    className: "logo-svg",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "bxg",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#3edc81"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#9dffc5"
  }))), /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "url(#bxg)",
    strokeWidth: "10",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 55 40 L 55 160"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 55 40 Q 135 40 135 70 Q 135 100 75 100"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 75 100 Q 145 100 145 130 Q 145 160 55 160"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 130 55 L 165 30",
    opacity: ".55"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 140 150 L 175 170",
    opacity: ".55"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "spin-orbit"
  }), /*#__PURE__*/React.createElement("div", {
    className: "spin-orbit b"
  }));
}

// Boomerang mark for C1K stage (rotate forward, reverse, loop)
function BoomerangLogo({
  label = 'C1K · Private'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "spinning-logo c1k"
  }, /*#__PURE__*/React.createElement("div", {
    className: "boomerang-3d"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 200",
    className: "logo-svg",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "c1kg",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#cc8f58"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#f4d56c"
  }))), /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "url(#c1kg)",
    strokeWidth: "9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 78 58 Q 40 58 40 100 Q 40 142 78 142"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 95 70 L 108 60 L 108 142"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 135 58 L 135 142"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 170 60 L 135 100 L 170 140"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "40",
    cy: "100",
    r: "3",
    fill: "#f4d56c",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "170",
    cy: "100",
    r: "3",
    fill: "#cc8f58",
    stroke: "none"
  })), /*#__PURE__*/React.createElement("path", {
    d: "M 40 100 Q 100 30 170 100 Q 100 170 40 100 Z",
    fill: "none",
    stroke: "rgba(244,213,108,.25)",
    strokeWidth: "1.2",
    strokeDasharray: "3 6"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "spin-orbit amber"
  }));
}

// Boomerang mark for Waves stage — Elliott impulse/corrective
function WaveLogo({
  label = 'Elliott Wave'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "spinning-logo waves"
  }, /*#__PURE__*/React.createElement("div", {
    className: "boomerang-3d"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 200",
    className: "logo-svg",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "wvg",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#f4d56c"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#ffe9a3"
  }))), /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "url(#wvg)",
    strokeWidth: "6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 25 140 L 60 90 L 85 120 L 115 55 L 140 95 L 175 40"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 175 40 L 160 75 L 172 60 L 155 90",
    opacity: ".45"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "60",
    cy: "90",
    r: "4",
    fill: "#f4d56c",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "85",
    cy: "120",
    r: "4",
    fill: "#f4d56c",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "115",
    cy: "55",
    r: "4",
    fill: "#f4d56c",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "140",
    cy: "95",
    r: "4",
    fill: "#f4d56c",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "175",
    cy: "40",
    r: "5",
    fill: "#ffe9a3",
    stroke: "none"
  })), /*#__PURE__*/React.createElement("g", {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "10",
    fill: "rgba(255,255,255,.55)"
  }, /*#__PURE__*/React.createElement("text", {
    x: "55",
    y: "80"
  }, "I"), /*#__PURE__*/React.createElement("text", {
    x: "80",
    y: "138"
  }, "II"), /*#__PURE__*/React.createElement("text", {
    x: "110",
    y: "45"
  }, "III"), /*#__PURE__*/React.createElement("text", {
    x: "135",
    y: "113"
  }, "IV"), /*#__PURE__*/React.createElement("text", {
    x: "168",
    y: "30"
  }, "V")))), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "spin-orbit gold"
  }));
}

// Animated waves logo — SVG recreation: glass frame + flowing candles + two wave streams.
// Everything animated, fully transparent background.
function WavesAnimated({
  label = 'Elliott Wave'
}) {
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let tx = 0,
      ty = 0,
      cx = 0,
      cy = 0,
      running = true;
    const onMove = e => {
      const r = wrap.getBoundingClientRect();
      tx = (e.clientX - r.left - r.width / 2) / r.width;
      ty = (e.clientY - r.top - r.height / 2) / r.height;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
    const tick = () => {
      if (!running) return;
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      wrap.style.setProperty('--rx', (-cy * 5).toFixed(2) + 'deg');
      wrap.style.setProperty('--ry', (cx * 8).toFixed(2) + 'deg');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
      wrap.removeEventListener('mousemove', onMove);
      wrap.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Candle data: [x%, baseY%, heightPct, color, delay]
  const candles = [[12, 52, 24, 'b', 0.0], [18, 48, 32, 'y', 0.3], [24, 55, 22, 'b', 0.6], [30, 44, 38, 'y', 0.2], [36, 50, 28, 'b', 0.8], [42, 42, 44, 'y', 0.5], [48, 38, 50, 'b', 0.1], [54, 32, 58, 'y', 0.7], [60, 28, 62, 'b', 0.4], [66, 34, 52, 'y', 0.9], [72, 30, 56, 'b', 0.2], [78, 40, 44, 'y', 0.6], [84, 46, 34, 'b', 0.3]];
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    className: "spinning-logo waves-animated"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 400 360",
    className: "waves-svg",
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "glass-edge",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#a7d3ff",
    stopOpacity: ".9"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: ".5",
    stopColor: "#5a8fd9",
    stopOpacity: ".6"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#a7d3ff",
    stopOpacity: ".85"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "glass-fill",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "rgba(255,255,255,0.06)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "rgba(20,30,50,0.14)"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "wave-blue",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#6bb0ff",
    stopOpacity: "0"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: ".5",
    stopColor: "#6bb0ff",
    stopOpacity: "1"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#6bb0ff",
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "wave-gold",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#ffd47a",
    stopOpacity: "0"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: ".5",
    stopColor: "#ffd47a",
    stopOpacity: "1"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#ffd47a",
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("filter", {
    id: "wave-glow"
  }, /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: "2.2"
  }), /*#__PURE__*/React.createElement("feMerge", null, /*#__PURE__*/React.createElement("feMergeNode", null), /*#__PURE__*/React.createElement("feMergeNode", {
    in: "SourceGraphic"
  }))), /*#__PURE__*/React.createElement("clipPath", {
    id: "frame-clip"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "28",
    y: "28",
    width: "344",
    height: "304",
    rx: "22"
  }))), /*#__PURE__*/React.createElement("rect", {
    x: "28",
    y: "28",
    width: "344",
    height: "304",
    rx: "22",
    fill: "url(#glass-fill)"
  }), /*#__PURE__*/React.createElement("g", {
    clipPath: "url(#frame-clip)"
  }, /*#__PURE__*/React.createElement("g", {
    className: "candles"
  }, candles.map((c, i) => {
    const [x, y, h, col, delay] = c;
    const px = 28 + x / 100 * 344;
    const py = 28 + y / 100 * 304;
    const ph = h / 100 * 304;
    const fill = col === 'b' ? '#5bbcff' : '#ffd47a';
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      style: {
        '--d': delay + 's'
      },
      className: "candle"
    }, /*#__PURE__*/React.createElement("line", {
      x1: px,
      y1: py - 16,
      x2: px,
      y2: py + ph + 16,
      stroke: fill,
      strokeWidth: "1.2",
      opacity: ".55"
    }), /*#__PURE__*/React.createElement("rect", {
      x: px - 7,
      y: py,
      width: "14",
      height: ph,
      rx: "1.5",
      fill: fill
    }));
  })), /*#__PURE__*/React.createElement("g", {
    filter: "url(#wave-glow)",
    className: "wave-streams"
  }, /*#__PURE__*/React.createElement("path", {
    className: "wave-a",
    d: "M -80,210 C 0,170 60,240 140,210 S 260,170 340,200 S 460,240 540,210",
    stroke: "url(#wave-blue)",
    strokeWidth: "3.5",
    fill: "none",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    className: "wave-b",
    d: "M -80,200 C 0,230 80,170 160,200 S 280,240 360,200 S 460,170 540,200",
    stroke: "url(#wave-gold)",
    strokeWidth: "3",
    fill: "none",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    className: "wave-c",
    d: "M -80,220 C 20,200 100,230 180,210 S 300,190 380,215 S 480,230 560,215",
    stroke: "url(#wave-blue)",
    strokeWidth: "1.5",
    fill: "none",
    opacity: ".4",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("rect", {
    x: "28",
    y: "28",
    width: "344",
    height: "304",
    rx: "22",
    fill: "none",
    stroke: "url(#glass-edge)",
    strokeWidth: "3"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "32",
    y: "32",
    width: "336",
    height: "296",
    rx: "19",
    fill: "none",
    stroke: "rgba(255,255,255,.18)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 50,34 L 180,34",
    stroke: "rgba(255,255,255,.55)",
    strokeWidth: "1.2",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 40,44 L 40,120",
    stroke: "rgba(255,255,255,.35)",
    strokeWidth: "1",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label));
}
function WavesGlassImage({
  label = 'Elliott Wave'
}) {
  const ref = React.useRef(null);
  const moveGlass = React.useCallback(event => {
    const el = ref.current;
    if (!el) return;
    const object = el.querySelector('.waves-glass-object');
    const rect = (object || el).getBoundingClientRect();
    const clamp = value => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    const rx = (0.5 - y) * 8;
    const ry = (x - 0.5) * 10;
    el.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(2)}%`);
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x - 0.5) * 14).toFixed(2)}px`);
    el.style.setProperty('--gy', `${((y - 0.5) * 10).toFixed(2)}px`);
  }, []);
  const resetGlass = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--gx', '0px');
    el.style.setProperty('--gy', '0px');
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: "waves-glass-image",
    role: "img",
    "aria-label": label,
    onPointerMove: moveGlass,
    onPointerLeave: resetGlass
  }, /*#__PURE__*/React.createElement("div", {
    className: "waves-glass-object"
  }, /*#__PURE__*/React.createElement("img", {
    className: "asset-base",
    src: "assets/waves-static-premium.png",
    alt: label,
    draggable: "false",
    loading: "eager",
    decoding: "async",
    fetchPriority: "high"
  }), /*#__PURE__*/React.createElement("img", {
    className: "asset-reflect",
    src: "assets/waves-static-premium.png",
    alt: "",
    "aria-hidden": "true",
    draggable: "false",
    loading: "eager",
    decoding: "async",
    fetchPriority: "high"
  })));
}
function C1KCutout({
  label = 'C1K · Private'
}) {
  const ref = React.useRef(null);
  const moveLogo = React.useCallback(event => {
    const el = ref.current;
    if (!el) return;
    const object = el.querySelector('.c1k-static-object');
    const rect = (object || el).getBoundingClientRect();
    const clamp = value => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    el.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(2)}%`);
    el.style.setProperty('--rx', `${((0.5 - y) * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x - 0.5) * 12).toFixed(2)}px`);
    el.style.setProperty('--gy', `${((y - 0.5) * 9).toFixed(2)}px`);
  }, []);
  const resetLogo = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--gx', '0px');
    el.style.setProperty('--gy', '0px');
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: "c1k-static-image",
    role: "img",
    "aria-label": label,
    onPointerMove: moveLogo,
    onPointerLeave: resetLogo
  }, /*#__PURE__*/React.createElement("div", {
    className: "c1k-static-object"
  }, /*#__PURE__*/React.createElement("img", {
    className: "asset-base",
    src: "assets/c1k-static-premium.png",
    alt: label,
    draggable: "false",
    loading: "eager",
    decoding: "async",
    fetchPriority: "high"
  }), /*#__PURE__*/React.createElement("img", {
    className: "asset-reflect",
    src: "assets/c1k-static-premium.png",
    alt: "",
    "aria-hidden": "true",
    draggable: "false",
    loading: "eager",
    decoding: "async",
    fetchPriority: "high"
  })));
}

// Video mark — autoplay, muted, loop
function VideoLogo({
  src,
  label,
  className = '',
  poster
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) v.play().catch(() => {});else v.pause();
      });
    }, {
      threshold: 0.25
    });
    observer.observe(v);
    return () => observer.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: `spinning-logo video-logo ${className}`
  }, /*#__PURE__*/React.createElement("video", {
    ref: ref,
    className: "logo-video",
    src: src,
    poster: poster,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "metadata"
  }), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label));
}

// Boomerang: start ping-pong playback immediately as frames stream in.
// Video captures silently in background; canvas plays forward+reverse across
// whatever frames exist *right now*, growing until full, then locks as true boomerang.
function BoomerangVideo({
  src,
  label,
  className = ''
}) {
  const vRef = React.useRef(null);
  const cRef = React.useRef(null);
  React.useEffect(() => {
    const v = vRef.current,
      c = cRef.current;
    if (!v || !c) return;
    const ctx = c.getContext('2d');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.loop = false;
    const frames = [];
    const MAX_FRAMES = 90;
    let grabTick = 0;
    let cancelled = false,
      rafPlay = 0,
      done = false;
    let i = 0,
      dir = 1,
      last = 0;
    const FPS = 1000 / 30;
    const grab = () => {
      if (cancelled || done) return;
      if (v.videoWidth && c.width !== v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
      if (v.readyState >= 2 && v.videoWidth && frames.length < MAX_FRAMES && grabTick++ % 2 === 0) {
        const f = document.createElement('canvas');
        f.width = v.videoWidth;
        f.height = v.videoHeight;
        try {
          f.getContext('2d').drawImage(v, 0, 0);
          frames.push(f);
        } catch (_) {}
      }
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(grab);
    };
    const onEnded = () => {
      done = true;
      v.pause();
    };
    const loop = t => {
      rafPlay = requestAnimationFrame(loop);
      if (!frames.length) return;
      if (t - last < FPS) return;
      last = t;
      const endIdx = frames.length - 1;
      i += dir;
      if (i >= endIdx) {
        i = endIdx;
        dir = -1;
      } else if (i <= 0) {
        i = 0;
        dir = 1;
      }
      ctx.drawImage(frames[i], 0, 0);
    };
    v.addEventListener('ended', onEnded);
    const start = () => {
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(grab);
      v.play().catch(() => {});
      rafPlay = requestAnimationFrame(loop);
    };
    if (v.readyState >= 2) start();else v.addEventListener('canplay', start, {
      once: true
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafPlay);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('canplay', start);
    };
  }, [src]);
  return /*#__PURE__*/React.createElement("div", {
    className: `spinning-logo video-logo boomerang ${className}`
  }, /*#__PURE__*/React.createElement("video", {
    ref: vRef,
    src: src,
    muted: true,
    playsInline: true,
    preload: "metadata",
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("canvas", {
    ref: cRef,
    className: "logo-video"
  }), /*#__PURE__*/React.createElement("div", {
    className: "spin-label"
  }, label));
}
function App() {
  const [active, setActive] = React.useState('hero');
  const scrollTo = (id, replace = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector('.site-header');
    const offset = header ? header.getBoundingClientRect().height + 16 : 40;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method](null, '', nextHash);
    }
    window.scrollTo({
      top,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
    setActive(id);
  };
  React.useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const ids = ['hero', 'bingx', 'c1k', 'waves', 'access'];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) setActive(e.target.id);
      });
    }, {
      rootMargin: '-30% 0px -45% 0px',
      threshold: 0.01
    });
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    const syncHash = () => {
      const id = window.location.hash.replace('#', '') || 'hero';
      if (ids.includes(id)) {
        requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(id, true)));
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('load', syncHash, {
      once: true
    });
    return () => {
      obs.disconnect();
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('load', syncHash);
    };
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(FluidBackground, null), /*#__PURE__*/React.createElement(WaveSpine, null), /*#__PURE__*/React.createElement(CursorParticles, null), /*#__PURE__*/React.createElement(Header, {
    active: active,
    onNav: scrollTo
  }), /*#__PURE__*/React.createElement(ChapterSpine, {
    active: active,
    onNav: scrollTo
  }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(Stage, {
    id: "bingx",
    ch: "02",
    waveLabel: "Wave II",
    kicker: "BingX",
    title: "Partner growth.",
    italics: "Public signal.",
    body: "Business development, creator alignment, and regional partner structure \u2014 built to expand reach without losing control.",
    metrics: ['CIS expansion · EU', 'Creator network · public', 'Partner structure · tiered'],
    cta: "Open BingX",
    ctaTarget: "access",
    href: "https://bingx.com/partner/andreisobolev",
    theme: "growth",
    onRoute: scrollTo,
    media: /*#__PURE__*/React.createElement(VideoLogo, {
      src: "assets/bingx.mov",
      poster: "assets/bingx-growth-poster.jpg",
      label: "BingX",
      className: "bingx-legacy"
    })
  }), /*#__PURE__*/React.createElement(Interlude, {
    quote: "Crypto to cash.",
    em: "Cash to crypto.",
    sig: "Wave III \xB7 C1K"
  }), /*#__PURE__*/React.createElement(Stage, {
    id: "c1k",
    ch: "03",
    waveLabel: "Wave III",
    kicker: "C1K \xB7 Private",
    title: "Routes, not rails.",
    italics: "Private execution.",
    body: "Exchange service for clients who need discretion, timing, and cross-border execution \u2014 without public noise.",
    metrics: ['Lisbon · Kyiv · Dubai · CH', 'BTC / ETH / USDT', 'USD / EUR / cash'],
    cta: "Message C1K",
    ctaTarget: "access",
    href: "https://t.me/sobolev_c1k",
    theme: "liquidity",
    flip: true,
    onRoute: scrollTo,
    media: /*#__PURE__*/React.createElement(C1KCutout, {
      label: "C1K \xB7 Private"
    })
  }), /*#__PURE__*/React.createElement(Interlude, {
    quote: "Count the structure.",
    em: "Then act on conviction.",
    sig: "Wave IV \xB7 Education"
  }), /*#__PURE__*/React.createElement(Stage, {
    id: "waves",
    ch: "04",
    waveLabel: "Wave IV",
    kicker: "Elliott Wave",
    title: "Discipline, not drama.",
    italics: "Read before acting.",
    body: "Wave counts, scenario logic, and timing discipline used to read structure \u2014 impulse, correction, conviction.",
    metrics: ['Impulse I–V', 'Corrective A-B-C', 'Premium setups · members'],
    cta: "Open Premium",
    ctaTarget: "access",
    href: "https://t.me/p4m_premium_bot",
    theme: "education",
    onRoute: scrollTo,
    media: /*#__PURE__*/React.createElement(WavesGlassImage, {
      label: "Elliott Wave"
    })
  }), /*#__PURE__*/React.createElement(Access, {
    onRoute: scrollTo
  })), /*#__PURE__*/React.createElement(Footer, null));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));

// --- Tweaks panel bridge ---
(function initTweaks() {
  const EDITMODE_DEFAULTS = /*EDITMODE-BEGIN*/{
    "grain": 2,
    "fluid": true,
    "waveIntensity": 0.55,
    "cursorParticles": false
  } /*EDITMODE-END*/;
  function apply(values) {
    document.body.setAttribute('data-grain', String(values.grain));
    document.body.setAttribute('data-fluid', values.fluid ? 'on' : 'off');
    document.body.setAttribute('data-cursor-particles', values.cursorParticles ? 'on' : 'off');
    const spine = document.querySelector('#wave-spine-container svg');
    if (spine) spine.style.opacity = String(values.waveIntensity);
    const cursor = document.querySelector('#cursor-layer');
    if (cursor) cursor.style.display = values.cursorParticles ? '' : 'none';
  }
  const state = {
    ...EDITMODE_DEFAULTS
  };
  apply(state);
  function persist(patch) {
    Object.assign(state, patch);
    apply(state);
    try {
      window.parent.postMessage({
        type: '__edit_mode_set_keys',
        edits: patch
      }, '*');
    } catch (_) {}
  }
  const panel = document.createElement('div');
  panel.id = 'tweaks-panel';
  panel.innerHTML = `
    <h4>Tweaks <button class="close">×</button></h4>
    <label>Grain
      <input type="range" id="tw-grain" min="0" max="3" step="1" value="${state.grain}">
    </label>
    <label>WebGL fluid bg
      <input type="checkbox" id="tw-fluid" ${state.fluid ? 'checked' : ''}>
    </label>
    <label>Wave spine
      <input type="range" id="tw-wave" min="0" max="1" step="0.05" value="${state.waveIntensity}">
    </label>
    <label>Cursor trail
      <input type="checkbox" id="tw-cursor" ${state.cursorParticles ? 'checked' : ''}>
    </label>
    <div class="hint">press T to toggle</div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.close').addEventListener('click', () => panel.classList.remove('show'));
  panel.querySelector('#tw-grain').addEventListener('input', e => persist({
    grain: Number(e.target.value)
  }));
  panel.querySelector('#tw-fluid').addEventListener('change', e => persist({
    fluid: e.target.checked
  }));
  panel.querySelector('#tw-wave').addEventListener('input', e => persist({
    waveIntensity: Number(e.target.value)
  }));
  panel.querySelector('#tw-cursor').addEventListener('change', e => persist({
    cursorParticles: e.target.checked
  }));
  window.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key.toLowerCase() === 't') panel.classList.toggle('show');
  });
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === '__activate_edit_mode') panel.classList.add('show');
    if (e.data.type === '__deactivate_edit_mode') panel.classList.remove('show');
  });
  setTimeout(() => {
    try {
      window.parent.postMessage({
        type: '__edit_mode_available'
      }, '*');
    } catch (_) {}
  }, 120);
})();
