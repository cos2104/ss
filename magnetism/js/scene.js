/**
 * 여러 가지 물질의 자성 알아보기
 * 비상교육 고등 물리학 II-2-01 (교과서 92~97쪽), 해 보기 93쪽
 *
 * 자석을 가까이 가져갈 때 물질 속 «자기 구역» 이 어떻게 반응하는지 보여 준다.
 *   강자성 — 강하게 정렬하고 자석을 떼어도 남는다 (영구 자석이 된다)
 *   상자성 — 약하게 같은 방향으로 정렬하고 떼면 곧 흐트러진다
 *   반자성 — 반대 방향으로 정렬해 살짝 밀려난다
 */
const MagnetismScene = (() => {
  const B = () => BABYLON;

  const GRID_X = 7, GRID_Z = 4;      // 자기 구역 격자
  const SAMPLE_X = 4;                 // 시료 중심

  let scene, camera;
  let magnet, sample, sampleBody, domains = [], resultTex, resultG;
  let placed = {};

  const state = {
    material: 'ferro',   // ferro | para | dia
    dist: 3.5,           // 자석과 시료 사이 거리 (unit)
    applied: false,      // 처음에는 자석을 멀리 치워 둔다
  };

  const MATERIALS = {
    ferro: { name: '강자성체', ex: '철·니켈·코발트', color: '#8e97a4',
      align: 1.0, keeps: true, force: 1.0, tag: 'con' },
    para: { name: '상자성체', ex: '알루미늄·백금·산소', color: '#b9a06a',
      align: 0.28, keeps: false, force: 0.12, tag: 'mid' },
    dia: { name: '반자성체', ex: '구리·금·물·흑연', color: '#7fa8b8',
      align: -0.18, keeps: false, force: -0.07, tag: 'des' },
  };

  // 자기 구역의 정렬 정도 (0~1, 음수면 반대 방향)
  let alignment = 0;
  let remanence = 0;        // 자석을 뗀 뒤에도 남은 자화

  const tools = [
    { id: 'magnet', label: '막대자석', icon: 'magnet' },
    { id: 'sample', label: '시료 (물질)', icon: 'weight' },
    { id: 'meter', label: '자기력 측정판', icon: 'galvano' },
  ];

  const slots = {
    magnet: { x: -4, name: '자석' },
    sample: { x: SAMPLE_X, name: '시료' },
    meter: { x: SAMPLE_X, name: '측정판' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 자석이 만드는 자기장의 세기 (거리에 따라 급히 약해진다) */
  function fieldStrength() {
    if (!state.applied) return 0;
    return 1 / (1 + Math.pow(state.dist / 2.4, 3));
  }

  /** 목표 정렬도 */
  function targetAlign() {
    const m = MATERIALS[state.material];
    return m.align * fieldStrength();
  }

  /** 시료가 받는 힘 (양수면 끌림, 음수면 밀림) */
  function forceOnSample() {
    const m = MATERIALS[state.material];
    return m.force * fieldStrength();
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#151d28ff');

    camera = new (B().ArcRotateCamera)(
      'camMg', -Math.PI / 2 - 0.1, 1.02, 21, new (B().Vector3)(1.2, 1.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.48;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hmg', new (B().Vector3)(-0.15, 1, -0.35), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new (B().Color3)(0.24, 0.27, 0.33);

    const dir = new (B().DirectionalLight)('dmg', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 15, -9);
    dir.intensity = 0.38;

    const glow = new (B().GlowLayer)('glowMg', scene);
    glow.intensity = 0.5;

    buildTable();
    buildMagnet();
    buildSample();
    buildResult();
    buildPlaceholders();

    glow.addExcludedMesh(scene.getMeshByName('mgResultFace'));
    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/magnetism.jpg', { x: -9.5, y: -1.2, z: 4.5, ry: 0.34 });

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
    const t = B().MeshBuilder.CreateBox('mgTable', { width: 26, height: 0.5, depth: 12 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('mgTableMat', '#2b3441', '#4c5766', 72);
  }

  function buildMagnet() {
    magnet = new (B().TransformNode)('mgMagnet', scene);
    const L = 3.6;
    const n = B().MeshBuilder.CreateBox('mgN', { width: L / 2, height: 1.3, depth: 1.3 }, scene);
    n.position.set(L / 4, 1.0, 0);
    n.material = mat('mgNMat', '#d0453a', '#ffc9c2', 48);
    n.parent = magnet;
    const s = B().MeshBuilder.CreateBox('mgS', { width: L / 2, height: 1.3, depth: 1.3 }, scene);
    s.position.set(-L / 4, 1.0, 0);
    s.material = mat('mgSMat', '#2f6ad0', '#c2d6ff', 48);
    s.parent = magnet;

    [['S', -L / 4], ['N', L / 4]].forEach(([txt, x]) => {
      const p = B().MeshBuilder.CreatePlane('mgLab' + txt, { width: 1.0, height: 1.0 }, scene);
      p.position.set(x, 1.0, -0.68);
      p.rotation.y = Math.PI;
      const tex = new (B().DynamicTexture)('mgLabT' + txt, { width: 96, height: 96 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 96, 96);
      ctx.translate(96, 0); ctx.scale(-1, 1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 66px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 48, 52);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      tex.hasAlpha = true; tex.update();
      const m = new (B().StandardMaterial)('mgLabM' + txt, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      p.parent = magnet;
    });
  }

  /** 시료 — 안에 자기 구역(작은 화살표)이 격자로 들어 있다 */
  function buildSample() {
    sample = new (B().TransformNode)('mgSample', scene);

    sampleBody = B().MeshBuilder.CreateBox('mgSampleBody',
      { width: GRID_X * 0.9 + 0.5, height: 2.4, depth: GRID_Z * 0.9 + 0.5 }, scene);
    sampleBody.position.set(SAMPLE_X, 1.2, 0);
    const bm = new (B().StandardMaterial)('mgSampleMat', scene);
    bm.diffuseColor = B().Color3.FromHexString('#8e97a4');
    bm.specularColor = B().Color3.FromHexString('#e8eef6');
    bm.specularPower = 64;
    bm.alpha = 0.35;
    bm.backFaceCulling = false;
    sampleBody.material = bm;
    sampleBody.parent = sample;

    // 자기 구역 화살표
    for (let i = 0; i < GRID_X; i++) {
      for (let k = 0; k < GRID_Z; k++) {
        const g = new (B().TransformNode)(`dom${i}_${k}`, scene);
        const shaft = B().MeshBuilder.CreateCylinder(`ds${i}_${k}`, { height: 0.58, diameter: 0.1 }, scene);
        shaft.rotation.z = -Math.PI / 2;
        const dm = new (B().StandardMaterial)(`dm${i}_${k}`, scene);
        dm.emissiveColor = B().Color3.FromHexString('#ffb03a');
        dm.disableLighting = true;
        shaft.material = dm;
        shaft.parent = g;

        const head = B().MeshBuilder.CreateCylinder(`dh${i}_${k}`,
          { height: 0.24, diameterTop: 0, diameterBottom: 0.24 }, scene);
        head.rotation.z = -Math.PI / 2;
        head.position.x = 0.4;
        head.material = dm;
        head.parent = g;

        g.position.set(
          SAMPLE_X - (GRID_X - 1) * 0.45 + i * 0.9,
          1.2,
          -(GRID_Z - 1) * 0.45 + k * 0.9,
        );
        g._mat = dm;
        g._seed = Math.random() * Math.PI * 2;
        g.parent = sample;
        domains.push(g);
      }
    }
  }

  /** 결과 표시판 */
  function buildResult() {
    resultG = new (B().TransformNode)('mgResult', scene);
    const body = B().MeshBuilder.CreateBox('mgResultBody', { width: 5.4, height: 3.2, depth: 0.5 }, scene);
    body.position.set(SAMPLE_X, 5.4, 1.2);
    body.material = mat('mgResultBodyMat', '#e6ebf2', '#ffffff', 70);
    body.parent = resultG;

    const face = B().MeshBuilder.CreatePlane('mgResultFace', { width: 5.0, height: 2.8 }, scene);
    face.position.set(SAMPLE_X, 5.4, 0.93);
    face.rotation.y = Math.PI;
    resultTex = new (B().DynamicTexture)('mgResultTex', { width: 340, height: 190 }, scene, true);
    const fm = new (B().StandardMaterial)('mgResultFM', scene);
    fm.diffuseTexture = resultTex; fm.emissiveTexture = resultTex; fm.opacityTexture = resultTex;
    fm.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    fm.specularColor = new (B().Color3)(0, 0, 0);
    fm.backFaceCulling = false;
    face.material = fm;
    face.parent = resultG;
  }

  function drawResult() {
    const m = MATERIALS[state.material];
    const f = forceOnSample();
    const ctx = resultTex.getContext();
    ctx.clearRect(0, 0, 340, 190);
    ctx.translate(340, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#12181f';
    ctx.fillRect(0, 0, 340, 190);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 332, 182);

    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(m.name, 170, 14);
    ctx.fillStyle = '#8e9bad';
    ctx.font = '15px "Noto Sans KR", sans-serif';
    ctx.fillText(m.ex, 170, 46);

    // 힘 막대
    const cx = 170, by = 108;
    ctx.fillStyle = '#243040';
    ctx.fillRect(30, by, 280, 26);
    const w = Math.min(140, Math.abs(f) * 140);
    ctx.fillStyle = f > 0 ? '#4ad8a0' : '#e8663f';
    if (f >= 0) ctx.fillRect(cx, by, w, 26);
    else ctx.fillRect(cx - w, by, w, 26);
    ctx.strokeStyle = '#8e9bad'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, by - 4); ctx.lineTo(cx, by + 30); ctx.stroke();

    ctx.fillStyle = f > 0.005 ? '#4ad8a0' : f < -0.005 ? '#e8663f' : '#8e9bad';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(f > 0.005 ? '자석에 끌린다' : f < -0.005 ? '자석에 밀린다' : '거의 반응 없다',
      170, 148);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resultTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      magnet: { x: -4, y: 1.0, w: 4.4, h: 2.2, label: '자석' },
      sample: { x: SAMPLE_X, y: 1.2, w: 7.4, h: 3.0, label: '시료' },
      meter: { x: SAMPLE_X, y: 5.4, w: 5.6, h: 3.4, label: '측정판' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 0.9);
      p.rotation.y = Math.PI;
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 256, height: 140 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 140);
      ctx.translate(256, 0); ctx.scale(-1, 1);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(7, 7, 242, 126);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 128, 72);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      tex.hasAlpha = true; tex.update();
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
    alignment = 0; remanence = 0;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    magnet.setEnabled(!!placed.magnet);
    sample.setEnabled(!!placed.sample);
    resultG.setEnabled(!!placed.meter);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    if (id === 'meter') return point.y > 3.2 ? 'ok' : 'wrong';
    return (Math.abs(point.x - s.x) <= 3.4 && point.y <= 3.6) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const m = MATERIALS[state.material];

    // 자석을 «치움»으로 두면 눈에 보이게 멀리 물러난다
    // (화면에는 가까이 있는데 반응이 없어 보이면 오개념이 생긴다)
    const away = state.applied ? 0 : 6.5;
    magnet.position.x = SAMPLE_X - state.dist - 3.4 - away;
    if (holders.magnet) holders.magnet.position.x = magnet.position.x;

    sampleBody.material.diffuseColor = B().Color3.FromHexString(m.color);
    if (placed.meter) drawResult();
    layoutDomains();
  }

  /** 자기 구역 화살표 방향 — 정렬도에 따라 */
  function layoutDomains() {
    const total = alignment + remanence;
    domains.forEach((g) => {
      // 정렬도가 1 이면 모두 +x, 0 이면 제멋대로, 음수면 −x 로 향한다
      const ordered = Math.min(1, Math.abs(total));
      const dirSign = total >= 0 ? 0 : Math.PI;
      const random = g._seed;
      g.rotation.y = dirSign * (1) + random * (1 - ordered);
      const c = 0.35 + ordered * 0.65;
      g._mat.emissiveColor = total >= 0
        ? new (B().Color3)(c, c * 0.62, 0.16)
        : new (B().Color3)(0.2, c * 0.7, c);
    });
  }

  /** 정렬이 서서히 따라가게 한다 */
  function tick(dt) {
    const target = targetAlign();
    const d = target - alignment;
    if (Math.abs(d) > 0.002) {
      alignment += d * Math.min(1, dt * 4);
      layoutDomains();
      return true;
    }
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.1;
    camera.beta = 1.02;
    camera.radius = 21;
    camera.setTarget(new (B().Vector3)(1.2, 1.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '물질의 종류를 바꿔 가며 자석을 가까이했을 때 <b>자기 구역</b>이 어떻게 정렬되는지 보세요.';
  const prepGuide = '점선으로 표시된 자리에 자석·시료·측정판을 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('물질의<br>종류', 'material', [
        { v: 'ferro', t: '강자성체 (철)' },
        { v: 'para', t: '상자성체 (알루미늄)' },
        { v: 'dia', t: '반자성체 (구리)' },
      ], state.material, 2)}
      ${LabUI.slider('dist', '자석까지<br>거리',
        { min: 0.5, max: 9, step: 0.25, value: state.dist, fmt: (v) => `${v.toFixed(2)} cm` })}
      <div class="control">
        <div class="clabel">자석</div>
        <button class="power${state.applied ? '' : ' off'}" id="applyBtn">${state.applied ? '가까이' : '치움'}</button>
      </div>
      <div class="control">
        <div class="clabel">시료<br>초기화</div>
        <button class="power off" id="demagBtn">↻ 자화 없애기</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'material', state, 'material', () => {
      alignment = 0; remanence = 0;
      onChange();
    }, String);
    LabUI.bindSlider(root, 'dist', state, 'dist', (v) => `${v.toFixed(2)} cm`, onChange);

    const ap = root.querySelector('#applyBtn');
    ap.addEventListener('click', () => {
      const m = MATERIALS[state.material];
      if (state.applied) {
        // 자석을 뗄 때 : 강자성체만 자화가 남는다.
        // 전체 정렬도(alignment + remanence)가 튀지 않도록 남길 몫만큼을 alignment 에서 덜어 낸다.
        const total = alignment + remanence;
        remanence = m.keeps ? total * 0.72 : 0;
        alignment = total - remanence;
      } else {
        // 다시 가까이 가져갈 때는 남은 자화를 alignment 로 되돌려 이어서 계산한다
        alignment += remanence;
        remanence = 0;
      }
      state.applied = !state.applied;
      ap.textContent = state.applied ? '가까이' : '치움';
      ap.classList.toggle('off', !state.applied);
      onChange();
    });

    root.querySelector('#demagBtn').addEventListener('click', () => {
      alignment = 0; remanence = 0;
      layoutDomains();
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const m = MATERIALS[state.material];
    const f = forceOnSample();
    const total = alignment + remanence;

    return `
      <div class="row"><span>물질</span><span class="tag ${m.tag}">${m.name}</span></div>
      <div class="row"><span>예</span><b style="font-size:12px">${m.ex}</b></div>
      <div class="row"><span>자석까지 거리</span><b>${state.dist.toFixed(2)} cm</b></div>
      <div class="row"><span>자석</span><b>${state.applied ? '가까이 둠' : '치움'}</b></div>

      <div class="sec">자기 구역</div>
      <div class="row"><span>정렬 방향</span>
        <b>${Math.abs(total) < 0.03 ? '제멋대로' : total > 0 ? '자기장과 같은 방향' : '자기장과 반대 방향'}</b></div>
      <div class="row"><span>정렬 정도</span>
        <b class="big">${(Math.abs(total) * 100).toFixed(0)} %</b></div>
      <div class="row"><span>남은 자화</span>
        <b>${remanence !== 0 ? `${(Math.abs(remanence) * 100).toFixed(0)} % (남음)` : '없음'}</b></div>

      <div class="sec">자기력</div>
      <div class="row"><span>받는 힘</span>
        <b style="color:${f > 0.005 ? '#2f9e6b' : f < -0.005 ? '#e0533f' : '#8e9bad'}">
        ${f > 0.005 ? '끌림 (인력)' : f < -0.005 ? '밀림 (척력)' : '거의 없음'}</b></div>
      <div class="formula">${m.keeps
        ? '자석을 떼어도 정렬이 남아 <b>영구 자석</b>이 됩니다.'
        : '자석을 떼면 열운동 때문에 곧 흐트러집니다.'}</div>`;
  }

  /* ══ 그래프 — 세 물질 비교 ══════════════════ */
  const graphTitle = '자기장 세기에 따른 자화';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 38, padR = 12, padT = 16, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const zeroY = padT + gh * 0.62;
    const xOf = (b) => padL + b * gw;
    const yOf = (mag) => zeroY - mag * (gh * 0.55);

    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + gw, zeroY); ctx.stroke();

    const lines = [
      ['ferro', '#e8663f', '강자성'],
      ['para', '#ffd84a', '상자성'],
      ['dia', '#5ad0f0', '반자성'],
    ];
    lines.forEach(([key, color, label], idx) => {
      const m = MATERIALS[key];
      ctx.strokeStyle = color;
      ctx.lineWidth = key === state.material ? 2.6 : 1.2;
      ctx.globalAlpha = key === state.material ? 1 : 0.42;
      ctx.beginPath();
      for (let px = 0; px <= gw; px++) {
        const b = px / gw;
        // 강자성은 곧 포화된다
        const val = key === 'ferro'
          ? m.align * (1 - Math.exp(-b * 5))
          : m.align * b;
        const y = yOf(val);
        px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(label, padL + 5 + idx * 52, padT + 1);
    });

    // 현재 지점
    const bNow = fieldStrength();
    const total = alignment + remanence;
    ctx.fillStyle = '#4ad8a0';
    ctx.beginPath(); ctx.arc(xOf(bNow), yOf(total), 4.5, 0, 7); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+', padL - 3, yOf(0.8));
    ctx.fillText('0', padL - 3, zeroY);
    ctx.fillText('−', padL - 3, yOf(-0.35));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('자기장 세기 →', W - 4, padT + gh + 4);
    ctx.textAlign = 'left';
    ctx.fillText('자화', padL + 3, padT + gh + 4);
  }

  function graphFootHTML() {
    const m = MATERIALS[state.material];
    return state.material === 'ferro'
      ? `강자성체는 <b>강하게 끌리고</b>, 자석을 떼어도 자화가 남아 <b>영구 자석</b>이 됩니다`
      : state.material === 'para'
        ? `상자성체는 <b>약하게 끌리고</b>, 자석을 떼면 정렬이 곧 흐트러집니다`
        : `반자성체는 자기장과 <b>반대로</b> 자화되어 오히려 <b>살짝 밀려납니다</b>`;
  }

  /* ══ 기록표 (교과서 93쪽 표) ════════════════ */
  const recordColumns = ['물질', '자석을 가까이 할 때', '자석을 치웠을 때', '정렬 정도 (%)'];

  function recordRow() {
    const m = MATERIALS[state.material];
    const f = forceOnSample();
    return [
      `${m.name} (${m.ex.split('·')[0]})`,
      f > 0.005 ? '끌린다' : f < -0.005 ? '밀린다' : '반응 없다',
      m.keeps ? '자석이 된다 (자화 남음)' : '원래대로 돌아간다',
      ((Math.abs(alignment + remanence)) * 100).toFixed(0),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 강자성체 끌림 · 1 상자성체 · 2 반자성체 밀림 · 3 자석을 치운 뒤 잔류 자기
     4 세 물질 모두 기록                                                   */
  const mis = { seen: {}, ferroApplied: false, remain: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.applied) {
      mis.seen[state.material] = true;
      if (state.material === 'ferro') mis.ferroApplied = true;
    } else if (mis.ferroApplied && state.material === 'ferro') {
      mis.remain = true;
    }
    if (i === 0) return !!mis.seen.ferro;
    if (i === 1) return !!mis.seen.para;
    if (i === 2) return !!mis.seen.dia;
    if (i === 3) return mis.remain;
    if (i === 4) return new Set(recs().map((r) => String(r[0]))).size >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'magnetism',
    title: '여러 가지 물질의 자성 알아보기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, forceOnSample, targetAlign,
    get alignment() { return alignment + remanence; },
    settle() { alignment = targetAlign(); layoutDomains(); },
    get scene() { return scene; },
  };
})();
