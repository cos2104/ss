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

  const state = {
    gas: 'H',
    voltage: 0.7,     // 방전 전압 (0~1)
    nHigh: 3,         // 전이 시작 준위
    nLow: 2,          // 전이 끝 준위
    on: true,
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

    buildTable();
    buildTube();
    buildPower();
    buildSpectrum();
    buildLevels();
    buildPlaceholders();

    glow.addExcludedMesh(spectrumPlane);
    glow.addExcludedMesh(levelPlane);
    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/spectrum.jpg', { x: -8, y: 0, z: 5.5, ry: 0.3 });

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

  /** 에너지 준위 그림 */
  function buildLevels() {
    levelPlane = B().MeshBuilder.CreatePlane('spLevels', { width: 7.0, height: 6.4 }, scene);
    levelPlane.position.set(8.6, 4.2, 0.6);
    levelPlane.rotation.y = Math.PI;
    levelTex = new (B().DynamicTexture)('spLevelTex', { width: 420, height: 384 }, scene, true);
    const m = new (B().StandardMaterial)('spLevelMat', scene);
    m.diffuseTexture = levelTex;
    m.emissiveTexture = levelTex;
    m.opacityTexture = levelTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    levelPlane.material = m;
  }

  function drawLevels() {
    const ctx = levelTex.getContext();
    ctx.clearRect(0, 0, 420, 384);
    ctx.translate(420, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#0b1018ee';
    ctx.fillRect(0, 0, 420, 384);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 414, 378);

    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('수소 원자의 에너지 준위', 210, 12);

    // n=1 을 아래, n=∞ 를 위에 두고 −13.6/n² 에 비례하게 배치
    const top = 54, bot = 330;
    const yOf = (n) => {
      const e = levelE(n);            // −13.6 ~ 0
      return bot + (e / -RY) * (bot - top) * -1;   // e=−13.6 → bot, e=0 → top
    };

    for (let n = 1; n <= 6; n++) {
      const y = yOf(n);
      ctx.strokeStyle = '#5b6675';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(330, y); ctx.stroke();
      ctx.fillStyle = '#9fb0c2';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`n=${n}`, 62, y);
      ctx.textAlign = 'left';
      ctx.fillText(`${levelE(n).toFixed(2)} eV`, 338, y);
    }
    // n = ∞
    ctx.strokeStyle = '#8e9bad';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(70, top); ctx.lineTo(330, top); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fb0c2';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('n=∞', 62, top);
    ctx.textAlign = 'left';
    ctx.fillText('0 eV', 338, top);

    // 고른 전이 화살표
    if (state.gas === 'H') {
      const yH = yOf(state.nHigh), yL = yOf(state.nLow);
      const nm = transitionLambda(state.nHigh, state.nLow);
      ctx.strokeStyle = rgbCss(nm, 1);
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(200, yH); ctx.lineTo(200, yL); ctx.stroke();
      // 화살촉 (아래로)
      ctx.fillStyle = rgbCss(nm, 1);
      ctx.beginPath();
      ctx.moveTo(200, yL); ctx.lineTo(193, yL - 12); ctx.lineTo(207, yL - 12);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#e8eef6';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${nm.toFixed(1)} nm`, 212, (yH + yL) / 2);
    }

    ctx.fillStyle = '#8e9bad';
    ctx.font = '14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('전자가 아래 준위로 떨어지며 빛을 낸다', 210, 374);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    levelTex.update();
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
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 200, height: 220 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 200, 220);
      ctx.translate(200, 0); ctx.scale(-1, 1);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(7, 7, 186, 206);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(slots[id].name, 100, 110);
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
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    tube.setEnabled(!!placed.tube);
    spPowerG.setEnabled(!!placed.power);
    spectrumPlane.setEnabled(!!placed.spectro && !!placed.tube);
    levelPlane.setEnabled(!!placed.spectro);
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

  return {
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
