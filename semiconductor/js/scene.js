/**
 * 반도체를 모형으로 나타내기
 * 비상교육 고등 물리학 III-2-02 (교과서 154~159쪽), 해 보기 156쪽
 *
 * 교과서의 «원형 자석 모형» 을 그대로 옮겼다.
 * 원자가 전자가 4 개인 규소로 결정을 만들고, 일부를 3 개(붕소)나 5 개(인)로
 * 바꾸면 짝을 못 이룬 전자(n형)나 비어 있는 자리(p형)가 생긴다.
 */
const SemiScene = (() => {
  const B = () => BABYLON;

  const NX = 4, NZ = 4;         // 결정 격자 크기
  const PITCH = 2.6;            // 원자 사이 간격
  const ATOM_Y = 1.0;

  let scene, camera;
  let lattice, atoms = [], bonds = [], carriers = [];
  let placed = {};

  const state = {
    doping: 'pure',     // pure | n | p
    temp: 300,          // K
    dopeCount: 2,       // 바꿔 넣은 원자 개수
    field: false,       // 전압을 걸었는가
  };

  // 물질별 띠 간격 (eV)
  const GAPS = { conductor: 0, semi: 1.12, insulator: 5.5 };

  const DOPANTS = {
    pure: { name: '순수 반도체 (진성)', atom: 'Si', valence: 4, color: '#8e9bad',
      carrier: '전자–양공 쌍', tag: 'mid' },
    n: { name: 'n형 반도체', atom: '인 (P)', valence: 5, color: '#4ad8a0',
      carrier: '남는 전자', tag: 'ok' },
    p: { name: 'p형 반도체', atom: '붕소 (B)', valence: 3, color: '#e8a14a',
      carrier: '양공 (빈자리)', tag: 'con' },
  };

  const tools = [
    { id: 'board', label: '자석 붙는 칠판', icon: 'screenBoard' },
    { id: 'si', label: '규소 원자 모형 (4)', icon: 'ball' },
    { id: 'dopant', label: '붕소·인 모형 (3·5)', icon: 'weight' },
  ];

  const slots = { board: { name: '칠판' }, si: { name: '규소 원자' }, dopant: { name: '불순물 원자' } };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 열에너지로 전도띠에 올라간 전자의 상대적인 수 (볼츠만 인자) */
  function thermalCarriers() {
    const kT = 8.617e-5 * state.temp;      // eV
    return Math.exp(-GAPS.semi / (2 * kT));
  }

  /** 도핑으로 생긴 운반자 수 (상댓값) */
  function dopedCarriers() {
    if (state.doping === 'pure') return 0;
    return state.dopeCount * 0.25;
  }

  /** 전기 전도도 (상댓값) */
  function conductivity() {
    return thermalCarriers() * 1e6 + dopedCarriers() * 100;
  }

  /** 값이 아주 작아도 «0» 으로 보이지 않게 적는다 */
  function fmtSigma(v) {
    if (v >= 10) return v.toFixed(0);
    if (v >= 0.1) return v.toFixed(2);
    return v.toExponential(1);
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#182230ff');

    camera = new (B().ArcRotateCamera)(
      'camSm', -Math.PI / 2, 0.72, 18, new (B().Vector3)(0, 1.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 9;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.46;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hsm', new (B().Vector3)(0, 1, -0.3), scene);
    hemi.intensity = 0.86;
    hemi.groundColor = new (B().Color3)(0.24, 0.28, 0.34);

    const glow = new (B().GlowLayer)('glowSm', scene);
    glow.intensity = 0.6;

    buildBoard();
    buildLattice();
    buildCarriers();
    buildPlaceholders();

    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('scBase', { width: 26, height: 18 }, scene);
    __base.position.y = -0.7;
    const __bm = new (B().StandardMaterial)('scBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#141a24');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/semiconductor.jpg', { x: -8, y: 0, z: 6, ry: 0.3 });

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

  /** 자석이 붙는 칠판 */
  function buildBoard() {
    const b = B().MeshBuilder.CreateGround('smBoard',
      { width: (NX + 1) * PITCH, height: (NZ + 1) * PITCH }, scene);
    b.position.y = 0;
    b.material = mat('smBoardMat', '#2b3a34', '#4a5a52', 48);
    b._isBoard = true;
    boardMesh = b;
  }
  let boardMesh;

  /** 규소 결정 격자 */
  function buildLattice() {
    lattice = new (B().TransformNode)('smLattice', scene);

    for (let i = 0; i < NX; i++) {
      for (let k = 0; k < NZ; k++) {
        const g = new (B().TransformNode)(`atom${i}_${k}`, scene);
        const core = B().MeshBuilder.CreateSphere(`core${i}_${k}`, { diameter: 1.5, segments: 16 }, scene);
        core.material = mat(`coreM${i}_${k}`, '#8e9bad', '#e4eaf2', 64);
        core.parent = g;

        // 원자 이름표
        const lab = B().MeshBuilder.CreatePlane(`lab${i}_${k}`, { width: 1.1, height: 1.1 }, scene);
        lab.position.y = 0.78;
        lab.rotation.x = Math.PI / 2;
        const tex = new (B().DynamicTexture)(`labT${i}_${k}`, { width: 96, height: 96 }, scene, true);
        const lm = new (B().StandardMaterial)(`labM${i}_${k}`, scene);
        lm.diffuseTexture = tex; lm.opacityTexture = tex;
        lm.emissiveColor = new (B().Color3)(1, 1, 1);
        lm.specularColor = new (B().Color3)(0, 0, 0);
        lm.backFaceCulling = false;
        lab.material = lm;
        lab.parent = g;

        // 원자가 전자 (최대 5 개, 원자 둘레에 배치)
        const els = [];
        for (let e = 0; e < 5; e++) {
          const s = B().MeshBuilder.CreateSphere(`ve${i}_${k}_${e}`, { diameter: 0.42, segments: 8 }, scene);
          const a = (e / 4) * Math.PI * 2;
          s.position.set(Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05);
          const em = new (B().StandardMaterial)(`veM${i}_${k}_${e}`, scene);
          em.emissiveColor = B().Color3.FromHexString('#5ad0f0');
          em.disableLighting = true;
          s.material = em;
          s.parent = g;
          els.push(s);
        }

        g.position.set(
          (i - (NX - 1) / 2) * PITCH,
          ATOM_Y,
          (k - (NZ - 1) / 2) * PITCH,
        );
        g._core = core;
        g._tex = tex;
        g._els = els;
        g._i = i; g._k = k;
        g.parent = lattice;
        atoms.push(g);
      }
    }

    // 공유 결합 선
    const lines = [];
    atoms.forEach((a) => {
      atoms.forEach((b2) => {
        if (b2._i === a._i + 1 && b2._k === a._k) lines.push([a.position.clone(), b2.position.clone()]);
        if (b2._k === a._k + 1 && b2._i === a._i) lines.push([a.position.clone(), b2.position.clone()]);
      });
    });
    const bondSys = B().MeshBuilder.CreateLineSystem('smBonds', { lines }, scene);
    bondSys.color = B().Color3.FromHexString('#5ad0f0');
    bondSys.alpha = 0.4;
    bondSys.isPickable = false;
    bondSys.parent = lattice;
    bonds.push(bondSys);
  }

  function drawAtomLabel(g, text, color) {
    const ctx = g._tex.getContext();
    ctx.clearRect(0, 0, 96, 96);
    ctx.fillStyle = color;
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 48, 50);
    g._tex.update();
  }

  /** 자유 전자와 양공 */
  function buildCarriers() {
    for (let i = 0; i < 10; i++) {
      const c = B().MeshBuilder.CreateSphere('carrier' + i, { diameter: 0.52, segments: 10 }, scene);
      const cm = new (B().StandardMaterial)('carrierM' + i, scene);
      cm.emissiveColor = B().Color3.FromHexString('#5ad0f0');
      cm.disableLighting = true;
      c.material = cm;
      c.isPickable = false;
      c._mat = cm;
      c._x = (Math.random() - 0.5) * NX * PITCH;
      c._z = (Math.random() - 0.5) * NZ * PITCH;
      c._vx = (Math.random() - 0.5) * 2;
      c._vz = (Math.random() - 0.5) * 2;
      carriers.push(c);
    }
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      board: { w: (NX + 1) * PITCH, h: (NZ + 1) * PITCH, y: 0.06, label: '칠판' },
      si: { w: NX * PITCH, h: NZ * PITCH, y: 0.1, label: '규소 원자' },
      dopant: { w: NX * PITCH * 0.6, h: NZ * PITCH * 0.4, y: 0.14, label: '불순물 원자' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(0, c.y, 0);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 256, height: 200 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 200);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(7, 7, 242, 186);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 128, 100);
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
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    boardMesh.setEnabled(!!placed.board);
    lattice.setEnabled(!!placed.si);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const halfX = (NX + 1) * PITCH / 2, halfZ = (NZ + 1) * PITCH / 2;
    return (Math.abs(point.x) <= halfX && Math.abs(point.z) <= halfZ) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  /** 어느 자리를 불순물로 바꿀지 — 가운데 쪽부터 고른다 */
  function dopedIndices() {
    if (state.doping === 'pure' || !placed.dopant) return [];
    const order = [5, 10, 6, 9, 1, 14];
    return order.slice(0, state.dopeCount);
  }

  function update() {
    if (!scene) return;
    const d = DOPANTS[state.doping];
    const doped = dopedIndices();

    atoms.forEach((g, idx) => {
      const isDoped = doped.includes(idx);
      const valence = isDoped ? d.valence : 4;
      const label = isDoped ? d.atom.replace(/\s*\(.*\)/, '') : 'Si';
      const color = isDoped ? d.color : '#8e9bad';

      g._core.material.diffuseColor = B().Color3.FromHexString(color);
      drawAtomLabel(g, label === '인' ? 'P' : label === '붕소' ? 'B' : 'Si',
        isDoped ? '#0f141b' : '#ffffff');

      // 원자가 전자 개수만큼만 보인다
      g._els.forEach((s, e) => {
        s.setEnabled(e < valence);
        // 5 번째 전자(남는 전자)는 초록으로, 부족한 자리는 표시하지 않는다
        s.material.emissiveColor = (isDoped && state.doping === 'n' && e === 4)
          ? B().Color3.FromHexString('#4ad8a0')
          : B().Color3.FromHexString('#5ad0f0');
      });
    });

    // 자유 운반자 개수
    const n = placed.si
      ? Math.min(carriers.length,
        Math.round(thermalCarriers() * 4e5 + dopedCarriers() * 6))
      : 0;
    carriers.forEach((c, i) => {
      c.setEnabled(i < n);
      // n형은 전자(파랑), p형은 양공(주황)
      c._mat.emissiveColor = B().Color3.FromHexString(
        state.doping === 'p' ? '#e8a14a' : '#5ad0f0');
    });
  }

  /** 자유 운반자가 떠다니는 애니메이션 */
  function tick(dt) {
    const halfX = NX * PITCH / 2, halfZ = NZ * PITCH / 2;
    // 전압을 걸면 한 방향으로 흐른다
    const drift = state.field ? (state.doping === 'p' ? -3.2 : 3.2) : 0;
    carriers.forEach((c) => {
      if (!c.isEnabled()) return;
      c._x += (c._vx + drift) * dt;
      c._z += c._vz * dt;
      if (c._x > halfX) c._x = -halfX;
      if (c._x < -halfX) c._x = halfX;
      if (Math.abs(c._z) > halfZ) c._vz *= -1;
      c.position.set(c._x, ATOM_Y + 1.4, c._z);
    });
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.72;
    camera.radius = 18;
    camera.setTarget(new (B().Vector3)(0, 1.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '규소 원자를 <b>원자가 전자 3 개(붕소)</b> 나 <b>5 개(인)</b> 로 바꿔 보세요. 짝을 못 이룬 전자와 빈자리가 어떤 역할을 할까요?';
  const prepGuide = '점선으로 표시된 자리에 칠판·규소 원자·불순물 원자를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('반도체의<br>종류', 'doping', [
        { v: 'pure', t: '순수 (Si 4개)' },
        { v: 'n', t: 'n형 (인 5개)' },
        { v: 'p', t: 'p형 (붕소 3개)' },
      ], state.doping, 2)}
      ${LabUI.opts('바꿔 넣은<br>원자 수', 'dopecount', [
        { v: 1, t: '1 개' }, { v: 2, t: '2 개' }, { v: 4, t: '4 개' }, { v: 6, t: '6 개' },
      ], state.dopeCount, 2)}
      ${LabUI.slider('temp', '온도<br><i>T</i>',
        { min: 100, max: 800, step: 10, value: state.temp, fmt: (v) => `${v} K` })}
      <div class="control">
        <div class="clabel">전압<br>걸기</div>
        <button class="power${state.field ? '' : ' off'}" id="fieldBtn">${state.field ? 'ON' : 'OFF'}</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'doping', state, 'doping', onChange, String);
    LabUI.bindOpts(root, 'dopecount', state, 'dopeCount', onChange);
    LabUI.bindSlider(root, 'temp', state, 'temp', (v) => `${v} K`, onChange);

    const f = root.querySelector('#fieldBtn');
    f.addEventListener('click', () => {
      state.field = !state.field;
      f.textContent = state.field ? 'ON' : 'OFF';
      f.classList.toggle('off', !state.field);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const d = DOPANTS[state.doping];
    const kT = 8.617e-5 * state.temp;
    const sigma = conductivity();

    return `
      <div class="row"><span>반도체</span><span class="tag ${d.tag}">${d.name}</span></div>
      <div class="row"><span>바탕 원자</span><b>규소 Si (원자가 4)</b></div>
      ${state.doping !== 'pure' ? `
        <div class="row"><span>넣은 원자</span><b>${d.atom} (원자가 ${d.valence})</b></div>
        <div class="row"><span>바꾼 개수</span><b>${state.dopeCount} 개</b></div>` : ''}

      <div class="sec">에너지띠</div>
      <div class="row"><span>띠 간격 <i>E</i><sub>g</sub></span><b>${GAPS.semi} eV</b></div>
      <div class="row"><span>열에너지 <i>kT</i></span><b>${(kT * 1000).toFixed(1)} meV</b></div>
      <div class="row"><span>온도</span><b>${state.temp} K</b></div>

      <div class="sec">전하 운반자</div>
      <div class="row"><span>주된 운반자</span><b>${d.carrier}</b></div>
      <div class="row"><span>운반자 종류</span>
        <b style="color:${state.doping === 'p' ? '#d8802f' : '#2f8fbf'}">${
          state.doping === 'p' ? '양공 (+)' : '전자 (−)'}</b></div>
      <div class="row"><span>상대 전도도</span><b class="big">${fmtSigma(sigma)}</b></div>
      <div class="row"><span>도핑으로 늘어난 배</span>
        <b>${state.doping === 'pure' ? '—'
          : `약 ${(sigma / Math.max(1e-12, thermalCarriers() * 1e6)).toExponential(0)} 배`}</b></div>
      <div class="formula">순수 반도체는 온도가 오르면 전도도가 <b>커집니다</b>
        (금속과 반대)</div>
      <div class="formula" style="color:#62718a">${
        state.doping === 'n' ? '5 번째 전자는 결합에 쓰이지 못하고 <b>자유롭게 돌아다닙니다.</b>'
        : state.doping === 'p' ? '전자가 하나 모자라 <b>빈자리(양공)</b> 가 생기고, 옆 전자가 채우며 이동합니다.'
        : '열에너지로 결합이 끊길 때만 <b>전자–양공 쌍</b> 이 생깁니다.'}</div>`;
  }

  /* ══ 그래프 — 에너지띠 구조 ═════════════════ */
  const graphTitle = '에너지띠 구조 비교';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const items = [
      { key: 'conductor', name: '도체', gap: 0, note: '띠가 겹침' },
      { key: 'semi', name: '반도체', gap: GAPS.semi, note: `${GAPS.semi} eV` },
      { key: 'insulator', name: '절연체', gap: GAPS.insulator, note: `${GAPS.insulator} eV` },
    ];

    const padT = 26, padB = 30;
    const gh = H - padT - padB;
    const colW = (W - 40) / 3;
    const maxGap = 6;

    items.forEach((it, i) => {
      const x = 20 + i * colW + 12;
      const w = colW - 24;
      const highlight = it.key === 'semi';

      // 원자가 띠 (아래) — 전자로 꽉 차 있다
      const gapPx = (it.gap / maxGap) * gh * 0.6;
      const bandH = (gh - gapPx) / 2;
      const valTop = padT + gh - bandH;

      ctx.globalAlpha = highlight ? 1 : 0.5;
      ctx.fillStyle = '#2f6ad0';
      ctx.fillRect(x, valTop, w, bandH);
      ctx.fillStyle = '#8fb0e0';
      ctx.font = 'bold 10px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (bandH > 16) ctx.fillText('원자가 띠', x + w / 2, valTop + bandH / 2);

      // 전도띠 (위) — 비어 있다
      ctx.fillStyle = '#5b6675';
      ctx.fillRect(x, padT, w, bandH);
      ctx.fillStyle = '#cfd8e4';
      if (bandH > 16) ctx.fillText('전도띠', x + w / 2, padT + bandH / 2);

      // 띠 간격
      if (gapPx > 2) {
        ctx.strokeStyle = highlight ? '#ffd84a' : '#5b667588';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, padT + bandH); ctx.lineTo(x + w / 2, valTop);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = highlight ? '#ffd84a' : '#8e9bad';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(it.note, x + w / 2, padT + bandH + gapPx / 2);
      } else {
        ctx.fillStyle = '#4ad8a0';
        ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
        ctx.fillText(it.note, x + w / 2, padT + bandH + 4);
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = highlight ? '#ffd84a' : '#9fb0c2';
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(it.name, x + w / 2, padT + gh + 6);
    });

    // 반도체 칸에 도핑 준위와 올라간 전자를 표시
    const x = 20 + colW + 12, w = colW - 24;
    const gapPx = (GAPS.semi / maxGap) * gh * 0.6;
    const bandH = (gh - gapPx) / 2;
    const condBot = padT + bandH, valTop = padT + gh - bandH;

    // 준위 선은 칸의 왼쪽 절반에만 긋고 이름표를 그 끝에 붙여
    // 가운데의 띠 간격 숫자(1.12 eV)와 겹치지 않게 한다
    if (state.doping === 'n') {
      const y = condBot + gapPx * 0.2;
      ctx.strokeStyle = '#4ad8a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w * 0.42, y); ctx.stroke();
      ctx.fillStyle = '#4ad8a0';
      ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('주개 준위', x + 6, y - 3);
    } else if (state.doping === 'p') {
      const y = valTop - gapPx * 0.2;
      ctx.strokeStyle = '#e8a14a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w * 0.42, y); ctx.stroke();
      ctx.fillStyle = '#e8a14a';
      ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('받개 준위', x + 6, y + 3);
    }

    // 온도가 높으면 전도띠에 전자가 보인다
    const nUp = Math.min(6, Math.round(thermalCarriers() * 3e5));
    ctx.fillStyle = '#5ad0f0';
    for (let i = 0; i < nUp; i++) {
      ctx.beginPath();
      ctx.arc(x + 14 + (i * (w - 28)) / 5, condBot - 7, 2.8, 0, 7);
      ctx.fill();
    }

    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('띠 간격이 좁을수록 전자가 전도띠로 잘 올라간다', W / 2, 5);
  }

  function graphFootHTML() {
    const d = DOPANTS[state.doping];
    return state.doping === 'pure'
      ? `순수 반도체는 <b>온도가 오를수록</b> 전자가 전도띠로 올라가 전도도가 커집니다`
      : state.doping === 'n'
        ? `인의 5 번째 전자가 <b>전도띠 바로 아래(주개 준위)</b> 에 놓여 쉽게 자유 전자가 됩니다`
        : `붕소는 전자가 하나 부족해 <b>원자가 띠 바로 위(받개 준위)</b> 에 양공을 만듭니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '종류', '넣은 원자', '원자가 전자', '주된 운반자', '온도 (K)', '상대 전도도',
  ];

  function recordRow() {
    const d = DOPANTS[state.doping];
    return [
      d.name,
      state.doping === 'pure' ? '없음' : `${d.atom} × ${state.dopeCount}`,
      state.doping === 'pure' ? '4' : String(d.valence),
      d.carrier, String(state.temp), fmtSigma(conductivity()),
    ];
  }

  return {
    id: 'semiconductor',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '반도체를 모형으로 나타내기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, conductivity, thermalCarriers,
    get scene() { return scene; },
  };
})();
