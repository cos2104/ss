/**
 * 별빛 수사대 — 스펙트럼으로 원소 찾기 (④ 문제해결형)
 * 비상교육 고등 전자기와 양자 III-05 (교과서 110~115쪽)
 *
 * 핵융합 모드 — 110~111쪽: p-p 연쇄 3단계와 질량 결손 E = mc².
 * 수사 모드  — 해 보기 114쪽: 별의 흡수 스펙트럼과 원소의 방출선을 대조하여
 *             별 대기의 구성 원소를 알아맞힌다.
 */
const StarlightScene = (() => {
  const B = () => BABYLON;

  // 원소별 방출선 (nm)
  const ELEMENTS = {
    H:  { name: '수소',   lines: [656.3, 486.1, 434.0, 410.2], hex: '#e8577a' },
    He: { name: '헬륨',   lines: [667.8, 587.6, 501.6, 447.1], hex: '#f0a53c' },
    Na: { name: '나트륨', lines: [589.0, 589.6],               hex: '#ffd84a' },
    Ca: { name: '칼슘',   lines: [422.7, 396.8, 393.4],        hex: '#69d98c' },
    Hg: { name: '수은',   lines: [579.1, 546.1, 435.8, 404.7], hex: '#b78af0' },
  };
  const KEYS = Object.keys(ELEMENTS);

  // 질량 (u)
  const M_P = 1.0073, M_N = 1.0087, M_HE = 4.0015;
  const U_MEV = 931.5;

  let scene, camera;
  let star, prism, screenP, screenTex, fusionPlane, fusionTex;
  let placed = {};

  const state = {
    mode: 'detective',    // 'fusion' | 'detective'
    fusionStep: 1,        // 1~3
    picked: { H: 0, He: 0, Na: 0, Ca: 0, Hg: 0 },
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'starT', label: '별 (광원)', icon: 'ball' },
    { id: 'slitT', label: '슬릿', icon: 'screenBoard' },
    { id: 'prismT', label: '프리즘 (분광기)', icon: 'lensConvex' },
    { id: 'chartT', label: '원소 스펙트럼 표', icon: 'ruler' },
  ];
  const slots = {
    starT: { name: '왼쪽 위 (별)' },
    slitT: { name: '가운데 (슬릿)' },
    prismT: { name: '가운데 (프리즘)' },
    chartT: { name: '앞쪽 (스펙트럼 표)' },
  };

  /* ══ 문제 생성 ═══════════════════════════════ */
  function newCase() {
    // 수소는 항상 + 나머지에서 1~3개 무작위
    const others = KEYS.slice(1).filter(() => Math.random() < 0.5);
    if (others.length === 0) others.push(KEYS[1 + Math.floor(Math.random() * 4)]);
    return ['H', ...others];
  }

  /** 파장 → 무지개 색 */
  function waveHex(nm) {
    let r = 0, g = 0, b2 = 0;
    if (nm < 440) { r = (440 - nm) / 60; b2 = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b2 = 1; }
    else if (nm < 510) { g = 1; b2 = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
    else { r = 1; }
    return [r * 255, g * 255, b2 * 255];
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0a0e1aff');

    camera = new (B().ArcRotateCamera)(
      'camSl', -Math.PI / 2 + 0.3, 1.2, 17, new (B().Vector3)(0, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hsl', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.7;
    hemi.groundColor = new (B().Color3)(0.25, 0.27, 0.35);
    const glow = new (B().GlowLayer)('slGlow', scene);
    glow.intensity = 0.7;

    // 밤하늘 별 — 항상 보이는 기본 배경
    for (let bi = 0; bi < 70; bi++) {
      const s = B().MeshBuilder.CreateSphere('slBgStar' + bi, { diameter: 0.06 + Math.random() * 0.07 }, scene);
      const th = Math.random() * Math.PI * 2, rr = 26 + Math.random() * 14;
      s.position.set(Math.cos(th) * rr, 2 + Math.random() * 16, Math.sin(th) * rr);
      s.material = emat('slBgStarM' + bi, '#cdd8ea', 0.75);
      s.isPickable = false;
    }

    buildOptics();
    buildFusion();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/starlight.jpg', { x: -10, y: 0, z: 7, ry: 0.35 });

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

  function buildOptics() {
    star = B().MeshBuilder.CreateSphere('slStar', { diameter: 2.2 }, scene);
    star.position.set(-6, 5, 0);
    star.material = emat('slStarM', '#fff2c0');

    prism = B().MeshBuilder.CreateCylinder('slPrism', {
      height: 1.6, diameter: 1.8, tessellation: 3,
    }, scene);
    prism.rotation.x = Math.PI / 2;
    prism.rotation.y = 0.4;
    prism.position.set(-0.5, 3.2, 0);
    const pm = new (B().StandardMaterial)('slPrismM', scene);
    pm.diffuseColor = B().Color3.FromHexString('#bcd8f0');
    pm.alpha = 0.45;
    pm.specularColor = B().Color3.FromHexString('#ffffff');
    pm.specularPower = 128;
    prism.material = pm;

    // 입사 빔
    const beam = B().MeshBuilder.CreateCylinder('slBeam', { height: 5.6, diameter: 0.16 }, scene);
    beam.position.set(-3.4, 4.1, 0);
    beam.rotation.z = Math.PI / 2 + 0.32;
    beam.material = emat('slBeamM', '#fff2c0', 0.85);

    // 스펙트럼 화면
    screenP = B().MeshBuilder.CreatePlane('slScreen', { width: 8.5, height: 4.6 }, scene);
    screenP.position.set(3.6, 2.6, 0.4);
    screenP.rotation.y = -0.25;
    screenTex = new (B().DynamicTexture)('slScreenTex', { width: 900, height: 480 }, scene, true);
    const m = new (B().StandardMaterial)('slScreenM', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screenP.material = m;
  }

  const NM0 = 380, NM1 = 700;
  const xNm = (nm, X0, X1) => X0 + ((nm - NM0) / (NM1 - NM0)) * (X1 - X0);

  /** 별 스펙트럼 + 후보 원소 방출선을 그린다 (해 보기 114쪽 (가)(나)) */
  function drawSpectrum() {
    const ctx = screenTex.getContext();
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, 900, 480);
    const X0 = 60, X1 = 860;
    // (가) 별의 흡수 스펙트럼: 무지개 + 검은 선
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`(가) 별 ${sim.caseNo}호의 흡수 스펙트럼`, X0, 12);
    for (let x = X0; x <= X1; x++) {
      const nm = NM0 + ((x - X0) / (X1 - X0)) * (NM1 - NM0);
      const [r, g, b2] = waveHex(nm);
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b2 | 0})`;
      ctx.fillRect(x, 48, 1, 110);
    }
    // 흡수선
    sim.answer.forEach((k) => {
      ELEMENTS[k].lines.forEach((nm) => {
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(xNm(nm, X0, X1) - 2, 48, 4, 110);
      });
    });
    // (나) 고른 원소들의 방출선
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText('(나) 내가 고른 원소의 방출선 (겹쳐 보기)', X0, 180);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(X0, 216, X1 - X0, 110);
    KEYS.forEach((k) => {
      if (!state.picked[k]) return;
      ELEMENTS[k].lines.forEach((nm) => {
        const [r, g, b2] = waveHex(nm);
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b2 | 0})`;
        ctx.fillRect(xNm(nm, X0, X1) - 2, 216, 4, 110);
      });
    });
    // 파장 눈금
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    for (let nm = 400; nm <= 700; nm += 50) {
      ctx.fillText(String(nm), xNm(nm, X0, X1), 340);
    }
    ctx.fillText('파장 (nm)', (X0 + X1) / 2, 372);
    // 판정 표시
    if (sim.judged) {
      ctx.font = 'bold 40px "Noto Sans KR", sans-serif';
      ctx.fillStyle = sim.correct ? '#69d98c' : '#e8577a';
      ctx.fillText(sim.correct ? '🎯 정답! 흡수선이 모두 설명됩니다'
        : '❌ 다시 — 남거나 빠진 선이 있어요', 450, 412);
    }
    screenTex.update();
  }

  const props = {};

  /** 준비 단계용 소품 — 슬릿 판 */
  function buildProps() {
    const g = new (B().TransformNode)('slPropSlit', scene);
    const plate = B().MeshBuilder.CreateBox('slPropSP', { width: 1.4, height: 1.8, depth: 0.12 }, scene);
    plate.position.y = 1.2;
    plate.material = mat('slPropSPM', '#39424f', '#8e9bad', 64);
    plate.parent = g;
    // 가운데 좁은 틈
    const slit = B().MeshBuilder.CreatePlane('slPropSS', { width: 0.08, height: 1.4 }, scene);
    slit.position.set(0, 1.2, -0.07);
    slit.material = emat('slPropSSM', '#fff2c0');
    slit.parent = g;
    const foot = B().MeshBuilder.CreateBox('slPropSF', { width: 1.0, height: 0.14, depth: 0.7 }, scene);
    foot.position.y = 0.07;
    foot.material = mat('slPropSFM', '#2b3441');
    foot.parent = g;
    g.position.set(-3, 0, -3);
    g.setEnabled(false);
    props.slitT = g;
  }

  function buildFusion() {
    fusionPlane = B().MeshBuilder.CreatePlane('slFusion', { width: 11, height: 6.6 }, scene);
    fusionPlane.position.set(0, 3.4, 0.5);
    fusionTex = new (B().DynamicTexture)('slFusionTex', { width: 1100, height: 660 }, scene, true);
    const m = new (B().StandardMaterial)('slFusionM', scene);
    m.diffuseTexture = fusionTex;
    m.emissiveTexture = fusionTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    fusionPlane.material = m;
  }

  function drawFusion() {
    const ctx = fusionTex.getContext();
    ctx.fillStyle = '#1c2436';
    ctx.fillRect(0, 0, 1100, 660);
    const ball = (x, y, r, hex, label) => {
      ctx.fillStyle = hex;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (label) {
        ctx.fillStyle = '#0f141b';
        ctx.font = `bold ${r}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + 1);
      }
    };
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 32px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const titles = {
      1: '1단계 — 양성자 2개 → 중수소 (+ 양전자, 중성미자)',
      2: '2단계 — 중수소 + 양성자 → 헬륨3',
      3: '3단계 — 헬륨3 두 개 → 헬륨4 + 양성자 2개',
    };
    ctx.fillText(titles[state.fusionStep], 550, 20);
    const Y = 340;
    if (state.fusionStep === 1) {
      ball(240, Y, 46, '#e8577a', 'p'); ball(360, Y, 46, '#e8577a', 'p');
      ctx.fillStyle = '#9fb0c2'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('→', 500, Y - 34);
      ball(650, Y - 26, 46, '#e8577a', 'p'); ball(650, Y + 40, 46, '#8a93a6', 'n');
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('중수소 ²H + e⁺ + ν', 650, Y + 110);
      ctx.fillStyle = '#9fb0c2';
      ctx.fillText('터널 효과로 반발 장벽을 뚫고 융합!', 550, 560);
    } else if (state.fusionStep === 2) {
      ball(200, Y - 26, 42, '#e8577a', 'p'); ball(200, Y + 34, 42, '#8a93a6', 'n');
      ball(360, Y, 42, '#e8577a', 'p');
      ctx.fillStyle = '#9fb0c2'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('→', 500, Y - 34);
      ball(650, Y - 30, 42, '#e8577a', 'p'); ball(700, Y + 16, 42, '#e8577a', 'p');
      ball(628, Y + 30, 42, '#8a93a6', 'n');
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('헬륨3 ³He + 감마선', 660, Y + 110);
    } else {
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ball(180, Y - 40, 36, '#e8577a', ''); ball(220, Y - 6, 36, '#e8577a', ''); ball(158, Y + 4, 36, '#8a93a6', '');
      ball(180, Y + 120, 36, '#e8577a', ''); ball(220, Y + 154, 36, '#e8577a', ''); ball(158, Y + 164, 36, '#8a93a6', '');
      ctx.fillStyle = '#9fb0c2'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('→', 420, Y);
      ball(620, Y, 44, '#e8577a', ''); ball(676, Y, 44, '#e8577a', '');
      ball(620, Y + 56, 44, '#8a93a6', ''); ball(676, Y + 56, 44, '#8a93a6', '');
      ball(880, Y - 20, 38, '#e8577a', 'p'); ball(960, Y + 30, 38, '#e8577a', 'p');
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('헬륨4 ⁴He', 648, Y + 140);
      ctx.fillStyle = '#9fb0c2';
      ctx.fillText('전체: 수소 원자핵 4개 → 헬륨 원자핵 1개', 550, 560);
    }
    fusionTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      starT: { x: -6, z: 0, w: 3.4, h: 2.8, label: '별 (광원)' },
      slitT: { x: -3, z: -3, w: 3, h: 2.4, label: '슬릿' },
      prismT: { x: 0, z: 0, w: 3, h: 2.6, label: '프리즘' },
      chartT: { x: 4, z: -3, w: 3.6, h: 2.6, label: '스펙트럼 표' },
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
  let caseCounter = 0;

  function reset() {
    state.running = false;
    caseCounter += 1;
    sim = {
      caseNo: caseCounter,
      answer: newCase(),
      judged: false, correct: false,
    };
    KEYS.forEach((k) => { state.picked[k] = 0; });
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const det = state.mode === 'detective';
    const beam = scene.getMeshByName('slBeam');

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      star.setEnabled(!!placed.starT);
      if (beam) beam.setEnabled(!!placed.starT && !!placed.prismT);
      prism.setEnabled(!!placed.prismT);
      screenP.setEnabled(!!placed.chartT);
      if (placed.chartT) drawSpectrum();
      fusionPlane.setEnabled(false);
      if (props.slitT) props.slitT.setEnabled(!!placed.slitT);
      return;
    }
    if (props.slitT) props.slitT.setEnabled(det);

    star.setEnabled(det);
    prism.setEnabled(det);
    screenP.setEnabled(det);
    if (beam) beam.setEnabled(det);
    fusionPlane.setEnabled(!det);
    if (det) drawSpectrum();
    else drawFusion();
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    // 별 반짝임
    if (state.mode === 'detective') {
      const k = 0.9 + 0.1 * Math.sin(Date.now() / 300);
      star.material.emissiveColor = new (B().Color3)(k, k * 0.95, k * 0.75);
    }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.3;
    camera.beta = 1.2;
    camera.radius = 17;
    camera.setTarget(new (B().Vector3)(0, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '별 스펙트럼의 검은 흡수선과 원소의 방출선 위치를 대조하세요. 흡수선을 전부 설명하는 원소 조합이 정답입니다!';
  const prepGuide = '점선 자리에 별·슬릿·프리즘·스펙트럼 표를 끌어다 놓아 관측을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'detective', t: '🔍 원소 수사 (114쪽)' }, { v: 'fusion', t: '☀️ 핵융합 (110쪽)' },
    ], state.mode, 1);

    if (state.mode === 'detective') {
      const elemBtns = KEYS.map((k) =>
        `<button class="opt${state.picked[k] ? ' on' : ''}" data-elem="${k}">${ELEMENTS[k].name}</button>`
      ).join('');
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">대기 원소<br>고르기</div>
          <div class="cbody"><div class="opt-grid">${elemBtns}</div></div>
        </div>
        <div class="control">
          <div class="clabel">판정</div>
          <button class="power" id="judgeBtn">🎯 판정</button>
        </div>
        <div class="control">
          <div class="clabel">새 별<br>관측</div>
          <button class="power off" id="resetBtn">🔭 다음 별</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('핵융합 단계', 'fusionStep', [
        { v: 1, t: '1단계' }, { v: 2, t: '2단계' }, { v: 3, t: '3단계' },
      ], state.fusionStep, 1)}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.getAttribute('data-mode');
      layout();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'detective') {
      root.querySelectorAll('[data-elem]').forEach((b) => b.addEventListener('click', () => {
        const k = b.getAttribute('data-elem');
        state.picked[k] = state.picked[k] ? 0 : 1;
        b.classList.toggle('on', !!state.picked[k]);
        sim.judged = false;
        layout();
        onChange();
      }));
      root.querySelector('#judgeBtn').addEventListener('click', () => {
        const chosen = KEYS.filter((k) => state.picked[k]);
        sim.judged = true;
        sim.correct = chosen.length === sim.answer.length &&
          sim.answer.every((k) => chosen.includes(k));
        layout();
        onChange();
      });
    } else {
      LabUI.bindOpts(root, 'fusionStep', state, 'fusionStep', () => { layout(); onChange(); });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => {
      if (state.mode === 'detective') reset();
      else { state.fusionStep = 1; layout(); }
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'detective') {
      const chosen = KEYS.filter((k) => state.picked[k]).map((k) => ELEMENTS[k].name);
      return `
        <div class="row"><span>관측 중인 별</span><b>${sim.caseNo}호</b></div>
        <div class="row"><span>흡수선 개수</span>
          <b>${sim.answer.reduce((s, k) => s + ELEMENTS[k].lines.length, 0)}개</b></div>
        <div class="row"><span>내가 고른 원소</span>
          <b class="big">${chosen.length ? chosen.join(', ') : '— (아직)'}</b></div>
        ${sim.judged ? `
        <div class="row"><span>판정</span>
          <b class="big">${sim.correct ? '🎯 정답!' : '❌ 다시 시도'}</b></div>
        ${sim.correct ? `<div class="row"><span>별 ${sim.caseNo}호의 대기</span>
          <b>${sim.answer.map((k) => ELEMENTS[k].name).join(' + ')}</b></div>` : ''}` : ''}
        <div class="formula">별 내부의 연속광이 <b>대기를 지나며</b> 특정 파장이 흡수되어
          검은 선이 생깁니다. 각 원소의 흡수 파장 = 방출 파장이므로,
          방출선 표와 맞춰 보면 대기의 원소를 알 수 있습니다 (그림 III-22).
          이렇게 우주의 수소:헬륨 질량비가 3:1임을 알아내 빅뱅 우주론의 증거가 되었습니다 (114쪽).</div>`;
    }
    // 핵융합: 질량 결손
    const m4p = 4 * M_P;
    const dm = 2 * M_P + 2 * M_N - M_HE;
    const E = dm * U_MEV;
    return `
      <div class="row"><span>양성자 2개 + 중성자 2개</span>
        <b>${(2 * M_P + 2 * M_N).toFixed(4)} u</b></div>
      <div class="row"><span>헬륨 원자핵 ⁴He</span><b>${M_HE.toFixed(4)} u</b></div>
      <div class="row"><span>질량 결손 Δm</span><b class="big">${dm.toFixed(4)} u</b></div>
      <div class="row"><span>방출 에너지 <i>E</i> = Δ<i>mc</i>²</span>
        <b class="big">${E.toFixed(1)} MeV</b></div>
      <div class="row"><span>질량의 몇 %가 에너지로?</span>
        <b>${(100 * dm / (2 * M_P + 2 * M_N)).toFixed(2)} %</b></div>
      <div class="formula">헬륨 원자핵은 재료였던 입자들보다 <b>가볍습니다</b> (확인 05 — 작다!).
        줄어든 질량이 E = mc² 에 따라 에너지가 되어 태양이 빛납니다.
        1단계의 양성자 융합은 <b>터널 효과</b> 덕분에 가능합니다 (104쪽).</div>`;
  }

  /* ══ 그래프 — 원소 방출선 대조표 ═════════════ */
  const graphTitle = '원소별 방출선 대조표 (해 보기 114쪽 (나))';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 58, padR = 10, padT = 12, padB = 22;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const rowH = gh / KEYS.length;
    KEYS.forEach((k, i) => {
      const y = padT + i * rowH;
      ctx.fillStyle = state.picked[k] ? ELEMENTS[k].hex : '#62718a';
      ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(ELEMENTS[k].name, padL - 6, y + rowH / 2);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(padL, y + 3, gw, rowH - 6);
      ELEMENTS[k].lines.forEach((nm) => {
        const x = padL + ((nm - NM0) / (NM1 - NM0)) * gw;
        const [r, g, b2] = waveHex(nm);
        ctx.fillStyle = state.picked[k] ? `rgb(${r | 0},${g | 0},${b2 | 0})` : 'rgba(160,170,190,.5)';
        ctx.fillRect(x - 1.5, y + 3, 3, rowH - 6);
      });
    });
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let nm = 400; nm <= 700; nm += 100) {
      ctx.fillText(String(nm), padL + ((nm - NM0) / (NM1 - NM0)) * gw, padT + gh + 4);
    }
  }

  function graphFootHTML() {
    if (state.mode === 'detective') {
      return '별 스펙트럼의 <b>검은 선 위치</b>와 여기 방출선 위치가 겹치는 원소를 찾으세요';
    }
    return '태양은 매초 약 6억 톤의 수소를 헬륨으로 바꾸며 420만 톤의 질량을 에너지로 방출합니다';
  }

  /* ══ 기록표 (해 보기 114쪽) ══════════════════ */
  const recordColumns = [
    '별', '고른 원소', '판정', '실제 대기 구성',
  ];

  function recordRow() {
    if (state.mode !== 'detective' || !sim.judged) return null;
    return [[`${sim.caseNo}호`,
      KEYS.filter((k) => state.picked[k]).map((k) => ELEMENTS[k].name).join('+') || '—',
      sim.correct ? '🎯 정답' : '❌ 오답',
      sim.correct ? sim.answer.map((k) => ELEMENTS[k].name).join('+') : '(다시 도전)']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0~1 핵융합 단계 · 2 스펙트럼 판정 1회 · 3 사건 2건 해결 · 4 기록 2줄  */
  const mis = { fusion: 0, judged: 0, solved: 0, cases: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'fusion') mis.fusion = Math.max(mis.fusion, state.fusionStep);
    if (state.mode === 'detective' && sim && sim.judged) {
      mis.judged = 1;
      if (sim.correct) mis.cases[sim.caseNo] = true;
    }
    mis.solved = Object.keys(mis.cases).length;

    if (i === 0) return mis.fusion >= 2;
    if (i === 1) return mis.fusion >= 3;
    if (i === 2) return mis.judged >= 1;
    if (i === 3) return mis.solved >= 2;
    if (i === 4) return recs().length >= 2;
    return false;
  }

  return {
    missionDone,
    id: 'starlight',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '별빛 수사대 — 스펙트럼으로 원소 찾기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, ELEMENTS, KEYS,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
