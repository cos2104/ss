/**
 * 실험 1 — 파동의 보강, 상쇄 간섭 실험 (음파)
 * 교과서 125쪽 「보강 간섭과 상쇄 간섭」을 소리로 직접 재어 확인한다.
 *
 * 원본 시뮬레이션과 달리 테이블 위에 간섭 무늬(보강/상쇄 영역)를 실시간으로 그려서
 * 소음측정기를 옮기기 전에 어디가 큰 소리인지 눈으로 예측할 수 있게 했다.
 */
const SoundScene = (() => {
  const B = () => BABYLON;

  const M = 9;              // 1 m = 9 scene unit
  const X_SPK = 0;          // 스피커가 놓인 선
  const L_M = 1.0;          // 스피커 선에서 측정기 선까지 (m) — 교과서 조건
  const X_MET = L_M * M;
  const TABLE_Y = 0;

  // 간섭 무늬를 그릴 영역 (m)
  const FX0 = -0.10, FX1 = 1.30, FZ = 0.88;
  const FIELD_N = 260;      // 텍스처 해상도

  let scene, camera;
  let speakerL, speakerR, meter, rulerZ, rulerX, rulerMet;
  let fieldPlane, fieldTex, markerLine;
  let placed = {};

  const state = {
    freq: 1000,       // Hz
    sep: 1.0,         // 스피커 사이의 간격 (m)
    pos: 0,           // 소음측정기 좌우 위치 (m)
    power: false,
  };

  const tools = [
    { id: 'speakers', label: '스피커 2개', icon: 'speaker' },
    { id: 'meter', label: '소음측정기 1개', icon: 'meter' },
    { id: 'rulers', label: '줄자 3개', icon: 'ruler' },
  ];

  // 도구를 놓을 자리 (scene 좌표). 반경은 서로 겹치지 않을 만큼만 넉넉하게.
  const slots = {
    speakers: { x: X_SPK, z: 0, r: 3.2, name: '스피커' },
    meter: { x: X_MET, z: 0, r: 3.2, name: '소음측정기' },
    rulers: { x: X_MET / 2, z: 0, r: 2.6, name: '줄자' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#bcdcf7ff');

    camera = new (B().ArcRotateCamera)(
      'camSound', -Math.PI / 2 + 0.42, 0.80, 21, new (B().Vector3)(4.6, 0.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 46;
    camera.upperBetaLimit = 1.46;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hs', new (B().Vector3)(-0.3, 1, -0.4), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.42, 0.45, 0.5);

    const dir = new (B().DirectionalLight)('ds', new (B().Vector3)(-0.5, -1, 0.4), scene);
    dir.position = new (B().Vector3)(8, 14, -8);
    dir.intensity = 0.35;

    buildTable();
    buildField();
    buildSpeakers();
    buildMeter();
    buildRulers();
    buildPlaceholders();

    resetTools();
    return scene;
  }

  function mat(name, hex, spec) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.05, 0.05, 0.05);
    return m;
  }

  function buildTable() {
    const t = B().MeshBuilder.CreateBox('sTable', { width: 22, height: 0.45, depth: 17 }, scene);
    t.position.set(4, TABLE_Y - 0.24, 0);
    t.material = mat('sTableMat', '#a9b0b8', '#cfd5db');
    t.material.specularPower = 110;
  }

  /** 테이블 위에 두 음파의 간섭 무늬를 그린다 */
  function buildField() {
    const w = (FX1 - FX0) * M, h = FZ * 2 * M;
    fieldPlane = B().MeshBuilder.CreateGround('field', { width: w, height: h }, scene);
    fieldPlane.position.set((FX0 + FX1) / 2 * M, TABLE_Y + 0.012, 0);

    fieldTex = new (B().DynamicTexture)('fieldTex', { width: FIELD_N, height: FIELD_N }, scene, true);
    const m = new (B().StandardMaterial)('fieldMat', scene);
    m.diffuseTexture = fieldTex;
    m.emissiveTexture = fieldTex;
    m.emissiveColor = new (B().Color3)(0.55, 0.55, 0.55);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.alpha = 0.92;
    fieldPlane.material = m;

    // 소음측정기가 있는 가로선 표시
    markerLine = B().MeshBuilder.CreateBox('marker', { width: 0.12, height: 0.02, depth: h }, scene);
    markerLine.position.set(X_MET, TABLE_Y + 0.03, 0);
    const mm = new (B().StandardMaterial)('markerMat', scene);
    mm.emissiveColor = B().Color3.FromHexString('#1c3f6e');
    mm.disableLighting = true;
    markerLine.material = mm;
  }

  function drawField() {
    const ctx = fieldTex.getContext();
    const img = ctx.createImageData(FIELD_N, FIELD_N);
    const lambda = Physics.soundWavelength(state.freq);

    for (let j = 0; j < FIELD_N; j++) {
      // 텍스처 세로 = scene 의 z 방향
      const z = (j / (FIELD_N - 1)) * 2 * FZ - FZ;
      for (let i = 0; i < FIELD_N; i++) {
        const x = FX0 + (i / (FIELD_N - 1)) * (FX1 - FX0);
        const o = (j * FIELD_N + i) * 4;

        if (!state.power || x < 0.02) {
          img.data[o] = 201; img.data[o + 1] = 205; img.data[o + 2] = 210; img.data[o + 3] = 255;
          continue;
        }
        const I = Physics.soundIntensity(z, x, state.sep, lambda);
        // 보강(빨강) ↔ 상쇄(파랑) 로 구분되게 칠한다
        const t = I;
        img.data[o]     = Math.round(201 + t * 54);
        img.data[o + 1] = Math.round(205 - t * 96);
        img.data[o + 2] = Math.round(210 - t * 128);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    fieldTex.update();
  }

  function buildSpeakers() {
    const body = (name) => {
      const g = new (B().TransformNode)(name, scene);
      const box = B().MeshBuilder.CreateBox(name + 'B', { width: 1.5, height: 1.9, depth: 1.5 }, scene);
      box.position.y = TABLE_Y + 0.95;
      box.material = mat(name + 'M', '#6f7a88', '#c3cad3');
      box.material.specularPower = 64;
      box.parent = g;

      const cone = B().MeshBuilder.CreateCylinder(name + 'C', { height: 0.14, diameter: 1.0 }, scene);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(0.76, TABLE_Y + 0.8, 0);
      cone.material = mat(name + 'CM', '#2f3742');
      cone.parent = g;

      const tw = B().MeshBuilder.CreateCylinder(name + 'T', { height: 0.14, diameter: 0.42 }, scene);
      tw.rotation.z = Math.PI / 2;
      tw.position.set(0.76, TABLE_Y + 1.5, 0);
      tw.material = mat(name + 'TM', '#2f3742');
      tw.parent = g;
      return g;
    };
    speakerL = body('spkL');
    speakerR = body('spkR');
  }

  function buildMeter() {
    meter = new (B().TransformNode)('meter', scene);

    const b = B().MeshBuilder.CreateBox('metB', { width: 0.5, height: 1.7, depth: 0.95 }, scene);
    b.position.y = TABLE_Y + 0.85;
    b.material = mat('metM', '#e0672f', '#ffd9c2');
    b.material.specularPower = 48;
    b.parent = meter;

    const scr = B().MeshBuilder.CreatePlane('metS', { width: 0.72, height: 0.5 }, scene);
    scr.rotation.y = -Math.PI / 2;
    scr.position.set(-0.26, TABLE_Y + 1.28, 0);
    const sm = new (B().StandardMaterial)('metSM', scene);
    sm.emissiveColor = B().Color3.FromHexString('#cfe8d2');
    sm.disableLighting = true;
    scr.material = sm;
    scr.parent = meter;

    const mic = B().MeshBuilder.CreateSphere('metMic', { diameter: 0.62 }, scene);
    mic.position.y = TABLE_Y + 2.0;
    mic.material = mat('metMicM', '#2b323c');
    mic.parent = meter;
  }

  function ruler(name, lengthUnits, vertical) {
    const r = B().MeshBuilder.CreateGround(name, {
      width: vertical ? 0.62 : lengthUnits,
      height: vertical ? lengthUnits : 0.62,
    }, scene);
    r.position.y = TABLE_Y + 0.02;
    const tex = new (B().DynamicTexture)(name + 'T', { width: vertical ? 64 : 1024, height: vertical ? 1024 : 64 }, scene, false);
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex;
    m.specularColor = new (B().Color3)(0, 0, 0);
    r.material = m;
    r._tex = tex;
    r._vertical = vertical;
    return r;
  }

  function buildRulers() {
    rulerZ = ruler('rulerZ', 1, true);     // 스피커 사이 (z 방향)
    rulerX = ruler('rulerX', X_MET, false); // 스피커 → 측정기 (x 방향)
    rulerMet = ruler('rulerMet', 1, true);  // 측정기가 움직이는 선
    drawRulerTex(rulerX, 'x', L_M);
  }

  function drawRulerTex(r, kind, span) {
    const tex = r._tex;
    const ctx = tex.getContext();
    const W = r._vertical ? 64 : 1024, H = r._vertical ? 1024 : 64;
    ctx.fillStyle = '#f4f1e4';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#4a5260';
    ctx.lineWidth = 2;
    const long = r._vertical ? H : W;
    const ticks = 40;
    for (let i = 0; i <= ticks; i++) {
      const p = (i / ticks) * (long - 6) + 3;
      const big = i % 10 === 0, mid = i % 5 === 0;
      const len = big ? 26 : mid ? 17 : 10;
      ctx.beginPath();
      if (r._vertical) { ctx.moveTo(0, p); ctx.lineTo(len, p); }
      else { ctx.moveTo(p, H); ctx.lineTo(p, H - len); }
      ctx.stroke();
    }
    ctx.fillStyle = '#2f3947';
    ctx.font = `bold ${r._vertical ? 22 : 26}px sans-serif`;
    ctx.textBaseline = 'middle';
    if (r._vertical) {
      ctx.textAlign = 'left';
      ctx.fillText((-span / 2).toFixed(1), 30, 24);
      ctx.fillText('0', 30, H / 2);
      ctx.fillText((span / 2).toFixed(1), 30, H - 24);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText('0 m', 44, 22);
      ctx.fillText(span.toFixed(1) + ' m', W - 54, 22);
    }
    tex.update();
  }

  /* ── 배치 안내용 점선 자리 ─────────────────── */
  const holders = {};
  let holderSpkR = null;   // 스피커는 두 대이므로 자리도 두 곳

  function buildPlaceholders() {
    Object.entries(slots).forEach(([id, s]) => {
      holders[id] = makeHolder(id, s);
    });
    holderSpkR = makeHolder('speakersR', slots.speakers);
  }

  function makeHolder(id, s) {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: 3.4, height: 3.4 }, scene);
      p.position.set(s.x, TABLE_Y + 0.05, s.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 256, height: 256 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 256);
      ctx.strokeStyle = '#2f6ad0';
      ctx.lineWidth = 6;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(10, 10, 236, 236);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
      ctx.font = 'bold 34px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, 128, 142);
      tex.hasAlpha = true;
      tex.update();

      const m = new (B().StandardMaterial)('phM_' + id, scene);
      m.diffuseTexture = tex;
      m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      return p;
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    placed = { speakers: false, meter: false, rulers: false };
    applyPlacement();
  }

  function placeTool(id) {
    placed[id] = true;
    applyPlacement();
  }

  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    speakerL.setEnabled(!!placed.speakers);
    speakerR.setEnabled(!!placed.speakers);
    meter.setEnabled(!!placed.meter);
    [rulerZ, rulerX, rulerMet].forEach((r) => r.setEnabled(!!placed.rulers));
    fieldPlane.setEnabled(!!placed.speakers);
    markerLine.setEnabled(!!placed.meter);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    holderSpkR.setEnabled(!placed.speakers);
    update();
  }

  /**
   * 드롭 지점이 그 도구의 자리인지 확인한다.
   * @returns {'ok'|'wrong'} 배치 성공 여부
   */
  function dropAt(id, point) {
    const s = slots[id];
    if (!s) return 'wrong';
    // 스피커는 두 자리에 걸쳐 있으므로 그 사이 어디에 놓아도 인정한다
    const zTol = id === 'speakers' ? s.r + state.sep * M / 2 : s.r;
    const ok = Math.abs(point.x - s.x) <= s.r && Math.abs(point.z - s.z) <= zTol;
    return ok ? 'ok' : 'wrong';
  }

  function slotName(id) { return slots[id] ? slots[id].name : ''; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const sepU = state.sep * M;

    speakerL.position.set(X_SPK, 0, -sepU / 2);
    speakerR.position.set(X_SPK, 0, sepU / 2);
    holders.speakers.position.z = -sepU / 2;
    holderSpkR.position.z = sepU / 2;

    meter.position.set(X_MET, 0, state.pos * M);
    markerLine.position.z = 0;

    rulerZ.position.set(X_SPK, TABLE_Y + 0.02, 0);
    rulerZ.scaling.z = sepU;
    drawRulerTex(rulerZ, 'z', state.sep);

    rulerX.position.set(X_MET / 2, TABLE_Y + 0.02, 0);

    rulerMet.position.set(X_MET, TABLE_Y + 0.02, 0);
    rulerMet.scaling.z = 1.6 * M;
    drawRulerTex(rulerMet, 'z', 1.6);

    drawField();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.42;
    camera.beta = 0.80;
    camera.radius = 21;
    camera.setTarget(new (B().Vector3)(4.6, 0.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '스피커의 전원을 켜고 소음측정기를 좌우로 옮겨 소리의 크기를 확인해 보세요.';
  const prepGuide = '화면의 점선 자리에 준비물을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
    <div class="control">
      <div class="clabel">소리의<br>진동수</div>
      <div class="cbody"><div class="opt-grid">
        ${[500, 1000, 1500, 2000].map((f) =>
          `<button class="opt${f === state.freq ? ' on' : ''}" data-freq="${f}">${f} Hz</button>`).join('')}
      </div></div>
    </div>
    <div class="control">
      <div class="clabel">스피커<br>사이의 간격</div>
      <div class="cbody"><div class="opt-grid">
        ${[0.6, 0.8, 1.0, 1.2].map((d) =>
          `<button class="opt${d === state.sep ? ' on' : ''}" data-sep="${d}">${d.toFixed(1)} m</button>`).join('')}
      </div></div>
    </div>
    <div class="control">
      <div class="clabel">소음측정기<br>이동거리</div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="posSlider" min="-0.8" max="0.8" step="0.005" value="${state.pos}">
          <output id="posOut">${state.pos.toFixed(3)} m</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-pos="0">중앙 0 m</button>
          <button class="opt" data-find="con">다음 보강 지점</button>
          <button class="opt" data-find="des">다음 상쇄 지점</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">스피커<br>전원</div>
      <button class="power${state.power ? '' : ' off'}" id="powerBtn">${state.power ? 'ON' : 'OFF'}</button>
    </div>`;
  }

  const POS_LIMIT = 0.8;

  /**
   * 경로차가 target 이 되는 측정기 위치를 찾는다.
   * x ≥ 0 에서 Δ(x) 는 0 에서 d 까지 단조 증가하므로 이분법으로 구할 수 있다.
   */
  function positionForDelta(target) {
    if (target >= state.sep) return null;   // 경로차는 스피커 간격을 넘을 수 없다
    let lo = 0, hi = 8;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (Physics.soundPathDifference(mid, L_M, state.sep) < target) lo = mid; else hi = mid;
    }
    const x = (lo + hi) / 2;
    return x > POS_LIMIT ? null : x;
  }

  /** 현재 위치보다 바깥쪽에 있는 다음 보강(또는 상쇄) 지점 */
  function nextExtremum(kind) {
    const lambda = Physics.soundWavelength(state.freq);
    const cur = Math.abs(state.pos);
    const n = Physics.soundPathDifference(cur, L_M, state.sep) / lambda;
    const offset = kind === 'con' ? 0 : 0.5;
    // 현재보다 큰 차수부터 차례로 시도
    for (let m = Math.floor(n - offset) + 1; m <= 40; m++) {
      const x = positionForDelta((m + offset) * lambda);
      if (x === null) break;
      if (x > cur + 0.004) return state.pos < 0 ? -x : x;
    }
    // 더 바깥에 없으면 가장 안쪽 지점으로 되돌아간다
    const wrap = positionForDelta(offset * lambda);
    if (wrap === null || Math.abs(wrap - cur) < 0.004) return null;
    return wrap;
  }

  function showNoMore(btn) {
    const old = btn.textContent;
    btn.textContent = '더 없음';
    setTimeout(() => { btn.textContent = old; }, 900);
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-freq]').forEach((b) => b.addEventListener('click', () => {
      state.freq = +b.dataset.freq;
      root.querySelectorAll('[data-freq]').forEach((o) => o.classList.toggle('on', o === b));
      onChange();
    }));
    root.querySelectorAll('[data-sep]').forEach((b) => b.addEventListener('click', () => {
      state.sep = +b.dataset.sep;
      root.querySelectorAll('[data-sep]').forEach((o) => o.classList.toggle('on', o === b));
      onChange();
    }));

    const slider = root.querySelector('#posSlider');
    const out = root.querySelector('#posOut');
    slider.addEventListener('input', () => {
      state.pos = +slider.value;
      out.textContent = `${state.pos.toFixed(3)} m`;
      onChange();
    });
    const setPos = (v) => {
      state.pos = v; slider.value = v;
      out.textContent = `${v.toFixed(3)} m`;
      onChange();
    };
    root.querySelectorAll('[data-pos]').forEach((b) =>
      b.addEventListener('click', () => setPos(+b.dataset.pos)));

    // 보강/상쇄 지점을 차례로 짚어 준다 (간격을 재어 보게 하기 위함)
    root.querySelectorAll('[data-find]').forEach((b) => b.addEventListener('click', () => {
      const next = nextExtremum(b.dataset.find);
      if (next === null) showNoMore(b);
      else setPos(+next.toFixed(3));
    }));

    const pb = root.querySelector('#powerBtn');
    pb.addEventListener('click', () => {
      state.power = !state.power;
      pb.textContent = state.power ? 'ON' : 'OFF';
      pb.classList.toggle('off', !state.power);
      onChange();
    });
  }

  /* ══ 측정값 · 그래프 ════════════════════════ */
  function readoutHTML() {
    const lambda = Physics.soundWavelength(state.freq);
    if (!state.power) {
      return `
        <div class="row"><span>실내온도</span><b>20 ℃</b></div>
        <div class="row"><span>소리의 속력</span><b>${Physics.soundSpeed().toFixed(0)} m/s</b></div>
        <div class="row"><span>소리의 파장 <i>λ</i></span><b>${(lambda * 100).toFixed(1)} cm</b></div>
        <div class="formula">스피커 전원을 켜면 소리의 크기를 측정할 수 있습니다.</div>`;
    }
    const db = Physics.soundLevelDb(state.pos, L_M, state.sep, lambda);
    const delta = Physics.soundPathDifference(state.pos, L_M, state.sep);
    const cond = Physics.soundCondition(state.pos, L_M, state.sep, lambda);
    return `
      <div class="row"><span>소리의 파장 <i>λ</i></span><b>${(lambda * 100).toFixed(1)} cm</b></div>
      <div class="row"><span>측정기 위치</span><b>${state.pos.toFixed(3)} m</b></div>
      <div class="row"><span>경로차 <i>Δ</i></span><b>${(delta * 100).toFixed(1)} cm</b></div>
      <div class="row"><span><i>Δ</i> / <i>λ</i></span><b>${cond.n.toFixed(2)} 배</b></div>
      <div class="row"><span>소리의 크기</span><b class="big">${db.toFixed(1)} dB</b></div>
      <div class="row"><span>판정</span><span class="tag ${cond.type}">${cond.label}</span></div>
      <div class="formula"><i>Δ</i> = <i>mλ</i> → 보강 &nbsp;/&nbsp; <i>Δ</i> = (<i>m</i>+½)<i>λ</i> → 상쇄</div>`;
  }

  const graphTitle = '위치에 따른 소리의 크기';

  function drawGraph(ctx, W, H) {
    const lambda = Physics.soundWavelength(state.freq);
    const SPAN = 0.8;
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const topH = Math.round(H * 0.42);   // 위 : 두 음파의 중첩
    const botY = topH + 6;
    const botH = H - botY - 20;

    /* 위 — 측정기 위치에 도착한 두 음파와 합성파 */
    const delta = Physics.soundPathDifference(state.pos, L_M, state.sep);
    const phase = 2 * Math.PI * delta / lambda;
    const LABEL_H = 15;                       // 범례가 곡선과 겹치지 않도록 띄운다
    const midY = LABEL_H + (topH - LABEL_H) / 2;
    const amp1 = (topH - LABEL_H) / 2.4;      // 합성파(최대 2배)까지 들어가는 크기
    const drawWave = (color, ph, amp, label, lx, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let px = 0; px <= W; px++) {
        const th = (px / W) * 4 * Math.PI;
        const y = midY - Math.sin(th + ph) * amp * amp1;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(label, lx, 3);
    };
    // 두 음파가 겹칠 때 잘 보이도록 굵기를 달리한다
    drawWave('#ff7a7a', 0, 0.5, '스피커 1', 6, 3.2);
    drawWave('#6ee39d', phase, 0.5, '스피커 2', 58, 1.6);

    ctx.strokeStyle = '#79c4ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const th = (px / W) * 4 * Math.PI;
      const v = 0.5 * Math.sin(th) + 0.5 * Math.sin(th + phase);
      const y = midY - v * amp1;
      px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#79c4ff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('합성파', 116, 3);

    /* 아래 — 위치에 따른 소리의 크기 */
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    for (let m = -0.8; m <= 0.81; m += 0.2) {
      const px = ((m + SPAN) / (SPAN * 2)) * W;
      ctx.beginPath(); ctx.moveTo(px, botY); ctx.lineTo(px, botY + botH); ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(0, botY + botH);
    for (let px = 0; px <= W; px++) {
      const x = ((px / W) * 2 - 1) * SPAN;
      const I = state.power ? Physics.soundIntensity(x, L_M, state.sep, lambda) : 0;
      ctx.lineTo(px, botY + botH - I * botH);
    }
    ctx.lineTo(W, botY + botH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(230,110,80,.45)';
    ctx.fill();
    ctx.strokeStyle = '#f08a5f';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 현재 측정기 위치
    const mx = ((state.pos + SPAN) / (SPAN * 2)) * W;
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, botY); ctx.lineTo(mx, botY + botH); ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let m = -0.8; m <= 0.81; m += 0.2) {
      ctx.fillText(m.toFixed(1), ((m + SPAN) / (SPAN * 2)) * W, botY + botH + 4);
    }
    ctx.textAlign = 'right';
    ctx.fillText('(m)', W - 3, botY + botH + 4);
  }

  function graphFootHTML() {
    const lambda = Physics.soundWavelength(state.freq);
    const approx = lambda * L_M / state.sep;          // 교과서의 근사식
    const first = positionForDelta(lambda);            // 실제 첫 보강 지점
    const realTxt = first === null ? '화면 밖' : `${(first * 100).toFixed(1)} cm`;
    return `첫 보강 지점 <b>±${realTxt}</b> · 근사식 <i>λL</i>/<i>d</i> = ${(approx * 100).toFixed(1)} cm
            <span style="opacity:.75">(거리가 가까워 근사식과 조금 다릅니다)</span>`;
  }

  return {
    id: 'sound',
    title: '파동의 보강, 상쇄 간섭 실험',
    guide, prepGuide, tools, state,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    get scene() { return scene; },
  };
})();
