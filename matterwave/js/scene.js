/**
 * 전자를 한 개씩 — 이중 슬릿 모의실험 (⑥ 데이터 기반 실험형)
 * 비상교육 고등 전자기와 양자 III-01 (교과서 92~97쪽)
 *
 * 탐구 93쪽 — 전자를 하나씩 쏘아 점이 쌓이면 간섭무늬가 나타난다.
 *            관측 장치를 켜면 무늬가 사라지고 두 줄이 된다 (94쪽 자료실).
 * 확률 해석 — 파동 함수 |Ψ|² 이 전자를 발견할 확률 (95쪽, 그림 III-3·4).
 */
const MatterwaveScene = (() => {
  const B = () => BABYLON;

  const L_DIST = 10;          // 슬릿-스크린 거리 (표시 단위)
  const SCREEN_H = 8;         // 스크린 높이
  const NBIN = 80;            // 히스토그램 칸

  const SLIT_X = -2;          // 슬릿 판이 선 자리
  const SLIT_CY = 3;          // 슬릿 중심 높이
  const DSC = 0.5;            // 슬릿 간격 d 의 표시 축척
  const PLATE_OFF = 1.85;     // 슬릿 가장자리에서 판 중심까지 (판 높이의 절반 + 여유)

  let scene, camera;
  let gun, slitPlate, screenP, screenTex, detector;
  let placed = {};
  let canvasRef = null;        // 끌기가 끝나면 카메라를 다시 붙일 캔버스
  let glowLayer = null;        // 이름표·단추가 하얗게 번지지 않도록 제외할 때 쓴다

  const state = {
    lambda: 1.0,        // 드브로이 파장 (연출 단위) — 가속 전압으로 조절
    dSlit: 3.0,         // 슬릿 간격 (연출 단위)
    rate: 40,           // 초당 발사 수
    observe: 0,         // 관측 장치 (0/1)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'gunT', label: '전자총', icon: 'tower' },
    { id: 'slitT', label: '이중 슬릿', icon: 'screenBoard' },
    { id: 'scrT', label: '형광 스크린', icon: 'screenBoard' },
    { id: 'obsT', label: '관측 장치', icon: 'sensor' },
  ];
  const slots = {
    gunT: { name: '왼쪽 (전자총)' },
    slitT: { name: '가운데 (슬릿)' },
    scrT: { name: '오른쪽 (스크린)' },
    obsT: { name: '슬릿 옆 (관측 장치)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 스크린 위 y 에서 전자를 발견할 확률 (미규격화) */
  function prob(y) {
    const a = state.dSlit / 4;                 // 슬릿 폭 (간격의 1/4 로 고정)
    if (state.observe) {
      // 관측하면 파동성이 사라져 슬릿 2개의 입자 분포 (두 줄)
      const s = 0.55;
      const g = (c) => Math.exp(-((y - c) ** 2) / (2 * s * s));
      return g(state.dSlit / 2) + g(-state.dSlit / 2);
    }
    const bd = Math.PI * state.dSlit * y / (state.lambda * L_DIST);
    const ba = Math.PI * a * y / (state.lambda * L_DIST);
    const sinc = ba === 0 ? 1 : Math.sin(ba) / ba;
    return Math.cos(bd) ** 2 * sinc * sinc;
  }
  /** 무늬 간격 Δy = λL/d */
  const fringe = () => state.lambda * L_DIST / state.dSlit;

  /** 확률 분포에서 표본 추출 (기각법) */
  function sampleY() {
    for (let i = 0; i < 60; i++) {
      const y = (Math.random() - 0.5) * SCREEN_H;
      if (Math.random() < prob(y)) return y;
    }
    return (Math.random() - 0.5) * SCREEN_H;
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camMw', -Math.PI / 2 + 0.5, 1.25, 20, new (B().Vector3)(1, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 44;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hmw', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('mwGlow', scene);
    glow.intensity = 0.5;
    glowLayer = glow;
    canvasRef = canvas;

    const table = B().MeshBuilder.CreateBox('mwTable', { width: 24, height: 0.5, depth: 12 }, scene);
    table.position.y = -0.26;
    table.material = mat('mwTableMat', '#242c3c');

    buildGun();
    buildSlit();
    buildScreen();
    buildDetector();
    buildPlaceholders();
    buildHandsOn();
    setupPointer(canvas);

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/matterwave.jpg', { x: -9.5, y: 0, z: -5.5 });

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

  function buildGun() {
    gun = new (B().TransformNode)('mwGun', scene);
    const body = B().MeshBuilder.CreateCylinder('mwGunB', { height: 2.4, diameter: 1.4 }, scene);
    body.rotation.z = Math.PI / 2;
    body.position.set(-7, 3, 0);
    body.material = mat('mwGunBM', '#39424f', '#8e9bad', 64);
    body.parent = gun;
    const nose = B().MeshBuilder.CreateCylinder('mwGunN', { height: 0.9, diameterTop: 0.4, diameterBottom: 1.0 }, scene);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(-5.6, 3, 0);
    nose.material = mat('mwGunNM', '#5b6675');
    nose.parent = gun;
    // 발사 중임을 알리는 표시등 — 전자총을 눌러 켜고 끈다
    const lamp = B().MeshBuilder.CreateSphere('mwGunLamp', { diameter: 0.44 }, scene);
    lamp.position.set(-7, 3.95, 0);
    gunLampMat = emat('mwGunLampM', '#3a4250');
    lamp.material = gunLampMat;
    lamp.parent = gun;
  }

  function buildSlit() {
    slitPlate = new (B().TransformNode)('mwSlit', scene);
    const mkPart = (y, h) => {
      const b = B().MeshBuilder.CreateBox('mwSlitP' + y, { width: 0.2, height: h, depth: 3.4 }, scene);
      b.position.set(-2, y, 0);
      b.material = mat('mwSlitPM' + y, '#7a8494', '#cfd6df', 96);
      b.parent = slitPlate;
      return b;
    };
    slitPlate._top = mkPart(5.4, 3.2);
    slitPlate._mid = mkPart(3, 1.0);
    slitPlate._bot = mkPart(0.6, 3.2);
  }

  function layoutSlit() {
    // 슬릿 간격 d 에 맞춰 가운데 막대 높이 조절 (중심 y = SLIT_CY)
    const d = state.dSlit * DSC;
    slitPlate._mid.scaling.y = Math.max(0.2, (d - 0.5) / 1.0);
    slitPlate._top.position.y = SLIT_CY + d / 2 + PLATE_OFF;
    slitPlate._top.scaling.y = 1;
    slitPlate._bot.position.y = SLIT_CY - d / 2 - PLATE_OFF;
  }

  /** 위·아래 판의 중심 높이를 슬릿 간격 d(설정값)으로 되돌린다 — 끌기의 역산 */
  function dSlitFromPlateY(side, plateY) {
    const half = side > 0 ? (plateY - SLIT_CY - PLATE_OFF) : (SLIT_CY - PLATE_OFF - plateY);
    return (2 * half) / DSC;
  }

  function buildScreen() {
    screenP = B().MeshBuilder.CreatePlane('mwScreen', { width: 1.2, height: SCREEN_H * 0.62 }, scene);
    screenP.position.set(3.2, 3, 0);
    screenP.rotation.y = -Math.PI / 2;
    screenP.scaling.x = 4;
    screenTex = new (B().DynamicTexture)('mwScreenTex', { width: 340, height: 620 }, scene, false);
    const m = new (B().StandardMaterial)('mwScreenM', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.9, 0.9, 0.9);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screenP.material = m;
    clearScreen();
  }

  function clearScreen() {
    const ctx = screenTex.getContext();
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, 340, 620);
    screenTex.update();
  }

  function dotOnScreen(y) {
    const ctx = screenTex.getContext();
    const py = 310 - (y / (SCREEN_H / 2)) * 300;
    const px = 20 + Math.random() * 300;
    ctx.fillStyle = 'rgba(122,224,160,.95)';
    ctx.beginPath(); ctx.arc(px, py, 2.1, 0, 7); ctx.fill();
    screenTex.update();
  }

  function buildDetector() {
    detector = new (B().TransformNode)('mwDet', scene);
    const cam2 = B().MeshBuilder.CreateBox('mwDetB', { width: 0.8, height: 0.8, depth: 0.8 }, scene);
    cam2.position.set(-2, 6.4, 1.4);
    detBodyMat = mat('mwDetBM', '#d0453a', '#ffd0c8', 48);
    cam2.material = detBodyMat;
    cam2.parent = detector;
    const lens = B().MeshBuilder.CreateCylinder('mwDetL', { height: 0.5, diameter: 0.5 }, scene);
    lens.rotation.x = 0.9;
    lens.position.set(-2, 5.9, 1.0);
    lens.material = mat('mwDetLM', '#20262f');
    lens.parent = detector;
    // 켜짐 표시등 — 관측 장치를 눌러 켜고 끈다
    const lamp = B().MeshBuilder.CreateSphere('mwDetLamp', { diameter: 0.3 }, scene);
    lamp.position.set(-2, 6.92, 1.4);
    detLampMat = emat('mwDetLampM', '#3a4250');
    lamp.material = detLampMat;
    lamp.parent = detector;
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 전자총을 누르면 전자를 쏘기 시작하고 다시 누르면 멈춘다
     · 슬릿 판의 «위·아래 판을 끌어» 슬릿 간격 d 를 넓히거나 좁힌다
     · 관측 장치를 누르면 «어느 슬릿으로 지났는지» 감시가 켜지고 꺼진다
     · 전자총 위 ＋ / － 로 가속 전압을 바꾸어 드브로이 파장 λ 를 조절한다   */

  let onChangeCb = null;        // 3D 에서 조작해도 측정값·그래프가 갱신되도록
  let stepLam = null;           // λ 를 바꾸는 ＋ / － 단추
  let lamTag = null, dTag = null;
  let gunLampMat = null, detLampMat = null, detBodyMat = null;
  let slitDrag = null;          // { side, y0, p0 } — 누른 순간의 손끝·판 높이
  let tap = null;               // { what, x, y } — 끌지 않고 «톡 누른» 것인지 가린다

  const TAP_R = 8;              // 이만큼 안 움직이면 누른 것으로 본다 (화면 픽셀)
  // 판이 손끝을 그대로 따라가면 d 한 칸(0.5)이 화면에서 너무 좁아 값이 튄다.
  // 손끝이 움직인 만큼의 절반을 판이 따라가게 해 차분히 맞출 수 있도록 한다.
  const DRAG_GAIN = 0.5;

  /** 값을 적어 두는 작은 이름표 — 늘 카메라 쪽을 본다 */
  function makeTag(name, w, h) {
    const pl = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    const TW = Math.round(w * 90), TH = Math.round(h * 90);
    const tex = new (B().DynamicTexture)(name + 'T', { width: TW, height: TH }, scene, true);
    tex.hasAlpha = true;
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex; m.emissiveTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.disableLighting = true;
    m.backFaceCulling = false;
    pl.material = m;
    pl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    pl.isPickable = false;
    pl._tex = tex;
    pl._tw = TW; pl._th = TH;
    if (glowLayer && glowLayer.addExcludedMesh) glowLayer.addExcludedMesh(pl);
    return pl;
  }

  function paintTag(pl, text, hex) {
    if (!pl || !pl._tex) return;
    const W = pl._tw, H = pl._th;
    const c = pl._tex.getContext();
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,20,32,.86)';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = hex; c.lineWidth = 4;
    c.strokeRect(2, 2, W - 4, H - 4);
    c.fillStyle = hex;
    let px = Math.round(H * 0.52);
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    while (px > 12 && c.measureText(text).width > W - 18) {
      px -= 2;
      c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2 + 1);
    pl._tex.update();
  }

  function buildHandsOn() {
    stepLam = LabUI.makeStepper(scene, 'Lam');
    lamTag = makeTag('mwLamTag', 2.8, 0.72);
    dTag = makeTag('mwDTag', 3.9, 0.72);
    layoutHands();
  }

  /** 단추·이름표의 자리와 표시등 색을 다시 잡는다 (layout 에서 매번 부른다) */
  function layoutHands() {
    const on = allPlaced();
    if (stepLam) {
      // 전자총 몸통(지름 1.4)과 표시등 위로 넉넉히 띄운다
      stepLam.place(-7, 4.95, 0, 1.0);
      stepLam.setEnabled(on && !!placed.gunT);
    }
    if (lamTag) {
      lamTag.position.set(-7, 6.05, 0);
      lamTag.setEnabled(on && !!placed.gunT);
      paintTag(lamTag, `λ = ${state.lambda.toFixed(1)}`, '#7ae0a0');
    }
    if (dTag) {
      // 위쪽 판의 꼭대기보다 더 위에 두어 슬릿 판과 겹치지 않게 한다
      const d = state.dSlit * DSC;
      dTag.position.set(SLIT_X, SLIT_CY + d / 2 + PLATE_OFF + 1.6 + 0.95, 0);
      dTag.setEnabled(on && !!placed.slitT);
      paintTag(dTag, `슬릿 간격 d = ${state.dSlit.toFixed(1)}`, '#5ad0f0');
    }
    if (gunLampMat) {
      gunLampMat.emissiveColor = B().Color3.FromHexString(state.running ? '#ffd34a' : '#3a4250');
    }
    if (detLampMat) {
      detLampMat.emissiveColor = B().Color3.FromHexString(state.observe ? '#ff5a48' : '#3a4250');
    }
    if (detBodyMat) {
      detBodyMat.diffuseColor = B().Color3.FromHexString(state.observe ? '#d0453a' : '#59616e');
    }
  }

  /** 3D 에서 값을 바꾼 뒤 — 장면과 측정값·그래프를 함께 갱신한다.
      clear 가 참이면 조건이 달라진 것이므로 스크린과 히스토그램을 비운다. */
  function applyChange(clear) {
    if (clear) {
      const wasRunning = state.running;
      reset();
      state.running = wasRunning;      // 3D 로 조절할 때는 발사를 그대로 이어 간다
    }
    if (onChangeCb) onChangeCb();      // 껍데기가 update() 까지 불러 준다
    else update();
    syncPanel();
  }

  /** 아래 조작 막대를 3D 에서 바꾼 값에 맞춘다 */
  function syncPanel() {
    const put = (id, val, txt) => {
      const el = document.querySelector('#' + id);
      const out = document.querySelector('#' + id + 'Out');
      if (el) el.value = val;
      if (out) out.textContent = txt;
    };
    put('lambda', state.lambda, state.lambda.toFixed(1));
    put('dSlit', state.dSlit, state.dSlit.toFixed(1));
    document.querySelectorAll('[data-observe]').forEach((b) => {
      b.classList.toggle('on', +b.getAttribute('data-observe') === state.observe);
    });
    const run = document.querySelector('#runBtn');
    if (run) {
      run.textContent = state.running ? '발사 중…' : '▶ 발사';
      run.classList.toggle('run', state.running);
    }
  }

  /** 가속 전압을 한 칸 올리고 내린다 — 전압이 높을수록 λ = h/mv 는 짧아진다.
      단추는 λ 를 곧바로 0.1 씩 바꾸도록 두어 무늬 간격의 변화를 바로 본다. */
  function bumpLambda(dir) {
    const v = Math.max(0.5, Math.min(2.0, +(state.lambda + dir * 0.1).toFixed(1)));
    if (v === state.lambda) return;
    state.lambda = v;
    applyChange(true);
  }

  function toggleRun() {
    state.running = !state.running;
    applyChange(false);
  }

  function toggleObserve() {
    state.observe = state.observe ? 0 : 1;
    applyChange(true);      // 관측 여부가 바뀌면 무늬를 처음부터 다시 쌓는다
  }

  /** 화면 위 한 점을 슬릿 판이 선 면(z = 0) 위의 세계 좌표로 바꾼다 */
  function slitPoint() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(SLIT_X, SLIT_CY, 0), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null || d < 0) return null;   // 면과 거의 나란히 보면 무시한다
    return ray.origin.add(ray.direction.scale(d));
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const m = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = m ? m.name : '';

      if (pi.type === T.POINTERDOWN) {
        // 앞서 누른 것이 손을 뗀 신호를 못 받고 남아 있을 수 있다
        // (오른쪽 단추·두 손가락). 새로 누를 때마다 지워 엉뚱한 곳에서 켜지지 않게 한다.
        tap = null;
        if (!allPlaced()) return;          // 장치를 다 놓기 전에는 만지지 못한다
        if (nm === 'btnAddLam') { bumpLambda(+1); return; }
        if (nm === 'btnSubLam') { bumpLambda(-1); return; }
        if (nm.indexOf('mwGun') === 0) {
          tap = { what: 'gun', x: scene.pointerX, y: scene.pointerY };
          return;
        }
        if (nm.indexOf('mwDet') === 0) {
          tap = { what: 'det', x: scene.pointerX, y: scene.pointerY };
          return;
        }
        if (slitPlate && (m === slitPlate._top || m === slitPlate._bot)) {
          const pt = slitPoint();
          if (!pt) return;
          // 누른 순간의 손끝 높이와 판 높이를 기억해 두어 «잡자마자 튀지» 않게 한다
          slitDrag = {
            side: m === slitPlate._top ? 1 : -1,
            y0: pt.y, p0: m.position.y, d0: state.dSlit,
          };
          camera.detachControl();
        }
        return;
      }

      if (pi.type === T.POINTERMOVE) {
        if (tap && (Math.abs(scene.pointerX - tap.x) > TAP_R
                 || Math.abs(scene.pointerY - tap.y) > TAP_R)) tap = null;
        if (!slitDrag) return;
        const pt = slitPoint();
        if (!pt) return;
        const plateY = slitDrag.p0 + (pt.y - slitDrag.y0) * DRAG_GAIN;
        const raw = dSlitFromPlateY(slitDrag.side, plateY);
        const v = Math.max(1.5, Math.min(5, Math.round(raw * 2) / 2));   // 0.5 칸
        if (v === state.dSlit) return;
        state.dSlit = v;
        applyChange(false);            // 끄는 동안에는 무늬를 지우지 않는다
        return;
      }

      if (pi.type === T.POINTERUP) {
        if (slitDrag) {
          const changed = state.dSlit !== slitDrag.d0;
          slitDrag = null;
          camera.attachControl(canvas, true);
          applyChange(changed);        // 간격이 달라졌을 때만 처음부터 다시 쌓는다
        } else if (tap) {
          const what = tap.what;
          tap = null;
          if (what === 'gun') toggleRun();
          else toggleObserve();
        }
      }
    });
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      gunT: { x: -7, z: 0, w: 4, h: 3, label: '전자총' },
      slitT: { x: -2, z: 0, w: 3, h: 3.4, label: '이중 슬릿' },
      scrT: { x: 3.2, z: 0, w: 3, h: 3.4, label: '형광 스크린' },
      obsT: { x: -2, z: 4, w: 3.4, h: 2.6, label: '관측 장치' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#5a9df0' });
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
    // 끌던 도중에 «다시 배치» 를 눌러도 카메라 조작이 잠긴 채로 남지 않게 한다
    if (slitDrag && camera && canvasRef) camera.attachControl(canvasRef, true);
    slitDrag = null; tap = null;
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
    sim = {
      count: 0,
      bins: new Array(NBIN).fill(0),
      acc: 0,
    };
    clearScreen();
    layout();
  }

  function layout() {
    if (!sim) return;
    // 놓은 도구부터 하나씩 나타난다
    gun.setEnabled(!!placed.gunT);
    slitPlate.setEnabled(!!placed.slitT);
    screenP.setEnabled(!!placed.scrT);
    // 관측 장치는 놓으면 늘 보인다 — 눌러서 켜고 끄므로 표시등 색으로 상태를 알린다
    detector.setEnabled(!!placed.obsT);
    if (placed.slitT) layoutSlit();
    layoutHands();
  }

  function tick(dt) {
    if (!sim || !allPlaced() || !state.running) return false;
    sim.acc += state.rate * dt;
    let fired = 0;
    while (sim.acc >= 1 && fired < 200) {
      sim.acc -= 1;
      const y = sampleY();
      dotOnScreen(y);
      const bin = Math.floor(((y + SCREEN_H / 2) / SCREEN_H) * NBIN);
      if (bin >= 0 && bin < NBIN) sim.bins[bin] += 1;
      sim.count += 1;
      fired += 1;
    }
    return fired > 0;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.5;
    camera.beta = 1.25;
    camera.radius = 20;
    camera.setTarget(new (B().Vector3)(1, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '전자를 한 개씩 쏘아도 점이 쌓이면 간섭무늬가 나타납니다. 관측 장치를 켜면 어떻게 될까요?';
  const prepGuide = '점선 자리에 전자총·이중 슬릿·스크린·관측 장치를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('lambda', '드브로이 파장<br><i>λ</i> = <i>h</i>/<i>mv</i>',
        { min: 0.5, max: 2.0, step: 0.1, value: state.lambda, fmt: (v) => `${(+v).toFixed(1)}` })}
      ${LabUI.slider('dSlit', '슬릿 간격 <i>d</i>',
        { min: 1.5, max: 5, step: 0.5, value: state.dSlit, fmt: (v) => `${(+v).toFixed(1)}` })}
      ${LabUI.opts('발사 빠르기', 'rate', [
        { v: 6, t: '한 개씩 천천히' }, { v: 40, t: '보통' }, { v: 240, t: '빠르게' },
      ], state.rate, 1)}
      ${LabUI.opts('관측 장치<br>(어느 슬릿?)', 'observe', [
        { v: 0, t: '끄기' }, { v: 1, t: '켜기 📷' },
      ], state.observe, 1)}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          <b>전자총을 누르면</b> 전자를 쏘기 시작하고 다시 누르면 멈춥니다.
          슬릿 판의 <b>위·아래 판을 끌어</b> 간격 <i>d</i> 를 넓히거나 좁히고,
          <b>관측 장치를 눌러</b> 어느 슬릿을 지났는지 감시를 켜고 끕니다.
          전자총 위 <b>＋ · －</b> 로 가속 전압을 바꾸면 λ 가 0.1 씩 달라집니다.
        </p></div>
      </div>
      <div class="control">
        <div class="clabel">전자 쏘기</div>
        <button class="power${state.running ? ' run' : ''}" id="runBtn">${
          state.running ? '발사 중…' : '▶ 발사'}</button>
      </div>
      <div class="control">
        <div class="clabel">스크린<br>지우기</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    // 조건이 바뀌면 스크린을 비우고 다시 쌓는다 (3D 조작과 같은 길로 지나간다)
    const after = () => applyChange(true);
    LabUI.bindSlider(root, 'lambda', state, 'lambda', (v) => `${(+v).toFixed(1)}`, after);
    LabUI.bindSlider(root, 'dSlit', state, 'dSlit', (v) => `${(+v).toFixed(1)}`, after);
    LabUI.bindOpts(root, 'rate', state, 'rate', onChange);
    LabUI.bindOpts(root, 'observe', state, 'observe', after);
    const run = root.querySelector('#runBtn');
    run.addEventListener('click', toggleRun);       // 표시는 syncPanel 이 맞춘다
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();                                      // 발사도 멈추고 처음 상태로
      onChange();
      syncPanel();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    return `
      <div class="row"><span>쏜 전자 수</span><b class="big">${sim.count.toLocaleString()}개</b></div>
      <div class="row"><span>드브로이 파장 λ</span><b>${state.lambda.toFixed(1)} (h/mv)</b></div>
      <div class="row"><span>슬릿 간격 d</span><b>${state.dSlit.toFixed(1)}</b></div>
      <div class="row"><span>무늬 간격 Δy = λL/d</span><b>${fringe().toFixed(2)}</b></div>
      <div class="row"><span>관측 장치</span>
        <b class="big">${state.observe ? '📷 켜짐 — 무늬 소멸!' : '꺼짐 — 간섭무늬'}</b></div>
      <div class="formula">${state.observe
        ? '어느 슬릿을 지났는지 <b>측정하는 순간</b> 파동성이 사라지고 입자처럼 두 줄만 남습니다. 측정이 상태를 바꾸는 양자 역학의 기묘함입니다 (94쪽 자료실).'
        : '전자 <b>한 개</b>는 확률 파동으로 <b>두 슬릿을 동시에</b> 지나며 스스로 간섭하고, 스크린에는 입자처럼 한 점으로 찍힙니다. 점이 쌓이면 |Ψ|² 을 따라 간섭무늬가 드러납니다 (95쪽).'}</div>
      <div class="sec">참고 — 물질파 파장 (92쪽 그림 III-1)</div>
      <div class="row"><span>전자 (9×10⁻³¹ kg)</span><b>4.3×10⁻¹² m — 관찰 가능</b></div>
      <div class="row"><span>야구공 (0.15 kg)</span><b>1.1×10⁻³⁴ m — 관찰 불가</b></div>`;
  }

  /* ══ 그래프 — 도달 분포 히스토그램 ═══════════ */
  const graphTitle = '전자를 발견할 확률 |Ψ|² 과 실제 분포';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 36, padR = 10, padT = 14, padB = 22;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const xOf = (y) => padL + ((y + SCREEN_H / 2) / SCREEN_H) * gw;

    // 이론 확률 곡선
    let pmax = 0;
    for (let i = 0; i <= 200; i++) {
      pmax = Math.max(pmax, prob(-SCREEN_H / 2 + (i / 200) * SCREEN_H));
    }
    ctx.strokeStyle = 'rgba(90,208,240,.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const y = -SCREEN_H / 2 + (i / 200) * SCREEN_H;
      const py = padT + gh - (prob(y) / pmax) * gh * 0.94;
      if (i === 0) ctx.moveTo(xOf(y), py); else ctx.lineTo(xOf(y), py);
    }
    ctx.stroke();

    // 실제 히스토그램
    if (sim && sim.count > 0) {
      const bmax = Math.max(1, ...sim.bins);
      ctx.fillStyle = 'rgba(122,224,160,.55)';
      const bw = gw / NBIN;
      sim.bins.forEach((n, i) => {
        const h = (n / bmax) * gh * 0.94;
        ctx.fillRect(padL + i * bw, padT + gh - h, bw - 0.5, h);
      });
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('|Ψ|² (이론)', padL + 6, padT + 2);
    ctx.fillStyle = '#7ae0a0';
    ctx.fillText(`실제 도달 분포 (${sim ? sim.count : 0}개)`, padL + 78, padT + 2);
  }

  function graphFootHTML() {
    return state.observe
      ? '관측하면 봉우리가 <b>두 개</b>뿐 — 슬릿 모양 그대로, 입자의 분포입니다'
      : `점이 쌓일수록 히스토그램이 <b>|Ψ|² 곡선</b>에 다가갑니다 — 보강 간섭 위치의 간격 Δy = λL/d = ${fringe().toFixed(2)}`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '전자 수', 'λ', 'd', '관측 장치', '스크린의 무늬',
  ];

  function recordRow() {
    return [[sim.count.toLocaleString(), state.lambda.toFixed(1), state.dSlit.toFixed(1),
      state.observe ? '켜짐' : '꺼짐',
      state.observe ? '두 줄 (입자성)' : sim.count < 100 ? '무작위 점 (아직)' : '간섭무늬 (파동성)']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 전자 100개 · 1 간섭무늬 (1000개) · 2 관측 장치 켜기 · 3 파장 바꿔 간격 비교
     4 기록 3줄                                                            */
  const mis = { max: 0, observed: false, lams: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (sim) mis.max = Math.max(mis.max, sim.count || 0);
    if (state.observe && sim && sim.count > 50) mis.observed = true;
    if (!state.observe && sim && sim.count > 300) mis.lams[state.lambda.toFixed(1)] = true;

    if (i === 0) return mis.max >= 100;
    if (i === 1) return !state.observe && mis.max >= 1000;
    if (i === 2) return mis.observed;
    if (i === 3) return Object.keys(mis.lams).length >= 2;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'matterwave',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '전자를 한 개씩 — 이중 슬릿 모의실험',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, prob, fringe, sampleY,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
