/**
 * 수소의 선 스펙트럼 관찰하기
 * 비상교육 고등 물리학 III-2-01 (교과서 148~153쪽), 해 보기 148쪽
 *
 * 기체 방전관에 전압을 걸고 분광기로 방출 스펙트럼을 관찰한다.
 * 에너지 준위 그림에서 전자가 떨어지는 전이를 고르면
 * 그 빛이 스펙트럼의 어느 선인지 바로 이어져 보인다.
 */
const SpectrumScene = (() => {
  const B = () => BABYLON;

  const RY = 13.6;          // 리드베리 에너지 (eV)
  const HC = 1239.84;       // hc (eV·nm)

  let scene, camera;
  let tube, tubeMat, spectrumPlane, spectrumTex, levelPlane, levelTex, glowLamp;
  let placed = {};

  /* ── 화면에서 직접 만지는 것들 ─────────────────── */
  let canvasEl = null;      // 끌기 중 카메라를 잠글 때 쓴다
  let glowLayer = null;     // 이름표가 하얗게 번지지 않도록 제외시킨다
  let onChangeCb = null;    // 3D 에서 조작해도 측정값·그래프가 갱신되도록
  let stepVolt = null, voltTag = null, powerTag = null, gasTag = null;
  let powerSw = null;       // 손으로 누르는 전원 스위치
  let levelDrag = null;     // 준위 그림에서 끌어내리는 중

  const state = {
    gas: 'H',
    voltage: 0.7,     // 방전 전압 (0~1)
    nHigh: 3,         // 전이 시작 준위
    nLow: 2,          // 전이 끝 준위
    on: false,        // 처음에는 방전관이 꺼져 있다
  };

  // 기체별 방출선 (nm)
  const GASES = {
    H: { name: '수소 (H)', color: '#e86a8a',
      lines: [656.3, 486.1, 434.0, 410.2, 397.0] },
    He: { name: '헬륨 (He)', color: '#f0d070',
      lines: [667.8, 587.6, 501.6, 492.2, 471.3, 447.1, 402.6] },
    Ne: { name: '네온 (Ne)', color: '#ff7a4a',
      lines: [640.2, 638.3, 626.6, 616.4, 607.4, 585.2, 540.1] },
  };

  const tools = [
    { id: 'tube', label: '기체 방전관', icon: 'led' },
    { id: 'power', label: '전원 장치', icon: 'battery' },
    { id: 'spectro', label: '간이 분광기', icon: 'lensConvex' },
  ];

  const slots = {
    tube: { x: 0, name: '방전관' },
    power: { x: -7, name: '전원 장치' },
    spectro: { x: 7, name: '분광기' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 수소 원자의 n 번째 에너지 준위 (eV) */
  function levelE(n) { return -RY / (n * n); }

  /** n1 → n2 전이에서 방출되는 빛의 파장 (nm) */
  function transitionLambda(nHigh, nLow) {
    const dE = levelE(nHigh) - levelE(nLow);   // 양수
    return HC / dE;
  }

  function transitionE(nHigh, nLow) {
    return levelE(nHigh) - levelE(nLow);
  }

  /** 계열 이름 */
  function seriesName(nLow) {
    return nLow === 1 ? '라이먼 계열 (자외선)'
      : nLow === 2 ? '발머 계열 (가시광선)'
        : nLow === 3 ? '파셴 계열 (적외선)' : `n=${nLow} 계열`;
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0c1119ff');

    camera = new (B().ArcRotateCamera)(
      'camSp', -Math.PI / 2 - 0.06, 1.16, 24, new (B().Vector3)(0, 2.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 42;
    camera.upperBetaLimit = 1.48;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hsp', new (B().Vector3)(0, 1, -0.3), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new (B().Color3)(0.18, 0.2, 0.25);

    const glow = new (B().GlowLayer)('glowSp', scene);
    glow.intensity = 0.9;
    glowLayer = glow;
    canvasEl = canvas;

    buildTable();
    buildTube();
    buildPower();
    buildSpectrum();
    buildLevels();
    buildPlaceholders();
    buildHands();
    setupPointer(canvas);

    glow.addExcludedMesh(spectrumPlane);
    glow.addExcludedMesh(levelPlane);
    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/spectrum.jpg', { x: -11, y: 0, z: -3 });

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
    const t = B().MeshBuilder.CreateBox('spTable', { width: 28, height: 0.5, depth: 12 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('spTableMat', '#1e242e', '#3a4350', 72);
  }

  /** 기체 방전관 — 전압을 올리면 빛난다 */
  function buildTube() {
    tube = new (B().TransformNode)('spTube', scene);

    const glass = B().MeshBuilder.CreateCylinder('spTubeGlass',
      { height: 6.0, diameter: 1.1, tessellation: 24 }, scene);
    glass.position.set(0, 3.4, 0);
    tubeMat = new (B().StandardMaterial)('spTubeMat', scene);
    tubeMat.diffuseColor = B().Color3.FromHexString('#cfe0f2');
    tubeMat.emissiveColor = new (B().Color3)(0, 0, 0);
    tubeMat.specularColor = B().Color3.FromHexString('#ffffff');
    tubeMat.specularPower = 96;
    tubeMat.alpha = 0.55;
    tubeMat.backFaceCulling = false;
    glass.material = tubeMat;
    glass.parent = tube;

    // 전극
    [-1, 1].forEach((s, i) => {
      const cap = B().MeshBuilder.CreateCylinder('spCap' + i,
        { height: 0.7, diameter: 1.4, tessellation: 20 }, scene);
      cap.position.set(0, 3.4 + s * 3.0, 0);
      cap.material = mat('spCapMat' + i, '#39424f', '#8e9bad', 64);
      cap.parent = tube;
    });

    const stand = B().MeshBuilder.CreateBox('spStand', { width: 2.6, height: 0.5, depth: 2.2 }, scene);
    stand.position.set(0, 0.25, 0);
    stand.material = mat('spStandMat', '#2b323c');
    stand.parent = tube;

    // 방전관 주위의 빛무리
    glowLamp = B().MeshBuilder.CreateCylinder('spGlow',
      { height: 5.4, diameter: 2.2, tessellation: 20 }, scene);
    glowLamp.position.set(0, 3.4, 0);
    const gm = new (B().StandardMaterial)('spGlowMat', scene);
    gm.emissiveColor = B().Color3.FromHexString('#e86a8a');
    gm.disableLighting = true;
    gm.alpha = 0.12;
    gm.backFaceCulling = false;
    glowLamp.material = gm;
    glowLamp._mat = gm;
    glowLamp.parent = tube;
  }

  function buildPower() {
    const g = new (B().TransformNode)('spPower', scene);
    const box = B().MeshBuilder.CreateBox('spPowerBox', { width: 3.4, height: 2.4, depth: 2.2 }, scene);
    box.position.set(-7, 1.2, 0);
    box.material = mat('spPowerMat', '#39424f', '#8e9bad', 64);
    box.parent = g;

    const led = B().MeshBuilder.CreateSphere('spPowerLed', { diameter: 0.4 }, scene);
    led.position.set(-7, 2.1, -1.15);
    const lm = new (B().StandardMaterial)('spPowerLedMat', scene);
    lm.emissiveColor = B().Color3.FromHexString('#4ad8a0');
    lm.disableLighting = true;
    led.material = lm;
    led.parent = g;
    g._led = lm;

    // 손으로 누르는 전원 스위치 — 이름표에 가리지 않도록 윗면에 올린다
    const swBase = B().MeshBuilder.CreateBox('spSwitchBase', { width: 1.5, height: 0.14, depth: 1.2 }, scene);
    swBase.position.set(-7, 2.44, -0.45);
    swBase.material = mat('spSwitchBaseMat', '#20262f');
    swBase.parent = g;

    powerSw = B().MeshBuilder.CreateBox('spSwitch', { width: 1.1, height: 0.34, depth: 0.9 }, scene);
    powerSw.position.set(-7, 2.62, -0.45);
    powerSw.material = mat('spSwitchMat', '#c0392b', '#ffb0a0', 48);
    powerSw.parent = g;

    spPowerG = g;
  }
  let spPowerG;

  /** 분광기로 본 스펙트럼 */
  function buildSpectrum() {
    spectrumPlane = B().MeshBuilder.CreatePlane('spSpectrum', { width: 11, height: 2.6 }, scene);
    spectrumPlane.position.set(0, 8.0, 1.0);
    spectrumPlane.rotation.y = Math.PI;
    spectrumTex = new (B().DynamicTexture)('spSpecTex', { width: 880, height: 210 }, scene, true);
    const m = new (B().StandardMaterial)('spSpecMat', scene);
    m.diffuseTexture = spectrumTex;
    m.emissiveTexture = spectrumTex;
    m.opacityTexture = spectrumTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    spectrumPlane.material = m;
  }

  /** 파장 → 색 */
  function wavelengthRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 380) { r = 0.42; g = 0.16; b = 0.75; }
    else if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm <= 780) { r = 1; }
    else { r = 0.5; }
    return { r: Math.max(0, r), g: Math.max(0, g), b: Math.max(0, b) };
  }
  function rgbCss(nm, a = 1) {
    const c = wavelengthRGB(nm);
    return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  }

  const L_MIN = 380, L_MAX = 720;

  function drawSpectrum() {
    const ctx = spectrumTex.getContext();
    ctx.clearRect(0, 0, 880, 210);
    ctx.translate(880, 0); ctx.scale(-1, 1);

    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, 880, 210);

    const gas = GASES[state.gas];
    const bright = state.on ? state.voltage : 0;
    const xOf = (nm) => 20 + ((nm - L_MIN) / (L_MAX - L_MIN)) * 840;

    // 방출선
    if (bright > 0.05) {
      gas.lines.forEach((nm) => {
        if (nm < L_MIN || nm > L_MAX) return;
        const x = xOf(nm);
        const w = 7;
        const grad = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
        grad.addColorStop(0, rgbCss(nm, 0));
        grad.addColorStop(0.5, rgbCss(nm, bright));
        grad.addColorStop(1, rgbCss(nm, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x - 14, 20, 28, 120);
        ctx.fillStyle = rgbCss(nm, Math.min(1, bright * 1.3));
        ctx.fillRect(x - w / 2, 20, w, 120);
      });

      // 지금 고른 전이를 노란 테두리로 강조
      if (state.gas === 'H') {
        const sel = transitionLambda(state.nHigh, state.nLow);
        if (sel >= L_MIN && sel <= L_MAX) {
          ctx.strokeStyle = '#ffd84a';
          ctx.lineWidth = 3;
          ctx.strokeRect(xOf(sel) - 10, 16, 20, 128);
        }
      }
    }

    // 눈금
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, 148); ctx.lineTo(860, 148); ctx.stroke();
    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let nm = 400; nm <= 700; nm += 50) {
      const x = xOf(nm);
      ctx.beginPath(); ctx.moveTo(x, 148); ctx.lineTo(x, 160); ctx.stroke();
      ctx.fillText(String(nm), x, 164);
    }
    ctx.textAlign = 'right';
    ctx.fillText('nm', 866, 164);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    spectrumTex.update();
  }

  /* ── 에너지 준위 그림의 자리 ──────────────────
     오른쪽 «준위 선»은 −13.6/n² 에 비례한 실제 높이라 위로 갈수록 촘촘해진다.
     그래서 손으로 누를 자리는 왼쪽에 고르게 벌린 «이름표(칩)»로 따로 둔다.   */
  const LV_X = 7.6, LV_Y = 3.02, LV_Z = -5.6; // 실험대 앞쪽에 세워 둔 준위 판
  const LV_PW = 6.3, LV_PH = 5.76;            // 판의 크기 (월드)
  const LV_W = 420, LV_H = 384;               // 텍스처 크기 (월드 1 단위 = 66.7 px)
  const LV_PPU = LV_W / LV_PW;
  const LV_TOP = 52, LV_BOT = 316;            // n=∞ · n=1 준위 선의 세로 자리
  const LINE_X0 = 192, LINE_X1 = 372;         // 준위 선의 좌우 끝
  const CHIP_X0 = 14, CHIP_X1 = 168, CHIP_H = 32;
  const CHIP_TOP = 62, CHIP_GAP = 44;         // 맨 위가 n=6, 아래로 한 칸씩
  const ARROW_X = 250;                        // 전이 화살표가 놓이는 자리

  /** n 준위 선의 세로 자리 — 에너지에 비례 (n=1 이 맨 아래) */
  function levelY(n) { return LV_TOP + (levelE(n) / -RY) * (LV_BOT - LV_TOP); }
  /** n 이름표(칩)의 세로 자리 — 손으로 누르기 쉽게 고르게 벌린다 */
  function chipY(n) { return CHIP_TOP + (6 - n) * CHIP_GAP; }

  /** 에너지 준위 그림 */
  function buildLevels() {
    levelPlane = B().MeshBuilder.CreatePlane('spLevels', { width: LV_PW, height: LV_PH }, scene);
    levelPlane.position.set(LV_X, LV_Y, LV_Z);
    levelPlane.rotation.y = Math.PI;
    levelTex = new (B().DynamicTexture)('spLevelTex', { width: LV_W, height: LV_H }, scene, true);
    const m = new (B().StandardMaterial)('spLevelMat', scene);
    m.diffuseTexture = levelTex;
    m.emissiveTexture = levelTex;
    m.opacityTexture = levelTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    levelPlane.material = m;

    // 실험대에 세워 둔 게시판처럼 보이도록 받침을 둔다.
    // 판(z = LV_Z)보다 «뒤»에 두어야 판 아래쪽의 테두리와 안내 글을 가리지 않는다.
    levelStand = B().MeshBuilder.CreateBox('spLevelStand',
      { width: LV_PW * 0.62, height: 0.28, depth: 0.8 }, scene);
    levelStand.position.set(LV_X, 0.14, LV_Z + 0.5);
    levelStand.material = mat('spLevelStandMat', '#2b323c', '#6b7686', 48);
  }
  let levelStand;

  /** 준위 이름표 — 여기를 눌러 전이를 고른다 */
  function drawChip(ctx, n, isH, isL) {
    const cy = chipY(n), w = CHIP_X1 - CHIP_X0, ty = cy - CHIP_H / 2;
    ctx.fillStyle = isH ? '#6b4e0c' : isL ? '#173a63' : '#1b2432';
    ctx.fillRect(CHIP_X0, ty, w, CHIP_H);
    ctx.strokeStyle = isH ? '#ffd84a' : isL ? '#5aa9ff' : '#3c4756';
    ctx.lineWidth = (isH || isL) ? 2.6 : 1.4;
    ctx.strokeRect(CHIP_X0, ty, w, CHIP_H);

    ctx.fillStyle = (isH || isL) ? '#ffffff' : '#cfe0f2';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`n=${n}`, CHIP_X0 + 11, cy + 1);
    ctx.fillStyle = (isH || isL) ? '#e8eef6' : '#9fb0c2';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${levelE(n).toFixed(2)} eV`, CHIP_X1 - 11, cy + 1);
  }

  function drawLevels() {
    const ctx = levelTex.getContext();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, LV_W, LV_H);
    ctx.translate(LV_W, 0); ctx.scale(-1, 1);   // 판을 돌려 쓰므로 좌우를 뒤집어 그린다
    ctx.fillStyle = '#0b1018ee';
    ctx.fillRect(0, 0, LV_W, LV_H);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, LV_W - 6, LV_H - 6);

    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('수소 원자의 에너지 준위', LV_W / 2, 9);

    // n = ∞ — 전자가 아주 멀어진 상태 (0 eV)
    ctx.strokeStyle = '#8e9bad'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(LINE_X0, LV_TOP); ctx.lineTo(LINE_X1, LV_TOP); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('n=∞ · 0 eV', LINE_X1, LV_TOP - 5);

    // 준위 선 · 이름표 · 둘을 이어 주는 점선
    for (let n = 6; n >= 1; n--) {
      const ly = levelY(n), cy = chipY(n);
      const isH = n === state.nHigh, isL = n === state.nLow;

      ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(CHIP_X1, cy); ctx.lineTo(LINE_X0, ly); ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = isH ? '#ffd84a' : isL ? '#5aa9ff' : '#5b6675';
      ctx.lineWidth = (isH || isL) ? 3.4 : 2;
      ctx.beginPath(); ctx.moveTo(LINE_X0, ly); ctx.lineTo(LINE_X1, ly); ctx.stroke();

      drawChip(ctx, n, isH, isL);
    }

    // 고른 전이 화살표 — 전자가 아래 준위로 떨어지는 길
    const yH = levelY(state.nHigh), yL = levelY(state.nLow);
    const nm = transitionLambda(state.nHigh, state.nLow);
    const col = rgbCss(nm, 1);
    const head = Math.max(5, Math.min(11, (yL - yH) * 0.7));
    ctx.strokeStyle = col; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(ARROW_X, yH); ctx.lineTo(ARROW_X, yL); ctx.stroke();
    ctx.lineWidth = 2.6;                       // 짧은 화살표도 보이도록 양 끝에 턱을 둔다
    ctx.beginPath(); ctx.moveTo(ARROW_X - 9, yH); ctx.lineTo(ARROW_X + 9, yH); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ARROW_X, yL); ctx.lineTo(ARROW_X - 7, yL - head); ctx.lineTo(ARROW_X + 7, yL - head);
    ctx.closePath(); ctx.fill();

    // 파장 이름표 — n=2 와 n=1 사이의 빈 자리에 놓아 선과 겹치지 않게 한다
    const label = `λ = ${nm.toFixed(1)} nm`;
    ctx.font = 'bold 15px sans-serif';
    const bw = ctx.measureText(label).width + 22, bx = 330 - bw / 2;
    ctx.fillStyle = '#0b1018f4';
    ctx.fillRect(bx, 239, bw, 26);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.strokeRect(bx, 239, bw, 26);
    ctx.fillStyle = '#e8eef6';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 330, 253);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8eef6';
    ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
    ctx.fillText(`n=${state.nHigh} → n=${state.nLow} · ${seriesName(state.nLow)}`, LV_W / 2, 328);
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.fillStyle = state.gas === 'H' ? '#8e9bad' : '#e8a94a';
    ctx.fillText(state.gas === 'H'
      ? '노랑 = 시작 준위 · 파랑 = 도착 준위'
      : `지금 방전관은 ${GASES[state.gas].name} — 이 그림은 수소 기준입니다`, LV_W / 2, 348);
    ctx.fillStyle = '#8e9bad';
    ctx.font = '11px "Noto Sans KR", sans-serif';
    ctx.fillText('준위를 누르거나 위에서 아래로 끌어내리세요', LV_W / 2, 366);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    levelTex.update();
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 전원 장치의 빨간 스위치를 눌러 방전관을 켜고 끈다
     · 스위치 앞의 ＋ / － 로 방전 전압을 5 %씩 맞춘다
     · 기체 방전관을 누르면 다른 기체 방전관으로 갈아 끼운다
     · 에너지 준위 그림에서 준위를 누르거나 위에서 아래로 끌어내려 전이를 고른다  */

  /** 글씨를 그려 넣은 판 — 이름표 겸 3D 단추로 쓴다 */
  function makePlate(name, w, h) {
    const W = Math.round(w * 110), H = Math.round(h * 110);
    const pl = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    pl.rotation.y = Math.PI;              // 다른 판들과 같이 카메라 쪽을 보게
    const tex = new (B().DynamicTexture)(name + 'T', { width: W, height: H }, scene, true);
    tex.hasAlpha = true;
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex; m.emissiveTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    pl.material = m;
    pl._tex = tex; pl._w = W; pl._h = H;
    if (glowLayer && glowLayer.addExcludedMesh) glowLayer.addExcludedMesh(pl);
    return pl;
  }

  /** 판에 글씨를 다시 그린다 — 내용이 그대로면 다시 그리지 않는다 */
  function paintPlate(pl, text, on, hex) {
    if (!pl || !pl._tex) return;
    const key = `${text}|${on ? 1 : 0}|${hex || ''}`;
    if (pl._last === key) return;
    pl._last = key;
    const W = pl._w, H = pl._h;
    const ctx = pl._tex.getContext();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W, 0); ctx.scale(-1, 1);   // 판을 돌려 쓰므로 좌우를 뒤집어 그린다
    ctx.fillStyle = on ? (hex || '#2f6ad0') : '#1b2432';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = on ? '#ffffff' : '#7a8aa0';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    let fs = Math.round(H * 0.46);
    const font = (s) => `bold ${s}px "Noto Sans KR", sans-serif`;
    ctx.font = font(fs);
    while (fs > 11 && ctx.measureText(text).width > W - 26) { fs -= 2; ctx.font = font(fs); }
    ctx.fillStyle = on ? '#ffffff' : '#c8d4e4';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    pl._tex.update();
  }

  /** 손으로 만지는 것들을 만든다 (자리는 layoutHands 에서 잡는다) */
  function buildHands() {
    stepVolt = LabUI.makeStepper(scene, 'Volt');
    voltTag = makePlate('spVoltTag', 2.9, 0.66);
    powerTag = makePlate('spPowerTag', 3.2, 0.62);
    gasTag = makePlate('spGasTag', 3.8, 0.74);
  }

  /** 단추·이름표의 자리와 표시를 다시 잡는다 (update 에서 매번 부른다) */
  function layoutHands() {
    const pw = allPlaced() && !!placed.power;
    if (stepVolt) { stepVolt.place(-7, 1.35, -3.2, 1.0); stepVolt.setEnabled(pw); }
    if (voltTag) {
      voltTag.position.set(-7, 2.40, -3.2);
      voltTag.setEnabled(pw);
      paintPlate(voltTag, `방전 전압 ${(state.voltage * 100).toFixed(0)} %`, true, '#b8791c');
    }
    if (powerTag) {
      powerTag.position.set(-7, 0.35, -3.2);
      powerTag.setEnabled(pw);
      paintPlate(powerTag, state.on ? '전원 ON — 누르면 끔' : '전원 OFF — 누르면 켬',
        !!state.on, '#2f8f6a');
    }
    if (powerSw) powerSw.rotation.x = state.on ? -0.30 : 0.30;   // 켜면 앞쪽이 눌린다

    const tb = allPlaced() && !!placed.tube;
    if (gasTag) {
      gasTag.position.set(0, 0.62, -2.6);
      gasTag.setEnabled(tb);
      paintPlate(gasTag, `${GASES[state.gas].name} — 누르면 교체`, true, GASES[state.gas].color);
    }
  }

  /** 3D 에서 값을 바꾼 뒤 — 측정값·그래프와 아래 조작 막대를 함께 맞춘다 */
  function applyChange() {
    if (onChangeCb) onChangeCb();   // 껍데기가 update() 까지 불러 준다
    else update();
    syncPanel();
  }

  /** 아래 조작 막대를 3D 에서 바꾼 값에 맞춘다 */
  function syncPanel() {
    const sl = document.querySelector('#voltage');
    const out = document.querySelector('#voltageOut');
    if (sl) sl.value = state.voltage;
    if (out) out.textContent = `${(state.voltage * 100).toFixed(0)} %`;
    document.querySelectorAll('[data-gas]').forEach((b) =>
      b.classList.toggle('on', b.getAttribute('data-gas') === state.gas));
    document.querySelectorAll('[data-nhigh]').forEach((b) =>
      b.classList.toggle('on', +b.getAttribute('data-nhigh') === state.nHigh));
    document.querySelectorAll('[data-nlow]').forEach((b) =>
      b.classList.toggle('on', +b.getAttribute('data-nlow') === state.nLow));
    const btn = document.querySelector('#onBtn');
    if (btn) {
      btn.textContent = state.on ? 'ON' : 'OFF';
      btn.classList.toggle('off', !state.on);
    }
  }

  function hint(t) {
    if (typeof Lab !== 'undefined' && Lab.showHint) Lab.showHint(t);
  }

  /** 방전관을 켜고 끈다 */
  function togglePower() { state.on = !state.on; applyChange(); }

  /** 방전 전압을 5 %씩 바꾼다 (아래 슬라이더와 같은 범위) */
  function bumpVolt(d) {
    const v = Math.max(0.1, Math.min(1.0, +(state.voltage + d * 0.05).toFixed(2)));
    if (Math.abs(v - state.voltage) < 1e-9) return;
    state.voltage = v;
    applyChange();
  }

  /** 다음 기체 방전관으로 갈아 끼운다 */
  const GAS_ORDER = ['H', 'He', 'Ne'];
  function nextGas() {
    state.gas = GAS_ORDER[(GAS_ORDER.indexOf(state.gas) + 1) % GAS_ORDER.length];
    applyChange();
  }

  /** 두 준위로 전이를 정한다 — 위쪽이 시작, 아래쪽이 도착 */
  function setTransition(a, b) {
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (hi === lo) return;
    if (hi < 3) { hint('시작 준위는 n=3 부터 고를 수 있습니다.'); return; }
    if (lo > 3) { hint('도착 준위는 n=3 까지 고를 수 있습니다.'); return; }
    const nh = Math.max(3, Math.min(6, hi));
    const nl = Math.max(1, Math.min(3, lo));
    if (nh <= nl) return;
    if (nh === state.nHigh && nl === state.nLow) return;
    state.nHigh = nh; state.nLow = nl;
    applyChange();
  }

  /** 준위를 한 번 눌렀을 때 — 위쪽은 시작 준위로, 아래쪽은 도착 준위로 삼는다 */
  function clickLevel(n) {
    if (n >= 4) setTransition(n, state.nLow);
    else if (n <= 2) setTransition(state.nHigh, n);
    else setTransition(state.nHigh > 3 ? state.nHigh : 4, 3);
  }

  /** 화면 위 한 점을 주어진 평면 위의 세계 좌표로 바꾼다 */
  function planePoint(origin, normal) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(origin, normal);
    const d = ray.intersectsPlane(plane);
    if (d === null || d < 0) return null;   // 옆에서 보아 면과 나란하면 무시한다
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 손끝이 가리키는 준위 (1~6) — 준위 그림 밖이면 null
      왼쪽 이름표 칸은 고르게 벌려 두었고, 오른쪽 준위 선은 −13.6/n² 자리에 있어
      세로 자리가 서로 다르다. 누른 쪽에 맞는 자를 써야 눌린 준위가 어긋나지 않는다. */
  function levelAtPointer() {
    const pt = planePoint(new (B().Vector3)(0, 0, LV_Z), new (B().Vector3)(0, 0, 1));
    if (!pt) return null;
    const cx = (pt.x - (LV_X - LV_PW / 2)) * LV_PPU;          // 그림을 그린 좌표와 같은 자리
    const cy = ((LV_Y + LV_PH / 2) - pt.y) * LV_PPU;
    if (cx < 0 || cx > LV_W) return null;
    if (cy < CHIP_TOP - 28 || cy > chipY(1) + 40) return null;   // 제목·아래 안내 글은 뺀다
    if (cx > (CHIP_X1 + LINE_X0) / 2) {          // 오른쪽 — 준위 «선» 의 실제 높이로 고른다
      let best = 1, bd = Infinity;
      for (let n = 1; n <= 6; n++) {
        const d = Math.abs(cy - levelY(n));
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    }
    const k = Math.round((cy - CHIP_TOP) / CHIP_GAP);          // 왼쪽 — 이름표 칸
    return 6 - Math.max(0, Math.min(5, k));
  }

  /** 끌던 것을 놓아 준다 — 카메라 조작이 잠긴 채 남지 않게 한다.
      끌던 손을 놓았을 때·«실험 다시하기» 를 눌렀을 때 모두 여기를 지난다. */
  function releaseDrag() {
    const d = levelDrag;
    levelDrag = null;
    if (d && camera) camera.attachControl(canvasEl, true);
    return d;
  }

  function setupPointer(canvas) {
    canvasEl = canvasEl || canvas;
    // 캔버스 밖에서 손을 놓아도 카메라가 잠긴 채 남지 않게 한다
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pointerup', releaseDrag);
      window.addEventListener('pointercancel', releaseDrag);
    }
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const mesh = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = mesh ? mesh.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;          // 준비물을 다 놓기 전에는 만지지 못한다
        // ── 방전 전압 ＋ · －
        if (nm === 'btnAddVolt') { bumpVolt(+1); return; }
        if (nm === 'btnSubVolt') { bumpVolt(-1); return; }
        // ── 전원 스위치를 눌러 켜고 끄기
        if (nm.indexOf('spSwitch') === 0 || nm === 'spPowerTag'
            || nm === 'spPowerBox' || nm === 'spPowerLed') { togglePower(); return; }
        // ── 방전관을 눌러 다른 기체로 갈아 끼우기
        if (nm.indexOf('spTube') === 0 || nm.indexOf('spCap') === 0
            || nm === 'spGlow' || nm === 'spGasTag') { nextGas(); return; }
        // ── 준위 그림에서 전이 고르기 (누르기 · 끌어내리기)
        if (nm === 'spLevels') {
          const n = levelAtPointer();
          if (n === null) return;
          levelDrag = { from: n, cur: n, moved: false };
          camera.detachControl();
        }
        return;
      }

      if (pi.type === T.POINTERMOVE && levelDrag) {
        const n = levelAtPointer();
        if (n === null || n === levelDrag.cur) return;
        levelDrag.cur = n;
        levelDrag.moved = true;
        setTransition(levelDrag.from, n);
        return;
      }

      if (pi.type === T.POINTERUP && levelDrag) {
        const d = releaseDrag();
        if (d && !d.moved) clickLevel(d.from);   // 끌지 않고 눌렀으면 그 준위 하나만 바꾼다
      }
    });
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      tube: { x: 0, y: 3.4, w: 3.0, h: 7.0 },
      power: { x: -7, y: 1.2, w: 4.0, h: 3.0 },
      spectro: { x: 7, y: 2.4, w: 4.0, h: 3.4 },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 0.9);
      p.rotation.y = Math.PI;
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, slots[id].name, { mirror: true, color: '#5aa9ff' });
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
    releaseDrag();   // 끌던 도중 «실험 다시하기» 를 눌러도 카메라가 잠긴 채 남지 않게
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    tube.setEnabled(!!placed.tube);
    spPowerG.setEnabled(!!placed.power);
    spectrumPlane.setEnabled(!!placed.spectro && !!placed.tube);
    levelPlane.setEnabled(!!placed.spectro);
    levelStand.setEnabled(!!placed.spectro);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    return Math.abs(point.x - slots[id].x) <= 3.4 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const gas = GASES[state.gas];
    const lit = state.on && placed.power ? state.voltage : 0;

    const c = B().Color3.FromHexString(gas.color);
    tubeMat.emissiveColor = new (B().Color3)(c.r * lit, c.g * lit, c.b * lit);
    glowLamp._mat.emissiveColor = c;
    glowLamp._mat.alpha = lit * 0.2;
    glowLamp.setEnabled(lit > 0.02);
    if (spPowerG._led) {
      spPowerG._led.emissiveColor = state.on
        ? B().Color3.FromHexString('#4ad8a0') : new (B().Color3)(0.1, 0.1, 0.1);
    }

    if (placed.spectro && placed.tube) drawSpectrum();
    if (placed.spectro) drawLevels();
    layoutHands();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.06;
    camera.beta = 1.16;
    camera.radius = 24;
    camera.setTarget(new (B().Vector3)(0, 2.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '방전관에 전압을 걸고 분광기로 스펙트럼을 보세요. 전이(<i>n</i>)를 바꾸면 어느 선인지 이어져 보입니다.';
  const prepGuide = '점선으로 표시된 자리에 방전관·전원 장치·분광기를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          전원 장치의 <b>빨간 스위치를 눌러</b> 방전관을 켜고 끄고,
          그 앞의 <b>＋ · －</b> 로 방전 전압을 5 %씩 맞춥니다.
          <b>방전관을 누르면</b> 다른 기체 방전관으로 갈아 끼워집니다.
          오른쪽 <b>에너지 준위 그림에서 준위를 누르거나</b>,
          위 준위에서 아래 준위로 <b>끌어내리면</b> 전이가 정해집니다.
        </p></div>
      </div>
      ${LabUI.opts('기체의<br>종류', 'gas', [
        { v: 'H', t: '수소' }, { v: 'He', t: '헬륨' }, { v: 'Ne', t: '네온' },
      ], state.gas, 1)}
      ${LabUI.slider('voltage', '방전<br>전압',
        { min: 0.1, max: 1.0, step: 0.05, value: state.voltage, fmt: (v) => `${(v * 100).toFixed(0)} %` })}
      ${LabUI.opts('전이 시작<br><i>n</i> (위)', 'nhigh', [
        { v: 3, t: 'n=3' }, { v: 4, t: 'n=4' }, { v: 5, t: 'n=5' }, { v: 6, t: 'n=6' },
      ], state.nHigh, 2)}
      ${LabUI.opts('전이 끝<br><i>n</i> (아래)', 'nlow', [
        { v: 1, t: 'n=1 라이먼' }, { v: 2, t: 'n=2 발머' }, { v: 3, t: 'n=3 파셴' },
      ], state.nLow, 2)}
      <div class="control">
        <div class="clabel">전원</div>
        <button class="power${state.on ? '' : ' off'}" id="onBtn">${state.on ? 'ON' : 'OFF'}</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;          // 3D 에서 직접 조작해도 측정값이 갱신되도록
    LabUI.bindOpts(root, 'gas', state, 'gas', onChange, String);
    LabUI.bindSlider(root, 'voltage', state, 'voltage', (v) => `${(v * 100).toFixed(0)} %`, onChange);

    const fix = () => {
      // 시작 준위가 끝 준위보다 높아야 방출이 일어난다
      if (state.nHigh <= state.nLow) {
        state.nHigh = state.nLow + 1;
        root.querySelectorAll('[data-nhigh]').forEach((o) =>
          o.classList.toggle('on', +o.dataset.nhigh === state.nHigh));
      }
    };
    LabUI.bindOpts(root, 'nhigh', state, 'nHigh', () => { fix(); onChange(); });
    LabUI.bindOpts(root, 'nlow', state, 'nLow', () => { fix(); onChange(); });

    const on = root.querySelector('#onBtn');
    on.addEventListener('click', () => {
      state.on = !state.on;
      on.textContent = state.on ? 'ON' : 'OFF';
      on.classList.toggle('off', !state.on);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const gas = GASES[state.gas];
    const nm = transitionLambda(state.nHigh, state.nLow);
    const dE = transitionE(state.nHigh, state.nLow);
    const visible = nm >= 380 && nm <= 780;

    const rows = state.gas === 'H'
      ? `<div class="sec">고른 전이</div>
         <div class="row"><span>전이</span><b><i>n</i>=${state.nHigh} → <i>n</i>=${state.nLow}</b></div>
         <div class="row"><span>계열</span><b style="font-size:12px">${seriesName(state.nLow)}</b></div>
         <div class="row"><span><i>E</i><sub>${state.nHigh}</sub></span><b>${levelE(state.nHigh).toFixed(2)} eV</b></div>
         <div class="row"><span><i>E</i><sub>${state.nLow}</sub></span><b>${levelE(state.nLow).toFixed(2)} eV</b></div>
         <div class="row"><span>방출 에너지 Δ<i>E</i></span><b>${dE.toFixed(2)} eV</b></div>
         <div class="row"><span>빛의 파장 <i>λ</i></span><b class="big">${nm.toFixed(1)} nm</b></div>
         <div class="row"><span>보이는 색</span>
           <b>${visible ? colorName(nm) : nm < 380 ? '자외선 (안 보임)' : '적외선 (안 보임)'}</b></div>`
      : `<div class="sec">방출선</div>
         <div class="row"><span>주요 선 개수</span><b>${gas.lines.length} 개</b></div>
         <div class="row"><span>가장 밝은 선</span><b>${gas.lines[0].toFixed(1)} nm</b></div>`;

    return `
      <div class="row"><span>기체</span><b>${gas.name}</b></div>
      <div class="row"><span>방전 전압</span><b>${(state.voltage * 100).toFixed(0)} %</b></div>
      <div class="row"><span>스펙트럼</span><span class="tag ok">선 스펙트럼</span></div>
      ${rows}
      <div class="formula"><i>E</i><sub>n</sub> = −13.6 / <i>n</i><sup>2</sup> eV</div>
      <div class="formula"><i>λ</i> = <i>hc</i> / Δ<i>E</i></div>
      <div class="formula" style="color:#62718a">
        원소마다 준위가 달라 <b>선의 위치가 고유</b>합니다. 이것으로 성분을 알아냅니다.</div>`;
  }

  function colorName(nm) {
    if (nm < 425) return '보라';
    if (nm < 450) return '남색';
    if (nm < 495) return '파랑';
    if (nm < 570) return '초록';
    if (nm < 590) return '노랑';
    if (nm < 620) return '주황';
    return '빨강';
  }

  /* ══ 그래프 — 스펙트럼 띠 ═══════════════════ */
  const graphTitle = '방출 스펙트럼';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, W, H);

    const gas = GASES[state.gas];
    const padL = 26, padR = 14;
    const gw = W - padL - padR;
    const bandTop = 22, bandH = Math.round(H * 0.42);
    const xOf = (nm) => padL + ((nm - L_MIN) / (L_MAX - L_MIN)) * gw;
    const bright = state.on ? state.voltage : 0;

    // 위 — 연속 스펙트럼(비교용)
    for (let px = 0; px <= gw; px++) {
      const nm = L_MIN + (px / gw) * (L_MAX - L_MIN);
      ctx.fillStyle = rgbCss(nm, 0.26);
      ctx.fillRect(padL + px, bandTop, 1, 14);
    }
    ctx.fillStyle = '#62718a';
    ctx.font = '9px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('연속 스펙트럼 (햇빛)', padL, bandTop - 3);

    // 아래 — 선 스펙트럼
    const lineTop = bandTop + 26;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(padL, lineTop, gw, bandH);
    if (bright > 0.05) {
      gas.lines.forEach((nm) => {
        if (nm < L_MIN || nm > L_MAX) return;
        const x = xOf(nm);
        const grad = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
        grad.addColorStop(0, rgbCss(nm, 0));
        grad.addColorStop(0.5, rgbCss(nm, bright * 0.85));
        grad.addColorStop(1, rgbCss(nm, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x - 9, lineTop, 18, bandH);
        ctx.fillStyle = rgbCss(nm, Math.min(1, bright * 1.25));
        ctx.fillRect(x - 1.6, lineTop, 3.2, bandH);
      });
      if (state.gas === 'H') {
        const sel = transitionLambda(state.nHigh, state.nLow);
        if (sel >= L_MIN && sel <= L_MAX) {
          ctx.strokeStyle = '#ffd84a';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(xOf(sel) - 6, lineTop - 2, 12, bandH + 4);
          ctx.fillStyle = '#ffd84a';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${sel.toFixed(0)}`, xOf(sel), lineTop - 4);
        }
      }
    }
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${gas.name} 선 스펙트럼`, padL, lineTop + bandH + 4);

    // 눈금
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 1;
    const axY = lineTop + bandH;
    ctx.beginPath(); ctx.moveTo(padL, axY); ctx.lineTo(padL + gw, axY); ctx.stroke();
    ctx.fillStyle = '#62718a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let nm = 400; nm <= 700; nm += 50) {
      ctx.beginPath(); ctx.moveTo(xOf(nm), axY); ctx.lineTo(xOf(nm), axY + 4); ctx.stroke();
      ctx.fillText(String(nm), xOf(nm), axY + 16);
    }
    ctx.textAlign = 'right';
    ctx.fillText('nm', W - 4, axY + 16);
  }

  function graphFootHTML() {
    const gas = GASES[state.gas];
    return state.gas === 'H'
      ? `수소의 <b>발머 계열</b>(n→2)만 가시광선으로 보입니다 —
         656(빨강) · 486(청록) · 434(파랑) · 410 nm(보라)`
      : `${gas.name}는 준위 구조가 달라 <b>선의 위치가 수소와 완전히 다릅니다</b> —
         이것이 원소를 알아내는 «지문» 입니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '기체', '전이', '계열', 'Δ<i>E</i> (eV)', '파장 (nm)', '색',
  ];

  function recordRow() {
    if (state.gas !== 'H') {
      const gas = GASES[state.gas];
      return gas.lines.filter((nm) => nm >= 380 && nm <= 780).map((nm) =>
        [gas.name, '—', '—', (HC / nm).toFixed(2), nm.toFixed(1), colorName(nm)]);
    }
    const nm = transitionLambda(state.nHigh, state.nLow);
    return [
      '수소 (H)', `n=${state.nHigh} → n=${state.nLow}`, seriesName(state.nLow),
      transitionE(state.nHigh, state.nLow).toFixed(2), nm.toFixed(1),
      nm < 380 ? '자외선' : nm > 780 ? '적외선' : colorName(nm),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 발머 계열 가시광선 관찰 · 1 라이먼(자외선) 확인 · 2 파셴(적외선) 확인
     3 다른 기체와 비교 · 4 기록 4줄                                        */
  const mis = { series: {}, gases: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.on) {
      mis.gases[state.gas] = true;
      if (state.gas === 'H') mis.series[state.nLow] = true;
    }
    if (i === 0) return !!mis.series[2];
    if (i === 1) return !!mis.series[1];
    if (i === 2) return !!mis.series[3];
    if (i === 3) return Object.keys(mis.gases).length >= 2;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'spectrum',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '수소의 선 스펙트럼 관찰하기',
    guide, prepGuide, tools,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, levelE, transitionLambda, transitionE,
    get scene() { return scene; },
  };
})();
