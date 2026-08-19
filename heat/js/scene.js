/**
 * 역학적 에너지에 의한 온도 변화 측정하기
 * 비상교육 고등 물리학 I-2-02 (교과서 48~51쪽), 해 보기 48쪽
 *
 * 모래를 넣은 스티로폼 컵을 위아래로 흔들면 모래가 컵 안에서 떨어지며
 * 역학적 에너지가 열로 바뀌어 온도가 올라간다.
 * 질량이 약분되어 «모래를 얼마나 넣든 온도 상승은 같다» 는 점이 드러나게 했다.
 */
const HeatScene = (() => {
  const B = () => BABYLON;

  const G = 9.8;
  const C_SAND = 800;       // 모래의 비열 (J/kg·K)
  const T0 = 20;            // 처음 온도 (℃)

  let scene, camera;
  let cup, cupGroup, sandMesh, thermo, thermoTex, lid;
  let placed = {};

  const state = {
    sandMass: 0.3,   // kg
    height: 0.40,    // 흔드는 높이 (m)
    shakes: 0,       // 흔든 횟수
    shaking: false,
  };

  let shakePhase = 0;       // 흔드는 애니메이션
  let shakeTarget = 0;      // 자동으로 채울 목표 횟수

  const tools = [
    { id: 'cup', label: '스티로폼 컵', icon: 'weight' },
    { id: 'sand', label: '모래', icon: 'ball' },
    { id: 'thermo', label: '온도계', icon: 'stopwatch' },
  ];

  const slots = {
    cup: { y: 2.4, name: '스티로폼 컵' },
    sand: { y: 1.8, name: '모래' },
    thermo: { y: 5.4, name: '온도계' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /**
   * 한 번 흔들 때 모래가 낙하하며 잃는 역학적 에너지 = mgh.
   * 모두 열로 바뀐다고 보면  Q = cmΔT  에서
   *   ΔT = N·m·g·h / (c·m) = N·g·h / c   ← 질량 m 이 약분된다
   */
  function deltaT(n = state.shakes) {
    return n * G * state.height / C_SAND;
  }
  function temperature() { return T0 + deltaT(); }
  function workDone() { return state.shakes * state.sandMass * G * state.height; }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#cfe3f5ff');

    camera = new (B().ArcRotateCamera)(
      'camHt', -Math.PI / 2 + 0.16, 1.18, 16, new (B().Vector3)(0, 3.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hh', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.92;
    hemi.groundColor = new (B().Color3)(0.46, 0.49, 0.54);

    const dir = new (B().DirectionalLight)('dh', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(7, 15, -8);
    dir.intensity = 0.38;

    buildTable();
    buildCup();
    buildThermo();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/heat.jpg', { x: -7, y: 0, z: 5, ry: 0.3 });

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
    const t = B().MeshBuilder.CreateBox('htTable', { width: 22, height: 0.5, depth: 14 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('htTableMat', '#a9b1ba', '#d6dbe1', 90);
  }

  function buildCup() {
    cupGroup = new (B().TransformNode)('cupGroup', scene);

    cup = B().MeshBuilder.CreateCylinder('cup',
      { height: 4.4, diameterTop: 2.9, diameterBottom: 2.2, tessellation: 32 }, scene);
    cup.position.y = 2.2;
    const cm = new (B().StandardMaterial)('cupMat', scene);
    cm.diffuseColor = B().Color3.FromHexString('#f4f6f9');
    cm.specularColor = B().Color3.FromHexString('#ffffff');
    cm.specularPower = 32;
    cm.alpha = 0.55;               // 안이 보이도록 반투명
    cm.backFaceCulling = false;
    cup.material = cm;
    cup.parent = cupGroup;

    // 모래
    sandMesh = B().MeshBuilder.CreateCylinder('sand',
      { height: 1, diameterTop: 2.6, diameterBottom: 2.1, tessellation: 32 }, scene);
    sandMesh.material = mat('sandMat', '#c8a86a', '#f0dcb0', 24);
    sandMesh.parent = cupGroup;

    // 뚜껑
    lid = B().MeshBuilder.CreateCylinder('lid', { height: 0.28, diameter: 3.1, tessellation: 32 }, scene);
    lid.position.y = 4.5;
    lid.material = mat('lidMat', '#e4e8ee', '#ffffff', 48);
    lid.parent = cupGroup;
  }

  /** 온도계 — 눈금과 붉은 기둥 */
  function buildThermo() {
    thermo = new (B().TransformNode)('thermoGroup', scene);

    const stick = B().MeshBuilder.CreateCylinder('thStick', { height: 5.2, diameter: 0.26 }, scene);
    stick.position.y = 5.4;
    const sm = new (B().StandardMaterial)('thStickMat', scene);
    sm.diffuseColor = B().Color3.FromHexString('#eef2f7');
    sm.alpha = 0.75;
    stick.material = sm;
    stick.parent = thermo;

    const bulbT = B().MeshBuilder.CreateSphere('thBulb', { diameter: 0.42 }, scene);
    bulbT.position.y = 2.85;
    bulbT.material = mat('thBulbMat', '#d0453a');
    bulbT.parent = thermo;

    // 눈금판 (온도를 숫자로도 보여 준다)
    const plate = B().MeshBuilder.CreatePlane('thPlate', { width: 2.4, height: 1.4 }, scene);
    plate.position.set(2.3, 6.6, 0);
    plate.rotation.y = Math.PI;
    thermoTex = new (B().DynamicTexture)('thTex', { width: 240, height: 140 }, scene, true);
    const pm = new (B().StandardMaterial)('thPlateMat', scene);
    pm.diffuseTexture = thermoTex;
    pm.emissiveTexture = thermoTex;
    pm.opacityTexture = thermoTex;
    pm.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    pm.specularColor = new (B().Color3)(0, 0, 0);
    pm.backFaceCulling = false;
    plate.material = pm;
    plate.parent = thermo;

    // 수은주
    const col = B().MeshBuilder.CreateCylinder('thCol', { height: 1, diameter: 0.14 }, scene);
    col.material = mat('thColMat', '#d0453a');
    col.parent = thermo;
    thermo._col = col;
  }

  function drawThermo() {
    const ctx = thermoTex.getContext();
    ctx.clearRect(0, 0, 240, 140);
    ctx.translate(240, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#ffffffee';
    ctx.fillRect(0, 0, 240, 140);
    ctx.strokeStyle = '#c3cad3'; ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 234, 134);

    const T = temperature();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('모래의 온도', 120, 12);

    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 52px "Menlo", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${T.toFixed(2)}`, 108, 72);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('℃', 200, 76);

    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 18px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`처음보다 +${deltaT().toFixed(2)} ℃`, 120, 132);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    thermoTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      cup: { y: 2.4, w: 4.0, h: 5.0, label: '컵' },
      sand: { y: 1.2, w: 3.4, h: 2.2, label: '모래' },
      thermo: { y: 6.2, w: 3.0, h: 4.4, label: '온도계' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(id === 'thermo' ? 2.2 : 0, c.y, 0.6);
      p.rotation.y = Math.PI;
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: true, color: '#2f6ad0' });
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
    state.shakes = 0; state.shaking = false; shakeTarget = 0; shakePhase = 0;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    cupGroup.setEnabled(!!placed.cup);
    sandMesh.setEnabled(!!placed.sand && !!placed.cup);
    lid.setEnabled(!!placed.thermo && !!placed.cup);
    thermo.setEnabled(!!placed.thermo);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    return Math.abs(point.y - slots[id].y) <= 3.0 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    // 모래의 양에 따라 높이가 달라진다
    const h = 0.5 + state.sandMass * 3.2;
    sandMesh.scaling.y = h;
    sandMesh.position.y = 0.15 + h / 2;

    // 온도에 따라 모래 색이 조금 붉어진다
    const warm = Math.min(1, deltaT() / 1.6);
    sandMesh.material.diffuseColor = new (B().Color3)(
      0.78 + warm * 0.2, 0.66 - warm * 0.16, 0.42 - warm * 0.2);

    if (placed.thermo) {
      const colH = 1.6 + Math.min(2.4, deltaT() * 1.6);
      thermo._col.scaling.y = colH;
      thermo._col.position.y = 3.0 + colH / 2;
      drawThermo();
    }
  }

  /** 흔들기 애니메이션. 한 주기마다 횟수를 1 올린다. */
  function tick(dt) {
    if (!state.shaking) return false;
    shakePhase += dt * 7.5;
    cupGroup.position.y = Math.sin(shakePhase) * 0.9;
    if (thermo) thermo.position.y = cupGroup.position.y;

    if (shakePhase >= Math.PI * 2) {
      shakePhase -= Math.PI * 2;
      state.shakes += 1;
      if (state.shakes >= shakeTarget) {
        state.shaking = false;
        cupGroup.position.y = 0;
        if (thermo) thermo.position.y = 0;
        const btn = document.querySelector('#shakeBtn');
        if (btn) { btn.textContent = '흔들기 (50회)'; btn.classList.remove('run'); }
      }
      update();
      return true;
    }
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.16;
    camera.beta = 1.18;
    camera.radius = 16;
    camera.setTarget(new (B().Vector3)(0, 3.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '컵을 50 회씩 흔들며 모래의 온도를 재어 보세요. <b>모래의 양</b>을 바꾸면 온도 상승이 달라질까요?';
  const prepGuide = '점선으로 표시된 자리에 컵·모래·온도계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('sandMass', '모래의<br>양 <i>m</i>',
        { min: 0.1, max: 0.8, step: 0.05, value: state.sandMass, fmt: (v) => `${v.toFixed(2)} kg` })}
      ${LabUI.slider('height', '흔드는<br>높이 <i>h</i>',
        { min: 0.1, max: 0.6, step: 0.05, value: state.height, fmt: (v) => `${v.toFixed(2)} m` })}
      <div class="control">
        <div class="clabel">흔든<br>횟수</div>
        <div class="cbody">
          <div class="slider-row" style="min-width:150px">
            <output id="shakeOut" style="font-size:19px;min-width:96px">${state.shakes} 회</output>
          </div>
          <div class="opt-grid one-row" style="margin-top:6px">
            <button class="opt" id="shakeBtn">흔들기 (50회)</button>
            <button class="opt" id="resetBtn">처음으로</button>
          </div>
        </div>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindSlider(root, 'sandMass', state, 'sandMass', (v) => `${v.toFixed(2)} kg`, onChange);
    LabUI.bindSlider(root, 'height', state, 'height', (v) => `${v.toFixed(2)} m`, onChange);

    const shake = root.querySelector('#shakeBtn');
    shake.addEventListener('click', () => {
      if (state.shaking) return;
      shakeTarget = state.shakes + 50;
      state.shaking = true;
      shake.textContent = '흔드는 중…';
      shake.classList.add('run');
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      state.shakes = 0; state.shaking = false; shakeTarget = 0; shakePhase = 0;
      cupGroup.position.y = 0;
      if (thermo) thermo.position.y = 0;
      shake.textContent = '흔들기 (50회)';
      shake.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const W = workDone();
    return `
      <div class="row"><span>모래의 양</span><b>${state.sandMass.toFixed(2)} kg</b></div>
      <div class="row"><span>흔드는 높이</span><b>${state.height.toFixed(2)} m</b></div>
      <div class="row"><span>흔든 횟수</span><b>${state.shakes} 회</b></div>

      <div class="sec">에너지</div>
      <div class="row"><span>한 번의 일 <i>mgh</i></span>
        <b>${(state.sandMass * G * state.height).toFixed(2)} J</b></div>
      <div class="row"><span>전체 한 일 <i>W</i></span><b>${W.toFixed(1)} J</b></div>

      <div class="sec">온도</div>
      <div class="row"><span>처음 온도</span><b>${T0.toFixed(2)} ℃</b></div>
      <div class="row"><span>지금 온도</span><b class="big">${temperature().toFixed(2)} ℃</b></div>
      <div class="row"><span>온도 변화 Δ<i>T</i></span><b>+${deltaT().toFixed(3)} ℃</b></div>
      <div class="formula"><i>Q</i> = <i>cm</i>Δ<i>T</i> &nbsp;=&nbsp; <i>W</i> = <i>Nmgh</i></div>
      <div class="formula" style="color:#62718a">
        Δ<i>T</i> = <i>Ngh</i>/<i>c</i> — 질량이 약분되어 <b>모래의 양과 무관</b>합니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '흔든 횟수에 따른 온도';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 40, padR = 12, padT = 16, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const N_MAX = 200;
    const dtMax = Math.max(1.2, deltaT(N_MAX) * 1.15);
    const xOf = (n) => padL + (n / N_MAX) * gw;
    const yOf = (d) => padT + gh - (d / dtMax) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let n = 50; n <= N_MAX; n += 50) {
      ctx.beginPath(); ctx.moveTo(xOf(n), padT); ctx.lineTo(xOf(n), padT + gh); ctx.stroke();
    }

    // 이론선 (횟수에 비례)
    ctx.strokeStyle = '#e8663f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(N_MAX), yOf(deltaT(N_MAX)));
    ctx.stroke();

    // 50 회마다의 측정점
    ctx.fillStyle = '#ffd84a';
    for (let n = 0; n <= Math.min(state.shakes, N_MAX); n += 50) {
      ctx.beginPath(); ctx.arc(xOf(n), yOf(deltaT(n)), 3.6, 0, 7); ctx.fill();
    }
    // 현재 위치
    if (state.shakes <= N_MAX) {
      ctx.fillStyle = '#4ad8a0';
      ctx.beginPath(); ctx.arc(xOf(state.shakes), yOf(deltaT()), 4.5, 0, 7); ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let n = 0; n <= N_MAX; n += 50) ctx.fillText(String(n), xOf(n), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('0', padL - 4, yOf(0));
    ctx.fillText(`+${dtMax.toFixed(1)}`, padL - 4, yOf(dtMax));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('흔든 횟수', W - 4, padT + gh + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8663f';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('온도 상승 ΔT (℃)', padL + 4, padT + 2);
  }

  function graphFootHTML() {
    return `흔든 횟수에 <b>정비례</b>해 온도가 올라갑니다 ·
      200 회면 <b>+${deltaT(200).toFixed(2)} ℃</b> ·
      모래를 더 넣어도 <b>온도 상승은 그대로</b>입니다`;
  }

  /* ══ 기록표 (교과서 48쪽 표) ════════════════ */
  const recordColumns = ['모래 (kg)', '높이 (m)', '흔든 횟수', '온도 (℃)', 'Δ<i>T</i> (℃)'];

  function recordRow() {
    return [
      state.sandMass.toFixed(2), state.height.toFixed(2), String(state.shakes),
      temperature().toFixed(2), `+${deltaT().toFixed(3)}`,
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 100회 흔들기 · 1 온도 상승 확인 · 2 질량 바꿔 비교
     3 높이 바꿔 비교 · 4 기록 3줄                                        */
  const mis = { mSeen: {}, hSeen: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.shakes > 0) {
      mis.mSeen[state.sandMass.toFixed(2)] = true;
      mis.hSeen[state.height.toFixed(2)] = true;
    }
    if (i === 0) return state.shakes >= 100;
    if (i === 1) return deltaT() >= 0.05;
    if (i === 2) return Object.keys(mis.mSeen).length >= 2;
    if (i === 3) return Object.keys(mis.hSeen).length >= 2;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'heat',
    title: '역학적 에너지에 의한 온도 변화 측정하기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, deltaT, temperature,
    get scene() { return scene; },
  };
})();
