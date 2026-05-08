function FluidBackground() {
  const canvasRef = React.useRef(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      canvas.style.display = "none";
      return;
    }
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      canvas.style.display = "none";
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
        console.warn("Shader error:", gl.getShaderInfoLog(s));
      }
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("Shader program error:", gl.getProgramInfoLog(prog));
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uScroll = gl.getUniformLocation(prog, "uScroll");
    const uThemeBlue = gl.getUniformLocation(prog, "uThemeBlue");
    const uThemeWarm = gl.getUniformLocation(prog, "uThemeWarm");
    const uThemeYellow = gl.getUniformLocation(prog, "uThemeYellow");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);
    let mx = 0.5, my = 0.5, mxT = 0.5, myT = 0.5;
    function onMove(e) {
      var _a, _b, _c, _d;
      const x = (_b = e.clientX) != null ? _b : e.touches && ((_a = e.touches[0]) == null ? void 0 : _a.clientX);
      const y = (_d = e.clientY) != null ? _d : e.touches && ((_c = e.touches[0]) == null ? void 0 : _c.clientY);
      if (x == null) return;
      mxT = x / window.innerWidth;
      myT = 1 - y / window.innerHeight;
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.__scrollProgress = 0;
    window.__themeWeights = [1, 0.4, 0.25];
    const start = performance.now();
    let running = true;
    function frame() {
      if (!running) return;
      if (document.visibilityState === "hidden") {
        requestAnimationFrame(frame);
        return;
      }
      const t = (performance.now() - start) / 1e3;
      mx += (mxT - mx) * 0.05;
      my += (myT - my) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mx * canvas.width, my * canvas.height);
      gl.uniform1f(uScroll, window.__scrollProgress || 0);
      const w2 = window.__themeWeights || [1, 0.4, 0.25];
      gl.uniform1f(uThemeBlue, w2[0]);
      gl.uniform1f(uThemeWarm, w2[1]);
      gl.uniform1f(uThemeYellow, w2[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }
    frame();
    return () => {
      running = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("canvas", { id: "fluid-canvas", ref: canvasRef });
}
window.FluidBackground = FluidBackground;
function SectionAnchor({ tone = "blue", ringCount = 3, children }) {
  const rootRef = React.useRef(null);
  const tiltRef = React.useRef(null);
  React.useEffect(() => {
    const root2 = rootRef.current;
    const tilt = tiltRef.current;
    if (!root2 || !tilt) return;
    let running = true;
    let rx = 0, ry = 0, rxT = 0, ryT = 0;
    let cy = 0, cyT = 0;
    let spin = 0;
    function onMove(e) {
      const r = root2.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      rxT = -y * 6;
      ryT = x * 10;
    }
    function onLeave() {
      rxT = 0;
      ryT = 0;
    }
    root2.addEventListener("mousemove", onMove);
    root2.addEventListener("mouseleave", onLeave);
    function onScroll() {
      const r = root2.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      const p = Math.max(-1, Math.min(1, mid / (window.innerHeight * 0.9)));
      cyT = -p * 60;
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    function tick() {
      if (!running) return;
      rx += (rxT - rx) * 0.08;
      ry += (ryT - ry) * 0.08;
      cy += (cyT - cy) * 0.08;
      spin += 0.04 + (window.__scrollVelocity || 0) * 5e-3;
      tilt.style.transform = `translate3d(0, ${cy.toFixed(2)}px, 0) rotateX(${(62 + rx).toFixed(2)}deg) rotateZ(${ry.toFixed(2)}deg)`;
      const rings2 = tilt.querySelectorAll(".anchor-ring");
      rings2.forEach((r, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = 1 + i * 0.35;
        r.style.transform = `rotate(${(spin * speed * dir).toFixed(2)}deg)`;
      });
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      running = false;
      root2.removeEventListener("mousemove", onMove);
      root2.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  const rings = [];
  for (let i = 0; i < ringCount; i++) {
    const pct = 100 - i * 16;
    rings.push(
      /* @__PURE__ */ React.createElement(
        "div",
        {
          key: i,
          className: "anchor-ring",
          style: {
            width: pct + "%",
            height: pct + "%",
            borderWidth: 1 + i * 0.4 + "px",
            opacity: 0.7 - i * 0.18
          }
        }
      )
    );
  }
  return /* @__PURE__ */ React.createElement("div", { className: `section-anchor tone-${tone}`, ref: rootRef }, /* @__PURE__ */ React.createElement("div", { className: "anchor-stage", ref: tiltRef }, /* @__PURE__ */ React.createElement("div", { className: "anchor-disc" }), rings, /* @__PURE__ */ React.createElement("div", { className: "anchor-spokes" })), /* @__PURE__ */ React.createElement("div", { className: "anchor-floor" }), /* @__PURE__ */ React.createElement("div", { className: "anchor-content" }, children));
}
window.SectionAnchor = SectionAnchor;
function CursorParticles() {
  const layerRef = React.useRef(null);
  React.useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (reduceMotion || coarsePointer) return;
    const dots = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.className = "cursor-dot";
      d.style.width = 10 - i * 0.5 + "px";
      d.style.height = 10 - i * 0.5 + "px";
      d.style.opacity = String(1 - i / N);
      layer.appendChild(d);
      dots.push({ el: d, x: -100, y: -100 });
    }
    let tx = -100, ty = -100;
    function onMove(e) {
      tx = e.clientX;
      ty = e.clientY;
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    let running = true;
    function tick() {
      if (!running) return;
      let x = tx, y = ty;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += (x - d.x) * (0.22 - i * 0.01);
        d.y += (y - d.y) * (0.22 - i * 0.01);
        d.el.style.left = d.x + "px";
        d.el.style.top = d.y + "px";
        x = d.x;
        y = d.y;
      }
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      running = false;
      window.removeEventListener("mousemove", onMove);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { id: "cursor-layer", ref: layerRef });
}
function WaveSpine() {
  const pathRef = React.useRef(null);
  const svgRef = React.useRef(null);
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len + " " + len;
    path.style.strokeDashoffset = len;
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      path.style.strokeDashoffset = String(len * (1 - p));
      const hue = p < 0.33 ? "#2f68ff" : p < 0.66 ? "#cc8f58" : "#f4d56c";
      path.setAttribute("stroke", hue);
      const blue = Math.max(0, 1 - Math.abs(p - 0.22) * 3);
      const warm = Math.max(0, 1 - Math.abs(p - 0.55) * 3);
      const yell = Math.max(0, 1 - Math.abs(p - 0.82) * 3);
      const total = blue + warm + yell + 0.35;
      window.__themeWeights = [
        Math.max(0.35, blue + 0.1),
        warm * 1.1,
        yell * 1.1
      ];
      window.__scrollProgress = p;
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { id: "wave-spine-container" }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref: svgRef,
      viewBox: "0 0 100 800",
      preserveAspectRatio: "none",
      style: {
        position: "absolute",
        right: "max(24px, calc((100vw - 1320px)/2 - 60px))",
        top: 0,
        bottom: 0,
        width: "60px",
        height: "100%",
        opacity: 0.55,
        mixBlendMode: "screen"
      }
    },
    /* @__PURE__ */ React.createElement(
      "path",
      {
        ref: pathRef,
        d: "M 50,0\n             L 55,60 L 45,110 L 62,150 L 38,200\n             L 58,245 L 42,290 L 65,340 L 35,390 L 58,440\n             L 40,490 L 62,540 L 38,590 L 60,640\n             L 45,690 L 55,740 L 50,800",
        stroke: "#2f68ff",
        strokeWidth: "1.2",
        fill: "none",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { filter: "drop-shadow(0 0 6px currentColor)" }
      }
    )
  ));
}
window.CursorParticles = CursorParticles;
window.WaveSpine = WaveSpine;
const { useState, useEffect, useRef } = React;
function RevealText({ text, tag = "span", className = "" }) {
  const Tag = tag;
  const parts = text.split(" ");
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) el.classList.add("in");
      });
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return /* @__PURE__ */ React.createElement(Tag, { ref, className: `reveal-words ${className}` }, parts.map((w, i) => /* @__PURE__ */ React.createElement(React.Fragment, { key: `${w}-${i}` }, /* @__PURE__ */ React.createElement("span", { className: "word", style: { "--i": i } }, w), i < parts.length - 1 ? " " : null)));
}
function ChapterSpine({ active, onNav }) {
  const trackRef = useRef(null);
  const chapters = [
    { id: "hero", label: "I", name: "Profile" },
    { id: "bingx", label: "II", name: "BingX" },
    { id: "c1k", label: "III", name: "C1K" },
    { id: "waves", label: "IV", name: "Premium" },
    { id: "access", label: "V", name: "Access" }
  ];
  useEffect(() => {
    let raf = 0;
    let last = "";
    function tick() {
      const header = document.querySelector(".site-header");
      const offset = header ? header.getBoundingClientRect().height + 16 : 40;
      const positions = chapters.map((chapter) => {
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
        track.style.setProperty("--spine-progress", next);
        track.style.setProperty("--spine-progress-pct", `${(p * 100).toFixed(2)}%`);
        track.style.setProperty("--spine-progress-y", `${(track.clientHeight * p).toFixed(2)}px`);
        last = next;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("aside", { id: "chapter-spine", "aria-label": "Chapter spine" }, /* @__PURE__ */ React.createElement("div", { ref: trackRef, className: "spine-track" }, /* @__PURE__ */ React.createElement("div", { className: "spine-fill" }), /* @__PURE__ */ React.createElement("div", { className: "spine-thumb", "aria-hidden": "true" }), chapters.map((c, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: c.id,
      className: `spine-dot ${active === c.id ? "active" : ""}`,
      style: { top: `calc(${i / (chapters.length - 1) * 100}% - 6px)` },
      onClick: () => onNav(c.id),
      "aria-label": `Go to ${c.name}`
    },
    /* @__PURE__ */ React.createElement("span", { className: "spine-roman" }, c.label),
    /* @__PURE__ */ React.createElement("span", { className: "spine-name" }, c.name)
  ))));
}
window.ChapterSpine = ChapterSpine;
const SOCIAL_LINKS = [
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/channel/UC0btvS_RZvsgJVkCywaSHyQ" },
  { id: "telegram", label: "Telegram", href: "https://t.me/joinchat/B2Hg1f7a3_40YTNi" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/andrei_sobolev_/" },
  { id: "dm", label: "DM", href: "https://t.me/andreisobolev" }
];
function SocialIcon({ id }) {
  if (id === "youtube") {
    return /* @__PURE__ */ React.createElement("svg", { className: "social-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "6.5", width: "17", height: "11", rx: "3.2" }), /* @__PURE__ */ React.createElement("path", { className: "solid", d: "M10.4 9.3v5.4l4.8-2.7-4.8-2.7z" }));
  }
  if (id === "telegram") {
    return /* @__PURE__ */ React.createElement("svg", { className: "social-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M20.5 4.6 3.9 11.1c-1 .4-.9 1.8.2 2.1l4.1 1.2 1.7 4.8c.3.9 1.4 1.1 2 .3l2.4-2.8 4.4 3.2c.8.6 1.9.1 2.1-.9l2.1-12.6c.2-1.1-.9-2-2.4-1.4Z" }), /* @__PURE__ */ React.createElement("path", { d: "m8.5 14.2 8.1-5.5-5.8 6.6-.3 3.6" }));
  }
  if (id === "instagram") {
    return /* @__PURE__ */ React.createElement("svg", { className: "social-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "5", width: "14", height: "14", rx: "4.2" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3.2" }), /* @__PURE__ */ React.createElement("circle", { cx: "16.1", cy: "7.9", r: "1" }));
  }
  return /* @__PURE__ */ React.createElement("svg", { className: "social-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M5.3 6.2h13.4c1.2 0 2.1.9 2.1 2.1v7.1c0 1.2-.9 2.1-2.1 2.1h-6l-4.2 3v-3H5.3c-1.2 0-2.1-.9-2.1-2.1V8.3c0-1.2.9-2.1 2.1-2.1Z" }), /* @__PURE__ */ React.createElement("path", { d: "m6.9 9 5.1 3.8L17.1 9" }));
}
function SocialLinks({ className = "" }) {
  return /* @__PURE__ */ React.createElement("div", { className: `social-links ${className}`.trim(), "aria-label": "Sobolev contacts" }, SOCIAL_LINKS.map((link) => /* @__PURE__ */ React.createElement(
    "a",
    {
      key: link.id,
      href: link.href,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": link.ariaLabel || link.label,
      className: "social-link"
    },
    /* @__PURE__ */ React.createElement(SocialIcon, { id: link.id }),
    /* @__PURE__ */ React.createElement("span", { className: "label" }, link.label)
  )));
}
function Header({ active, onNav }) {
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
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const items = [
    { id: "hero", label: "Profile" },
    { id: "bingx", label: "BingX" },
    { id: "c1k", label: "C1K" },
    { id: "waves", label: "Premium" },
    { id: "access", label: "Access" }
  ];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { id: "scroll-progress" }, /* @__PURE__ */ React.createElement("div", { className: "bar", style: { width: pct + "%" } })), /* @__PURE__ */ React.createElement("header", { className: `site-header ${scrolled ? "scrolled" : ""}` }, /* @__PURE__ */ React.createElement("a", { href: "#hero", className: "brand", onClick: (e) => {
    e.preventDefault();
    onNav("hero");
  } }, /* @__PURE__ */ React.createElement("span", { className: "sig" }, /* @__PURE__ */ React.createElement("img", { src: "assets/bingx-growth-poster.jpg", alt: "BingX", draggable: "false", decoding: "async" })), "Sobolev"), /* @__PURE__ */ React.createElement("nav", { className: "site-nav" }, items.map((it) => /* @__PURE__ */ React.createElement(
    "a",
    {
      key: it.id,
      href: `#${it.id}`,
      className: active === it.id ? "active" : "",
      onClick: (e) => {
        e.preventDefault();
        onNav(it.id);
      }
    },
    it.label
  )))));
}
function Hero({ onRoute }) {
  return /* @__PURE__ */ React.createElement("section", { id: "hero", className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: "hero-copy" }, /* @__PURE__ */ React.createElement("span", { className: "kicker" }, /* @__PURE__ */ React.createElement("span", { className: "wave-label" }, "Wave I"), " \xB7 Andrei Sobolev"), /* @__PURE__ */ React.createElement("h1", { className: "display xl" }, /* @__PURE__ */ React.createElement(RevealText, { text: "Andrei Sobolev.", tag: "span" })), /* @__PURE__ */ React.createElement("p", { className: "role" }, "Media figure \xB7 market operator \xB7 BingX partner \xB7 C1K exchange \xB7 Premium analytics \xB7 Since 2017"), /* @__PURE__ */ React.createElement("p", { className: "lede" }, /* @__PURE__ */ React.createElement(RevealText, { text: "First time here: choose the route that fits you \u2014 market media, premium analytics, BingX partner access, or private crypto exchange." })), /* @__PURE__ */ React.createElement("div", { className: "cta-row" }, /* @__PURE__ */ React.createElement("button", { className: "btn primary", "data-magnetic": "0.25", onClick: () => onRoute && onRoute("access") }, /* @__PURE__ */ React.createElement("span", { "data-magnetic-inner": true }, "Choose route ", /* @__PURE__ */ React.createElement("span", { className: "arrow" }, "\u2192"))), /* @__PURE__ */ React.createElement("a", { className: "btn ghost", "data-magnetic": "0.2", href: "https://t.me/andreisobolev", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { "data-magnetic-inner": true }, "Contact direct ", /* @__PURE__ */ React.createElement("span", { className: "arrow" }, "\u2192")))), /* @__PURE__ */ React.createElement("ul", { className: "hero-proof", "aria-label": "Profile highlights" }, /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", { className: "proof-value" }, "2017"), /* @__PURE__ */ React.createElement("span", { className: "proof-label" }, "in the market")), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", { className: "proof-value" }, "30K+"), /* @__PURE__ */ React.createElement("span", { className: "proof-label" }, "telegram audience")), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", { className: "proof-value" }, "100s"), /* @__PURE__ */ React.createElement("span", { className: "proof-label" }, "published setups")), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", { className: "proof-value" }, "4"), /* @__PURE__ */ React.createElement("span", { className: "proof-label" }, "routes to enter")))), /* @__PURE__ */ React.createElement("div", { className: "hero-portrait" }, /* @__PURE__ */ React.createElement("div", { className: "layer photo" }, /* @__PURE__ */ React.createElement("img", { src: "assets/andrei-hero-crop.jpg", alt: "Andrei Sobolev", draggable: "false", fetchpriority: "high", decoding: "async" }))));
}
function Stage({ id, ch, waveLabel, kicker, title, italics, body, metrics, cta, ctaTarget = "access", href, flip, theme, image, media, align, onRoute }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) el.classList.add("in-view");
      });
    }, { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return /* @__PURE__ */ React.createElement("div", { ref, className: `stage ${flip ? "flip" : ""} theme-${theme}`, id, "data-screen-label": `${ch} ${title.replace(/\./g, "")}` }, /* @__PURE__ */ React.createElement("div", { className: "stage-copy" }, /* @__PURE__ */ React.createElement("span", { className: "kicker" }, /* @__PURE__ */ React.createElement("span", { className: "wave-label" }, waveLabel), " \xB7 ", kicker), /* @__PURE__ */ React.createElement("h2", { className: "display l" }, /* @__PURE__ */ React.createElement(RevealText, { text: title }), italics && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement(RevealText, { text: italics, className: "italic" }))), /* @__PURE__ */ React.createElement("p", { className: "lede" }, /* @__PURE__ */ React.createElement(RevealText, { text: body })), /* @__PURE__ */ React.createElement("ul", { className: "metrics" }, metrics.map((m, i) => /* @__PURE__ */ React.createElement("li", { key: i }, /* @__PURE__ */ React.createElement("span", { className: "n" }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", null, m)))), href ? /* @__PURE__ */ React.createElement("a", { className: "btn", "data-magnetic": "0.25", href, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { "data-magnetic-inner": true }, cta, " ", /* @__PURE__ */ React.createElement("span", { className: "arrow" }, "\u2192"))) : /* @__PURE__ */ React.createElement("button", { className: "btn", "data-magnetic": "0.25", onClick: () => onRoute && onRoute(ctaTarget) }, /* @__PURE__ */ React.createElement("span", { "data-magnetic-inner": true }, cta, " ", /* @__PURE__ */ React.createElement("span", { className: "arrow" }, "\u2192")))), /* @__PURE__ */ React.createElement("div", { className: "stage-media" }, media ? media : /* @__PURE__ */ React.createElement("img", { src: image, alt: title, loading: "lazy", decoding: "async" }), /* @__PURE__ */ React.createElement("div", { className: "scrim" }), /* @__PURE__ */ React.createElement("div", { className: "corner-tag" }, waveLabel, " \xB7 ", kicker), /* @__PURE__ */ React.createElement("div", { className: "overlay-title" }, /* @__PURE__ */ React.createElement("div", { className: "title" }, title), /* @__PURE__ */ React.createElement("div", { className: "sub" }, kicker, " \xB7 ", ch))));
}
function Interlude({ quote, em, sig }) {
  return /* @__PURE__ */ React.createElement("div", { className: "interlude" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("blockquote", null, /* @__PURE__ */ React.createElement(RevealText, { text: quote }), em && /* @__PURE__ */ React.createElement(React.Fragment, null, " ", /* @__PURE__ */ React.createElement("em", null, /* @__PURE__ */ React.createElement(RevealText, { text: em })))), /* @__PURE__ */ React.createElement("div", { className: "sig" }, "\u2014 ", sig)));
}
function Access({ onRoute }) {
  return /* @__PURE__ */ React.createElement("section", { className: "access", id: "access", "data-screen-label": "05 Access" }, /* @__PURE__ */ React.createElement("span", { className: "kicker" }, /* @__PURE__ */ React.createElement("span", { className: "wave-label" }, "Wave V"), " \xB7 Choose what fits"), /* @__PURE__ */ React.createElement("h2", { className: "display xl" }, /* @__PURE__ */ React.createElement(RevealText, { text: "Find your route." })), /* @__PURE__ */ React.createElement("p", { className: "lede" }, /* @__PURE__ */ React.createElement(RevealText, { text: "If this is your first contact with Andrei, start where your intent is: media, premium analytics, BingX partner access, or private exchange." })), /* @__PURE__ */ React.createElement("div", { className: "doors" }, /* @__PURE__ */ React.createElement("a", { href: "https://t.me/joinchat/B2Hg1f7a3_40YTNi", className: "door media", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { className: "door-no" }, "01 \xB7 Media"), /* @__PURE__ */ React.createElement("div", { className: "door-title" }, "Life &", /* @__PURE__ */ React.createElement("br", null), "markets."), /* @__PURE__ */ React.createElement("p", { className: "door-desc" }, "Telegram channel, YouTube streams, videos, reviews, setups, and Instagram personal life."), /* @__PURE__ */ React.createElement("div", { className: "door-cta" }, /* @__PURE__ */ React.createElement("span", null, "Open channel"), /* @__PURE__ */ React.createElement("span", { className: "arr" }, "\u2192"))), /* @__PURE__ */ React.createElement("a", { href: "https://bingx.com/partner/andreisobolev", className: "door bingx", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { className: "door-no" }, "02 \xB7 BingX"), /* @__PURE__ */ React.createElement("div", { className: "door-title" }, "CIS", /* @__PURE__ */ React.createElement("br", null), "partner."), /* @__PURE__ */ React.createElement("p", { className: "door-desc" }, "Partnerships, VIP conditions, bonuses, drops, merch, podcasts, and creator campaigns."), /* @__PURE__ */ React.createElement("div", { className: "door-cta" }, /* @__PURE__ */ React.createElement("span", null, "Open BingX"), /* @__PURE__ */ React.createElement("span", { className: "arr" }, "\u2192"))), /* @__PURE__ */ React.createElement("a", { href: "https://t.me/sobolev_c1k", className: "door c1k", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { className: "door-no" }, "03 \xB7 C1K"), /* @__PURE__ */ React.createElement("div", { className: "door-title" }, "Crypto", /* @__PURE__ */ React.createElement("br", null), "exchange."), /* @__PURE__ */ React.createElement("p", { className: "door-desc" }, "Crypto to cash or electronic money and back, almost worldwide, through private contact."), /* @__PURE__ */ React.createElement("div", { className: "door-cta" }, /* @__PURE__ */ React.createElement("span", null, "Message C1K"), /* @__PURE__ */ React.createElement("span", { className: "arr" }, "\u2192"))), /* @__PURE__ */ React.createElement("a", { href: "https://t.me/p4m_premium_bot", className: "door waves", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { className: "door-no" }, "04 \xB7 Premium"), /* @__PURE__ */ React.createElement("div", { className: "door-title" }, "Market", /* @__PURE__ */ React.createElement("br", null), "analytics."), /* @__PURE__ */ React.createElement("p", { className: "door-desc" }, "Premium market analytics, scenarios, reviews, and setups for every market phase."), /* @__PURE__ */ React.createElement("div", { className: "door-cta" }, /* @__PURE__ */ React.createElement("span", null, "Open Premium"), /* @__PURE__ */ React.createElement("span", { className: "arr" }, "\u2192")))));
}
function Footer() {
  return /* @__PURE__ */ React.createElement("footer", { className: "site-foot" }, /* @__PURE__ */ React.createElement("div", { className: "foot-mark" }, "Sobolev", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("small", null, "\xA9 ", (/* @__PURE__ */ new Date()).getFullYear())), /* @__PURE__ */ React.createElement(SocialLinks, { className: "footer-social" }));
}
window.RevealText = RevealText;
window.Header = Header;
window.Hero = Hero;
window.Stage = Stage;
window.Interlude = Interlude;
window.Access = Access;
window.Footer = Footer;
window.SocialLinks = SocialLinks;
function SpinningLogo({ label = "BingX" }) {
  return /* @__PURE__ */ React.createElement("div", { className: "spinning-logo" }, /* @__PURE__ */ React.createElement("div", { className: "spin-3d" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 200 200", className: "logo-svg", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "bxg", x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#3edc81" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#9dffc5" }))), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "url(#bxg)", strokeWidth: "10", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M 55 40 L 55 160" }), /* @__PURE__ */ React.createElement("path", { d: "M 55 40 Q 135 40 135 70 Q 135 100 75 100" }), /* @__PURE__ */ React.createElement("path", { d: "M 75 100 Q 145 100 145 130 Q 145 160 55 160" }), /* @__PURE__ */ React.createElement("path", { d: "M 130 55 L 165 30", opacity: ".55" }), /* @__PURE__ */ React.createElement("path", { d: "M 140 150 L 175 170", opacity: ".55" })))), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label), /* @__PURE__ */ React.createElement("div", { className: "spin-orbit" }), /* @__PURE__ */ React.createElement("div", { className: "spin-orbit b" }));
}
function BoomerangLogo({ label = "C1K \xB7 Exchange" }) {
  return /* @__PURE__ */ React.createElement("div", { className: "spinning-logo c1k" }, /* @__PURE__ */ React.createElement("div", { className: "boomerang-3d" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 200 200", className: "logo-svg", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "c1kg", x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#cc8f58" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#f4d56c" }))), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "url(#c1kg)", strokeWidth: "9", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M 78 58 Q 40 58 40 100 Q 40 142 78 142" }), /* @__PURE__ */ React.createElement("path", { d: "M 95 70 L 108 60 L 108 142" }), /* @__PURE__ */ React.createElement("path", { d: "M 135 58 L 135 142" }), /* @__PURE__ */ React.createElement("path", { d: "M 170 60 L 135 100 L 170 140" }), /* @__PURE__ */ React.createElement("circle", { cx: "40", cy: "100", r: "3", fill: "#f4d56c", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "170", cy: "100", r: "3", fill: "#cc8f58", stroke: "none" })), /* @__PURE__ */ React.createElement(
    "path",
    {
      d: "M 40 100 Q 100 30 170 100 Q 100 170 40 100 Z",
      fill: "none",
      stroke: "rgba(244,213,108,.25)",
      strokeWidth: "1.2",
      strokeDasharray: "3 6"
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label), /* @__PURE__ */ React.createElement("div", { className: "spin-orbit amber" }));
}
function WaveLogo({ label = "Elliott Wave" }) {
  return /* @__PURE__ */ React.createElement("div", { className: "spinning-logo waves" }, /* @__PURE__ */ React.createElement("div", { className: "boomerang-3d" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 200 200", className: "logo-svg", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "wvg", x1: "0", y1: "0", x2: "1", y2: "0" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#f4d56c" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#ffe9a3" }))), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "url(#wvg)", strokeWidth: "6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M 25 140 L 60 90 L 85 120 L 115 55 L 140 95 L 175 40" }), /* @__PURE__ */ React.createElement("path", { d: "M 175 40 L 160 75 L 172 60 L 155 90", opacity: ".45" }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "90", r: "4", fill: "#f4d56c", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "85", cy: "120", r: "4", fill: "#f4d56c", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "115", cy: "55", r: "4", fill: "#f4d56c", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "140", cy: "95", r: "4", fill: "#f4d56c", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "175", cy: "40", r: "5", fill: "#ffe9a3", stroke: "none" })), /* @__PURE__ */ React.createElement("g", { fontFamily: "JetBrains Mono, monospace", fontSize: "10", fill: "rgba(255,255,255,.55)" }, /* @__PURE__ */ React.createElement("text", { x: "55", y: "80" }, "I"), /* @__PURE__ */ React.createElement("text", { x: "80", y: "138" }, "II"), /* @__PURE__ */ React.createElement("text", { x: "110", y: "45" }, "III"), /* @__PURE__ */ React.createElement("text", { x: "135", y: "113" }, "IV"), /* @__PURE__ */ React.createElement("text", { x: "168", y: "30" }, "V")))), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label), /* @__PURE__ */ React.createElement("div", { className: "spin-orbit gold" }));
}
function WavesAnimated({ label = "Elliott Wave" }) {
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, running = true;
    const onMove = (e) => {
      const r = wrap.getBoundingClientRect();
      tx = (e.clientX - r.left - r.width / 2) / r.width;
      ty = (e.clientY - r.top - r.height / 2) / r.height;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    const tick = () => {
      if (!running) return;
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      wrap.style.setProperty("--rx", (-cy * 5).toFixed(2) + "deg");
      wrap.style.setProperty("--ry", (cx * 8).toFixed(2) + "deg");
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  const candles = [
    [12, 52, 24, "b", 0],
    [18, 48, 32, "y", 0.3],
    [24, 55, 22, "b", 0.6],
    [30, 44, 38, "y", 0.2],
    [36, 50, 28, "b", 0.8],
    [42, 42, 44, "y", 0.5],
    [48, 38, 50, "b", 0.1],
    [54, 32, 58, "y", 0.7],
    [60, 28, 62, "b", 0.4],
    [66, 34, 52, "y", 0.9],
    [72, 30, 56, "b", 0.2],
    [78, 40, 44, "y", 0.6],
    [84, 46, 34, "b", 0.3]
  ];
  return /* @__PURE__ */ React.createElement("div", { ref: wrapRef, className: "spinning-logo waves-animated" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 400 360", className: "waves-svg", preserveAspectRatio: "xMidYMid meet" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "glass-edge", x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#a7d3ff", stopOpacity: ".9" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#5a8fd9", stopOpacity: ".6" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#a7d3ff", stopOpacity: ".85" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "glass-fill", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "rgba(255,255,255,0.06)" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "rgba(20,30,50,0.14)" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wave-blue", x1: "0", y1: "0", x2: "1", y2: "0" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#6bb0ff", stopOpacity: "0" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#6bb0ff", stopOpacity: "1" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#6bb0ff", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wave-gold", x1: "0", y1: "0", x2: "1", y2: "0" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#ffd47a", stopOpacity: "0" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#ffd47a", stopOpacity: "1" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#ffd47a", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("filter", { id: "wave-glow" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: "2.2" }), /* @__PURE__ */ React.createElement("feMerge", null, /* @__PURE__ */ React.createElement("feMergeNode", null), /* @__PURE__ */ React.createElement("feMergeNode", { in: "SourceGraphic" }))), /* @__PURE__ */ React.createElement("clipPath", { id: "frame-clip" }, /* @__PURE__ */ React.createElement("rect", { x: "28", y: "28", width: "344", height: "304", rx: "22" }))), /* @__PURE__ */ React.createElement("rect", { x: "28", y: "28", width: "344", height: "304", rx: "22", fill: "url(#glass-fill)" }), /* @__PURE__ */ React.createElement("g", { clipPath: "url(#frame-clip)" }, /* @__PURE__ */ React.createElement("g", { className: "candles" }, candles.map((c, i) => {
    const [x, y, h, col, delay] = c;
    const px = 28 + x / 100 * 344;
    const py = 28 + y / 100 * 304;
    const ph = h / 100 * 304;
    const fill = col === "b" ? "#5bbcff" : "#ffd47a";
    return /* @__PURE__ */ React.createElement("g", { key: i, style: { "--d": delay + "s" }, className: "candle" }, /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: px,
        y1: py - 16,
        x2: px,
        y2: py + ph + 16,
        stroke: fill,
        strokeWidth: "1.2",
        opacity: ".55"
      }
    ), /* @__PURE__ */ React.createElement("rect", { x: px - 7, y: py, width: "14", height: ph, rx: "1.5", fill }));
  })), /* @__PURE__ */ React.createElement("g", { filter: "url(#wave-glow)", className: "wave-streams" }, /* @__PURE__ */ React.createElement(
    "path",
    {
      className: "wave-a",
      d: "M -80,210 C 0,170 60,240 140,210 S 260,170 340,200 S 460,240 540,210",
      stroke: "url(#wave-blue)",
      strokeWidth: "3.5",
      fill: "none",
      strokeLinecap: "round"
    }
  ), /* @__PURE__ */ React.createElement(
    "path",
    {
      className: "wave-b",
      d: "M -80,200 C 0,230 80,170 160,200 S 280,240 360,200 S 460,170 540,200",
      stroke: "url(#wave-gold)",
      strokeWidth: "3",
      fill: "none",
      strokeLinecap: "round"
    }
  ), /* @__PURE__ */ React.createElement(
    "path",
    {
      className: "wave-c",
      d: "M -80,220 C 20,200 100,230 180,210 S 300,190 380,215 S 480,230 560,215",
      stroke: "url(#wave-blue)",
      strokeWidth: "1.5",
      fill: "none",
      opacity: ".4",
      strokeLinecap: "round"
    }
  ))), /* @__PURE__ */ React.createElement(
    "rect",
    {
      x: "28",
      y: "28",
      width: "344",
      height: "304",
      rx: "22",
      fill: "none",
      stroke: "url(#glass-edge)",
      strokeWidth: "3"
    }
  ), /* @__PURE__ */ React.createElement(
    "rect",
    {
      x: "32",
      y: "32",
      width: "336",
      height: "296",
      rx: "19",
      fill: "none",
      stroke: "rgba(255,255,255,.18)",
      strokeWidth: "1"
    }
  ), /* @__PURE__ */ React.createElement("path", { d: "M 50,34 L 180,34", stroke: "rgba(255,255,255,.55)", strokeWidth: "1.2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M 40,44 L 40,120", stroke: "rgba(255,255,255,.35)", strokeWidth: "1", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label));
}
function WavesGlassImage({ label = "Elliott Wave" }) {
  const ref = React.useRef(null);
  const moveGlass = React.useCallback((event) => {
    const el = ref.current;
    if (!el) return;
    const object = el.querySelector(".waves-glass-object");
    const rect = (object || el).getBoundingClientRect();
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    const rx = (0.5 - y) * 8;
    const ry = (x - 0.5) * 10;
    el.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
    el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x - 0.5) * 14).toFixed(2)}px`);
    el.style.setProperty("--gy", `${((y - 0.5) * 10).toFixed(2)}px`);
  }, []);
  const resetGlass = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "50%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--gx", "0px");
    el.style.setProperty("--gy", "0px");
  }, []);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref,
      className: "waves-glass-image",
      role: "img",
      "aria-label": label,
      onPointerMove: moveGlass,
      onPointerLeave: resetGlass
    },
    /* @__PURE__ */ React.createElement("div", { className: "waves-glass-object" }, /* @__PURE__ */ React.createElement("img", { className: "asset-base", src: "assets/waves-static-premium.png", alt: label, draggable: "false", loading: "eager", decoding: "async", fetchPriority: "high" }), /* @__PURE__ */ React.createElement("img", { className: "asset-reflect", src: "assets/waves-static-premium.png", alt: "", "aria-hidden": "true", draggable: "false", loading: "eager", decoding: "async", fetchPriority: "high" }))
  );
}
function C1KCutout({ label = "C1K \xB7 Exchange" }) {
  const ref = React.useRef(null);
  const moveLogo = React.useCallback((event) => {
    const el = ref.current;
    if (!el) return;
    const object = el.querySelector(".c1k-static-object");
    const rect = (object || el).getBoundingClientRect();
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    el.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x - 0.5) * 12).toFixed(2)}px`);
    el.style.setProperty("--gy", `${((y - 0.5) * 9).toFixed(2)}px`);
  }, []);
  const resetLogo = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "50%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--gx", "0px");
    el.style.setProperty("--gy", "0px");
  }, []);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref,
      className: "c1k-static-image",
      role: "img",
      "aria-label": label,
      onPointerMove: moveLogo,
      onPointerLeave: resetLogo
    },
    /* @__PURE__ */ React.createElement("div", { className: "c1k-static-object" }, /* @__PURE__ */ React.createElement("img", { className: "asset-base", src: "assets/c1k-static-premium.png", alt: label, draggable: "false", loading: "eager", decoding: "async", fetchPriority: "high" }), /* @__PURE__ */ React.createElement("img", { className: "asset-reflect", src: "assets/c1k-static-premium.png", alt: "", "aria-hidden": "true", draggable: "false", loading: "eager", decoding: "async", fetchPriority: "high" }))
  );
}
function VideoLogo({ src, label, className = "", poster }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) v.play().catch(() => {
        });
        else v.pause();
      });
    }, { threshold: 0.25 });
    observer.observe(v);
    return () => observer.disconnect();
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: `spinning-logo video-logo ${className}` }, /* @__PURE__ */ React.createElement("video", { ref, className: "logo-video", src, poster, muted: true, loop: true, playsInline: true, preload: "metadata" }), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label));
}
function BoomerangVideo({ src, label, className = "" }) {
  const vRef = React.useRef(null);
  const cRef = React.useRef(null);
  React.useEffect(() => {
    const v = vRef.current, c = cRef.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.loop = false;
    const frames = [];
    const MAX_FRAMES = 90;
    let grabTick = 0;
    let cancelled = false, rafPlay = 0, done = false;
    let i = 0, dir = 1, last = 0;
    const FPS = 1e3 / 30;
    const grab = () => {
      if (cancelled || done) return;
      if (v.videoWidth && c.width !== v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
      if (v.readyState >= 2 && v.videoWidth && frames.length < MAX_FRAMES && grabTick++ % 2 === 0) {
        const f = document.createElement("canvas");
        f.width = v.videoWidth;
        f.height = v.videoHeight;
        try {
          f.getContext("2d").drawImage(v, 0, 0);
          frames.push(f);
        } catch (_) {
        }
      }
      if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(grab);
    };
    const onEnded = () => {
      done = true;
      v.pause();
    };
    const loop = (t) => {
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
    v.addEventListener("ended", onEnded);
    const start = () => {
      if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(grab);
      v.play().catch(() => {
      });
      rafPlay = requestAnimationFrame(loop);
    };
    if (v.readyState >= 2) start();
    else v.addEventListener("canplay", start, { once: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafPlay);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("canplay", start);
    };
  }, [src]);
  return /* @__PURE__ */ React.createElement("div", { className: `spinning-logo video-logo boomerang ${className}` }, /* @__PURE__ */ React.createElement(
    "video",
    {
      ref: vRef,
      src,
      muted: true,
      playsInline: true,
      preload: "metadata",
      style: { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }
    }
  ), /* @__PURE__ */ React.createElement("canvas", { ref: cRef, className: "logo-video" }), /* @__PURE__ */ React.createElement("div", { className: "spin-label" }, label));
}
function App() {
  const [active, setActive] = React.useState("hero");
  const scrollTo = (id, replace = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector(".site-header");
    const offset = header ? header.getBoundingClientRect().height + 16 : 40;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method](null, "", nextHash);
    }
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    setActive(id);
  };
  React.useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const ids = ["hero", "bingx", "c1k", "waves", "access"];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) setActive(e.target.id);
      });
    }, { rootMargin: "-30% 0px -45% 0px", threshold: 0.01 });
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    const syncHash = () => {
      const id = window.location.hash.replace("#", "") || "hero";
      if (ids.includes(id)) {
        requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(id, true)));
      }
    };
    syncHash();
    const syncTimer = window.setTimeout(syncHash, 450);
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("load", syncHash, { once: true });
    return () => {
      window.clearTimeout(syncTimer);
      obs.disconnect();
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("load", syncHash);
    };
  }, []);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FluidBackground, null), /* @__PURE__ */ React.createElement(WaveSpine, null), /* @__PURE__ */ React.createElement(CursorParticles, null), /* @__PURE__ */ React.createElement(Header, { active, onNav: scrollTo }), /* @__PURE__ */ React.createElement(ChapterSpine, { active, onNav: scrollTo }), /* @__PURE__ */ React.createElement("main", null, /* @__PURE__ */ React.createElement(Hero, { onRoute: scrollTo }), /* @__PURE__ */ React.createElement(
    Stage,
    {
      id: "bingx",
      ch: "02",
      waveLabel: "Wave II",
      kicker: "BingX",
      title: "BingX partner.",
      italics: "Deals, drops, access.",
      body: "Partnerships, VIP conditions, bonuses, drops, merch, podcasts, and regional campaigns \u2014 one route into the BingX ecosystem through Andrei.",
      metrics: ["VIP conditions \xB7 bonuses", "Drops \xB7 merch \xB7 podcasts", "Partnerships \xB7 creator campaigns"],
      cta: "Open BingX",
      href: "https://bingx.com/partner/andreisobolev",
      theme: "growth",
      onRoute: scrollTo,
      media: /* @__PURE__ */ React.createElement(VideoLogo, { src: "assets/bingx.mov", poster: "assets/bingx-growth-poster.jpg", label: "BingX", className: "bingx-legacy" })
    }
  ), /* @__PURE__ */ React.createElement(
    Interlude,
    {
      quote: "Choose the route.",
      em: "Keep the contact direct.",
      sig: "Wave III \xB7 C1K"
    }
  ), /* @__PURE__ */ React.createElement(
    Stage,
    {
      id: "c1k",
      ch: "03",
      waveLabel: "Wave III",
      kicker: "C1K \xB7 Private",
      title: "Crypto to cash.",
      italics: "Cash to crypto.",
      body: "C1K exchanges crypto into cash or electronic money and back almost worldwide \u2014 built for people who need speed, discretion, and clear routing.",
      metrics: ["Crypto \u21C4 cash", "Electronic money routes", "Global execution \xB7 private contact"],
      cta: "Message C1K",
      href: "https://t.me/sobolev_c1k",
      theme: "liquidity",
      flip: true,
      onRoute: scrollTo,
      media: /* @__PURE__ */ React.createElement(C1KCutout, { label: "C1K \xB7 Private" })
    }
  ), /* @__PURE__ */ React.createElement(
    Interlude,
    {
      quote: "No noise.",
      em: "Just market structure.",
      sig: "Wave IV \xB7 Premium"
    }
  ), /* @__PURE__ */ React.createElement(
    Stage,
    {
      id: "waves",
      ch: "04",
      waveLabel: "Wave IV",
      kicker: "Premium analytics",
      title: "Premium market read.",
      italics: "Setups for any phase.",
      body: "Premium market analytics: scenarios, reviews, and setups across bullish, bearish, and sideways markets \u2014 education and timing, not noise.",
      metrics: ["Market scenarios", "Hundreds of published setups", "Elliott Wave structure"],
      cta: "Open Premium",
      href: "https://t.me/p4m_premium_bot",
      theme: "education",
      onRoute: scrollTo,
      media: /* @__PURE__ */ React.createElement(WavesGlassImage, { label: "Elliott Wave" })
    }
  ), /* @__PURE__ */ React.createElement(Access, { onRoute: scrollTo })), /* @__PURE__ */ React.createElement(Footer, null));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/* @__PURE__ */ React.createElement(App, null));
(function initTweaks() {
  const EDITMODE_DEFAULTS = (
    /*EDITMODE-BEGIN*/
    {
      "grain": 2,
      "fluid": true,
      "waveIntensity": 0.55,
      "cursorParticles": false
    }
  );
  function apply(values) {
    document.body.setAttribute("data-grain", String(values.grain));
    document.body.setAttribute("data-fluid", values.fluid ? "on" : "off");
    document.body.setAttribute("data-cursor-particles", values.cursorParticles ? "on" : "off");
    const spine = document.querySelector("#wave-spine-container svg");
    if (spine) spine.style.opacity = String(values.waveIntensity);
    const cursor = document.querySelector("#cursor-layer");
    if (cursor) cursor.style.display = values.cursorParticles ? "" : "none";
  }
  const state = { ...EDITMODE_DEFAULTS };
  apply(state);
  function persist(patch) {
    Object.assign(state, patch);
    apply(state);
    try {
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: patch }, "*");
    } catch (_) {
    }
  }
  const panel = document.createElement("div");
  panel.id = "tweaks-panel";
  panel.innerHTML = `
    <h4>Tweaks <button class="close">\xD7</button></h4>
    <label>Grain
      <input type="range" id="tw-grain" min="0" max="3" step="1" value="${state.grain}">
    </label>
    <label>WebGL fluid bg
      <input type="checkbox" id="tw-fluid" ${state.fluid ? "checked" : ""}>
    </label>
    <label>Wave spine
      <input type="range" id="tw-wave" min="0" max="1" step="0.05" value="${state.waveIntensity}">
    </label>
    <label>Cursor trail
      <input type="checkbox" id="tw-cursor" ${state.cursorParticles ? "checked" : ""}>
    </label>
    <div class="hint">press T to toggle</div>
  `;
  document.body.appendChild(panel);
  panel.querySelector(".close").addEventListener("click", () => panel.classList.remove("show"));
  panel.querySelector("#tw-grain").addEventListener("input", (e) => persist({ grain: Number(e.target.value) }));
  panel.querySelector("#tw-fluid").addEventListener("change", (e) => persist({ fluid: e.target.checked }));
  panel.querySelector("#tw-wave").addEventListener("input", (e) => persist({ waveIntensity: Number(e.target.value) }));
  panel.querySelector("#tw-cursor").addEventListener("change", (e) => persist({ cursorParticles: e.target.checked }));
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.key.toLowerCase() === "t") panel.classList.toggle("show");
  });
  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "__activate_edit_mode") panel.classList.add("show");
    if (e.data.type === "__deactivate_edit_mode") panel.classList.remove("show");
  });
  setTimeout(() => {
    try {
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    } catch (_) {
    }
  }, 120);
})();
(function initMagnetic() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
  let running = true;
  const targets = /* @__PURE__ */ new Map();
  function scan() {
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      if (targets.has(el)) return;
      targets.set(el, { tx: 0, ty: 0, cx: 0, cy: 0 });
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        const strength = Number(el.dataset.magnetic) || 0.25;
        const s = targets.get(el);
        s.tx = x * strength;
        s.ty = y * strength;
      });
      el.addEventListener("mouseleave", () => {
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
      const inner = el.querySelector("[data-magnetic-inner]") || el;
      inner.style.transform = `translate3d(${s.cx.toFixed(2)}px, ${s.cy.toFixed(2)}px, 0)`;
    });
    requestAnimationFrame(tick);
  }
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(tick);
  window.addEventListener("beforeunload", () => {
    running = false;
    observer.disconnect();
  });
})();
(function initScrubTilt() {
  function onScroll() {
    document.querySelectorAll("[data-scrub-tilt]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const p = (center - window.innerHeight / 2) / window.innerHeight;
      const axis = el.dataset.scrubTilt || "x";
      const mag = Number(el.dataset.scrubStrength) || 14;
      const rx = axis.includes("x") ? -p * mag : 0;
      const ry = axis.includes("y") ? p * mag : 0;
      const scale = 1 - Math.min(0.06, Math.abs(p) * 0.06);
      el.style.transform = `perspective(1400px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    });
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
})();
function SpinWrap({ children, className = "" }) {
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let angle = 0;
    let vel = 0;
    let dragging = false;
    let lastX = 0, lastT = 0;
    let running = true;
    let bias = 0;
    function onMove(e) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const dx = (e.clientX - cx) / r.width;
      bias = dx * 12;
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    function onDown(e) {
      var _a, _b, _c;
      dragging = true;
      vel = 0;
      lastX = (_c = (_b = e.clientX) != null ? _b : e.touches && ((_a = e.touches[0]) == null ? void 0 : _a.clientX)) != null ? _c : 0;
      lastT = performance.now();
      el.classList.add("grabbing");
      e.preventDefault();
    }
    function onMoveDrag(e) {
      var _a, _b, _c;
      if (!dragging) return;
      const x = (_c = (_b = e.clientX) != null ? _b : e.touches && ((_a = e.touches[0]) == null ? void 0 : _a.clientX)) != null ? _c : 0;
      const dx = x - lastX;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      angle += dx * 0.4;
      vel = dx * 0.4 / dt * 16;
      lastX = x;
      lastT = now;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("grabbing");
    }
    el.addEventListener("mousedown", onDown);
    el.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMoveDrag);
    window.addEventListener("touchmove", onMoveDrag, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    let idle = 0;
    function tick() {
      if (!running) return;
      if (!dragging) {
        angle += vel;
        vel *= 0.94;
        if (Math.abs(vel) < 0.01) vel = 0;
        idle += 6e-3;
        const breathe = Math.sin(idle) * 4;
        if (vel === 0) {
          const targetAngle = angle * 0.995 + bias * 0.02;
          angle += (targetAngle - angle) * 0.08;
          angle = angle * 0.9995 + breathe * 5e-4;
        }
      }
      el.style.setProperty("--spin", angle.toFixed(2) + "deg");
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return () => {
      running = false;
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("touchstart", onDown);
      window.removeEventListener("mousemove", onMoveDrag);
      window.removeEventListener("touchmove", onMoveDrag);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { ref: wrapRef, className: `spin-wrap ${className}` }, /* @__PURE__ */ React.createElement("div", { className: "spin-wrap-inner" }, children), /* @__PURE__ */ React.createElement("div", { className: "spin-hint", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, "drag"), /* @__PURE__ */ React.createElement("span", { className: "arc" })));
}
window.SpinWrap = SpinWrap;
(function installSmoothScroll() {
  const prefersReduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCoarse = matchMedia("(pointer: coarse)").matches;
  if (prefersReduce || isCoarse) {
    window.__smoothScrollActive = false;
    return;
  }
  let target = window.scrollY;
  let current = window.scrollY;
  const ease = 0.095;
  function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }
  function clamp(v) {
    return Math.max(0, Math.min(maxScroll(), v));
  }
  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    target = clamp(target + delta);
  }
  window.addEventListener("wheel", onWheel, { passive: false });
  function onKey(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const vh = window.innerHeight;
    const M = maxScroll();
    let d = 0;
    if (e.key === "ArrowDown" || e.key === "PageDown") d = vh * 0.85;
    else if (e.key === "ArrowUp" || e.key === "PageUp") d = -vh * 0.85;
    else if (e.key === " ") d = e.shiftKey ? -vh * 0.85 : vh * 0.85;
    else if (e.key === "Home") {
      target = 0;
      return;
    } else if (e.key === "End") {
      target = M;
      return;
    }
    if (d) {
      e.preventDefault();
      target = clamp(target + d);
    }
  }
  window.addEventListener("keydown", onKey);
  const nativeScrollTo = window.scrollTo.bind(window);
  window.scrollTo = function(a, b) {
    let top;
    if (typeof a === "object" && a !== null) top = a.top;
    else top = b;
    if (typeof top !== "number") return nativeScrollTo(a, b);
    target = clamp(top);
  };
  window.addEventListener("scroll", () => {
    if (Math.abs(window.scrollY - current) > 3 && Math.abs(window.scrollY - target) > 3) {
      target = window.scrollY;
      current = window.scrollY;
    }
  }, { passive: true });
  function tick() {
    current += (target - current) * ease;
    if (Math.abs(target - current) < 0.3) current = target;
    if (Math.abs(window.scrollY - current) > 0.5) {
      nativeScrollTo(0, current);
    }
    const v = Math.abs(target - current);
    window.__scrollVelocity = v;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__smoothScrollActive = true;
})();
