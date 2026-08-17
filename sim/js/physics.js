/**
 * 빛의 중첩과 간섭 - 물리 계산 모듈
 * 비상교육 고등 물리학 III-1-01 (교과서 p.124~129)
 */
const Physics = (() => {
  /**
   * 파장(nm) -> RGB. 가시광선 380~780nm.
   * 교과서 p.127 그림 III-5의 적색광/청색광 색감을 재현한다.
   */
  function wavelengthToRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440)       { r = -(nm - 440) / 60; g = 0; b = 1; }
    else if (nm >= 440 && nm < 490)  { r = 0; g = (nm - 440) / 50; b = 1; }
    else if (nm >= 490 && nm < 510)  { r = 0; g = 1; b = -(nm - 510) / 20; }
    else if (nm >= 510 && nm < 580)  { r = (nm - 510) / 70; g = 1; b = 0; }
    else if (nm >= 580 && nm < 645)  { r = 1; g = -(nm - 645) / 65; b = 0; }
    else if (nm >= 645 && nm <= 780) { r = 1; g = 0; b = 0; }

    // 가시광선 양 끝에서 밝기가 떨어지는 것을 반영
    let f = 1;
    if (nm >= 380 && nm < 420)      f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm > 700 && nm <= 780) f = 0.3 + 0.7 * (780 - nm) / 80;

    const gamma = 0.8;
    const adj = (c) => (c <= 0 ? 0 : Math.pow(c * f, gamma));
    return { r: adj(r), g: adj(g), b: adj(b) };
  }

  function rgbToCss({ r, g, b }, scale = 1) {
    const to255 = (c) => Math.round(Math.min(1, Math.max(0, c * scale)) * 255);
    return `rgb(${to255(r)},${to255(g)},${to255(b)})`;
  }

  /**
   * 밝은 무늬 사이의 간격 Δx = λL / d   (교과서 p.127, Δx ∝ λ/d)
   * @param {number} lambdaNm 파장 (nm)
   * @param {number} L        슬릿-스크린 거리 (m)
   * @param {number} dMm      슬릿 사이의 간격 (mm)
   * @returns {number} Δx (mm)
   */
  function fringeSpacing(lambdaNm, L, dMm) {
    const lambda = lambdaNm * 1e-9; // m
    const d = dMm * 1e-3;           // m
    return (lambda * L / d) * 1e3;  // mm
  }

  /**
   * 스크린 위 위치 y(mm)에서의 상대 세기.
   *   경로차 Δ = d·sinθ ≈ d·y/L
   *   이중 슬릿 간섭항 : cos²(πΔ/λ)
   *   단일 슬릿 회절 포락선 : sinc²(π·a·y / (λL))
   * @param {number} yMm      스크린 중심으로부터의 거리 (mm)
   * @param {number} lambdaNm 파장 (nm)
   * @param {number} dMm      슬릿 사이의 간격 (mm)
   * @param {number} L        슬릿-스크린 거리 (m)
   * @param {number} aMm      슬릿 하나의 폭 (mm). 0이면 회절 포락선을 무시한다.
   * @returns {number} 0~1
   */
  function intensity(yMm, lambdaNm, dMm, L, aMm) {
    const lambda = lambdaNm * 1e-9;
    const d = dMm * 1e-3;
    const y = yMm * 1e-3;

    const interference = Math.pow(Math.cos(Math.PI * d * y / (lambda * L)), 2);

    if (!aMm) return interference;

    const a = aMm * 1e-3;
    const beta = Math.PI * a * y / (lambda * L);
    const sinc = Math.abs(beta) < 1e-9 ? 1 : Math.sin(beta) / beta;
    return interference * sinc * sinc;
  }

  /**
   * 경로차가 반파장의 몇 배인지 계산. 교과서 p.127의 보강/상쇄 조건 판정용.
   *   Δ = (λ/2)(2m)   -> 보강 간섭
   *   Δ = (λ/2)(2m+1) -> 상쇄 간섭
   */
  function pathDifference(yMm, dMm, L) {
    return (dMm * 1e-3) * (yMm * 1e-3) / L; // m
  }

  function halfWavelengthMultiple(yMm, lambdaNm, dMm, L) {
    const delta = pathDifference(yMm, dMm, L);
    return delta / (lambdaNm * 1e-9 / 2);
  }

  /* ══ 단일 슬릿 회절 ══════════════════════════════
   * 교과서 심화 : 슬릿의 폭 a 하나만으로 생기는 회절 무늬
   *   어두운 무늬 조건  a sinθ = mλ  (m = ±1, ±2 …)
   */

  /** 단일 슬릿 회절의 상대 세기 */
  function diffractionIntensity(yMm, lambdaNm, aMm, L) {
    const beta = Math.PI * (aMm * 1e-3) * (yMm * 1e-3) / (lambdaNm * 1e-9 * L);
    if (Math.abs(beta) < 1e-9) return 1;
    const s = Math.sin(beta) / beta;
    return s * s;
  }

  /** m번째 어두운 무늬의 위치 (mm) */
  function darkFringePosition(m, lambdaNm, aMm, L) {
    return m * (lambdaNm * 1e-9) * L / (aMm * 1e-3) * 1e3;
  }

  /** 중앙 밝은 무늬의 폭 (mm) — 첫 번째 어두운 무늬 사이의 거리 */
  function centralMaxWidth(lambdaNm, aMm, L) {
    return 2 * darkFringePosition(1, lambdaNm, aMm, L);
  }

  /* ══ 음파의 간섭 ═════════════════════════════════
   * 교과서 p.125 보강 간섭 / 상쇄 간섭을 소리로 직접 측정한다.
   * 두 스피커에서 나온 소리의 경로차에 따라 소리가 커지고 작아진다.
   */

  const DB_MAX = 78;      // 보강 간섭 지점에서의 소리 크기
  const DB_FLOOR = 1e-4;  // 상쇄 지점이 -∞ dB 가 되지 않도록 하는 하한

  /** 공기 중 음속 (m/s). 교과서 실험 조건은 실내온도 20 ℃ */
  function soundSpeed(tempC = 20) {
    return 331.5 + 0.6 * tempC;
  }

  /** 소리의 파장 (m) */
  function soundWavelength(freqHz, tempC = 20) {
    return soundSpeed(tempC) / freqHz;
  }

  /**
   * 두 스피커 사이의 경로차 (m).
   * 근사 없이 실제 거리로 계산하므로 측정기가 가까이 있어도 정확하다.
   * @param x  두 스피커의 중앙을 0 으로 하는 측정기의 좌우 위치 (m)
   * @param L  스피커에서 측정기까지의 앞뒤 거리 (m)
   * @param d  두 스피커 사이의 간격 (m)
   */
  function soundPathDifference(x, L, d) {
    const r1 = Math.hypot(x + d / 2, L);
    const r2 = Math.hypot(x - d / 2, L);
    return Math.abs(r1 - r2);
  }

  /** 두 음파가 중첩된 지점의 상대 세기 (0~1) */
  function soundIntensity(x, L, d, lambdaM) {
    const delta = soundPathDifference(x, L, d);
    return Math.pow(Math.cos(Math.PI * delta / lambdaM), 2);
  }

  /** 소음측정기가 가리키는 값 (dB) */
  function soundLevelDb(x, L, d, lambdaM) {
    const I = soundIntensity(x, L, d, lambdaM);
    return DB_MAX + 10 * Math.log10(Math.max(I, DB_FLOOR));
  }

  /** 보강/상쇄 판정. 경로차가 파장의 몇 배인지로 구분한다. */
  function soundCondition(x, L, d, lambdaM) {
    const n = soundPathDifference(x, L, d) / lambdaM;
    const frac = Math.abs(n - Math.round(n));
    if (frac < 0.12) return { type: 'con', n, label: '보강 간섭' };
    if (Math.abs(frac - 0.5) < 0.12) return { type: 'des', n, label: '상쇄 간섭' };
    return { type: 'mid', n, label: '중간' };
  }

  return {
    wavelengthToRGB,
    rgbToCss,
    fringeSpacing,
    intensity,
    pathDifference,
    halfWavelengthMultiple,
    diffractionIntensity,
    darkFringePosition,
    centralMaxWidth,
    soundSpeed,
    soundWavelength,
    soundPathDifference,
    soundIntensity,
    soundLevelDb,
    soundCondition,
    DB_MAX,
  };
})();
