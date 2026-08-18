/**
 * 공용 학습 흐름 — 진단하기 · 확인하기 · 창의적으로 생각하기 · 보고서 · 나의 탐구 현황
 *
 * 축전기 서비스 센터에만 있던 흐름을 모든 시뮬레이션이 함께 쓰도록 일반화한 것.
 * 시뮬레이션마다 다른 내용은 content.js 의 LabContent.flow 에서 읽는다.
 *
 *   LabContent.flow = {
 *     subject : '축전기와 센서',                    // 보고서 제목에 쓰임
 *     diag   : [ { q, c:[…], a, cap, fig, svg } … ],// 선행 개념 진단 (보통 3문항)
 *     check  : [ { fb, img, exp } … ],              // quiz 문항별 오답 안내 (quiz 와 같은 길이)
 *     essay  : { q, ph, keys:[[이름, 정규식]…] },   // 확인하기 서술형 1문항
 *     creative: { q, src, ph },                     // 창의적으로 생각하기
 *     figs   : [ { key, cap } … ],                  // 핵심정리에 덧붙일 교과서 그림
 *     preFigs: [ { key, cap } … ],                  // 사전학습에 덧붙일 교과서 그림
 *   }
 *
 * 어느 항목도 없으면 그 부분만 조용히 건너뛴다 — 있는 만큼만 보여 준다.
 */
const LabFlow = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let F = {};          // LabContent.flow
  let DIAG = [];
  let CHECK = [];      // quiz + flow.check 합친 것

  const state = {
    diag: { pick: [], ok: [], retry: [] },
    quiz: { pick: [], essay: '' },
    creative: '',
    t0: Date.now(),
  };

  /* ── 교과서 그림 ─────────────────────────────────── */
  function thumb(key, cap) {
    const src = (typeof window !== 'undefined' && window.THUMB_DATA) ? window.THUMB_DATA[key] : null;
    return src ? `<figure class="fx-fig"><img src="${src}" alt="${esc(cap)}"><figcaption>${cap}</figcaption></figure>` : '';
  }
  const figs = (inner) => (inner ? `<div class="fx-figs">${inner}</div>` : '');
  const figList = (list) => figs((list || []).map((f) => thumb(f.key, f.cap)).join(''));

  function bar(label, val, max, extra = '') {
    const pct = max ? Math.max(0, Math.min(100, Math.round((val / max) * 100))) : 0;
    return `<div class="wl"><span class="wl-t">${label}</span>
      <div class="wl-bar"><i style="width:${pct}%"></i></div>
      <span class="wl-v">${val} / ${max}${extra}</span></div>`;
  }

  const diagDone = () => DIAG.length > 0 && state.diag.pick.every((p, i) => p !== null && (state.diag.ok[i] || state.diag.retry[i]));
  const checkDone = () => CHECK.length > 0 && state.quiz.pick.every((p) => p !== null);
  const quizScore = () => CHECK.filter((q, i) => state.quiz.pick[i] === q.answer).length;

  /* ── 모달 (셸의 학습 패널 모달을 함께 쓴다) ───────── */
  function openView(id) {
    const body = $('#panelBody');
    if (!body) return;
    if (id === 'diag') { body.innerHTML = renderDiag(); bindDiag(); }
    else if (id === 'check') { body.innerHTML = renderCheck(); bindCheck(); }
    else if (id === 'creative') { body.innerHTML = renderCreative(); bindCreative(); }
    $('#panelModal').classList.remove('hidden');
    body.scrollTop = 0;
  }
  function closeView() { $('#panelModal').classList.add('hidden'); paintBadges(); }

  /* ── ① 진단하기 ──────────────────────────────────── */
  function diagFig(Q) {
    if (Q.svg) return Q.svg;
    if (Q.fig) return figs(thumb(Q.fig, Q.figCap || '교과서 그림 다시 보기'));
    return '';
  }

  function renderDiag() {
    const d = state.diag;
    const n = DIAG.length;
    const idx = d.pick.findIndex((v, i) => !(v !== null && (d.ok[i] || d.retry[i])));
    const cur = idx === -1 ? n : idx;

    let block;
    if (cur === n) {
      const nOk = d.ok.filter(Boolean).length;
      block = `<div class="quiz-result o">
          진단을 마쳤습니다 — 맞힌 문항 <b>${nOk} / ${n}</b>.<br>
          ${nOk === n ? '선행 개념이 잘 잡혀 있어요. 바로 실험으로 가 봅시다.'
                      : '헷갈린 개념은 실험 화면에서 직접 확인할 수 있습니다.'}
        </div>
        <div class="quiz-actions">
          <button class="primary" id="fdStart">탐구 시작하기 →</button>
          <button id="fdRetryAll">진단 다시 하기</button>
        </div>`;
    } else {
      const Q = DIAG[cur];
      const picked = d.pick[cur];
      const showScene = picked !== null && !d.ok[cur] && !d.retry[cur];
      block = `
        <p class="src">진단 ${cur + 1} / ${n}${Q.topic ? ' · ' + Q.topic : ''}</p>
        <h3 style="margin-top:6px">${Q.q}</h3>
        <div id="fdOpts">${Q.c.map((c, j) =>
          `<button class="quiz-opt ${picked === j ? (d.ok[cur] ? 'right' : 'wrong') : ''}" data-fd="${j}"
             ${picked !== null && (d.ok[cur] || d.retry[cur]) ? 'disabled' : ''}>${j + 1}. ${c}</button>`).join('')}</div>
        ${showScene ? `<div class="quiz-result x">정답을 바로 알려 주지 않을게요. 아래 자료를 먼저 보고
            <b>한 번 더</b> 골라 보세요.<span id="fdCd" style="font-weight:800"></span></div>${diagFig(Q)}` : ''}
        ${d.ok[cur] ? `<div class="quiz-result o">맞았어요! ${Q.cap}</div>
          <div class="quiz-actions"><button class="primary" id="fdNext">다음 문항 →</button></div>` : ''}
        ${d.retry[cur] && !d.ok[cur] ? `<div class="quiz-result x">${Q.cap}<br>실험 화면에서 이 부분을 다시 확인해 봅시다.</div>
          <div class="quiz-actions"><button class="primary" id="fdNext">다음 문항 →</button></div>` : ''}`;
    }
    return `<h2>진단하기</h2>
      <p class="src">본 학습 전, 알고 있는 것을 확인합니다 — 틀려도 괜찮아요.</p>${block}`;
  }

  function bindDiag() {
    const d = state.diag;
    const idx = d.pick.findIndex((v, i) => !(v !== null && (d.ok[i] || d.retry[i])));
    const cur = idx === -1 ? DIAG.length : idx;
    const st = $('#fdStart');
    if (st) st.onclick = () => closeView();
    const ra = $('#fdRetryAll');
    if (ra) ra.onclick = () => { resetDiag(); openView('diag'); };
    const nx = $('#fdNext');
    if (nx) nx.onclick = () => openView('diag');
    $$('#fdOpts [data-fd]').forEach((el) => {
      el.onclick = () => {
        const j = +el.dataset.fd, Q = DIAG[cur];
        if (d.pick[cur] !== null) {           // 자료를 본 뒤 재도전
          d.retry[cur] = true;
          d.ok[cur] = (j === Q.a);
          d.pick[cur] = j;
          openView('diag');
          return;
        }
        d.pick[cur] = j;
        d.ok[cur] = (j === Q.a);
        if (d.ok[cur]) d.retry[cur] = true;
        openView('diag');
        if (!d.ok[cur]) {                     // 오답 — 자료를 5초 본 뒤 재선택
          $$('#fdOpts [data-fd]').forEach((b) => b.setAttribute('disabled', ''));
          let s = 5;
          const tick = () => {
            const cd = $('#fdCd');
            if (cd) cd.textContent = s > 0 ? ` (${s}초 뒤 다시 선택할 수 있어요)` : '';
          };
          tick();
          const t = setInterval(() => {
            s -= 1; tick();
            if (s <= 0) {
              clearInterval(t);
              $$('#fdOpts [data-fd]').forEach((b) => b.removeAttribute('disabled'));
            }
          }, 1000);
        }
      };
    });
  }

  function resetDiag() {
    state.diag = {
      pick: DIAG.map(() => null), ok: DIAG.map(() => false), retry: DIAG.map(() => false),
    };
  }

  /* ── ② 확인하기 (선택형 + 서술형) ─────────────────── */
  function renderCheck() {
    const q = state.quiz;
    const multi = $$('.top-tabs button').length > 1;
    const E = F.essay;
    return `<h2>확인하기</h2>
      <p class="src">형성평가 — 선택형 ${CHECK.length}문항${E ? ' + 서술형 1문항' : ''}.
         오답이어도 정답을 바로 알려 주지 않고, 다시 볼 곳을 안내합니다.</p>
      ${CHECK.map((Q, i) => `
        <h3>${i + 1}. ${Q.q}</h3>
        <div>${Q.opts.map((c, j) =>
          `<button class="quiz-opt ${q.pick[i] === j ? (j === Q.answer ? 'right' : 'wrong') : ''}"
             data-fq="${i}" data-fj="${j}">${j + 1}. ${c}</button>`).join('')}</div>
        ${q.pick[i] !== null && q.pick[i] !== Q.answer ? `<div class="quiz-result x">${Q.fb || '실험 화면으로 돌아가 다시 관찰해 보세요.'}
            ${Q.img ? figs(thumb(Q.img, '교과서 그림 다시 보기')) : ''}
            ${multi && Q.exp ? `<div class="quiz-actions" style="margin-top:8px">
              <button data-fgo="${Q.exp}">그 실험 화면으로 가기 →</button></div>` : ''}</div>` : ''}
        ${q.pick[i] === Q.answer ? `<div class="quiz-result o">맞았어요. ${Q.why}</div>` : ''}`).join('')}
      ${E ? `<h3>${CHECK.length + 1}. ${E.q}</h3>
        <textarea id="fqEssay" class="fx-ta" style="min-height:90px"
          placeholder="${esc(E.ph || '')}">${esc(q.essay)}</textarea>
        <p id="fqEssayFb" style="font-size:13px;margin-top:6px;color:#62718a"></p>` : ''}
      <div class="quiz-result ${quizScore() === CHECK.length ? 'o' : 'x'}" style="margin-top:10px">
        선택형 점수 <b>${quizScore()} / ${CHECK.length}</b>${E ? ' · 서술형은 점수화하지 않고 핵심어만 확인합니다.' : ''}</div>`;
  }

  function bindCheck() {
    $$('#panelBody [data-fq]').forEach((el) => {
      el.onclick = () => { state.quiz.pick[+el.dataset.fq] = +el.dataset.fj; openView('check'); };
    });
    $$('#panelBody [data-fgo]').forEach((el) => {
      el.onclick = () => {
        closeView();
        if (typeof Lab !== 'undefined' && Lab.switchExp) Lab.switchExp(el.dataset.fgo);
      };
    });
    const E = F.essay;
    const ta = $('#fqEssay');
    const fb = $('#fqEssayFb');
    if (!E || !ta || !fb) return;
    const keys = (E.keys || []).map(([label, re]) => [label, re instanceof RegExp ? re : new RegExp(re)]);
    const renderFb = () => {
      if (state.quiz.essay.length < 8 || !keys.length) { fb.innerHTML = ''; return; }
      const hits = keys.map((k) => k[1].test(state.quiz.essay));
      fb.innerHTML = '핵심어 확인 — ' + keys.map((k, i) =>
        `<b style="color:${hits[i] ? '#2f9e6b' : '#9aa7b8'}">${hits[i] ? '✓' : '○'} ${k[0]}</b>`).join(' · ') +
        (hits.every(Boolean) ? '<br>필요한 내용이 모두 들어 있어요. 잘 서술했습니다.'
          : '<br>빠진 것이 있다면 실험 화면을 다시 보고 덧붙여 볼까요? (통과·미통과를 표시하지 않습니다)');
    };
    ta.oninput = () => { state.quiz.essay = ta.value; renderFb(); };
    renderFb();
  }

  /* ── ③ 창의적으로 생각하기 ────────────────────────── */
  function renderCreative() {
    const C = F.creative || {};
    return `<h2>창의적으로 생각하기</h2>
      ${C.src ? `<p class="src">${C.src}</p>` : ''}
      <h3>${C.q || '오늘 배운 원리를 생활 속 어디에 활용할 수 있을까요?'}</h3>
      <textarea id="fcText" class="fx-ta" style="min-height:130px"
        placeholder="${esc(C.ph || '')}">${esc(state.creative)}</textarea>
      <p style="font-size:13px;color:#62718a;margin-top:6px">쓴 내용은 보고서 다운로드에 함께 담깁니다.</p>`;
  }
  function bindCreative() {
    const ta = $('#fcText');
    if (ta) ta.oninput = () => { state.creative = ta.value; };
  }

  /* ── ④ 나의 탐구 현황 — 핵심정리 패널 아래에 덧붙임 ── */
  function statusHTML() {
    const rep = (typeof Lab !== 'undefined' && Lab.missionReport) ? Lab.missionReport() : [];
    const dAns = state.diag.pick.filter((p) => p !== null).length;
    const qAns = state.quiz.pick.filter((p) => p !== null).length;
    const mBars = rep.filter((r) => r.total).map((r) =>
      bar(r.mission ? r.title : r.title + ' (수행)', r.done, r.total, r.done === r.total ? ' 🏅' : '')).join('');
    const left = rep.filter((r) => r.total && r.done < r.total);
    return `${(F.figs && F.figs.length) ? `<h3>교과서 그림 다시 보기</h3>${figList(F.figs)}` : ''}
      <h3>나의 탐구 현황</h3>
      ${DIAG.length ? bar('진단하기', dAns, DIAG.length, diagDone() ? ` · 정답 ${state.diag.ok.filter(Boolean).length}` : '') : ''}
      ${mBars}
      ${CHECK.length ? bar('확인하기', qAns, CHECK.length, checkDone() ? ` · 정답 ${quizScore()}` : '') : ''}
      ${bar('창의적으로 생각하기', state.creative.trim().length >= 10 ? 1 : 0, 1)}
      <p style="margin-top:10px">${left.length
        ? `아직 <b>${left.map((r) => r.title).join(' · ')}</b> 의 미션이 남아 있어요. 실험 화면으로 돌아가 이어서 해 보세요.`
        : '탐구 미션을 모두 마쳤습니다! <b>창의적으로 생각하기</b>와 <b>보고서 다운로드</b>로 정리해 보세요.'}</p>`;
  }

  /* ── ⑤ 활동 보고서 ───────────────────────────────── */
  function downloadReport() {
    const mins = Math.max(1, Math.round((Date.now() - state.t0) / 60000));
    const row = (a, b) => `<tr><th>${a}</th><td>${esc(String(b == null ? '' : b)) || '—'}</td></tr>`;
    const subject = F.subject || (typeof Lab !== 'undefined' && Lab.config ? Lab.config.title : '실험');
    const unit = (typeof Lab !== 'undefined' && Lab.config) ? Lab.config.unit : '';
    const rep = (typeof Lab !== 'undefined' && Lab.missionReport) ? Lab.missionReport() : [];
    const cols = (typeof Lab !== 'undefined' && Lab.getColumns) ? Lab.getColumns() : [];
    const recs = (typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : [];

    const missionTables = rep.filter((r) => r.total).map((r) => `
      <h2>탐구하기 — ${esc(r.title)} <span style="font-size:13px;color:#5a6c82">(${r.done} / ${r.total} 달성)</span></h2>
      <table><tr><th style="width:70px">달성</th><th>미션</th></tr>
      ${r.list.map((m) => `<tr><td style="text-align:center">${m.ok ? '○' : '—'}</td>
        <td>${esc(m.t)}${m.goal ? `<br><span style="color:#2f7fd6;font-size:13px">목표 · ${esc(m.goal)}</span>` : ''}</td></tr>`).join('')}
      </table>`).join('');

    const recTable = (cols.length && recs.length) ? `
      <h2>실험 결과 기록</h2>
      <table><tr>${cols.map((c) => `<th style="width:auto">${esc(c)}</th>`).join('')}</tr>
      ${recs.map((r) => `<tr>${r.map((v) => `<td>${esc(String(v))}</td>`).join('')}</tr>`).join('')}</table>` : '';

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${esc(subject)} — 활동 보고서</title><style>
body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#12233d;line-height:1.7}
h1{font-size:22px;border-bottom:3px solid #1a4fa0;padding-bottom:10px}
h2{font-size:17px;margin-top:28px;color:#1a4fa0;border-left:5px solid #1a4fa0;padding-left:9px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}
th,td{border:1px solid #c8d4e2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#eef4fb;width:200px;color:#1a4fa0}
.meta{font-size:13px;color:#5a6c82}
</style></head><body>
<h1>${esc(subject)} — 활동 보고서</h1>
<p class="meta">${esc(unit)} · 작성일 ${new Date().toLocaleDateString('ko-KR')}<br>
학교 __________ 학년 ____ 반 ____ 이름 __________</p>
<table>${row('총 학습 시간', '약 ' + mins + '분')}</table>

${DIAG.length ? `<h2>진단하기 (선행 개념)</h2>
<table>${DIAG.map((Q, i) => row('진단 ' + (i + 1) + (Q.topic ? ' · ' + Q.topic : ''),
      state.diag.pick[i] === null ? '미응답' : (state.diag.ok[i] ? '정답' : '오답 → 자료 확인 후 재도전'))).join('')}</table>` : ''}

${missionTables}
${recTable}

${CHECK.length ? `<h2>확인하기 (형성평가)</h2>
<table>${CHECK.map((Q, i) => row('문항 ' + (i + 1),
      state.quiz.pick[i] === null ? '미응답' : (state.quiz.pick[i] === Q.answer ? '정답' : '오답 → 실험 재확인 필요'))).join('')}
${F.essay ? row('서술형 · ' + F.essay.q, state.quiz.essay) : ''}</table>` : ''}

<h2>창의적으로 생각하기</h2>
<table>${row((F.creative && F.creative.q) || '나의 생각', state.creative)}</table>
</body></html>`;

    const blob = new Blob(['﻿' + html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${subject.replace(/[\\/:*?"<>|]/g, '')}_활동보고서_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof Lab !== 'undefined') Lab.showHint('활동 보고서를 내려받았습니다 — 인쇄에서 PDF로 저장할 수 있어요.', true);
  }

  /* ── 사이드바 ────────────────────────────────────── */
  const ICONS = {
    diag: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2"/>
      <path d="M9 4h6v3H9z" fill="#8a97a8" stroke="none"/>
      <path d="M8.5 14l2.5 2.5 4.5-5.5"/></svg>`,
    creative: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.7.5 1.1 1.3 1.1 2.1h4.6c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>
      <path d="M10 19h4M10.8 21.5h2.4"/></svg>`,
    report: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>
      <path d="M12 10v6M9.5 13.5L12 16l2.5-2.5"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/></svg>`,
  };

  function sbButton(id, label) {
    const b = document.createElement('button');
    b.className = 'sb-flow';
    b.dataset.flow = id;
    b.title = label;
    b.innerHTML = `${ICONS[id]}<span class="sb-label">${label}</span><span class="sb-done hidden">✓</span>`;
    return b;
  }

  function paintBadges() {
    const set = (id, done) => {
      const b = $(`.sidebar [data-flow="${id}"] .sb-done`);
      if (b) b.classList.toggle('hidden', !done);
    };
    set('diag', diagDone());
    set('check', checkDone());
    set('creative', state.creative.trim().length >= 10);
  }

  function injectSidebar() {
    const sb = $('.sidebar');
    if (!sb) return;

    if (DIAG.length) {
      const bDiag = sbButton('diag', '진단하기');
      bDiag.addEventListener('click', () => openView('diag'));
      sb.querySelector('[data-panel="pre"]').after(bDiag);
    }

    // 퀴즈 → 확인하기 (셸이 그린 뒤 우리 내용으로 덮어쓴다)
    const bQuiz = sb.querySelector('[data-panel="quiz"]');
    if (bQuiz && CHECK.length) {
      bQuiz.classList.add('sb-flow');
      bQuiz.dataset.flow = 'check';
      bQuiz.title = '확인하기';
      bQuiz.innerHTML = `${ICONS.check}<span class="sb-label">확인하기</span><span class="sb-done hidden">✓</span>`;
      bQuiz.addEventListener('click', () => openView('check'));
    }

    const anchor = bQuiz || sb.querySelector('[data-panel="summary"]');
    const bCre = sbButton('creative', '창의');
    bCre.addEventListener('click', () => openView('creative'));
    anchor.after(bCre);
    const bRep = sbButton('report', '보고서');
    bRep.addEventListener('click', downloadReport);
    bCre.after(bRep);

    // 핵심정리 아래에 «나의 탐구 현황» 덧붙이기
    sb.querySelector('[data-panel="summary"]').addEventListener('click', () => {
      const body = $('#panelBody');
      if (body) body.insertAdjacentHTML('beforeend', statusHTML());
    });

    // 사전학습 아래에 교과서 그림 덧붙이기
    if (F.preFigs && F.preFigs.length) {
      sb.querySelector('[data-panel="pre"]').addEventListener('click', () => {
        const body = $('#panelBody');
        if (body) body.insertAdjacentHTML('beforeend',
          `<h3>교과서 그림 미리 보기</h3>${figList(F.preFigs)}`);
      });
    }

    $('#panelClose').addEventListener('click', paintBadges);
  }

  function init() {
    if (!$('.sidebar') || typeof LabContent === 'undefined') return;
    F = LabContent.flow || {};
    DIAG = F.diag || [];
    const meta = F.check || [];
    CHECK = (LabContent.quiz || []).map((q, i) => ({ ...q, ...(meta[i] || {}) }));
    resetDiag();
    state.quiz.pick = CHECK.map(() => null);
    injectSidebar();
    paintBadges();
  }

  return { init, openView, state, downloadReport, statusHTML };
})();

LabFlow.init();
