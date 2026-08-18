/**
 * 전자구름 속으로 — 불확정성과 원자 모형 (① 시공간 초월형)
 * 비상교육 고등 전자기와 양자 III-04 (교과서 106~109쪽)
 *
 * 불확정성 모드 — 그림 III-15·16: 파장을 골라 전자를 '측정'해 본다.
 *               짧은 파장 = 위치 정확·운동량 엉망 / 긴 파장 = 반대.
 * 원자 모형 모드 — 109쪽 해 보기: 보어 궤도와 전자구름(확률)을 비교한다.
 *               구름의 확률 최대 지점 = 보어 반지름 (공통점!)
 */
const AtomScene = (() => {
  const B = () => BABYLON;

  const A0 = 2.4;                 // 보어 반지름 (표시 단위)
  const MAX_DOTS = 700;

  let scene, camera;
  let boardPlane, boardTex;
  let nucleus, bohrOrbit, bohrElec, cloudDots = [], modelG;
  let placed = {};

  const state = {
    mode: 'model',        // 'uncertainty' | 'model'
    lambda: 1.0,          // 측정에 쓰는 빛의 파장 (0.3 짧음 ~ 2.0 김)
    model: 'cloud',       // 'bohr' | 'cloud'
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'nucT', label: '수소 원자핵', icon: 'ball' },
    { id: 'lightT', label: '측정용 광원', icon: 'bulb' },
    { id: 'camT', label: '양자 현미경', icon: 'sensor' },
    { id: 'boardT', label: '기록판', icon: 'screenBoard' },
  ];
  const slots = {
    nucT: { name: '가운데 (원자핵)' },
    lightT: { name: '왼쪽 (광원)' },
    camT: { name: '앞쪽 (현미경)' },
    boardT: { name: '뒤쪽 (기록판)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 측정: 위치 오차 σx ∝ λ, 운동량 반동 σp ∝ 1/λ */
  const dx = () => 0.5 * state.lambda;
  const dp = () => 0.5 / state.lambda;
  /** 1s 오비탈 반지름 표본: P(r) ∝ r²e^(−2r/a₀) → 감마(3) 분포 */
  function sampleR() {
    const u = () => -Math.log(1 - Math.random());
    return (A0 / 2) * (u() + u() + u());
  }
  function sampleDir() {
    const th = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - z * z);
    return [s * Math.cos(th), z, s * Math.sin(th)];
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camAt', -Math.PI / 2 + 0.4, 1.15, 16, new (B().Vector3)(0, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 36;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hat', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('atGlow', scene);
    glow.intensity = 0.55;

    // 실험대 — 항상 보이는 기본 배경
    const bench = B().MeshBuilder.CreateBox('atBench', { width: 20, height: 0.5, depth: 12 }, scene);
    bench.position.y = -0.26;
    bench.material = mat('atBenchMat', '#242c3c', '#3a4a60', 48);

    buildBoard();
    buildModel();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/atom.jpg', { x: -7.5, y: 0, z: 5.5, ry: 0.3 });

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
    boardPlane = B().MeshBuilder.CreatePlane('atBoard', { width: 11, height: 7 }, scene);
    boardPlane.position.set(0, 3.4, 0.5);
    boardTex = new (B().DynamicTexture)('atBoardTex', { width: 1100, height: 700 }, scene, true);
    const m = new (B().StandardMaterial)('atBoardM', scene);
    m.diffuseTexture = boardTex;
    m.emissiveTexture = boardTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    boardPlane.material = m;
  }

  /** 불확정성 화면: 측정된 위치 점 + 반동 화살표 */
  function drawUncertainty() {
    const ctx = boardTex.getContext();
    ctx.fillStyle = '#1c2436';
    ctx.fillRect(0, 0, 1100, 700);
    const CX = 550, CY = 380;
    // 전자의 '실제' 위치 (중앙) — 알 수 없음 표시
    ctx.strokeStyle = 'rgba(90,157,240,.5)';
    ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.arc(CX, CY, 12, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    // 위치 불확정 반경 (λ 에 비례)
    const rx = dx() * 160;
    ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(CX, CY, rx, 0, 7); ctx.stroke();
    ctx.fillStyle = '#5ad0f0';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`위치 불확정량 Δx ∝ λ`, CX, CY - rx - 10);
    // 측정 기록
    (sim ? sim.hits : []).forEach((h) => {
      ctx.fillStyle = 'rgba(255,216,74,.9)';
      ctx.beginPath(); ctx.arc(CX + h.x * 160, CY + h.y * 160, 6, 0, 7); ctx.fill();
      // 반동 화살표
      ctx.strokeStyle = 'rgba(232,87,122,.8)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CX + h.x * 160, CY + h.y * 160);
      ctx.lineTo(CX + h.x * 160 + h.px * 130, CY + h.y * 160 + h.py * 130);
      ctx.stroke();
    });
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`파장 ${state.lambda.toFixed(1)} 의 빛으로 전자 측정 — 노란 점 = 측정된 위치, 빨간 화살표 = 반동`, 550, 20);
    boardTex.update();
  }

  const props = {};

  /** 준비 단계용 소품 — 측정용 광원과 양자 현미경 */
  function buildProps() {
    const gl = new (B().TransformNode)('atPropLight', scene);
    const base = B().MeshBuilder.CreateCylinder('atPropLB', { height: 1.1, diameter: 0.28 }, scene);
    base.position.y = 0.55;
    base.material = mat('atPropLBM', '#39424f');
    base.parent = gl;
    const head = B().MeshBuilder.CreateCylinder('atPropLH', { height: 0.6, diameterTop: 0.7, diameterBottom: 0.35 }, scene);
    head.rotation.z = -0.7;
    head.position.set(0.28, 1.25, 0);
    head.material = mat('atPropLHM', '#2b3441', '#7a8aa0', 64);
    head.parent = gl;
    const bulb = B().MeshBuilder.CreateSphere('atPropLL', { diameter: 0.3 }, scene);
    bulb.position.set(0.5, 1.42, 0);
    bulb.material = emat('atPropLLM', '#ffd84a');
    bulb.parent = gl;
    gl.position.set(-5, 0, 0);
    gl.setEnabled(false);
    props.lightT = gl;

    const gc = new (B().TransformNode)('atPropCam', scene);
    const body = B().MeshBuilder.CreateCylinder('atPropCB', { height: 1.4, diameter: 0.5 }, scene);
    body.rotation.x = 0.5;
    body.position.y = 0.9;
    body.material = mat('atPropCBM', '#2b3441', '#8fa0b8', 96);
    body.parent = gc;
    const lens = B().MeshBuilder.CreateCylinder('atPropCL', { height: 0.1, diameter: 0.42 }, scene);
    lens.rotation.x = 0.5;
    lens.position.set(0, 1.55, 0.33);
    lens.material = emat('atPropCLM', '#5ad0f0');
    lens.parent = gc;
    const foot = B().MeshBuilder.CreateBox('atPropCF', { width: 0.9, height: 0.16, depth: 0.9 }, scene);
    foot.position.y = 0.08;
    foot.material = mat('atPropCFM', '#39424f');
    foot.parent = gc;
    gc.position.set(0, 0, -4.2);
    gc.setEnabled(false);
    props.camT = gc;
  }

  function buildModel() {
    modelG = new (B().TransformNode)('atModel', scene);
    nucleus = B().MeshBuilder.CreateSphere('atNuc', { diameter: 0.6 }, scene);
    nucleus.position.y = 3;
    nucleus.material = emat('atNucM', '#e8577a');
    nucleus.parent = modelG;

    bohrOrbit = B().MeshBuilder.CreateTorus('atOrbit', { diameter: A0 * 2, thickness: 0.05, tessellation: 64 }, scene);
    bohrOrbit.position.y = 3;
    bohrOrbit.material = emat('atOrbitM', '#5a9df0', 0.9);
    bohrOrbit.parent = modelG;

    bohrElec = B().MeshBuilder.CreateSphere('atElec', { diameter: 0.4 }, scene);
    bohrElec.material = emat('atElecM', '#5ad0f0');
    bohrElec.parent = modelG;
  }

  function addCloudDot() {
    if (cloudDots.length >= MAX_DOTS) return;
    const r = sampleR();
    if (r > A0 * 4.5) return;
    const [ux, uy, uz] = sampleDir();
    const s = B().MeshBuilder.CreateSphere('atDot' + cloudDots.length, { diameter: 0.09 }, scene);
    s.position.set(ux * r, 3 + uy * r, uz * r);
    s.material = emat('atDotM' + cloudDots.length, '#5ad0f0', 0.55);
    s.isPickable = false;
    s.parent = modelG;
    cloudDots.push({ m: s, r });
  }
  function clearCloud() {
    cloudDots.forEach((d) => d.m.dispose());
    cloudDots = [];
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      nucT: { x: 0, z: 0, w: 3.2, h: 2.8, label: '수소 원자핵' },
      lightT: { x: -5, z: 0, w: 3.2, h: 2.6, label: '측정용 광원' },
      camT: { x: 0, z: -4.2, w: 3.4, h: 2.4, label: '양자 현미경' },
      boardT: { x: 5, z: 0, w: 3.2, h: 2.6, label: '기록판' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#5a9df0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#5a9df0';
      ctx.font = 'bold 38px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 210, 64);
      tex.hasAlpha = true; tex.update();
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
    return (Math.abs(point.x - c.x) <= 3.4 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = { t: 0, hits: [], bins: new Array(40).fill(0) };
    clearCloud();
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const un = state.mode === 'uncertainty';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      modelG.setEnabled(!!placed.nucT);
      bohrOrbit.setEnabled(false);
      bohrElec.setEnabled(false);
      cloudDots.forEach((d) => d.m.setEnabled(false));
      boardPlane.setEnabled(!!placed.boardT);
      if (placed.boardT) drawUncertainty();
      if (props.lightT) props.lightT.setEnabled(!!placed.lightT);
      if (props.camT) props.camT.setEnabled(!!placed.camT);
      return;
    }
    if (props.lightT) props.lightT.setEnabled(un);
    if (props.camT) props.camT.setEnabled(!un);

    boardPlane.setEnabled(un);
    modelG.setEnabled(!un);
    if (un) {
      drawUncertainty();
    } else {
      const bohr = state.model === 'bohr';
      bohrOrbit.setEnabled(bohr);
      bohrElec.setEnabled(bohr);
      cloudDots.forEach((d) => d.m.setEnabled(!bohr));
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    sim.t += dt;

    if (state.mode === 'model') {
      if (state.model === 'bohr') {
        bohrElec.position.set(Math.cos(sim.t * 1.6) * A0, 3, Math.sin(sim.t * 1.6) * A0);
        return false;
      }
      if (state.running) {
        for (let i = 0; i < 6; i++) {
          const before = cloudDots.length;
          addCloudDot();
          if (cloudDots.length > before) {
            const r = cloudDots[cloudDots.length - 1].r;
            const bin = Math.floor((r / (A0 * 4)) * 40);
            if (bin >= 0 && bin < 40) sim.bins[bin] += 1;
          }
        }
        if (cloudDots.length >= MAX_DOTS) {
          state.running = false;
          const btn = document.querySelector('#runBtn');
          if (btn) { btn.textContent = '▶ 전자 관측'; btn.classList.remove('run'); }
        }
        return true;
      }
    }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.4;
    camera.beta = 1.15;
    camera.radius = 16;
    camera.setTarget(new (B().Vector3)(0, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '전자구름의 점 하나하나가 «관측했더니 여기 있었다» 는 기록입니다. 구름이 가장 짙은 곳이 보어 반지름과 일치합니다!';
  const prepGuide = '점선 자리에 원자핵·광원·양자 현미경·기록판을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'uncertainty', t: '불확정성 (106쪽)' }, { v: 'model', t: '원자 모형 (108쪽)' },
    ], state.mode, 1);

    if (state.mode === 'uncertainty') {
      return `
        ${modeBtns}
        ${LabUI.slider('lam', '측정용 빛의 파장',
          { min: 0.3, max: 2.0, step: 0.1, value: state.lambda, fmt: (v) => `${(+v).toFixed(1)}` })}
        <div class="control">
          <div class="clabel">측정</div>
          <button class="power" id="measureBtn">📸 전자 측정</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('원자 모형', 'model', [
        { v: 'bohr', t: '보어 (궤도)' }, { v: 'cloud', t: '현대 (전자구름)' },
      ], state.model, 1)}
      <div class="control">
        <div class="clabel">관측 반복</div>
        <button class="power" id="runBtn">▶ 전자 관측</button>
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

    if (state.mode === 'uncertainty') {
      LabUI.bindSlider(root, 'lam', state, 'lambda', (v) => `${(+v).toFixed(1)}`, () => { layout(); onChange(); });
      root.querySelector('#measureBtn').addEventListener('click', () => {
        // 위치: σ ∝ λ 가우시안, 반동: 크기 ∝ 1/λ 무작위 방향
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        const a = Math.random() * Math.PI * 2;
        sim.hits.push({
          x: g() * dx(), y: g() * dx(),
          px: Math.cos(a) * dp(), py: Math.sin(a) * dp(),
        });
        if (sim.hits.length > 14) sim.hits.shift();
        layout();
        onChange();
      });
    } else {
      LabUI.bindOpts(root, 'model', state, 'model', () => {
        layout();
        onChange();
      }, String);
      const run = root.querySelector('#runBtn');
      run.addEventListener('click', () => {
        if (state.model === 'bohr') { state.model = 'cloud'; layout(); }
        state.running = !state.running;
        run.textContent = state.running ? '관측 중…' : '▶ 전자 관측';
        run.classList.toggle('run', state.running);
        onChange();
      });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'uncertainty') {
      return `
        <div class="row"><span>빛의 파장 λ</span><b>${state.lambda.toFixed(1)}
          (${state.lambda < 0.8 ? '짧음 — 에너지 큼' : state.lambda > 1.4 ? '김 — 에너지 작음' : '중간'})</b></div>
        <div class="row"><span>위치 불확정량 Δx ∝ λ</span><b class="big">${dx().toFixed(2)}</b></div>
        <div class="row"><span>운동량 불확정량 Δp ∝ 1/λ</span><b class="big">${dp().toFixed(2)}</b></div>
        <div class="row"><span>곱 Δx·Δp</span>
          <b>${(dx() * dp()).toFixed(2)} (일정 — 줄일 수 없다!)</b></div>
        <div class="row"><span>측정 횟수</span><b>${sim.hits.length}회</b></div>
        <div class="formula">짧은 파장 — 위치는 정확(작은 원)하지만 반동 화살표가 큽니다.
          긴 파장 — 반동은 작지만 위치가 흐릿합니다. <b>둘 다 정확히는 불가능</b> —
          하이젠베르크: ΔxΔp ≥ ℏ/2 (107쪽).</div>`;
    }
    const peak = (() => {
      let bi = 0;
      sim.bins.forEach((n, i) => { if (n > sim.bins[bi]) bi = i; });
      return (bi + 0.5) / 40 * A0 * 4;
    })();
    return `
      <div class="row"><span>모형</span>
        <b class="big">${state.model === 'bohr' ? '보어 — 정해진 궤도' : '현대 — 전자구름 (확률)'}</b></div>
      ${state.model === 'bohr' ? `
      <div class="row"><span>전자의 위치</span><b>반지름 a₀ 로 정확히 결정</b></div>
      <div class="row"><span>위치 불확정량 Δr</span><b>0</b></div>
      <div class="row"><span>중심 방향 운동량 불확정량</span><b>0</b></div>
      <div class="formula">Δr·Δp = 0 — <b>불확정성 원리에 위배!</b>
        수소 밖의 원자도 설명하지 못해 새 모형이 필요했습니다 (그림 III-17).</div>`
      : `
      <div class="row"><span>관측 횟수 (점의 수)</span><b class="big">${cloudDots.length}개</b></div>
      <div class="row"><span>확률 최대 반지름 (측정)</span>
        <b>${cloudDots.length > 100 ? peak.toFixed(2) : '관측을 더 하세요'}</b></div>
      <div class="row"><span>보어 반지름 a₀</span><b>${A0.toFixed(2)} — 서로 일치!</b></div>
      <div class="formula">전자는 «어디에 있다» 가 아니라 <b>«여기서 발견될 확률»</b> 만 말할 수 있습니다.
        점의 밀도가 곧 |Ψ|² — 확률 최대 지점이 보어 반지름과 같다는 것이
        두 모형의 공통점입니다 (109쪽). 2013년 양자 현미경으로 실제 촬영되었습니다.</div>`}`;
  }

  /* ══ 그래프 — 지름 방향 확률 분포 ════════════ */
  const graphTitle = '전자를 발견할 확률 (반지름별)';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'uncertainty') {
      // Δx·Δp 반비례 곡선
      const xOf = (l) => padL + ((l - 0.3) / 1.7) * gw;
      const yOf = (v) => padT + gh - (v / 2) * gh;
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const l = 0.3 + (i / 100) * 1.7;
        const y = yOf(0.5 * l);
        if (i === 0) ctx.moveTo(xOf(l), y); else ctx.lineTo(xOf(l), y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#e8577a';
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const l = 0.3 + (i / 100) * 1.7;
        const y = yOf(0.5 / l);
        if (i === 0) ctx.moveTo(xOf(l), y); else ctx.lineTo(xOf(l), y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.lambda), yOf(dx()), 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(xOf(state.lambda), yOf(dp()), 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Δx (파장에 비례)', padL + 6, padT + 2);
      ctx.fillStyle = '#e8577a';
      ctx.fillText('Δp (파장에 반비례)', padL + 110, padT + 2);
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('빛의 파장 λ →', W2 - 4, padT + gh + 4);
      return;
    }

    // 반지름 확률: 이론 r²e^(−2r/a₀) + 히스토그램 + 보어 반지름 선
    const RMAX = A0 * 4;
    const xOf = (r) => padL + (r / RMAX) * gw;
    const th = (r) => r * r * Math.exp(-2 * r / A0);
    let m = 0;
    for (let i = 0; i <= 100; i++) m = Math.max(m, th((i / 100) * RMAX));
    const yOf = (v) => padT + gh - (v / m) * gh * 0.92;
    ctx.strokeStyle = 'rgba(90,208,240,.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const r = (i / 120) * RMAX;
      const y = yOf(th(r));
      if (i === 0) ctx.moveTo(xOf(r), y); else ctx.lineTo(xOf(r), y);
    }
    ctx.stroke();
    if (sim && cloudDots.length > 0) {
      const bmax = Math.max(1, ...sim.bins);
      ctx.fillStyle = 'rgba(122,224,160,.5)';
      const bw = gw / 40;
      sim.bins.forEach((n, i) => {
        const h = (n / bmax) * gh * 0.92;
        ctx.fillRect(padL + i * bw, padT + gh - h, bw - 0.5, h);
      });
    }
    // 보어 반지름
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(xOf(A0), padT); ctx.lineTo(xOf(A0), padT + gh); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('보어 반지름 a₀', xOf(A0), padT + 2);
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('원자핵으로부터의 거리 r', W2 - 4, padT + gh + 4);
  }

  function graphFootHTML() {
    if (state.mode === 'uncertainty') {
      return '한쪽을 줄이면 다른 쪽이 커집니다 — 곱이 ℏ/2 아래로는 <b>절대 내려가지 않습니다</b>';
    }
    return '히스토그램(관측)이 이론 곡선과 겹치고, 봉우리가 <b>보어 반지름</b>과 일치합니다 (그림 III-18)';
  }

  /* ══ 기록표 (109쪽 해 보기 표) ═══════════════ */
  const recordColumns = [
    '체험', '조건', '결과', '해석',
  ];

  function recordRow() {
    if (state.mode === 'uncertainty') {
      return [['불확정성', `λ = ${state.lambda.toFixed(1)}`,
        `Δx=${dx().toFixed(2)}, Δp=${dp().toFixed(2)}`,
        '곱 ΔxΔp 는 줄일 수 없음']];
    }
    if (state.model === 'bohr') {
      return [['보어 모형', '전자가 정해진 궤도 운동', 'Δr=0, Δp_r=0',
        '불확정성 원리 위배 → 새 모형 필요']];
    }
    return [['전자구름', `관측 ${cloudDots.length}회`,
      '확률 최대 지점 ≈ 보어 반지름',
      '위치는 확률로만 말할 수 있음']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 짧은 파장으로 측정 · 1 긴 파장으로 측정 · 2 보어 모형 살펴보기
     3 전자구름 200회 관측 · 4 기록 3줄                                    */
  const mis = { shortL: false, longL: false, bohr: false, cloud: 0 };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'uncertainty') {
      if (state.lambda <= 0.6) mis.shortL = true;
      if (state.lambda >= 1.6) mis.longL = true;
    }
    if (state.mode === 'model') {
      if (state.model === 'bohr') mis.bohr = true;
      if (state.model === 'cloud') mis.cloud = Math.max(mis.cloud, cloudDots.length);
    }
    if (i === 0) return mis.shortL;
    if (i === 1) return mis.longL;
    if (i === 2) return mis.bohr;
    if (i === 3) return mis.cloud >= 200;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'atom',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '전자구름 속으로 — 불확정성과 원자 모형',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, dx, dp, sampleR, A0,
    get cloudDots() { return cloudDots; },
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
