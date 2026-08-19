/**
 * 벽을 통과하는 전자 — 터널 효과 (① 시공간 초월형)
 * 비상교육 고등 전자기와 양자 III-03 (교과서 102~105쪽)
 *
 * 파동 모드 — 해 보기 103쪽: 파동 묶음이 퍼텐셜 장벽을 만나 일부는 반사,
 *            일부는 확률적으로 통과한다. 높이·두께·에너지를 바꿔 본다.
 * STM 모드 — 그림 III-14: 탐침-시료 틈이 장벽. 터널링 전류로 원자를 '본다'.
 */
const TunnelScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let boardPlane, boardTex, stmG, tip, atoms2 = [], currentTex;
  let placed = {};

  const state = {
    mode: 'packet',      // 'packet' | 'stm'
    E: 5,                // 전자 에너지 (eV, 연출)
    V0: 10,              // 장벽 높이
    w: 0.8,              // 장벽 두께 (nm)
    gap: 0.7,            // STM: 탐침-시료 거리 (nm)
    tipX: 0,             // STM: 탐침 위치
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'srcT', label: '전자 발생기', icon: 'tower' },
    { id: 'barrierT', label: '퍼텐셜 장벽', icon: 'screenBoard' },
    { id: 'detT', label: '검출기 2개', icon: 'sensor' },
    { id: 'stmT', label: 'STM 탐침', icon: 'wire' },
  ];
  const slots = {
    srcT: { name: '왼쪽 (발생기)' },
    barrierT: { name: '가운데 (장벽)' },
    detT: { name: '양쪽 (검출기)' },
    stmT: { name: '오른쪽 (탐침)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 직사각형 장벽의 정확한 투과 확률 (m=1, ħ=1 단위) */
  function transT(E, V0, w) {
    E = E || state.E; V0 = V0 || state.V0; w = w || state.w;
    if (Math.abs(E - V0) < 1e-6) E = V0 - 1e-6;
    if (E < V0) {
      const k = Math.sqrt(2 * (V0 - E));
      const s = Math.sinh(k * w);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
    }
    const k2 = Math.sqrt(2 * (E - V0));
    const s = Math.sin(k2 * w);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }
  /** STM 전류 (상대값): I ∝ e^(−2κd), κ=√(2Φ), Φ=4 eV 일함수 가정 */
  const stmI = (d) => 100 * Math.exp(-2 * Math.sqrt(8) * (d - 0.4));
  /** 시료 표면 원자 높이 (nm): 원자 3개의 봉우리 */
  function surfaceH(x) {
    let h = 0;
    [-2.4, 0, 2.4].forEach((c) => { h = Math.max(h, 0.18 * Math.exp(-((x - c) ** 2) / 0.5)); });
    return h;
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camTu', -Math.PI / 2, 1.3, 17, new (B().Vector3)(0, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('htu', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('tuGlow', scene);
    glow.intensity = 0.5;

    // 실험대 — 항상 보이는 기본 배경
    const bench = B().MeshBuilder.CreateBox('tuBench', { width: 22, height: 0.5, depth: 12 }, scene);
    bench.position.y = -0.26;
    bench.material = mat('tuBenchMat', '#242c3c', '#3a4a60', 48);

    buildBoard();
    buildSTM();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/tunnel.jpg', { x: -8, y: 0, z: 6, ry: 0.3 });

    resetTools();
    return scene;
  }

  function mat(name, hex, spec, power) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.05, 0.05, 0.05);
    if (power) m.specularPower = power;
    return m;
  }
  function emat(name, hex, alpha) {
    const m = new (B().StandardMaterial)(name, scene);
    m.emissiveColor = B().Color3.FromHexString(hex);
    m.disableLighting = true;
    if (alpha != null) m.alpha = alpha;
    return m;
  }

  function buildBoard() {
    boardPlane = B().MeshBuilder.CreatePlane('tuBoard', { width: 12, height: 7 }, scene);
    boardPlane.position.set(0, 3.4, 0.5);
    boardTex = new (B().DynamicTexture)('tuBoardTex', { width: 1200, height: 700 }, scene, true);
    const m = new (B().StandardMaterial)('tuBoardM', scene);
    m.diffuseTexture = boardTex;
    m.emissiveTexture = boardTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    boardPlane.material = m;
  }

  /** 파동 묶음 화면 그리기 (103쪽 그림 재현) */
  function drawPacket() {
    const ctx = boardTex.getContext();
    ctx.fillStyle = '#1c2436';
    ctx.fillRect(0, 0, 1200, 700);
    const X0 = 60, X1 = 1140, YMID = 420, H = 200;
    const xOf = (u) => X0 + ((u + 6) / 12) * (X1 - X0);   // u: -6~6 (nm 연출)

    // 에너지 축 (장벽)
    const bx0 = xOf(-state.w / 2), bx1 = xOf(state.w / 2);
    const bh = (state.V0 / 14) * 260;
    ctx.fillStyle = 'rgba(122,132,148,.55)';
    ctx.fillRect(bx0, YMID - bh, bx1 - bx0, bh + 180);
    ctx.strokeStyle = '#9fb0c2'; ctx.lineWidth = 2;
    ctx.strokeRect(bx0, YMID - bh, bx1 - bx0, bh + 180);
    // 전자 에너지 선
    const ey = YMID - (state.E / 14) * 260;
    ctx.strokeStyle = '#ffd84a';
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(X0, ey); ctx.lineTo(X1, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd84a';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`전자 에너지 E = ${state.E.toFixed(1)}`, X0 + 6, ey - 6);
    ctx.fillStyle = '#9fb0c2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`장벽 V₀ = ${state.V0.toFixed(1)} · 두께 ${state.w.toFixed(1)} nm`, (bx0 + bx1) / 2, YMID - bh - 8);

    // 파동 묶음 |Ψ|²
    const T = transT();
    const pos = sim.px;                     // 묶음 중심
    const packet = (c, amp, karr) => {
      ctx.strokeStyle = karr || '#7ae0a0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const u = -6 + (i / 240) * 12;
        const g = amp * Math.exp(-((u - c) ** 2) / 0.9);
        // 장벽 안에서는 지수적으로 감쇠하는 모양
        let damp = 1;
        if (u > -state.w / 2 && u < state.w / 2) {
          damp = Math.exp(-2.2 * (u + state.w / 2));
        }
        const y = YMID + 150 - g * damp * H;
        if (i === 0) ctx.moveTo(xOf(u), y); else ctx.lineTo(xOf(u), y);
      }
      ctx.stroke();
    };
    if (sim.phase === 'in') {
      packet(pos, 1);
    } else {
      packet(sim.rx, 1 - T, '#f0a53c');   // 반사 (주황)
      packet(sim.tx, T * 3 < 1 ? Math.max(0.08, T * 3) : 1, '#7ae0a0'); // 통과 (초록, 최소 표시)
    }
    ctx.fillStyle = '#7ae0a0';
    ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('|Ψ|² — 전자를 발견할 확률', X0, 24);
    if (sim.phase !== 'in') {
      ctx.fillStyle = '#f0a53c';
      ctx.textAlign = 'left';
      ctx.fillText(`반사 ${(100 * (1 - T)).toFixed(1)} %`, X0 + 10, YMID + 165);
      ctx.fillStyle = '#7ae0a0';
      ctx.textAlign = 'right';
      ctx.fillText(`통과 ${(100 * T).toFixed(2)} %`, X1 - 10, YMID + 165);
    }
    boardTex.update();
  }

  function buildSTM() {
    stmG = new (B().TransformNode)('tuSTM', scene);
    // 시료 표면 (원자 3개)
    const base = B().MeshBuilder.CreateBox('tuBase', { width: 10, height: 0.8, depth: 3 }, scene);
    base.position.y = 0.4;
    base.material = mat('tuBaseM', '#39424f', '#6a7a96', 64);
    base.parent = stmG;
    [-2.4, 0, 2.4].forEach((x, i) => {
      const a = B().MeshBuilder.CreateSphere('tuAtom' + i, { diameter: 1.5 }, scene);
      a.position.set(x, 1.1, 0);
      a.material = mat('tuAtomM' + i, '#5a9df0', '#cfe4ff', 48);
      a.parent = stmG;
      atoms2.push(a);
    });
    // 탐침
    tip = B().MeshBuilder.CreateCylinder('tuTip', { height: 2.2, diameterTop: 1.2, diameterBottom: 0.06 }, scene);
    tip.material = mat('tuTipM', '#d8b44a', '#ffe8a0', 96);
    tip.parent = stmG;
    // 전류계
    const p = B().MeshBuilder.CreatePlane('tuAmm', { width: 3, height: 2 }, scene);
    p.position.set(4.6, 4.6, 0);
    currentTex = new (B().DynamicTexture)('tuAmmTex', { width: 300, height: 200 }, scene, true);
    const m = new (B().StandardMaterial)('tuAmmM', scene);
    m.diffuseTexture = currentTex; m.emissiveTexture = currentTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    p.parent = stmG;
  }

  const props = {};

  /** 준비 단계용 소품 — 전자 발생기와 검출기 */
  function buildProps() {
    const gs = new (B().TransformNode)('tuPropSrc', scene);
    const body = B().MeshBuilder.CreateCylinder('tuPropSB', { height: 1.6, diameter: 0.9 }, scene);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.6;
    body.material = mat('tuPropSBM', '#39424f', '#8e9bad', 64);
    body.parent = gs;
    const nose = B().MeshBuilder.CreateCylinder('tuPropSN', { height: 0.5, diameterTop: 0.25, diameterBottom: 0.7 }, scene);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.95, 0.6, 0);
    nose.material = emat('tuPropSNM', '#7ae0a0');
    nose.parent = gs;
    gs.position.set(-6, 0, 0);
    gs.setEnabled(false);
    props.srcT = gs;

    const gd = new (B().TransformNode)('tuPropDet', scene);
    const dbody = B().MeshBuilder.CreateBox('tuPropDB', { width: 0.9, height: 1.3, depth: 0.9 }, scene);
    dbody.position.y = 0.65;
    dbody.material = mat('tuPropDBM', '#2b3441', '#7a8aa0', 64);
    dbody.parent = gd;
    const win = B().MeshBuilder.CreatePlane('tuPropDW', { width: 0.6, height: 0.8 }, scene);
    win.position.set(-0.46, 0.7, 0);
    win.rotation.y = Math.PI / 2;
    win.material = emat('tuPropDWM', '#173a2c');
    win.parent = gd;
    gd.position.set(6, 0, 0);
    gd.setEnabled(false);
    props.detT = gd;
  }

  function drawCurrent() {
    const d = state.gap - surfaceH(state.tipX);
    const I = stmI(d);
    const ctx = currentTex.getContext();
    ctx.clearRect(0, 0, 300, 200);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 200, 16); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('터널링 전류', 150, 10);
    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(I.toFixed(1), 150, 58);
    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('nA (상대값)', 150, 124);
    currentTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      srcT: { x: -6, z: 0, w: 3.4, h: 2.8, label: '전자 발생기' },
      barrierT: { x: 0, z: 0, w: 3.4, h: 3.0, label: '퍼텐셜 장벽' },
      detT: { x: 6, z: 0, w: 3.4, h: 2.8, label: '검출기' },
      stmT: { x: 0, z: 4.4, w: 3.6, h: 2.6, label: 'STM 탐침' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#5a9df0' });
      const m = new (B().StandardMaterial)('phM_' + id, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      holders[id] = p;
    });
    holders._spec = spec;
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }
  function applyPlacement() {
    Object.entries(holders).forEach(([id, h]) => {
      if (id !== '_spec') h.setEnabled(!placed[id]);
    });
    reset();
  }
  function dropAt(id, point) {
    const c = holders._spec[id];
    return (Math.abs(point.x - c.x) <= 3.6 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = {
      px: -4.2, rx: -0.8, tx: 0.8, phase: 'in', t: 0,
      shots: 0, passed: 0,
      scan: [],           // STM 스캔 기록 {x, I}
    };
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const pk = state.mode === 'packet';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      boardPlane.setEnabled(!!placed.barrierT);
      if (placed.barrierT) drawPacket();
      stmG.setEnabled(!!placed.stmT);
      if (placed.stmT) {
        tip.position.set(state.tipX, 1.15 + state.gap * 3.2 + 1.1, 0);
        drawCurrent();
      }
      if (props.srcT) props.srcT.setEnabled(!!placed.srcT);
      if (props.detT) props.detT.setEnabled(!!placed.detT);
      return;
    }
    if (props.srcT) props.srcT.setEnabled(pk);
    if (props.detT) props.detT.setEnabled(pk);

    boardPlane.setEnabled(pk);
    stmG.setEnabled(!pk);

    if (pk) {
      drawPacket();
    } else {
      const h = surfaceH(state.tipX);
      tip.position.set(state.tipX, 1.15 + h * 6 + state.gap * 3.2 + 1.1, 0);
      drawCurrent();
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;

    if (state.mode === 'packet') {
      if (!state.running) return false;
      sim.t += dt;
      if (sim.phase === 'in') {
        sim.px += 2.4 * dt;
        if (sim.px >= -state.w / 2 - 0.7) {
          sim.phase = 'split';
          sim.rx = sim.px;
          sim.tx = state.w / 2 + 0.7;
        }
      } else {
        sim.rx -= 2.4 * dt;
        sim.tx += 2.4 * dt;
        if (sim.rx < -6.5) {
          state.running = false;
          const btn = document.querySelector('#runBtn');
          if (btn) { btn.textContent = '▶ 파동 발사'; btn.classList.remove('run'); }
        }
      }
      drawPacket();
      return true;
    }

    // STM 자동 스캔
    if (state.running) {
      state.tipX += 1.6 * dt;
      if (state.tipX > 4.5) state.tipX = -4.5;
      const d = state.gap - surfaceH(state.tipX);
      sim.scan.push({ x: state.tipX, I: stmI(d) });
      if (sim.scan.length > 400) sim.scan.shift();
      layout();
      return true;
    }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.3;
    camera.radius = 17;
    camera.setTarget(new (B().Vector3)(0, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '고전 물리에서는 E < V₀ 면 절대 통과할 수 없습니다. 하지만 전자의 파동 함수는 장벽 너머에서도 0이 아닙니다!';
  const prepGuide = '점선 자리에 전자 발생기·퍼텐셜 장벽·검출기·STM 탐침을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'packet', t: '파동 묶음 (103쪽)' }, { v: 'stm', t: 'STM — 원자 보기 (105쪽)' },
    ], state.mode, 1);

    if (state.mode === 'packet') {
      return `
        ${modeBtns}
        ${LabUI.slider('eCtl', '전자 에너지 <i>E</i>',
          { min: 1, max: 14, step: 0.5, value: state.E, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('vCtl', '장벽 높이 <i>V</i>₀',
          { min: 2, max: 14, step: 0.5, value: state.V0, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('wCtl', '장벽 두께 <i>w</i>',
          { min: 0.2, max: 2.0, step: 0.1, value: state.w, fmt: (v) => `${(+v).toFixed(1)} nm` })}
        <div class="control">
          <div class="clabel">파동</div>
          <button class="power" id="runBtn">▶ 파동 발사</button>
        </div>
        <div class="control">
          <div class="clabel">전자 1개<br>운명은?</div>
          <button class="power" id="shotBtn">🎲 발사</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('gapCtl', '탐침-시료 거리',
        { min: 0.45, max: 1.2, step: 0.05, value: state.gap, fmt: (v) => `${(+v).toFixed(2)} nm` })}
      ${LabUI.slider('tipCtl', '탐침 위치',
        { min: -4.5, max: 4.5, step: 0.1, value: state.tipX, fmt: (v) => `${(+v).toFixed(1)}` })}
      <div class="control">
        <div class="clabel">자동 스캔</div>
        <button class="power" id="runBtn">▶ 표면 스캔</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.getAttribute('data-mode');
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'packet') {
      const after = () => { reset(); onChange(); };
      LabUI.bindSlider(root, 'eCtl', state, 'E', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'vCtl', state, 'V0', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'wCtl', state, 'w', (v) => `${(+v).toFixed(1)} nm`, after);
      root.querySelector('#shotBtn').addEventListener('click', () => {
        sim.shots += 1;
        if (Math.random() < transT()) sim.passed += 1;
        onChange();
      });
    } else {
      LabUI.bindSlider(root, 'gapCtl', state, 'gap', (v) => `${(+v).toFixed(2)} nm`, () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'tipCtl', state, 'tipX', (v) => `${(+v).toFixed(1)}`, () => { layout(); onChange(); });
    }
    const run = root.querySelector('#runBtn');
    const label = state.mode === 'packet' ? '▶ 파동 발사' : '▶ 표면 스캔';
    run.addEventListener('click', () => {
      if (state.mode === 'packet' && sim.phase !== 'in') reset();
      state.running = !state.running;
      run.textContent = state.running ? '진행 중…' : label;
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = label;
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'packet') {
      const T = transT();
      const cls = state.E < state.V0;
      return `
        <div class="row"><span>전자 에너지 / 장벽</span><b>E = ${state.E.toFixed(1)} / V₀ = ${state.V0.toFixed(1)}</b></div>
        <div class="row"><span>고전 물리의 예측</span>
          <b>${cls ? '100 % 반사 (통과 불가!)' : '통과'}</b></div>
        <div class="row"><span>양자 역학의 투과 확률 <i>T</i></span>
          <b class="big">${(T * 100).toFixed(3)} %</b></div>
        <div class="sec">전자 1개씩 발사한 통계</div>
        <div class="row"><span>발사 / 통과</span>
          <b class="big">${sim.shots}개 / ${sim.passed}개
            ${sim.shots ? '(' + (100 * sim.passed / sim.shots).toFixed(1) + ' %)' : ''}</b></div>
        <div class="formula">${cls
          ? '장벽 안에서 파동 함수는 지수적으로 줄지만 <b>0이 되지는 않아</b> 반대편에 얇게 새어 나갑니다. 두께를 절반으로 줄이면 투과율이 크게 뜁니다 — 반도체 미세 공정에서 누설 전류가 생기는 까닭입니다 (103쪽).'
          : 'E > V₀ 여도 양자 역학에서는 일부가 <b>반사</b>됩니다 — 이것도 고전과 다른 점!'}</div>`;
    }
    const d = state.gap - surfaceH(state.tipX);
    return `
      <div class="row"><span>탐침 위치</span><b>${state.tipX.toFixed(1)}</b></div>
      <div class="row"><span>표면(원자) 높이</span><b>${(surfaceH(state.tipX) * 1000).toFixed(0)} pm</b></div>
      <div class="row"><span>실제 틈 (장벽 두께)</span><b>${d.toFixed(3)} nm</b></div>
      <div class="row"><span>터널링 전류</span><b class="big">${stmI(d).toFixed(1)} nA</b></div>
      <div class="formula">틈이 <b>0.1 nm 만 줄어도 전류가 몇 배</b>로 뛰는 지수적 민감함 덕분에
        원자 하나하나의 요철을 '볼' 수 있습니다. 탐침으로 원자를 끌고 다니며 만든
        영화 '소년과 원자'도 이 원리입니다 (105쪽).</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '투과 확률과 장벽';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'packet') {
      // T vs 두께 (로그 느낌으로 선형 표시)
      const xOf = (w) => padL + ((w - 0.2) / 1.8) * gw;
      const yOf = (T) => padT + gh - T * gh;
      ctx.strokeStyle = '#7ae0a0'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const w = 0.2 + (i / 120) * 1.8;
        const y = yOf(transT(state.E, state.V0, w));
        if (i === 0) ctx.moveTo(xOf(w), y); else ctx.lineTo(xOf(w), y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.w), yOf(transT()), 5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('장벽 두께 w (nm)', W2 - 4, padT + gh + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7ae0a0'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('투과 확률 T — 두께에 지수적으로 민감', padL + 6, padT + 2);
      return;
    }

    // STM: 스캔 전류 프로필 (원자가 보인다!)
    const xOf = (x) => padL + ((x + 4.5) / 9) * gw;
    let iMax = 1;
    (sim ? sim.scan : []).forEach((p) => { iMax = Math.max(iMax, p.I); });
    const yOf = (I) => padT + gh - (I / iMax) * gh * 0.92;
    if (sim && sim.scan.length > 1) {
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
      ctx.beginPath();
      const sorted = [...sim.scan].sort((a, b) => a.x - b.x);
      sorted.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.I)); else ctx.lineTo(xOf(p.x), yOf(p.I));
      });
      ctx.stroke();
    }
    // 원자 위치 표시
    [-2.4, 0, 2.4].forEach((x) => {
      ctx.strokeStyle = 'rgba(90,157,240,.4)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(xOf(x), padT); ctx.lineTo(xOf(x), padT + gh); ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('전류 프로필 — 봉우리 = 원자!', padL + 6, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'packet') {
      return `두께 ${state.w.toFixed(1)} nm 에서 T = ${(transT() * 100).toFixed(3)} % ·
        두께가 얇을수록, 장벽이 낮을수록 잘 통과합니다 (103쪽)`;
    }
    return '전류 봉우리 세 개가 파란 점선(실제 원자 위치)과 일치 — 원자를 전류로 본 것입니다';
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '실험', '조건', '투과 확률 T', '통계 / 전류', '비고',
  ];

  function recordRow() {
    if (state.mode === 'packet') {
      const T = transT();
      return [['파동 묶음', `E=${state.E.toFixed(1)}, V₀=${state.V0.toFixed(1)}, w=${state.w.toFixed(1)}`,
        (T * 100).toFixed(3) + ' %',
        sim.shots ? `${sim.passed}/${sim.shots} 통과` : '—',
        state.E < state.V0 ? '고전: 통과 불가' : 'E > V₀']];
    }
    const d = state.gap - surfaceH(state.tipX);
    return [['STM', `틈 ${d.toFixed(2)} nm`, '—', stmI(d).toFixed(1) + ' nA',
      '지수적 민감도']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 E < V₀ 에서 통과 확인 · 1 장벽을 얇게 해 확률 높이기 · 2 두껍게 해 급감 확인
     3 STM 모드 · 4 기록 3줄                                               */
  const mis = { passed: false, thin: false, thick: false, stm: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'packet') {
      if (state.E < state.V0 && sim && sim.passed > 0) mis.passed = true;
      if (state.E < state.V0 && transT() > 0.2) mis.thin = true;
      if (state.E < state.V0 && transT() < 0.005) mis.thick = true;
    }
    if (state.mode === 'stm') mis.stm = true;

    if (i === 0) return mis.passed;
    if (i === 1) return mis.thin;
    if (i === 2) return mis.thick;
    if (i === 3) return mis.stm;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'tunnel',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '벽을 통과하는 전자 — 터널 효과',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, transT, stmI, surfaceH,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
