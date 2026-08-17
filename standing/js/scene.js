/**
 * 정상파와 악기 — 기주 공명으로 음속 재기 (③ 체험·조작형)
 * 비상교육 고등 역학과 에너지 III-05 (교과서 108~113쪽)
 *
 * 악기 모드 — 현 · 열린 관 · 닫힌 관의 배진동 (그림 III-21~23)
 * 공명 모드 — 탐구 112쪽: 한쪽 막힌 관의 수면을 내리며 공명 위치 y₁,y₂,y₃ 을
 *            찾아 λ = 2(y₂−y₁), v = fλ 로 음속을 측정한다.
 */
const StandingScene = (() => {
  const B = () => BABYLON;

  const V_AIR = 343;             // 음속 (20 ℃)
  const V_STRING = 120;          // 줄에서의 파속
  const N_BEAD = 56;
  const SM = 4.2;                // 악기 모드 축척 (unit per m)
  const F_RES = 440;             // 공명 모드 스피커 진동수

  let scene, camera;
  let instG, beads = [], postL, postR, envMesh;
  let resG, tube, water, speaker, meterTex, meterPlane;
  let placed = {};

  const state = {
    mode: 'inst',            // 'inst' | 'res'
    inst: 'string',          // 'string' | 'open' | 'closed'
    harmonic: 1,             // n (닫힌 관은 1,3,5)
    L: 1.0,                  // 현·관의 길이 (m)
    depth: 0.10,             // 공명 모드: 관 위 끝에서 수면까지 (m)
    running: true,
  };

  let sim = null;

  const tools = [
    { id: 'strT', label: '줄 · 관 (악기)', icon: 'wire' },
    { id: 'motorT', label: '진동 발생기', icon: 'coil' },
    { id: 'tubeT', label: '공명 장치 (유리관)', icon: 'lensConvex' },
    { id: 'spkT', label: '소리 발생기 · 측정 앱', icon: 'sensor' },
  ];
  const slots = {
    strT: { name: '가운데 (줄)' },
    motorT: { name: '줄 왼쪽 끝' },
    tubeT: { name: '오른쪽 (유리관)' },
    spkT: { name: '유리관 위' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 배진동의 파장·진동수 (그림 III-21~23) */
  function waveOf() {
    const n = state.harmonic, L = state.L;
    if (state.inst === 'string') return { lam: 2 * L / n, f: V_STRING / (2 * L) * n, v: V_STRING };
    if (state.inst === 'open') return { lam: 2 * L / n, f: V_AIR / (2 * L) * n, v: V_AIR };
    return { lam: 4 * L / n, f: V_AIR / (4 * L) * n, v: V_AIR };   // closed: n = 1,3,5…
  }
  /** 공명 모드: 공기 기둥 길이 L 에서의 소리 크기 (λ/4 홀수배에서 공명) */
  const LAM_RES = V_AIR / F_RES;
  function resAmp(Lair) {
    let best = 0;
    for (let k = 0; k < 4; k++) {
      const Ln = (2 * k + 1) * LAM_RES / 4;
      best = Math.max(best, 1 / (1 + ((Lair - Ln) / 0.012) ** 2));
    }
    return best;
  }
  const resPositions = () => [1, 3, 5].map((k) => k * LAM_RES / 4);

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camSt', -Math.PI / 2 + 0.1, 1.2, 15, new (B().Vector3)(0, 2.2, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hst', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('dst', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.35;

    const table = B().MeshBuilder.CreateBox('stTable', { width: 24, height: 0.6, depth: 12 }, scene);
    table.position.y = -0.32;
    table.material = mat('stTableMat', '#9aa3ad', '#c6ccd3', 96);

    buildInstrument();
    buildResonance();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/standing.jpg', { x: -7.5, y: 0, z: 5, ry: 0.3 });

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

  function buildInstrument() {
    instG = new (B().TransformNode)('stInst', scene);
    postL = B().MeshBuilder.CreateBox('stPostL', { width: 0.3, height: 3.2, depth: 0.3 }, scene);
    postL.material = mat('stPostLM', '#39424f', '#8e9bad', 64);
    postL.parent = instG;
    postR = postL.clone('stPostR');
    postR.parent = instG;

    for (let i = 0; i < N_BEAD; i++) {
      const s = B().MeshBuilder.CreateSphere('stBd' + i, { diameter: 0.17 }, scene);
      s.material = emat('stBdM' + i, '#2f6ad0');
      s.isPickable = false;
      s.parent = instG;
      beads.push(s);
    }
  }

  function buildResonance() {
    resG = new (B().TransformNode)('stRes', scene);
    // 유리관 (투명)
    tube = B().MeshBuilder.CreateCylinder('stTube', { height: 4.6, diameter: 0.8 }, scene);
    tube.position.y = 2.5;
    const tm = new (B().StandardMaterial)('stTubeMat', scene);
    tm.diffuseColor = B().Color3.FromHexString('#bcd8f0');
    tm.alpha = 0.25;
    tm.specularColor = B().Color3.FromHexString('#ffffff');
    tube.material = tm;
    tube.parent = resG;
    // 물기둥
    water = B().MeshBuilder.CreateCylinder('stWater', { height: 1, diameter: 0.74 }, scene);
    water.material = mat('stWaterMat', '#3f7ec8', '#bcd8f0', 64);
    water.material.alpha = 0.8;
    water.parent = resG;
    // 스피커
    speaker = B().MeshBuilder.CreateCylinder('stSpk', { height: 0.5, diameterTop: 0.9, diameterBottom: 0.5 }, scene);
    speaker.position.y = 5.2;
    speaker.material = mat('stSpkMat', '#2b323c', '#7a8494', 64);
    speaker.parent = resG;
    // 소리 크기 미터
    const p = B().MeshBuilder.CreatePlane('stMeter', { width: 2.8, height: 1.9 }, scene);
    meterPlane = p;
    p.position.set(2.6, 3.4, 0);
    p.rotation.y = 0.3;
    meterTex = new (B().DynamicTexture)('stMeterTex', { width: 300, height: 210 }, scene, true);
    const mm = new (B().StandardMaterial)('stMeterMat', scene);
    mm.diffuseTexture = meterTex; mm.emissiveTexture = meterTex;
    mm.emissiveColor = new (B().Color3)(1, 1, 1);
    mm.specularColor = new (B().Color3)(0, 0, 0);
    mm.backFaceCulling = false;
    p.material = mm;
    p.parent = resG;
    resG.position.x = 0;
  }

  function drawMeter() {
    const amp = resAmp(state.depth);
    const db = 40 + amp * 45;
    const ctx = meterTex.getContext();
    ctx.clearRect(0, 0, 300, 210);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 210, 16); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('소리 측정 앱', 150, 10);
    ctx.fillStyle = amp > 0.6 ? '#d0453a' : '#62718a';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(db.toFixed(1), 150, 58);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('dB', 150, 122);
    // 레벨 바
    ctx.fillStyle = '#e8e4d2';
    ctx.fillRect(30, 162, 240, 24);
    ctx.fillStyle = amp > 0.6 ? '#d0453a' : '#f0a53c';
    ctx.fillRect(30, 162, 240 * amp, 24);
    if (amp > 0.85) {
      ctx.fillStyle = '#d0453a';
      ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('공명!', 270, 138);
    }
    meterTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      strT: { x: -1.5, z: 0, w: 5.4, h: 2.6, label: '줄 · 관' },
      motorT: { x: -4.4, z: -2.6, w: 3.2, h: 2.2, label: '진동 발생기' },
      tubeT: { x: 3.4, z: 1.6, w: 3.2, h: 2.4, label: '유리관' },
      spkT: { x: 3.4, z: -2.6, w: 3.4, h: 2.2, label: '소리 발생기' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
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
    return (Math.abs(point.x - c.x) <= 3.6 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    sim = { t: 0, found: [] };
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const inst = state.mode === 'inst';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      instG.setEnabled(true);
      resG.setEnabled(true);
      beads.forEach((s, i) => {
        s.setEnabled(!!placed.strT);
        if (placed.strT) {
          const Lu = state.L * SM;
          s.position.set(-Lu / 2 + (i / (N_BEAD - 1)) * Lu, 1.6, 0);
        }
      });
      postL.setEnabled(!!placed.motorT);
      postR.setEnabled(!!placed.motorT);
      if (placed.motorT) {
        const Lu = state.L * SM;
        postL.position.set(-Lu / 2, 1.6, 0);
        postR.position.set(Lu / 2, 1.6, 0);
      }
      tube.setEnabled(!!placed.tubeT);
      water.setEnabled(!!placed.tubeT);
      speaker.setEnabled(!!placed.spkT);
      if (meterPlane) meterPlane.setEnabled(!!placed.spkT);
      if (placed.tubeT) {
        const TUBE_H = 4.6;
        const airU = Math.min(TUBE_H - 0.2, state.depth * 4.2);
        const waterH = TUBE_H - airU;
        water.scaling.y = waterH;
        water.position.y = 0.2 + waterH / 2;
      }
      return;
    }
    beads.forEach((s) => s.setEnabled(true));
    postL.setEnabled(true); postR.setEnabled(true);
    tube.setEnabled(true); water.setEnabled(true);
    speaker.setEnabled(true);
    if (meterPlane) meterPlane.setEnabled(true);

    instG.setEnabled(inst);
    resG.setEnabled(!inst);

    if (inst) {
      const Lu = state.L * SM;
      postL.position.set(-Lu / 2, 1.6, 0);
      postR.position.set(Lu / 2, 1.6, 0);
      // 정상파: y = 2A sin(nπx/L) cos(ωt) — 닫힌 관은 sin((nπx)/(2L))
      updateBeads();
    } else {
      // 물기둥: 관 위 끝(y=4.8)에서 depth 만큼이 공기 기둥
      const TUBE_TOP = 4.8, TUBE_H = 4.6;
      const airLen = state.depth * SM * 0.22 * 4.6;  // depth(m) → 표시 축척
      // 간단히: depth (0~1 m) 를 관 높이에 맞춰 그린다
      const airU = Math.min(TUBE_H - 0.2, state.depth * 4.2);
      const waterH = TUBE_H - airU;
      water.scaling.y = waterH;
      water.position.y = 0.2 + waterH / 2;
      drawMeter();
    }
  }

  function updateBeads() {
    const Lu = state.L * SM;
    const n = state.harmonic;
    const phase = Math.cos(2 * Math.PI * 1.2 * sim.t);   // 진동 연출 (1.2 Hz)
    for (let i = 0; i < N_BEAD; i++) {
      const u = i / (N_BEAD - 1);          // 0~1
      let env;
      if (state.inst === 'string') env = Math.sin(n * Math.PI * u);              // 양 끝 마디
      else if (state.inst === 'open') env = Math.cos(n * Math.PI * u);           // 양 끝 배
      else env = Math.cos(n * Math.PI * u / 2);                                  // 왼쪽(막힘) 마디 → sin?
      if (state.inst === 'closed') env = Math.sin(n * Math.PI * u / 2);          // x=0 막힘(마디), x=L 열림(배)
      const y = 1.6 + env * 0.85 * phase;
      beads[i].position.set(-Lu / 2 + u * Lu, y, 0);
      // 마디는 붉게
      const isNode = Math.abs(env) < 0.06;
      beads[i].material.emissiveColor = isNode
        ? B().Color3.FromHexString('#d0453a') : B().Color3.FromHexString('#2f6ad0');
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    sim.t += dt;
    if (state.mode === 'inst') { updateBeads(); return false; }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.1;
    camera.beta = 1.2;
    camera.radius = 15;
    camera.setTarget(new (B().Vector3)(0, 2.2, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '수면을 천천히 내리며 소리가 가장 커지는 위치 y₁, y₂, y₃ 을 찾아 «기록» 하세요. λ = 2(y₂−y₁) 로 음속을 구할 수 있습니다.';
  const prepGuide = '점선 자리에 줄·진동 발생기·유리관·소리 발생기를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'inst', t: '악기의 정상파 (110쪽)' }, { v: 'res', t: '기주 공명 — 음속 (112쪽)' },
    ], state.mode, 1);

    if (state.mode === 'inst') {
      const odd = state.inst === 'closed';
      const harm = odd
        ? [{ v: 1, t: '기본(n=1)' }, { v: 3, t: '3배' }, { v: 5, t: '5배' }]
        : [{ v: 1, t: '기본(n=1)' }, { v: 2, t: '2배' }, { v: 3, t: '3배' }, { v: 4, t: '4배' }];
      return `
        ${modeBtns}
        ${LabUI.opts('악기', 'inst', [
          { v: 'string', t: '현 (기타)' }, { v: 'open', t: '열린 관 (플루트)' },
          { v: 'closed', t: '닫힌 관 (클라리넷)' },
        ], state.inst, 1)}
        ${LabUI.opts('배진동', 'harmonic', harm, state.harmonic, 1)}
        ${LabUI.slider('len', '길이 <i>L</i>',
          { min: 0.5, max: 2.0, step: 0.05, value: state.L, fmt: (v) => `${(+v).toFixed(2)} m` })}
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('depth', '관 끝 ~ 수면<br>(공기 기둥)',
        { min: 0.03, max: 1.0, step: 0.002, value: state.depth, fmt: (v) => `${(v * 100).toFixed(1)} cm` })}
      <div class="control">
        <div class="clabel">공명 위치<br>표시</div>
        <button class="power" id="markBtn">📌 여기 기록</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'inst') {
      LabUI.bindOpts(root, 'inst', state, 'inst', () => {
        if (state.inst === 'closed' && state.harmonic % 2 === 0) state.harmonic = 1;
        root.innerHTML = controlsHTML();
        bindControls(root, onChange);
        layout();
        onChange();
      }, String);
      LabUI.bindOpts(root, 'harmonic', state, 'harmonic', () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'len', state, 'L', (v) => `${(+v).toFixed(2)} m`, () => { layout(); onChange(); });
    } else {
      LabUI.bindSlider(root, 'depth', state, 'depth', (v) => `${(v * 100).toFixed(1)} cm`, () => {
        layout(); onChange();
      });
      root.querySelector('#markBtn').addEventListener('click', () => {
        if (resAmp(state.depth) > 0.6) {
          sim.found.push(state.depth);
          sim.found.sort((a, b) => a - b);
        }
        onChange();
      });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => { reset(); onChange(); });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'inst') {
      const w = waveOf();
      const kind = { string: '현 — 양 끝 마디', open: '열린 관 — 양 끝 배', closed: '닫힌 관 — 막힌 쪽 마디·열린 쪽 배' }[state.inst];
      return `
        <div class="row"><span>악기</span><b>${kind}</b></div>
        <div class="row"><span>길이 <i>L</i></span><b>${state.L.toFixed(2)} m</b></div>
        <div class="row"><span>배진동</span><b>${state.harmonic}배 진동</b></div>
        <div class="row"><span>파속 <i>v</i></span><b>${w.v} m/s</b></div>
        <div class="sec">정상파</div>
        <div class="row"><span>파장 <i>λ</i></span><b>${w.lam.toFixed(3)} m</b></div>
        <div class="row"><span>진동수 <i>f</i></span><b class="big">${w.f.toFixed(1)} Hz</b></div>
        <div class="formula">${state.inst === 'closed'
          ? '닫힌 관은 λ = 4L/n (n = 1, 3, 5…) — <b>홀수 배진동만</b> 가능합니다.'
          : 'λ = 2L/n, f = nv/2L — 길이를 줄이면 진동수가 커져 <b>높은 음</b>이 납니다.'}
          빨간 점이 <b>마디</b>, 가장 크게 흔들리는 곳이 <b>배</b>입니다.</div>`;
    }
    const amp = resAmp(state.depth);
    const pos = resPositions();
    const found = sim.found;
    let lamM = null, vM = null;
    if (found.length >= 2) {
      lamM = 2 * (found[1] - found[0]);
      vM = F_RES * lamM;
    }
    return `
      <div class="row"><span>스피커 진동수 <i>f</i></span><b>${F_RES} Hz</b></div>
      <div class="row"><span>공기 기둥 길이</span><b>${(state.depth * 100).toFixed(1)} cm</b></div>
      <div class="row"><span>소리 크기</span>
        <b class="big">${(40 + amp * 45).toFixed(1)} dB ${amp > 0.85 ? '🔊 공명!' : ''}</b></div>
      <div class="sec">찾은 공명 위치</div>
      <div class="row"><span>y₁ / y₂ / y₃</span>
        <b>${[0, 1, 2].map((i) => found[i] ? (found[i] * 100).toFixed(1) : '—').join(' / ')} cm</b></div>
      ${lamM ? `
      <div class="row"><span>파장 λ = 2(y₂−y₁)</span><b>${(lamM * 100).toFixed(1)} cm</b></div>
      <div class="row"><span>음속 <i>v</i> = <i>f</i>λ</span>
        <b class="big">${vM.toFixed(1)} m/s</b></div>
      <div class="formula">이론값 343 m/s (20 ℃, v = 331.5 + 0.6t) 와 비교해 보세요!</div>`
      : `<div class="formula">수면을 내리며 소리가 가장 커질 때 «여기 기록» 을 누르세요.
        첫 공명은 약 ${(pos[0] * 100).toFixed(0)} cm 부근입니다 (λ/4).</div>`}`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '정상파의 모양';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'inst') {
      const n = state.harmonic;
      const xOf = (u) => padL + u * gw;
      const yOf = (y) => padT + gh / 2 - y * (gh / 2.4);
      const env = (u) => state.inst === 'string' ? Math.sin(n * Math.PI * u)
        : state.inst === 'open' ? Math.cos(n * Math.PI * u)
        : Math.sin(n * Math.PI * u / 2);
      // 진동 봉투 (양쪽)
      [-1, 1].forEach((sgn) => {
        ctx.strokeStyle = 'rgba(90,157,240,.5)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i <= 140; i++) {
          const u = i / 140;
          const y = yOf(sgn * env(u));
          if (i === 0) ctx.moveTo(xOf(u), y); else ctx.lineTo(xOf(u), y);
        }
        ctx.stroke();
      });
      // 현재 위상
      const phase = Math.cos(2 * Math.PI * 1.2 * (sim ? sim.t : 0));
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const u = i / 140;
        const y = yOf(env(u) * phase);
        if (i === 0) ctx.moveTo(xOf(u), y); else ctx.lineTo(xOf(u), y);
      }
      ctx.stroke();
      // 마디 표시
      ctx.fillStyle = '#e8577a';
      for (let i = 0; i <= 140; i++) {
        const u = i / 140;
        if (Math.abs(env(u)) < 0.02) {
          ctx.beginPath(); ctx.arc(xOf(u), yOf(0), 4, 0, 7); ctx.fill();
        }
      }
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('빨강 = 마디 · 봉투의 최대 = 배', padL + 4, padT + 2);
      return;
    }

    // 공명: 공기 기둥 길이별 소리 크기 곡선
    const xOf = (d) => padL + d * gw;         // d in m (0~1)
    const yOf = (a) => padT + gh - a * gh;
    ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const d = 0.03 + (i / 240) * 0.97;
      const y = yOf(resAmp(d));
      if (i === 0) ctx.moveTo(xOf(d), y); else ctx.lineTo(xOf(d), y);
    }
    ctx.stroke();
    // 공명 위치 세로선
    resPositions().forEach((p, i) => {
      if (p > 1) return;
      ctx.strokeStyle = 'rgba(255,216,74,.5)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(xOf(p), padT); ctx.lineTo(xOf(p), padT + gh); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd84a'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`y${i + 1}`, xOf(p), padT + 2);
    });
    // 현재 위치
    ctx.strokeStyle = '#e8577a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOf(state.depth), padT); ctx.lineTo(xOf(state.depth), padT + gh); ctx.stroke();
    // 찾은 위치
    ctx.fillStyle = '#69d98c';
    (sim ? sim.found : []).forEach((d) => {
      ctx.beginPath(); ctx.arc(xOf(d), yOf(1), 4.5, 0, 7); ctx.fill();
    });
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('공기 기둥 길이 (0~100 cm)', W2 - 4, padT + gh + 4);
  }

  function graphFootHTML() {
    if (state.mode === 'inst') {
      const w = waveOf();
      return `f<sub>${state.harmonic}</sub> = ${w.f.toFixed(1)} Hz — 기본 진동의 ${state.harmonic}배 ·
        이웃한 마디 사이 거리는 λ/2 = ${(w.lam / 2 * 100).toFixed(1)} cm`;
    }
    return `공명은 λ/4 의 <b>홀수 배</b>(${resPositions().map((p) => (p * 100).toFixed(0)).join(' · ')} cm)에서만 —
      이웃 간격이 λ/2 입니다`;
  }

  /* ══ 기록표 (탐구 112쪽 표) ══════════════════ */
  const recordColumns = [
    '실험', '조건', 'y₁ (cm)', 'y₂ (cm)', 'y₃ (cm)', 'λ (cm)', 'v = fλ (m/s)',
  ];

  function recordRow() {
    if (state.mode === 'inst') {
      const w = waveOf();
      return [['악기', `${{ string: '현', open: '열린 관', closed: '닫힌 관' }[state.inst]} L=${state.L.toFixed(2)} m, ${state.harmonic}배`,
        '—', '—', '—', (w.lam * 100).toFixed(1), `f = ${w.f.toFixed(1)} Hz`]];
    }
    const f2 = sim.found;
    const lam = f2.length >= 2 ? 2 * (f2[1] - f2[0]) : null;
    return [['공명', `f = ${F_RES} Hz`,
      f2[0] ? (f2[0] * 100).toFixed(1) : '—',
      f2[1] ? (f2[1] * 100).toFixed(1) : '—',
      f2[2] ? (f2[2] * 100).toFixed(1) : '—',
      lam ? (lam * 100).toFixed(1) : '—',
      lam ? (F_RES * lam).toFixed(1) : '—']];
  }

  return {
    id: 'standing',
    title: '정상파와 악기 — 기주 공명으로 음속 재기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, waveOf, resAmp, resPositions, LAM_RES,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
