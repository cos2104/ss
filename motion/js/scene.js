/**
 * 힘, 질량, 가속도 사이의 관계 알아보기
 * 비상교육 고등 물리학 I-1-02 (교과서 22~29쪽), 해 보기 24쪽
 *
 * 역학 수레를 용수철저울로 일정한 힘으로 당기며 시간에 따른 속도를 측정한다.
 * 교과서의 표 (가) 힘 1·2·3 N, (나) 질량 0.5·1.0·1.5 kg 을 그대로 재현한다.
 */
const MotionScene = (() => {
  const B = () => BABYLON;

  const M = 5;              // 1 m = 5 unit
  const TRACK_L = 3.2;      // 트랙 길이 (m)
  const X0 = -TRACK_L / 2;
  const TABLE_Y = 0;

  let scene, camera;
  let cart, track, spring, springLabel, springTex, marks = [];
  let placed = {};

  const state = {
    force: 1.0,     // N
    mass: 0.5,      // kg
    running: false,
  };

  // 진행 상태
  let sim = null;
  const SAMPLE_DT = 0.1;    // 교과서 표와 같은 0.1 초 간격

  const tools = [
    { id: 'track', label: '트랙 · 자', icon: 'rail' },
    { id: 'cart', label: '역학 수레', icon: 'cart' },
    { id: 'spring', label: '용수철저울', icon: 'stopwatch' },
  ];

  const slots = {
    track: { x: 0, name: '트랙' },
    cart: { x: X0 + 0.4, name: '역학 수레' },
    spring: { x: 1.2, name: '용수철저울' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 뉴턴 제2법칙 : a = F/m */
  function accel() { return state.force / state.mass; }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camMo', -Math.PI / 2 + 0.26, 1.04, 20, new (B().Vector3)(0, 1.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 42;
    camera.upperBetaLimit = 1.48;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hm', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new (B().Color3)(0.44, 0.47, 0.52);

    const dir = new (B().DirectionalLight)('dm', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.4;

    buildTable();
    buildTrack();
    buildCart();
    buildSpring();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/motion.jpg', { x: -10, y: 0, z: 5, ry: 0.3 });

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

  function buildTable() {
    const t = B().MeshBuilder.CreateBox('moTable', { width: 32, height: 0.6, depth: 12 }, scene);
    t.position.set(0, TABLE_Y - 0.32, 0);
    t.material = mat('moTableMat', '#9aa3ad', '#c6ccd3', 96);
  }

  function buildTrack() {
    track = new (B().TransformNode)('trackGroup', scene);
    const bar = B().MeshBuilder.CreateBox('track', { width: TRACK_L * M, height: 0.2, depth: 1.6 }, scene);
    bar.position.set(0, TABLE_Y + 0.1, 0);
    bar.material = mat('trackMat', '#39424f', '#8e9bad', 64);
    bar.parent = track;

    const ruler = B().MeshBuilder.CreateGround('moRuler', { width: TRACK_L * M, height: 0.8 }, scene);
    ruler.position.set(0, TABLE_Y + 0.02, 1.5);
    const tex = new (B().DynamicTexture)('moRulerTex', { width: 1400, height: 84 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#f2efe2';
    ctx.fillRect(0, 0, 1400, 84);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    const N = Math.round(TRACK_L * 10);
    for (let i = 0; i <= N; i++) {
      const x = 8 + (i / N) * 1384;
      ctx.beginPath(); ctx.moveTo(x, 84); ctx.lineTo(x, i % 5 === 0 ? 42 : 62); ctx.stroke();
    }
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 24px sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    for (let i = 0; i <= N; i += 5) ctx.fillText(`${(i / 10).toFixed(1)}`, 8 + (i / N) * 1384, 5);
    tex.update();
    const rm = new (B().StandardMaterial)('moRulerMat', scene);
    rm.diffuseTexture = tex;
    rm.specularColor = new (B().Color3)(0, 0, 0);
    ruler.material = rm;
    ruler.parent = track;
  }

  function buildCart() {
    cart = new (B().TransformNode)('cartGroup', scene);

    const body = B().MeshBuilder.CreateBox('cartBody', { width: 1.5, height: 0.9, depth: 1.2 }, scene);
    body.position.y = TABLE_Y + 0.72;
    body.material = mat('cartBodyMat', '#c8ccd2', '#ffffff', 48);
    body.parent = cart;

    // 질량을 나타내는 추 (질량이 크면 더 쌓인다)
    for (let i = 0; i < 3; i++) {
      const w = B().MeshBuilder.CreateBox('cartMassW' + i, { width: 0.9, height: 0.3, depth: 0.8 }, scene);
      w.position.set(0, TABLE_Y + 1.32 + i * 0.34, 0);
      w.material = mat('cartMassWM' + i, '#5b6675', '#c3cad3', 64);
      w.parent = cart;
      w.setEnabled(false);
      cart['_w' + i] = w;
    }

    const wm = mat('moWheelMat', '#20262f');
    [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz], i) => {
      const w = B().MeshBuilder.CreateCylinder('mw' + i, { height: 0.12, diameter: 0.42 }, scene);
      w.rotation.x = Math.PI / 2;
      w.position.set(dx, TABLE_Y + 0.4, dz);
      w.material = wm;
      w.parent = cart;
    });
  }

  /** 용수철저울 — 당기는 힘을 눈금으로 보여 준다 */
  function buildSpring() {
    spring = new (B().TransformNode)('springGroup', scene);

    const body = B().MeshBuilder.CreateBox('springBody', { width: 2.2, height: 0.6, depth: 0.5 }, scene);
    body.material = mat('springBodyMat', '#d0453a', '#ffd0c8', 48);
    body.parent = spring;

    springLabel = B().MeshBuilder.CreatePlane('springLabel', { width: 2.0, height: 0.55 }, scene);
    springLabel.position.set(0, 0.02, -0.27);
    springLabel.rotation.y = Math.PI;
    springTex = new (B().DynamicTexture)('springTex', { width: 260, height: 72 }, scene, true);
    const sm = new (B().StandardMaterial)('springLabelMat', scene);
    sm.diffuseTexture = springTex;
    sm.emissiveTexture = springTex;
    sm.opacityTexture = springTex;
    sm.emissiveColor = new (B().Color3)(1, 1, 1);
    sm.specularColor = new (B().Color3)(0, 0, 0);
    sm.backFaceCulling = false;
    springLabel.material = sm;
    springLabel.parent = spring;

    // 연결 줄
    const rope = B().MeshBuilder.CreateCylinder('springRope', { height: 1, diameter: 0.07 }, scene);
    rope.rotation.z = Math.PI / 2;
    rope.material = mat('springRopeMat', '#2b323c');
    rope.parent = spring;
    spring._rope = rope;
  }

  function drawSpring() {
    const ctx = springTex.getContext();
    ctx.clearRect(0, 0, 260, 72);
    ctx.translate(260, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#f6f2e6';
    ctx.fillRect(0, 0, 260, 72);
    ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const x = 12 + (i / 8) * 236;
      ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x, i % 2 === 0 ? 40 : 54); ctx.stroke();
    }
    // 지침
    const p = 12 + (state.force / 4) * 236;
    ctx.strokeStyle = '#d0453a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p, 72); ctx.lineTo(p, 24); ctx.stroke();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`${state.force.toFixed(1)} N`, 130, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    springTex.update();
  }

  /** 0.1 초마다 남기는 자취 — 간격이 점점 넓어지는 것이 등가속도의 증거 */
  function clearMarks() {
    marks.forEach((m) => m.dispose());
    marks = [];
  }

  function addMark(x) {
    const s = B().MeshBuilder.CreateBox('mmark' + marks.length,
      { width: 0.07, height: 0.5, depth: 0.9 }, scene);
    s.position.set(x * M, TABLE_Y + 0.45, -1.1);
    const m = new (B().StandardMaterial)('mmarkMat' + marks.length, scene);
    m.emissiveColor = B().Color3.FromHexString('#e8577a');
    m.disableLighting = true;
    m.alpha = 0.8;
    s.material = m;
    s.isPickable = false;
    marks.push(s);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      track: { x: 0, w: TRACK_L * M, h: 2.2, label: '트랙' },
      cart: { x: (X0 + 0.4) * M, w: 3.2, h: 2.0, label: '역학 수레' },
      spring: { x: 1.2 * M, w: 3.4, h: 1.8, label: '용수철저울' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, TABLE_Y + 0.05, 0);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#2f6ad0' });
      const m = new (B().StandardMaterial)('phM_' + id, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      holders[id] = p;
    });
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
    track.setEnabled(!!placed.track);
    cart.setEnabled(!!placed.cart);
    spring.setEnabled(!!placed.spring);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    reset();
  }

  function dropAt(id, point) {
    const s = slots[id];
    return (Math.abs(point.x / M - s.x) <= 1.6 && Math.abs(point.z) <= 2.6) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = { t: 0, x: X0 + 0.4, v: 0, samples: [{ t: 0, v: 0 }], nextSample: SAMPLE_DT, done: false };
    clearMarks();
    layout();
  }

  function layout() {
    if (!sim) return;
    cart.position.x = sim.x * M;
    // 질량에 따라 수레 위 추 개수를 바꾼다
    const n = Math.round((state.mass - 0.5) / 0.5);
    for (let i = 0; i < 3; i++) cart['_w' + i].setEnabled(i < n);
    // 용수철저울은 수레 앞에 붙어 함께 간다
    spring.position.set(sim.x * M + 2.1, TABLE_Y + 0.72, 0);
    const gap = 1.0;
    spring._rope.scaling.y = gap;
    spring._rope.position.set(-1.1 - gap / 2 + 0.05, 0, 0);
    drawSpring();
  }

  function tick(dt) {
    if (!sim || !state.running || sim.done) return false;

    const a = accel();
    sim.t += dt;
    sim.v += a * dt;
    sim.x += sim.v * dt;

    // 0.1 초마다 표본을 남긴다 (교과서 표와 같은 간격)
    while (sim.t >= sim.nextSample) {
      const tS = sim.nextSample;
      sim.samples.push({ t: +tS.toFixed(1), v: a * tS });
      addMark(X0 + 0.4 + 0.5 * a * tS * tS);
      sim.nextSample += SAMPLE_DT;
    }

    // 트랙 끝에 닿으면 멈춘다
    if (sim.x >= X0 + TRACK_L - 0.3) {
      sim.x = X0 + TRACK_L - 0.3;
      sim.done = true;
      state.running = false;
      const btn = document.querySelector('#runBtn');
      if (btn) { btn.textContent = '▶ 당기기'; btn.classList.remove('run'); }
    }
    layout();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.26;
    camera.beta = 1.04;
    camera.radius = 20;
    camera.setTarget(new (B().Vector3)(0, 1.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '힘과 질량을 바꿔 가며 수레를 당겨 보고, 속도–시간 그래프의 <b>기울기(가속도)</b>가 어떻게 변하는지 관찰하세요.';
  const prepGuide = '점선으로 표시된 자리에 트랙·역학 수레·용수철저울을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('당기는 힘<br><i>F</i>', 'force', [
        { v: 1, t: '1 N' }, { v: 2, t: '2 N' }, { v: 3, t: '3 N' },
      ], state.force, 1)}
      ${LabUI.opts('수레의<br>질량 <i>m</i>', 'mass', [
        { v: 0.5, t: '0.5 kg' }, { v: 1.0, t: '1.0 kg' }, { v: 1.5, t: '1.5 kg' },
      ], state.mass, 1)}
      <div class="control">
        <div class="clabel">실험</div>
        <button class="power" id="runBtn">▶ 당기기</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 되돌리기</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    const after = () => { reset(); onChange(); };
    LabUI.bindOpts(root, 'force', state, 'force', after);
    LabUI.bindOpts(root, 'mass', state, 'mass', after);

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      if (sim && sim.done) reset();
      state.running = !state.running;
      run.textContent = state.running ? '당기는 중' : '▶ 당기기';
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = '▶ 당기기';
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    const a = accel();
    return `
      <div class="row"><span>당기는 힘 <i>F</i></span><b>${state.force.toFixed(1)} N</b></div>
      <div class="row"><span>수레의 질량 <i>m</i></span><b>${state.mass.toFixed(1)} kg</b></div>
      <div class="row"><span>가속도 <i>a</i> = <i>F</i>/<i>m</i></span>
        <b class="big">${a.toFixed(1)} m/s²</b></div>

      <div class="sec">현재</div>
      <div class="row"><span>시간 <i>t</i></span><b>${sim.t.toFixed(2)} s</b></div>
      <div class="row"><span>속도 <i>v</i> = <i>at</i></span><b>${sim.v.toFixed(2)} m/s</b></div>
      <div class="row"><span>이동 거리 <i>s</i></span>
        <b>${(sim.x - (X0 + 0.4)).toFixed(2)} m</b></div>
      <div class="formula"><i>F</i> = <i>ma</i> &nbsp;·&nbsp;
        <i>v</i> = <i>at</i> &nbsp;·&nbsp; <i>s</i> = ½<i>at</i><sup>2</sup></div>
      <div class="formula" style="color:#62718a">
        빨간 자취의 간격이 점점 넓어지는 것이 속도가 커진다는 뜻입니다.</div>`;
  }

  /* ══ 그래프 — 속도-시간 (교과서 24쪽) ═══════ */
  const graphTitle = '시간에 따른 속도 (v–t 그래프)';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 34, padR = 12, padT = 14, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const T_MAX = 1.0, V_MAX = 7;
    const xOf = (t) => padL + (t / T_MAX) * gw;
    const yOf = (v) => padT + gh - (v / V_MAX) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let t = 0.2; t <= T_MAX; t += 0.2) {
      ctx.beginPath(); ctx.moveTo(xOf(t), padT); ctx.lineTo(xOf(t), padT + gh); ctx.stroke();
    }
    for (let v = 1; v <= V_MAX; v++) {
      ctx.beginPath(); ctx.moveTo(padL, yOf(v)); ctx.lineTo(padL + gw, yOf(v)); ctx.stroke();
    }

    // 세 가지 힘(또는 질량)에 대한 비교선을 옅게 함께 보여 준다
    const others = [
      { F: 1, m: state.mass }, { F: 2, m: state.mass }, { F: 3, m: state.mass },
    ];
    others.forEach((o) => {
      const a = o.F / o.m;
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(0));
      ctx.lineTo(xOf(T_MAX), yOf(Math.min(V_MAX, a * T_MAX)));
      ctx.stroke();
    });

    // 현재 조건의 이론선
    const a = accel();
    ctx.strokeStyle = '#5ad0f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    const tEnd = Math.min(T_MAX, V_MAX / a);
    ctx.lineTo(xOf(tEnd), yOf(a * tEnd));
    ctx.stroke();

    // 실제로 측정된 표본
    if (sim) {
      ctx.fillStyle = '#ffd84a';
      sim.samples.forEach((s) => {
        if (s.t > T_MAX || s.v > V_MAX) return;
        ctx.beginPath(); ctx.arc(xOf(s.t), yOf(s.v), 3.2, 0, 7); ctx.fill();
      });
    }

    // 축
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= T_MAX; t += 0.2) ctx.fillText(t.toFixed(1), xOf(t), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 2; v <= V_MAX; v += 2) ctx.fillText(String(v), padL - 4, yOf(v));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('시간 (s)', W - 4, padT + gh + 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5ad0f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`기울기 = 가속도 ${a.toFixed(1)} m/s²`, padL + 5, padT + 3);
  }

  function graphFootHTML() {
    const a = accel();
    return `<i>v</i>–<i>t</i> 그래프의 <b>기울기</b>가 곧 가속도입니다 ·
      지금 <b>${state.force.toFixed(1)} N ÷ ${state.mass.toFixed(1)} kg
      = ${a.toFixed(1)} m/s²</b> · 노란 점은 0.1 초마다 측정한 값`;
  }

  /* ══ 기록표 (교과서 24쪽 표) ════════════════ */
  const recordColumns = [
    '힘 <i>F</i> (N)', '질량 <i>m</i> (kg)', '가속도 <i>a</i> (m/s²)',
    '0.1 s', '0.2 s', '0.3 s', '0.4 s',
  ];

  function recordRow() {
    const a = accel();
    return [
      state.force.toFixed(1), state.mass.toFixed(1), a.toFixed(1),
      (a * 0.1).toFixed(1), (a * 0.2).toFixed(1), (a * 0.3).toFixed(1), (a * 0.4).toFixed(1),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 수레 출발 · 1 힘 2배 → 가속도 2배 · 2 질량 2배 → 가속도 절반
     3 기록 4줄 · 4 가속도 4 m/s² 이상 만들기                             */
  const mis = { ran: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);
  const num = (v) => parseFloat(v);
  /** 기록 중 «한쪽 값은 같고 다른 값이 배수»인 짝을 찾는다 */
  function pair(sameCol, ratioCol, ratio) {
    const rs = recs();
    for (let a = 0; a < rs.length; a++) {
      for (let b = 0; b < rs.length; b++) {
        if (a === b) continue;
        if (Math.abs(num(rs[a][sameCol]) - num(rs[b][sameCol])) > 1e-6) continue;
        if (Math.abs(num(rs[b][ratioCol]) - num(rs[a][ratioCol]) * ratio) < 0.06) return [rs[a], rs[b]];
      }
    }
    return null;
  }

  function missionDone(i) {
    if (state.running) mis.ran = true;
    if (i === 0) return mis.ran;
    if (i === 1) return !!pair(1, 0, 2);            // 질량 같고 힘 2배
    if (i === 2) return !!pair(0, 1, 2);            // 힘 같고 질량 2배
    if (i === 3) return recs().length >= 4;
    if (i === 4) return accel() >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'motion',
    title: '힘, 질량, 가속도 사이의 관계 알아보기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, accel,
    get scene() { return scene; },
  };
})();
