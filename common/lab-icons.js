/** 실험도구 아이콘 (외부 이미지 없이 SVG 로 그린다) */
const LabIcons = {
  /* 역학 */
  cart: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="8" y="16" width="32" height="13" rx="2.5" fill="#f0a0b4"/>
    <circle cx="16" cy="33" r="4.5" fill="#39424f"/><circle cx="32" cy="33" r="4.5" fill="#39424f"/>
    <rect x="14" y="11" width="20" height="5" rx="1.5" fill="#c8d2de"/></svg>`,

  rail: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="3" y="20" width="42" height="9" rx="1.5" fill="#8e9bad"/>
    <path d="M3 24.5h42" stroke="#5b6675"/>
    <rect x="6" y="29" width="5" height="5" fill="#5b6675"/>
    <rect x="37" y="29" width="5" height="5" fill="#5b6675"/></svg>`,

  sensor: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="14" y="12" width="20" height="24" rx="2.5" fill="#e8eef6"/>
    <circle cx="24" cy="20" r="4.5" fill="#2f6ad0"/>
    <path d="M18 30h12" stroke="#8e9bad"/></svg>`,

  weight: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <path d="M13 20h22l3 20H10z" fill="#98a4b4"/>
    <path d="M20 20a4 4 0 018 0" fill="none"/></svg>`,

  ball: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <circle cx="24" cy="24" r="13" fill="#e0533f"/>
    <path d="M24 11c5 5 5 21 0 26M11 24h26" stroke="#a83421" stroke-width="1.4"/></svg>`,

  tower: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <path d="M16 42V8h4v34M28 42V8h4v34" fill="#c8d2de"/>
    <path d="M10 42h28"/></svg>`,

  stopwatch: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <circle cx="24" cy="27" r="13" fill="#eef3f9"/>
    <path d="M24 20v7l5 3M20 8h8M24 8v6"/></svg>`,

  /* 전기 */
  battery: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="7" y="17" width="30" height="15" rx="2" fill="#d9c07a"/>
    <rect x="37" y="21" width="5" height="7" rx="1" fill="#8e9bad"/>
    <path d="M14 24.5h6M17 21.5v6M27 24.5h6" stroke="#4a5a70" stroke-width="2.2"/></svg>`,

  resistor: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="10" y="18" width="28" height="13" rx="2" fill="#e8b96a"/>
    <path d="M17 18v13M23 18v13M29 18v13" stroke="#8a5a2b" stroke-width="2.4"/>
    <path d="M3 24.5h7M38 24.5h7"/></svg>`,

  bulb: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <circle cx="24" cy="20" r="10" fill="#ffe9a8"/>
    <path d="M19 20l3 4h4l3-4" fill="none" stroke="#c99a2e"/>
    <rect x="19" y="30" width="10" height="8" rx="1.5" fill="#98a4b4"/></svg>`,

  ammeter: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="7" y="12" width="34" height="24" rx="3" fill="#eef3f9"/>
    <rect x="12" y="16" width="24" height="9" rx="1.5" fill="#2b323c"/>
    <text x="24" y="33" font-size="9" font-weight="700" fill="#4a5a70" text-anchor="middle" stroke="none">A</text></svg>`,

  voltmeter: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="7" y="12" width="34" height="24" rx="3" fill="#eef3f9"/>
    <rect x="12" y="16" width="24" height="9" rx="1.5" fill="#2b323c"/>
    <text x="24" y="33" font-size="9" font-weight="700" fill="#4a5a70" text-anchor="middle" stroke="none">V</text></svg>`,

  wire: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <path d="M6 30c6-14 12 12 18-2s10 6 18-6" stroke="#d0453a" stroke-width="3"/></svg>`,

  switchSw: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="8" y="26" width="32" height="8" rx="2" fill="#c8d2de"/>
    <circle cx="14" cy="30" r="2.5" fill="#4a5a70"/><circle cx="34" cy="30" r="2.5" fill="#4a5a70"/>
    <path d="M14 30L33 18" stroke="#4a5a70" stroke-width="2.6"/></svg>`,

  /* 자기 */
  magnet: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="10" y="14" width="28" height="10" rx="1.5" fill="#d0453a"/>
    <rect x="10" y="24" width="28" height="10" rx="1.5" fill="#2f6ad0"/>
    <text x="24" y="22" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" stroke="none">N</text>
    <text x="24" y="32" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" stroke="none">S</text></svg>`,

  coil: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <path d="M12 16c0-3 24-3 24 0M12 22c0-3 24-3 24 0M12 28c0-3 24-3 24 0M12 34c0-3 24-3 24 0"
      stroke="#c07a2e" stroke-width="2.6"/>
    <path d="M6 30h6M36 18h6"/></svg>`,

  galvano: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="7" y="13" width="34" height="22" rx="3" fill="#eef3f9"/>
    <path d="M24 31V20M18 24l6-5 6 5" fill="none" stroke="#2f6ad0"/>
    <path d="M13 31h22" stroke="#8e9bad"/></svg>`,

  /* 광학 */
  bench: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="3" y="26" width="42" height="8" rx="1.5" fill="#8e9bad"/>
    <path d="M8 26v-3M18 26v-3M28 26v-3M38 26v-3" stroke="#5b6675" stroke-width="1.6"/></svg>`,

  led: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="8" y="19" width="20" height="11" rx="2" fill="#39424f"/>
    <circle cx="31" cy="24.5" r="5" fill="#ffe066"/>
    <path d="M38 24.5h6M36 19l4-3M36 30l4 3" stroke="#e0a800" stroke-width="1.8"/></svg>`,

  lensConvex: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <path d="M24 8c7 6 7 26 0 32-7-6-7-26 0-32z" fill="#a8d8f0" fill-opacity=".75"/>
    <path d="M24 40v5M18 45h12"/></svg>`,

  screenBoard: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="9" y="8" width="30" height="24" rx="2" fill="#f4f6f9"/>
    <path d="M24 32v7M17 39h14"/></svg>`,

  ruler: `<svg viewBox="0 0 48 48" fill="none" stroke="#4a5a70" stroke-width="2">
    <rect x="4" y="18" width="40" height="12" rx="2" fill="#f0e6c8"/>
    <path d="M10 18v6M16 18v4M22 18v6M28 18v4M34 18v6M40 18v4"/></svg>`,
};
