
// PromptQM — prompt-qm

const extensionName   = 'Ptest';
const GLOBAL_DUMMY_ID = 100001;
const TG_KEY          = extensionName;

let getRequestHeaders, openai_setting_names, openai_settings,
    extension_settings, saveSettingsDebounced, oai_settings,
    eventSource, event_types, setupChatCompletionPromptManager,
    callGenericPopup, POPUP_TYPE;

async function initImports() {
    const scriptPath   = import.meta.url;
    const isThirdParty = scriptPath.includes('/third-party/');
    const base  = isThirdParty ? '../../../../' : '../../../';
    const base2 = isThirdParty ? '../../../'    : '../../';

    const sm = await import(base + 'script.js');
    getRequestHeaders     = sm.getRequestHeaders;
    saveSettingsDebounced = sm.saveSettingsDebounced;
    eventSource           = sm.eventSource;
    event_types           = sm.event_types;

    const om = await import(base2 + 'openai.js');
    openai_setting_names             = om.openai_setting_names;
    openai_settings                  = om.openai_settings;
    oai_settings                     = om.oai_settings;
    setupChatCompletionPromptManager = om.setupChatCompletionPromptManager;

    const em = await import(base2 + 'extensions.js');
    extension_settings = em.extension_settings;

    const pm = await import(base2 + 'popup.js');
    callGenericPopup = pm.callGenericPopup;
    POPUP_TYPE       = pm.POPUP_TYPE;
}

// ══════════════════════════════════════════
// A. Toggle Group Data (3-state system)
// ══════════════════════════════════════════

const collapsedGroups = new Set();
let groupReorderMode  = false;
let toggleReorderMode = null;

function getTGStore() {
    if (!extension_settings[TG_KEY]) extension_settings[TG_KEY] = { presets: {} };
    return extension_settings[TG_KEY];
}
function getGroupsForPreset(pn) {
    const s = getTGStore();
    if (!s.presets[pn]) s.presets[pn] = [];
    return s.presets[pn];
}
function saveGroups(pn, groups) {
    getTGStore().presets[pn] = groups;
    saveSettingsDebounced();
}
function getCurrentPreset() {
    return oai_settings?.preset_settings_openai || '';
}

// ══════════════════════════════════════════
// THEMES — ppc-popup / ppc-sub
// ══════════════════════════════════════════

const PPC_THEMES = {
    dark: {
        label: '🖤', title: '다크',
        popup: { upper:'#23233a', lower:'#1a1a2e', text:'#dcdaf0', shadow:'0 6px 24px rgba(0,0,0,0.6)' },
        sub:   { bg:'#23233a', text:'#dcdaf0' },
        rowBorder:'rgba(255,255,255,0.08)',
    },
    white: {
        label: '🤍', title: '화이트',
        popup: { upper:'#ffffff', lower:'#f2f2f2', text:'#222222', shadow:'0 4px 18px rgba(0,0,0,0.10)' },
        sub:   { bg:'#ffffff', text:'#222222' },
        rowBorder:'rgba(0,0,0,0.07)',
    },
    classic: {
        label: '🤎', title: '클래식',
        popup: { upper:'#f5f0e8', lower:'#ede7db', text:'#2a2520', shadow:'0 4px 18px rgba(0,0,0,0.15)' },
        sub:   { bg:'#f5f0e8', text:'#2a2520' },
        rowBorder:'rgba(0,0,0,0.07)',
    },
    pink: {
        label: '🩷', title: '핑크',
        popup: { upper:'#fff7fa', lower:'#fdedf4', text:'#3c1830', shadow:'0 4px 18px rgba(200,70,110,0.09)' },
        sub:   { bg:'#fff7fa', text:'#3c1830' },
        rowBorder:'rgba(200,70,110,0.1)',
    },
    green: {
        label: '💚', title: '그린',
        popup: { upper:'#f4fbf6', lower:'#e4f5ea', text:'#1a3022', shadow:'0 4px 18px rgba(40,140,70,0.10)' },
        sub:   { bg:'#f4fbf6', text:'#1a3022' },
        rowBorder:'rgba(40,140,70,0.1)',
    },
    sky: {
        label: '🩵', title: '스카이',
        popup: { upper:'#f8feff', lower:'#edf9ff', text:'#143450', shadow:'0 4px 18px rgba(40,120,200,0.10)' },
        sub:   { bg:'#f8feff', text:'#143450' },
        rowBorder:'rgba(40,120,200,0.1)',
    },
    lavender: {
        label: '💜', title: '라벤더',
        popup: { upper:'#f8f5ff', lower:'#ede8f8', text:'#2c2448', shadow:'0 4px 18px rgba(120,90,200,0.14)' },
        sub:   { bg:'#f8f5ff', text:'#2c2448' },
        rowBorder:'rgba(120,90,200,0.1)',
    },
};
// Unified On/Off colors across all themes
const PPC_ON_BG  = '#5abf82', PPC_ON_CLR  = '#fff';
const PPC_OFF_BG = '#bf5a5a', PPC_OFF_CLR = '#fff';

function getPpcTheme() {
    return getTGStore().ppcTheme || 'classic';
}
function setPpcTheme(key) {
    getTGStore().ppcTheme = key;
    saveSettingsDebounced();
    applyPpcTheme();
}

// ── PPC button ON/OFF setting ─────────────────────────────────────────────────
function getPpcEnabled() {
    return getTGStore().ppcEnabled ?? true;
}
function setPpcEnabled(val) {
    getTGStore().ppcEnabled = val;
    saveSettingsDebounced();
    updatePpcBtnVisibility();
}
function updatePpcBtnVisibility() {
    const enabled = getPpcEnabled();
    const btn = document.getElementById('ppc-btn');
    if (btn) btn.style.display = enabled ? '' : 'none';
    const tglBtn = document.getElementById('ptm-ppc-enable-btn');
    if (tglBtn) {
        tglBtn.textContent = enabled ? '🔌 ON' : '🔌OFF';
        tglBtn.style.background = enabled ? PPC_ON_BG  : PPC_OFF_BG;
        tglBtn.style.color      = enabled ? PPC_ON_CLR : PPC_OFF_CLR;
    }
}
function applyPpcTheme() {
    const key = getPpcTheme();
    const t = PPC_THEMES[key] || PPC_THEMES.classic;
    const popup = document.getElementById('ppc-popup');
    if (popup) {
        popup.style.border    = 'none';
        popup.style.color     = t.popup.text;
        popup.style.boxShadow = t.popup.shadow;
        const upper = popup.querySelector('#ppc-upper');
        const lower = popup.querySelector('#ppc-lower');
        if (upper) upper.style.background = t.popup.upper;
        if (lower) lower.style.background = t.popup.lower;
    }
    const sub = document.getElementById('ppc-sub');
    if (sub) {
        sub.style.background = t.sub.bg;
        sub.style.border     = 'none';
        sub.style.color      = t.sub.text;
    }
    const popup2 = document.getElementById('ppc-popup');
    const bar = popup2 ? popup2.querySelector('#ppc-theme-bar') : null;
    if (bar) {
        bar.style.background = t.popup.lower;
        bar.querySelectorAll('.ppc-theme-btn').forEach(btn => {
            const active = btn.dataset.theme === key;
            btn.style.background = active ? 'rgba(128,128,128,0.18)' : 'none';
            btn.style.transform  = active ? 'scale(1.18)' : 'scale(1)';
            btn.style.opacity    = active ? '1' : '0.45';
        });
    }
}

// ══════════════════════════════════════════
// B. Apply group (3-state logic)
// ══════════════════════════════════════════

function applyGroup(pn, gi) {
    const groups = getGroupsForPreset(pn);
    const g      = groups[gi];
    if (!g) return;
    try {
        const pm = setupChatCompletionPromptManager(oai_settings);
        for (const t of g.toggles) {
            const entry = pm.getPromptOrderEntry(pm.activeCharacter, t.target);
            if (!entry) continue;
            const ovr = t.override ?? null;
            
            // 3-state logic
            if (ovr !== null) {
                // 고정 override: 그룹 상태 무관
                entry.enabled = ovr;
            } else if (g.state === 'neutral') {
                // 중립: 건드리지 않음 (현재 PT 상태 유지)
                continue;
            } else {
                // on/off: behavior에 따라 적용
                const isDirect = t.behavior === 'direct';
                entry.enabled = isDirect ? (g.state === 'on') : (g.state !== 'on');
            }
            
            if (pm.tokenHandler?.getCounts) {
                const counts = pm.tokenHandler.getCounts();
                counts[t.target] = null;
            }
        }
        pm.render();
        pm.saveServiceSettings();
    } catch (e) {
        console.warn('[PTM] applyGroup error', e);
    }
}

// ══════════════════════════════════════════
// C. Toggle Group UI (3-state + PT state reading)
// ══════════════════════════════════════════

function renderTGGroups() {
    const area = document.getElementById('ptm-tg-area');
    if (!area) return;
    const pn = getCurrentPreset();
    if (!pn) { area.innerHTML = '프리셋이 선택되지 않았습니다'; return; }

    // PM 호출 1회로 validIds, allPrompts, ptStateMap 모두 추출
    let validIds, allPrompts, ptStateMap;
    try {
        const pm = setupChatCompletionPromptManager(oai_settings);
        const order = (pm.serviceSettings?.prompt_order || [])
            .find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
        validIds   = new Set((order?.order || []).map(e => e.identifier));
        allPrompts = pm.serviceSettings?.prompts || [];
        ptStateMap = new Map((order?.order || []).map(e => [e.identifier, e.enabled]));
    } catch(e) {
        const livePreset = getLivePresetData(pn) || openai_settings[openai_setting_names[pn]];
        const order = (livePreset?.prompt_order || [])
            .find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
        validIds   = new Set((order?.order || []).map(e => e.identifier));
        allPrompts = livePreset?.prompts || [];
        ptStateMap = new Map((order?.order || []).map(e => [e.identifier, e.enabled]));
    }

    const allPromptIds = new Set(allPrompts.map(p => p.identifier));
    const groups = getGroupsForPreset(pn);

    // 표시용 복사본으로만 필터링 (원본 mutate 방지)
    const displayGroups = allPrompts.length > 0
        ? groups.map(g => ({ ...g, toggles: g.toggles.filter(t => allPromptIds.has(t.target)) }))
        : groups;

    // 실제 저장은 진짜로 없어진 토글이 있을 때만
    if (allPrompts.length > 0) {
        let changed = false;
        groups.forEach((g, i) => {
            const before = g.toggles.length;
            g.toggles = g.toggles.filter(t => allPromptIds.has(t.target));
            if (g.toggles.length !== before) changed = true;
        });
        if (changed) saveGroups(pn, groups);
    }

    if (!displayGroups.length) { area.innerHTML = '그룹이 없습니다'; return; }
    area.innerHTML = displayGroups.map((g, gi) => buildGroupCard(g, gi, pn, allPrompts, ptStateMap)).join('');
    wireGroupCards(area);
}

function buildGroupCard(g, gi, pn, allPrompts, ptStateMap) {
    const inToggleReorder = toggleReorderMode === gi;

    const rows = g.toggles.map((t, ti) => {
        const name     = allPrompts.find(p => p.identifier === t.target)?.name ?? '';
        const isDirect = t.behavior === 'direct';
        const ovr      = t.override ?? null;

        // effectiveOn 계산 (3-state + PT 상태 읽기)
        let effectiveOn;
        if (ovr !== null) {
            effectiveOn = ovr;
        } else if (g.state === 'neutral') {
            effectiveOn = ptStateMap.get(t.target) ?? false;
        } else {
            effectiveOn = isDirect ? (g.state === 'on') : (g.state !== 'on');
        }

        let ovrLabel, ovrCls;
        if (ovr === null)      { ovrLabel = '—'; ovrCls = 'ptm-tovr-lock'; }
        else if (ovr === true) { ovrLabel = 'On';  ovrCls = 'ptm-tovr-on';  }
        else                   { ovrLabel = 'Off'; ovrCls = 'ptm-tovr-off'; }

        return `
       
            ${inToggleReorder
                ? `⠿`
                : `${effectiveOn ? 'On' : 'Off'}`}
           ${ovrLabel}
           ${name}
            ${!inToggleReorder ? `${isDirect ? '동일' : '반전'}` : ''}
           ✕
       `;
    }).join('');

    const collapseKey = `${pn}__${gi}`;
    const isCollapsed = collapsedGroups.has(collapseKey);
    const toggleCount = g.toggles.length;
    const groups      = getGroupsForPreset(pn);
    const isFirst     = gi === 0;
    const isLast      = gi === groups.length - 1;

    // 3-state 버튼 스타일
    let stateBg, stateClr, stateLabel;
    if (g.state === 'on') {
        stateBg = PPC_ON_BG; stateClr = PPC_ON_CLR; stateLabel = 'On';
    } else if (g.state === 'off') {
        stateBg = PPC_OFF_BG; stateClr = PPC_OFF_CLR; stateLabel = 'Off';
    } else {
        stateBg = 'rgba(150,150,150,0.3)'; stateClr = '#999'; stateLabel = '—';
    }

    return `

            ${groupReorderMode ? `
               ▲
               ▼
            ` : `${stateLabel}`}
           ${g.name}(${toggleCount})
           
                ${!groupReorderMode && !inToggleReorder && !isCollapsed ? `✏️` : ''}
                ${!groupReorderMode && !inToggleReorder && !isCollapsed ? `⠿` : ''}
                ${!groupReorderMode && !inToggleReorder && !isCollapsed ? `📋` : ''}
                ${!groupReorderMode && !inToggleReorder ? `📌` : ''}
                ${!groupReorderMode && !inToggleReorder ? `✕` : ''}
                ${inToggleReorder ? `✓` : ''}
               ${isCollapsed ? '▸' : '▾'}

            ${rows || '토글 없음'}
       
        ${!groupReorderMode ? `+ 토글 추가` : ''}
   `;
}

function wireGroupCards(area) {
    area.querySelectorAll('.ptm-grp-up').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        if (gi === 0) return;
        [gs[gi-1], gs[gi]] = [gs[gi], gs[gi-1]];
        saveGroups(pn, gs); renderTGGroups();
    }));
    area.querySelectorAll('.ptm-grp-dn').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        if (gi >= gs.length - 1) return;
        [gs[gi], gs[gi+1]] = [gs[gi+1], gs[gi]];
        saveGroups(pn, gs); renderTGGroups();
    }));

    // 3-state 버튼: neutral → on → off → neutral
    area.querySelectorAll('.ptm-onoff').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        const cur = gs[gi].state;
        gs[gi].state = cur === 'neutral' ? 'on' : cur === 'on' ? 'off' : 'neutral';
        applyGroup(pn, gi);
        saveGroups(pn, gs);
        renderTGGroups();
        refreshPpcPopup();
        const sub = document.getElementById('ppc-sub');
        if (sub && sub.style.display !== 'none' && ppcSubGi === gi) {
            sub.innerHTML = buildPpcSubHtml(gi);
            wirePpcSub(sub, gi);
            requestAnimationFrame(() => positionPpcSub(sub));
        }
    }));

    area.querySelectorAll('.ptm-reorder-grp-btn').forEach(btn => btn.addEventListener('click', () => {
        toggleReorderMode = +btn.dataset.gi;
        renderTGGroups();
    }));
    area.querySelectorAll('.ptm-toggle-reorder-done').forEach(btn => btn.addEventListener('click', () => {
        toggleReorderMode = null;
        renderTGGroups();
    }));
    area.querySelectorAll('.ptm-collapse-grp').forEach(btn => btn.addEventListener('click', () => {
        const cpkey = btn.dataset.cpkey;
        if (collapsedGroups.has(cpkey)) collapsedGroups.delete(cpkey);
        else collapsedGroups.add(cpkey);
        renderTGGroups();
    }));

    area.querySelectorAll('.ptm-tovr').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, ti = +btn.dataset.ti, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        const cur = gs[gi].toggles[ti].override ?? null;
        gs[gi].toggles[ti].override = cur === null ? true : cur === true ? false : null;
        applyGroup(pn, gi);
        saveGroups(pn, gs);
        renderTGGroups();
    }));

    area.querySelectorAll('.ptm-ren-grp').forEach(btn => btn.addEventListener('click', async () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        const n = await callGenericPopup('그룹 이름 변경:', POPUP_TYPE.INPUT, gs[gi].name);
        if (!n?.trim()) return;
        gs[gi].name = n.trim(); saveGroups(pn, gs); renderTGGroups(); refreshPpcPopup();
    }));

    area.querySelectorAll('.ptm-del-grp').forEach(btn => btn.addEventListener('click', async () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        const ok = await callGenericPopup(`"${gs[gi].name}" 그룹을 삭제할까요?`, POPUP_TYPE.CONFIRM);
        if (!ok) return;
        gs.splice(gi, 1); saveGroups(pn, gs); renderTGGroups(); refreshPpcPopup();
    }));

    // behavior 변경 시 applyGroup 추가 (2번 문제 수정)
    area.querySelectorAll('.ptm-bsel').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, ti = +btn.dataset.ti, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        gs[gi].toggles[ti].behavior = gs[gi].toggles[ti].behavior === 'direct' ? 'invert' : 'direct';
        applyGroup(pn, gi);
        saveGroups(pn, gs);
        renderTGGroups();
    }));

    area.querySelectorAll('.ptm-del-toggle').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, ti = +btn.dataset.ti, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        gs[gi].toggles.splice(ti, 1); saveGroups(pn, gs); renderTGGroups();
    }));

    area.querySelectorAll('.ptm-add-toggle').forEach(btn => btn.addEventListener('click', () => {
        showAddToggleModal(+btn.dataset.gi);
    }));

    area.querySelectorAll('.ptm-copy-grp').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        copyGroupToPreset(+btn.dataset.gi);
    }));

    area.querySelectorAll('button.ptm-popup-pin').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const gi = +btn.dataset.gi, pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
        gs[gi].showInPopup = !gs[gi].showInPopup;
        saveGroups(pn, gs);
        refreshPpcPopup();
        renderTGGroups();
    }));
}

// ── Copy group to another preset ─────────────────────────────────────────────
async function copyGroupToPreset(gi) {
    const pn = getCurrentPreset();
    const gs = getGroupsForPreset(pn);
    const sourceGroup = gs[gi];
    if (!sourceGroup) return;

    const srcPreset = getLivePresetData(pn);
    const srcPrompts = srcPreset?.prompts || [];
    const idToName = new Map(srcPrompts.map(p => [p.identifier, p.name ?? '']));

    const presetOpts = Object.keys(openai_setting_names)
        .filter(n => n !== pn && openai_settings[openai_setting_names[n]])
        .map(n => `${escapeHtml(n)}`)
        .join('');
    if (!presetOpts) { toastr.warning('복사할 다른 프리셋이 없습니다'); return; }

    let selectedDst = Object.keys(openai_setting_names)
        .find(n => n !== pn && openai_settings[openai_setting_names[n]]) || '';

    const html = `
       
           그룹을 붙여넣을 프롬프트:
           
                ${presetOpts}

            토글 ${sourceGroup.toggles.length}개 · 이름이 일치하는 프롬프트에 자동 연결됩니다
       `;

    const observer = new MutationObserver(() => {
        const sel = document.getElementById('ptm-cg-dst');
        if (sel && !sel._ptmWired) {
            sel._ptmWired = true;
            selectedDst = sel.value;
            sel.addEventListener('change', () => { selectedDst = sel.value; });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const ok = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: '복사', cancelButton: '취소' });
    observer.disconnect();
    if (!ok) return;

    const dstPresetName = selectedDst;
    if (!dstPresetName) return;

    const dstPreset = getLivePresetData(dstPresetName);
    if (!dstPreset) { toastr.error('대상 프리셋을 불러올 수 없습니다'); return; }

    const dstPrompts = dstPreset.prompts || [];
    const nameToId = new Map(dstPrompts.map(p => [p.name ?? '', p.identifier]));

    const matched = [], unmatched = [];
    for (const t of sourceGroup.toggles) {
        const name  = idToName.get(t.target) ?? '';
        const dstId = nameToId.get(name);
        if (dstId) {
            matched.push({ target: dstId, behavior: t.behavior, override: t.override });
        } else {
            unmatched.push(name || t.target);
        }
    }

    if (matched.length === 0) {
        toastr.error('대상 프롬프트에 이름이 일치하는 토글이 없습니다');
        return;
    }

    const dstGroups   = getGroupsForPreset(dstPresetName);
    const existingIdx = dstGroups.findIndex(g => g.name === sourceGroup.name);
    let finalName     = sourceGroup.name;
    let shouldOverwrite = false;

    if (existingIdx >= 0) {
        const choice = await callGenericPopup(
            `"${sourceGroup.name}" 그룹이 이미 존재합니다. 어떻게 할까요?`,
            POPUP_TYPE.CONFIRM, '',
            { okButton: '덮어쓰기', cancelButton: '새로 만들기' }
        );
        if (choice === null) return;
        if (choice) {
            shouldOverwrite = true;
        } else {
            let c = 2;
            while (dstGroups.some(g => g.name === `${sourceGroup.name} (${c})`)) c++;
            finalName = `${sourceGroup.name} (${c})`;
        }
    }

    const newGroup = {
        name:        finalName,
        state:       'neutral',  // 복사된 그룹도 neutral로 시작
        showInPopup: sourceGroup.showInPopup ?? false,
        toggles:     matched,
    };

    if (shouldOverwrite) {
        dstGroups[existingIdx] = newGroup;
    } else {
        dstGroups.push(newGroup);
    }
    saveGroups(dstPresetName, dstGroups);

    if (dstPresetName === pn) { renderTGGroups(); refreshPpcPopup(); }

    if (unmatched.length > 0) {
        const preview = unmatched.slice(0, 3).join(', ') + (unmatched.length > 3 ? ` 외 ${unmatched.length - 3}개` : '');
        toastr.warning(
            `"${finalName}" 복사 완료 — ${matched.length}개 연결, ${unmatched.length}개 미일치 스킵\n(${preview})`,
            '', { timeOut: 6000 }
        );
    } else {
        toastr.success(`"${finalName}" 그룹이 [${dstPresetName}]에 복사됐습니다 (${matched.length}개 연결)`);
    }
}

// ── Add toggle modal ──────────────────────────────────────────────────────────
async function showAddToggleModal(gi) {
    const pn = getCurrentPreset();
    let preset;
    try {
        preset = setupChatCompletionPromptManager(oai_settings).serviceSettings;
    } catch(e) {
        preset = getLivePresetData(pn) || openai_settings[openai_setting_names[pn]];
    }
    if (!preset) return;

    const gs = getGroupsForPreset(pn), exists = new Set(gs[gi].toggles.map(t => t.target));
    const prompts = [...(preset.prompts || [])].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', 'ko'));
    const selectedMap = new Map();

    const listHtml = prompts.map((p, idx) => {
        const ex = exists.has(p.identifier);
        return `
           
           ${p.name ?? ''}
            ${ex ? '추가됨' : ''}
       `;
    }).join('');

    const html = `
       
           전체
           해제
           연속
       
       ${listHtml}`;

    const observer = new MutationObserver(() => {
        document.querySelectorAll('.ptm-add-cb:not(:disabled)').forEach(cb => {
            if (cb._ptmWired) return;
            cb._ptmWired = true;
            cb.addEventListener('change', () => {
                if (cb.checked) selectedMap.set(+cb.dataset.i, cb.dataset.id);
                else selectedMap.delete(+cb.dataset.i);
            });
        });
        const mallBtn = document.getElementById('ptm-mall');
        if (mallBtn && !mallBtn._ptmWired) {
            mallBtn._ptmWired = true;
            mallBtn.addEventListener('click', () => {
                document.querySelectorAll('.ptm-add-cb:not(:disabled)').forEach(cb => {
                    cb.checked = true; selectedMap.set(+cb.dataset.i, cb.dataset.id);
                });
            });
        }
        const mnoneBtn = document.getElementById('ptm-mnone');
        if (mnoneBtn && !mnoneBtn._ptmWired) {
            mnoneBtn._ptmWired = true;
            mnoneBtn.addEventListener('click', () => {
                document.querySelectorAll('.ptm-add-cb:not(:disabled)').forEach(cb => {
                    cb.checked = false; selectedMap.delete(+cb.dataset.i);
                });
            });
        }
        const mrangeBtn = document.getElementById('ptm-mrange');
        if (mrangeBtn && !mrangeBtn._ptmWired) {
            mrangeBtn._ptmWired = true;
            mrangeBtn.addEventListener('click', () => {
                if (selectedMap.size a - b);
                const mn = idxs[0], mx = idxs[idxs.length - 1];
                document.querySelectorAll('.ptm-add-cb:not(:disabled)').forEach(cb => {
                    const i = +cb.dataset.i;
                    if (i >= mn && i gs2[gi].toggles.push({ target: id, behavior: 'direct', override: null }));
    saveGroups(pn, gs2); renderTGGroups();
    toastr.success(`${selectedMap.size}개 추가됨`);
}

// ══════════════════════════════════════════
// D. Mover helpers
// ══════════════════════════════════════════

let sourcePresetName = '', targetPresetName = '', sourceOrderedPrompts = [],
    targetOrderedPrompts = [], selectedSourceIndices = new Set(), insertPosition = -1;

function getPromptOrder(preset) {
    if (!preset?.prompt_order) return [];
    return preset.prompt_order.find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID))?.order || [];
}
function getOrderedPrompts(preset) {
    const prompts = preset?.prompts || [];
    const order   = getPromptOrder(preset);
    const inOrder = new Set(order.map(e => e.identifier));

    const ordered = order
        .map(e => {
            const def = prompts.find(p => p.identifier === e.identifier);
            if (!def) return null;
            return { identifier: e.identifier, enabled: e.enabled, prompt: def };
        })
        .filter(Boolean);

    return ordered;
}
function getLivePresetData(presetName) {
    if (!presetName) return null;
    if (presetName === getCurrentPreset()) return oai_settings;
    return openai_settings[openai_setting_names[presetName]];
}
async function savePreset(name, preset) {
    const r = await fetch('/api/presets/save', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ apiId: 'openai', name, preset }) });
    if (!r.ok) throw new Error('프리셋 저장 실패');
    return r.json();
}
function getPresetOptions() {
    if (!openai_settings || !openai_setting_names) return '-- 프리셋 없음 --';
    return '-- 선택 --'
        + Object.keys(openai_setting_names).filter(n => openai_settings[openai_setting_names[n]])
            .map(n => `${n}`).join('');
}

// ══════════════════════════════════════════
// E. Build drawers
// ══════════════════════════════════════════

function buildMoverDrawer() {
    const presets = getPresetOptions();
    const el = document.createElement('div');
    el.id = 'ptm-mover-drawer';
    el.innerHTML = `

           토글 복사/이동

               ① 출발 프리셋
               ${presets}

                   ② 이동할 항목
                   
                       전체
                       해제
                       연속

               출발 프리셋을 선택하세요

               ③ 도착 프리셋
               ${presets}

               ④ 삽입 위치 (+ 클릭)
               도착 프리셋을 선택하세요

                   복사/이동 후 토글 그룹으로 묶기

           항목과 위치를 선택하면 버튼이 활성화됩니다
           
               복사
               이동

   `;
    return el;
}

function buildTGDrawer() {
    const el = document.createElement('div');
    el.id = 'ptm-tg-drawer';
    el.innerHTML = `

           토글 그룹 관리

                    🔌 ON
               
               🤖📋 팝업
           
           로딩 중...
           
               + 그룹 추가
               ⠿

   `;
    return el;
}

// ══════════════════════════════════════════
// F. Render mover
// ══════════════════════════════════════════

function renderSrcList() {
    if (sourcePresetName) sourceOrderedPrompts = getOrderedPrompts(getLivePresetData(sourcePresetName));
    const el = document.getElementById('ptm-src-list'); if (!el) return;
    if (!sourceOrderedPrompts.length) { el.innerHTML = '프롬프트 없음'; return; }
    el.innerHTML = sourceOrderedPrompts.map((e, i) => {
        const name = e.prompt.name ?? '', chk = selectedSourceIndices.has(i);
        return `
           #${i + 1}
           ${e.prompt.marker ? '[고정] ' : ''}${name}`;
    }).join('');
    el.querySelectorAll('.ptm-chk').forEach(cb => cb.addEventListener('change', ev => {
        const i = +ev.target.dataset.i;
        if (ev.target.checked) { selectedSourceIndices.add(i); ev.target.closest('.ptm-item').classList.add('ptm-chked'); }
        else { selectedSourceIndices.delete(i); ev.target.closest('.ptm-item').classList.remove('ptm-chked'); }
        updateButtons();
    }));
}

function renderDstList() {
    if (targetPresetName) targetOrderedPrompts = getOrderedPrompts(getLivePresetData(targetPresetName));
    const el = document.getElementById('ptm-dst-list'); if (!el) return;
    const slot = i => `+`;
    if (!targetOrderedPrompts.length) {
        el.innerHTML = slot(0);
        el.querySelector('.ptm-slot').addEventListener('click', () => selectSlot(0));
        return;
    }
    el.innerHTML = slot(0) + targetOrderedPrompts.map((e, i) => {
        const name = e.prompt.name ?? '';
        return `#${i + 1}
           ${e.prompt.marker ? '[고정] ' : ''}${name}${slot(i + 1)}`;
    }).join('');
    el.querySelectorAll('.ptm-slot').forEach(s => s.addEventListener('click', () => selectSlot(+s.dataset.slot)));
}

function selectSlot(s) { insertPosition = s; renderDstList(); updateButtons(); }

function updateButtons() {
    const n = selectedSourceIndices.size, ok = sourcePresetName && targetPresetName && n > 0 && insertPosition >= 0;
    document.getElementById('ptm-copy').disabled = !ok;
    document.getElementById('ptm-move').disabled = !ok;
    const info = document.getElementById('ptm-info'); if (!info) return;
    if (!sourcePresetName) info.textContent = '출발 프리셋을 선택하세요';
    else if (!n) info.textContent = '이동할 항목을 체크하세요';
    else if (!targetPresetName) info.textContent = `${n}개 선택됨 · 도착 프리셋을 선택하세요`;
    else if (insertPosition a - b).map(i => sourceOrderedPrompts[i]).filter(Boolean);
    const tp = JSON.parse(JSON.stringify(openai_settings[dstIdx]));
    tp.prompts = tp.prompts || []; tp.prompt_order = tp.prompt_order || [];
    const existingIds = new Set(tp.prompts.map(p => p.identifier)), newIds = [];
    const go = tp.prompt_order.find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
    const baseInsertIdx = (() => {
        if (!go?.order || insertPosition === 0) return 0;
        const beforeId = targetOrderedPrompts[insertPosition - 1]?.identifier;
        const rawIdx = beforeId ? go.order.findIndex(e => e.identifier === beforeId) : -1;
        return rawIdx >= 0 ? rawIdx + 1 : go.order.length;
    })();
    selected.forEach((entry, offset) => {
        const pd = JSON.parse(JSON.stringify(entry.prompt));
        let id = pd.identifier;
        if (existingIds.has(id)) { let c = 1, base = id.replace(/_\d+$/, ''); while (existingIds.has(`${base}_${c}`)) c++; id = `${base}_${c}`; pd.identifier = id; pd.name = `${pd.name || entry.identifier} (${c})`; }
        existingIds.add(id); newIds.push(id); tp.prompts.push(pd);
        if (go?.order) go.order.splice(baseInsertIdx + offset, 0, { identifier: id, enabled: true });
        else tp.prompt_order.push({ character_id: GLOBAL_DUMMY_ID, order: [{ identifier: id, enabled: true }] });
        for (const oe of tp.prompt_order) if (String(oe.character_id) !== String(GLOBAL_DUMMY_ID) && oe.order) oe.order.push({ identifier: id, enabled: true });
    });
    try {
        await savePreset(targetPresetName, tp); openai_settings[dstIdx] = tp;
        if (isMove && sourcePresetName !== targetPresetName) {
            const sp = JSON.parse(JSON.stringify(openai_settings[srcIdx])), rem = new Set(selected.map(e => e.identifier));
            sp.prompts = sp.prompts.filter(p => !rem.has(p.identifier));
            if (sp.prompt_order) for (const o of sp.prompt_order) if (o.order) o.order = o.order.filter(e => !rem.has(e.identifier));
            await savePreset(sourcePresetName, sp); openai_settings[srcIdx] = sp;
            if (sourcePresetName === getCurrentPreset()) { oai_settings.prompts = sp.prompts; oai_settings.prompt_order = sp.prompt_order; }
        }
        if (targetPresetName === getCurrentPreset()) { oai_settings.prompts = tp.prompts; oai_settings.prompt_order = tp.prompt_order; }
        if (makeGroup && groupName) {
            const gs = getGroupsForPreset(targetPresetName); let fn = groupName, c = 1;
            while (gs.some(g => g.name === fn)) fn = `${groupName} (${c++})`;
            gs.push({ name: fn, state: 'neutral', toggles: newIds.map(id => ({ target: id, behavior: 'direct', override: null })) });
            saveGroups(targetPresetName, gs);
            renderTGGroups();
            toastr.success(`${n}개 ${isMove ? '이동' : '복사'} 완료 + 그룹 "${fn}" 생성!`);
        } else toastr.success(`${n}개 ${isMove ? '이동' : '복사'} 완료`);
        selectedSourceIndices.clear(); insertPosition = -1;
        const cb = document.getElementById('ptm-make-group'); if (cb) cb.checked = false;
        document.getElementById('ptm-gname-row')?.classList.add('ptm-hidden');
        const gi = document.getElementById('ptm-gname'); if (gi) gi.value = '';
        renderSrcList(); renderDstList(); updateButtons();
        try { setupChatCompletionPromptManager(oai_settings).render(); } catch(e) { console.warn('[PTM] PM refresh failed', e); }
    } catch(err) { console.error('[PTM]', err); toastr.error('실패: ' + err.message); }
}

async function performSamePresetMove(n, makeGroup, groupName) {
    const srcIdx = openai_setting_names[sourcePresetName];
    const selected = [...selectedSourceIndices].sort((a, b) => a - b).map(i => sourceOrderedPrompts[i]).filter(Boolean);
    const selectedSet = new Set(selected.map(e => e.identifier));
    const sp = JSON.parse(JSON.stringify(openai_settings[srcIdx]));

    for (const oe of (sp.prompt_order || [])) {
        if (!oe.order) continue;
        const isGlobal = String(oe.character_id) === String(GLOBAL_DUMMY_ID);
        const filtered = oe.order.filter(e => !selectedSet.has(e.identifier));
        let adjPos;
        if (isGlobal) {
            if (insertPosition === 0) {
                adjPos = 0;
            } else {
                let anchorId = null;
                for (let vi = insertPosition - 1; vi >= 0; vi--) {
                    const id = sourceOrderedPrompts[vi]?.identifier;
                    if (id && !selectedSet.has(id)) { anchorId = id; break; }
                }
                if (anchorId) {
                    const idx = filtered.findIndex(e => e.identifier === anchorId);
                    adjPos = idx >= 0 ? idx + 1 : filtered.length;
                } else {
                    adjPos = 0;
                }
            }
        } else {
            let removedBefore = 0;
            for (let i = 0; i ({ identifier: e.identifier, enabled: e.enabled }))
            : selected.map(e => ({ identifier: e.identifier, enabled: true }));
        filtered.splice(adjPos, 0, ...toInsert);
        oe.order = filtered;
    }

    try {
        await savePreset(sourcePresetName, sp);
        openai_settings[srcIdx] = sp;
        if (sourcePresetName === getCurrentPreset()) { oai_settings.prompts = sp.prompts; oai_settings.prompt_order = sp.prompt_order; }
        if (makeGroup && groupName) {
            const newIds = selected.map(e => e.identifier);
            const gs = getGroupsForPreset(sourcePresetName); let fn = groupName, c = 1;
            while (gs.some(g => g.name === fn)) fn = `${groupName} (${c++})`;
            gs.push({ name: fn, state: 'neutral', toggles: newIds.map(id => ({ target: id, behavior: 'direct', override: null })) });
            saveGroups(sourcePresetName, gs);
            renderTGGroups();
            toastr.success(`${n}개 순서 변경 완료 + 그룹 "${fn}" 생성!`);
        } else {
            toastr.success(`${n}개 순서 변경 완료`);
        }
        sourceOrderedPrompts = getOrderedPrompts(openai_settings[srcIdx]);
        targetOrderedPrompts = getOrderedPrompts(openai_settings[srcIdx]);
        selectedSourceIndices.clear(); insertPosition = -1;
        const cb = document.getElementById('ptm-make-group'); if (cb) cb.checked = false;
        document.getElementById('ptm-gname-row')?.classList.add('ptm-hidden');
        const gi = document.getElementById('ptm-gname'); if (gi) gi.value = '';
        renderSrcList(); renderDstList(); updateButtons();
        try { setupChatCompletionPromptManager(oai_settings).render(); } catch(e) { console.warn('[PTM] PM refresh failed', e); }
    } catch(err) { console.error('[PTM]', err); toastr.error('실패: ' + err.message); }
}

// ══════════════════════════════════════════
// H. Wire mover + TG events
// ══════════════════════════════════════════

function refreshPresetSelects() {
    const opts = getPresetOptions();
    const src = document.getElementById('ptm-src');
    const dst = document.getElementById('ptm-dst');
    if (!src || !dst) return;
    const prevSrc = src.value, prevDst = dst.value;
    src.innerHTML = opts;
    dst.innerHTML = opts;
    if ([...src.options].some(o => o.value === prevSrc)) src.value = prevSrc;
    if ([...dst.options].some(o => o.value === prevDst)) dst.value = prevDst;
}

function wireMover() {
    document.querySelector('#ptm-mover-drawer .inline-drawer-toggle')?.addEventListener('click', () => {
        setTimeout(() => { refreshPresetSelects(); renderSrcList(); renderDstList(); updateButtons(); }, 0);
    });
    document.getElementById('ptm-src')?.addEventListener('change', e => {
        sourcePresetName = e.target.value; selectedSourceIndices.clear(); sourceOrderedPrompts = [];
        renderSrcList(); updateButtons();
    });
    document.getElementById('ptm-dst')?.addEventListener('change', e => {
        targetPresetName = e.target.value; insertPosition = -1; targetOrderedPrompts = [];
        renderDstList(); updateButtons();
    });
    document.getElementById('ptm-all')?.addEventListener('click', () => {
        document.querySelectorAll('#ptm-src-list .ptm-chk').forEach(cb => { cb.checked = true; selectedSourceIndices.add(+cb.dataset.i); cb.closest('.ptm-item').classList.add('ptm-chked'); }); updateButtons();
    });
    document.getElementById('ptm-none')?.addEventListener('click', () => {
        document.querySelectorAll('#ptm-src-list .ptm-chk').forEach(cb => { cb.checked = false; cb.closest('.ptm-item').classList.remove('ptm-chked'); }); selectedSourceIndices.clear(); updateButtons();
    });
    document.getElementById('ptm-range')?.addEventListener('click', () => {
        if (selectedSourceIndices.size a - b), mn = s[0], mx = s[s.length - 1];
        for (let i = mn; i { const i = +cb.dataset.i; if (i >= mn && i {
        document.getElementById('ptm-gname-row')?.classList[e.target.checked ? 'remove' : 'add']('ptm-hidden');
        if (e.target.checked) document.getElementById('ptm-gname')?.focus();
    });
    document.getElementById('ptm-copy')?.addEventListener('click', () => performOperation(false));
    document.getElementById('ptm-move')?.addEventListener('click', () => performOperation(true));
}

function wireTG() {
    document.querySelector('#ptm-tg-drawer .inline-drawer-toggle')?.addEventListener('click', () => {
        setTimeout(renderTGGroups, 0);
    });
    document.getElementById('ptm-ppc-enable-btn')?.addEventListener('click', () => {
        setPpcEnabled(!getPpcEnabled());
    });
    updatePpcBtnVisibility();
    
    document.getElementById('ptm-add-group')?.addEventListener('click', async () => {
        const pn = getCurrentPreset(); if (!pn) { toastr.warning('프리셋을 먼저 선택하세요'); return; }
        const name = await callGenericPopup('새 그룹 이름:', POPUP_TYPE.INPUT, '');
        if (!name?.trim()) return;
        const gs = getGroupsForPreset(pn); if (gs.some(g => g.name === name.trim())) { toastr.warning('같은 이름이 이미 있습니다'); return; }
        // 신규 그룹은 neutral 상태로 시작
        gs.push({ name: name.trim(), state: 'neutral', showInPopup: false, toggles: [] });
        saveGroups(pn, gs); renderTGGroups();
    });
    
    document.getElementById('ptm-reorder-btn')?.addEventListener('click', () => {
        groupReorderMode = !groupReorderMode;
        if (groupReorderMode) toggleReorderMode = null;
        const btn = document.getElementById('ptm-reorder-btn');
        if (btn) { btn.textContent = groupReorderMode ? '✓' : '⠿'; btn.style.color = groupReorderMode ? '#6ddb9e' : ''; }
        renderTGGroups();
    });
    wireTGReorder();
}

function wireTGReorder() {
    const area = document.getElementById('ptm-tg-area');
    if (!area) return;

    let drag = null;

    function getRows(gi) {
        return [...area.querySelectorAll(`.ptm-trow[data-gi="${gi}"][data-draggable="true"]`)];
    }

    function applyPositions(fromTi, toTi, rows, dragEl, rowH) {
        rows.forEach((r, i) => {
            if (r === dragEl) return;
            let shift = 0;
            if (fromTi fromTi && i= toTi && i {
            r.style.transform  = '';
            r.style.transition = '';
            r.style.position   = '';
            r.style.zIndex     = '';
            r.style.opacity    = '';
            r.style.boxShadow  = '';
        });
    }

    area.addEventListener('pointerdown', e => {
        if (toggleReorderMode === null) return;
        const handle = e.target.closest('.ptm-drag-handle');
        if (!handle) return;
        const row = handle.closest('.ptm-trow[data-draggable="true"]');
        if (!row || +row.dataset.gi !== toggleReorderMode) return;

        e.preventDefault();
        const gi   = +row.dataset.gi;
        const ti   = +row.dataset.ti;
        const rows = getRows(gi);
        const rowH = row.offsetHeight;

        row.style.position  = 'relative';
        row.style.zIndex    = '10';
        row.style.opacity   = '0.88';
        row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.28)';
        row.style.transition = 'none';

        drag = { el: row, gi, fromTi: ti, currentTi: ti, rows, rowH, startY: e.clientY };

        area.setPointerCapture(e.pointerId);
    });

    area.addEventListener('pointermove', e => {
        if (!drag) return;
        const { el, fromTi, currentTi, rows, rowH, startY } = drag;
        const dy = e.clientY - startY;

        const maxUp   = -(fromTi * rowH);
        const maxDown = (rows.length - 1 - fromTi) * rowH;
        const clamped = Math.max(maxUp, Math.min(maxDown, dy));
        el.style.transform = `translateY(${clamped}px)`;

        const newTi = Math.max(0, Math.min(rows.length - 1,
            fromTi + Math.round(dy / rowH)));

        if (newTi !== currentTi) {
            drag.currentTi = newTi;
            applyPositions(fromTi, newTi, rows, el, rowH);
        }
    });

    function endDrag(e) {
        if (!drag) return;
        const { el, gi, fromTi, currentTi, rows } = drag;
        drag = null;

        try { area.releasePointerCapture(e.pointerId); } catch(_) {}

        resetStyles(rows);

        if (currentTi !== fromTi) {
            const pn = getCurrentPreset(), gs = getGroupsForPreset(pn);
            const toggles = gs[gi].toggles;
            const [moved] = toggles.splice(fromTi, 1);
            toggles.splice(currentTi, 0, moved);
            saveGroups(pn, gs);
            renderTGGroups();
        }
    }

    area.addEventListener('pointerup',     endDrag);
    area.addEventListener('pointercancel', endDrag);
}

// ══════════════════════════════════════════
// J. PPC — Popup (two-tone, no hard border)
// ══════════════════════════════════════════

let ppcIsOpen         = false;
let ppcGroupsExpanded = false;
let ppcBtn            = null;
let ppcSubGi          = null;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCurrentPresetName() {
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.getPresetManager === 'function') {
            const pm = ctx.getPresetManager();
            if (typeof pm?.getSelectedPresetName === 'function') {
                const name = pm.getSelectedPresetName();
                if (name) return name;
            }
        }
    } catch {}
    for (const sel of ['#settings_preset', '#preset_name_select', 'select[name="preset_name"]']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const txt = el.options[el.selectedIndex]?.text?.trim();
        if (txt && txt !== '—') return txt;
    }
    return '—';
}

async function getCurrentProfileName() {
    try {
        const ctx = SillyTavern.getContext();
        const execFn = ctx.executeSlashCommandsWithOptions
                    ?? window.executeSlashCommandsWithOptions
                    ?? ctx.executeSlashCommands
                    ?? window.executeSlashCommands;
        if (typeof execFn === 'function') {
            const result = await execFn('/profile', { showOutput: false, handleReturn: false });
            const name = (typeof result === 'string' ? result : result?.pipe)?.trim();
            if (name && name !== 'null') return name;
        }
    } catch {}
    const el = document.querySelector('#connection-profile-select');
    if (el) {
        const txt = el.options[el.selectedIndex]?.text?.trim();
        if (txt && txt !== '—') return txt;
    }
    return '—';
}

function getOrCreatePpcPopup() {
    let popup = document.getElementById('ppc-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'ppc-popup';
    popup.style.cssText = `
        display:none;
        position:fixed;
        z-index:2147483647;
        border:none;
        border-radius:10px;
        font-size:14px;
        line-height:1.6;
        color:#2a2a2a;
        box-shadow:0 4px 16px rgba(0,0,0,0.18);
        overflow:hidden;
        min-width:200px;
    `;
    popup.innerHTML = `
<div id="ppc-upper" style="padding:12px 14px;"></div>
<div id="ppc-lower" style="padding:12px 14px;"></div>
<div id="ppc-theme-bar" style="display:none;padding:8px 14px;gap:6px;flex-wrap:wrap;justify-content:center;">
            ${Object.entries(PPC_THEMES).map(([k,t]) =>
                `<button class="ppc-theme-btn" data-theme="${k}" title="${t.title}" style="border:none;background:none;font-size:20px;cursor:pointer;padding:4px;border-radius:4px;transition:all 0.2s;">
                    ${t.label}
               </button>`
            ).join('')}
       </div>
    `;
    popup.querySelectorAll('.ppc-theme-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            setPpcTheme(btn.dataset.theme);
            const bar = document.getElementById('ppc-theme-bar');
            if (bar) bar.style.display = 'none';
        });
    });
    document.body.appendChild(popup);
    return popup;
}

function positionPpcPopup(popup, btn) {
    const rect   = btn.getBoundingClientRect();
    const popupW = popup.offsetWidth  || 220;
    const popupH = popup.offsetHeight || 80;
    let left = rect.left + rect.width / 2 - popupW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
    let top = rect.top - popupH - 8;
    if (top < 8) top = rect.bottom + 8;
    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;
}

async function openPpcPopup() {
    const popup = getOrCreatePpcPopup();
    const preset  = escapeHtml(getCurrentPresetName());
    const profile = escapeHtml(await getCurrentProfileName());
    const upper = popup.querySelector('#ppc-upper');
    if (upper) upper.innerHTML = `
       <div style="display:flex;flex-direction:column;gap:6px;">
           <div style="font-size:12px;opacity:0.7;">🤖${profile}</div>
           <div style="font-size:12px;opacity:0.7;">📋${preset}</div>
       </div>
    `;
    renderPpcLower();
    popup.style.display = 'block';
    ppcIsOpen = true;
    requestAnimationFrame(() => { positionPpcPopup(popup, ppcBtn); applyPpcTheme(); });
}

function closePpcPopup() {
    const popup = document.getElementById('ppc-popup');
    if (popup) popup.style.display = 'none';
    const bar = document.getElementById('ppc-theme-bar');
    if (bar) bar.style.display = 'none';
    closePpcSub();
    ppcIsOpen = false;
}

function refreshPpcPopup() {
    if (!ppcIsOpen) return;
    renderPpcLower();
    const popup = document.getElementById('ppc-popup');
    if (popup && ppcBtn) requestAnimationFrame(() => positionPpcPopup(popup, ppcBtn));
}

function renderPpcLower() {
    const lower = document.getElementById('ppc-lower');
    if (!lower) return;

    const pn      = getCurrentPreset();
    const allGs   = pn ? getGroupsForPreset(pn) : [];
    const visible = allGs.reduce((acc, g, gi) => { if (g.showInPopup) acc.push({ g, gi }); return acc; }, []);
    const arrow   = ppcGroupsExpanded ? '▾' : '▸';

    let rowsHtml = '';
    if (ppcGroupsExpanded) {
        if (!visible.length) {
            rowsHtml = `<div style="padding:8px;text-align:center;opacity:0.5;font-size:12px;">표시할 그룹 없음</div>`;
        } else {
            rowsHtml = visible.map(({ g, gi }) => {
                let bg, clr, label;
                if (g.state === 'on') {
                    bg = PPC_ON_BG; clr = PPC_ON_CLR; label = 'On';
                } else if (g.state === 'off') {
                    bg = PPC_OFF_BG; clr = PPC_OFF_CLR; label = 'Off';
                } else {
                    bg = 'rgba(150,150,150,0.3)'; clr = '#999'; label = '—';
                }
                return `
<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
                    <button class="ppc-grp-toggle" data-gi="${gi}" style="border:none;border-radius:4px;background:${bg};color:${clr};width:36px;height:22px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">
                        ${label}
                    </button>
                    <span class="ppc-grp-name" data-gi="${gi}" style="flex:1;cursor:pointer;font-size:13px;user-select:none;">
                        ${escapeHtml(g.name)}
                    </span>
               </div>
                `;
            }).join('');
        }
    }

    lower.innerHTML = `
       <div id="ppc-grp-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding:4px 0;">
           <span style="font-weight:600;font-size:13px;">그룹${arrow}</span>
           <button id="ppc-theme-toggle" style="border:none;background:none;font-size:16px;cursor:pointer;padding:4px;">🤍</button>
       </div>
        ${ppcGroupsExpanded ? `<div style="margin-top:8px;">${rowsHtml}</div>` : ''}`;

    lower.querySelector('#ppc-grp-head').addEventListener('click', (e) => {
        if (e.target.closest('#ppc-theme-toggle')) return;
        e.stopPropagation();
        ppcGroupsExpanded = !ppcGroupsExpanded;
        renderPpcLower();
        const popup = document.getElementById('ppc-popup');
        if (popup && ppcBtn) requestAnimationFrame(() => positionPpcPopup(popup, ppcBtn));
    });

    lower.querySelector('#ppc-theme-toggle')?.addEventListener('click', e => {
        e.stopPropagation();
        const bar = document.getElementById('ppc-theme-bar');
        if (!bar) return;
        bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
    });

    // 3-state 순환: neutral → on → off → neutral
    lower.querySelectorAll('.ppc-grp-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const gi = +btn.dataset.gi, pn2 = getCurrentPreset(), gs = getGroupsForPreset(pn2);
            const cur = gs[gi].state;
            gs[gi].state = cur === 'neutral' ? 'on' : cur === 'on' ? 'off' : 'neutral';
            applyGroup(pn2, gi);
            saveGroups(pn2, gs);
            renderPpcLower();
            renderTGGroups();
            const sub = document.getElementById('ppc-sub');
            if (sub && sub.style.display !== 'none' && ppcSubGi === gi) {
                sub.innerHTML = buildPpcSubHtml(gi);
                wirePpcSub(sub, gi);
                requestAnimationFrame(() => positionPpcSub(sub));
            }
            const popup = document.getElementById('ppc-popup');
            if (popup && ppcBtn) requestAnimationFrame(() => positionPpcPopup(popup, ppcBtn));
        });
    });

    lower.querySelectorAll('.ppc-grp-name').forEach(span => {
        span.addEventListener('click', e => {
            e.stopPropagation();
            openPpcSub(+span.dataset.gi);
        });
    });
}

// ══════════════════════════════════════════
// K. PPC — Sub-popup (group detail, 3-state)
// ══════════════════════════════════════════

function getOrCreatePpcSub() {
    let sub = document.getElementById('ppc-sub');
    if (sub) return sub;
    sub = document.createElement('div');
    sub.id = 'ppc-sub';
    sub.style.cssText = `
        display:none;
        position:fixed;
        z-index:2147483648;
        background:#f5f0e8;
        border:none;
        border-radius:10px;
        font-size:13px;
        color:#2a2a2a;
        box-shadow:0 6px 24px rgba(0,0,0,0.18);
        min-width:240px;
        max-width:320px;
        max-height:70vh;
        overflow-y:auto;
    `;
    document.body.appendChild(sub);
    return sub;
}

function positionPpcSub(sub) {
    const popup = document.getElementById('ppc-popup');
    const vw = window.innerWidth, vh = window.innerHeight;

    if (popup) {
        const pr = popup.getBoundingClientRect();
        const availableH = pr.top - 18;
        sub.style.maxHeight = Math.max(120, availableH) + 'px';
        sub.style.overflowY = 'auto';
    }

    const subW = sub.offsetWidth  || 280;
    const subH = sub.offsetHeight || 200;

    let left;
    if (popup) {
        const pr = popup.getBoundingClientRect();
        left = pr.left + (pr.width - subW) / 2;
    } else {
        left = (vw - subW) / 2;
    }
    left = Math.max(8, Math.min(left, vw - subW - 8));

    let top;
    if (popup) {
        const pr = popup.getBoundingClientRect();
        top = pr.top - subH - 8;
        if (top < 8) top = pr.bottom + 8;
    } else {
        top = (vh - subH) / 2;
    }
    top = Math.max(8, Math.min(top, vh - subH - 8));

    sub.style.left = `${left}px`;
    sub.style.top  = `${top}px`;
}

function openPpcSub(gi) {
    closePpcSub();
    ppcSubGi = gi;
    const sub = getOrCreatePpcSub();
    sub.innerHTML = buildPpcSubHtml(gi);
    sub.style.display = 'block';
    requestAnimationFrame(() => { positionPpcSub(sub); wirePpcSub(sub, gi); applyPpcTheme(); });
}

function closePpcSub() {
    const sub = document.getElementById('ppc-sub');
    if (sub) sub.style.display = 'none';
    ppcSubGi = null;
}

function buildPpcSubHtml(gi) {
    const pn = getCurrentPreset(), gs = getGroupsForPreset(pn), g = gs[gi];
    if (!g) return '<div style="padding:14px;">그룹을 찾을 수 없습니다</div>';

    let allPrompts, ptStateMap;
    try {
        const pm = setupChatCompletionPromptManager(oai_settings);
        const order = (pm.serviceSettings?.prompt_order || [])
            .find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
        allPrompts = pm.serviceSettings?.prompts || [];
        ptStateMap = new Map((order?.order || []).map(e => [e.identifier, e.enabled]));
    } catch(e) {
        const preset = getLivePresetData(pn) || openai_settings[openai_setting_names[pn]];
        const order = (preset?.prompt_order || [])
            .find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
        allPrompts = preset?.prompts || [];
        ptStateMap = new Map((order?.order || []).map(e => [e.identifier, e.enabled]));
    }

    let grpBg, grpClr, grpLabel;
    if (g.state === 'on') {
        grpBg = PPC_ON_BG; grpClr = PPC_ON_CLR; grpLabel = 'On';
    } else if (g.state === 'off') {
        grpBg = PPC_OFF_BG; grpClr = PPC_OFF_CLR; grpLabel = 'Off';
    } else {
        grpBg = 'rgba(150,150,150,0.3)'; grpClr = '#999'; grpLabel = '—';
    }

    const rows = g.toggles.map((t, ti) => {
        const name     = allPrompts.find(p => p.identifier === t.target)?.name ?? '';
        const isDirect = t.behavior === 'direct';
        const ovr      = t.override ?? null;

        let effectOn;
        if (ovr !== null) {
            effectOn = ovr;
        } else if (g.state === 'neutral') {
            effectOn = ptStateMap.get(t.target) ?? false;
        } else {
            effectOn = isDirect ? (g.state === 'on') : (g.state !== 'on');
        }

        let ovrBg, ovrClr, ovrLabel;
        if (ovr === null)      { ovrLabel = '—'; ovrBg = 'rgba(150,150,150,0.25)'; ovrClr = '#c0c0c0'; }
        else if (ovr === true) { ovrLabel = 'On';  ovrBg = 'rgba(90,184,130,0.25)';  ovrClr = '#6dcc96'; }
        else                   { ovrLabel = 'Off'; ovrBg = 'rgba(184,90,90,0.25)';   ovrClr = '#d07070'; }

        const bBg  = isDirect ? 'rgba(150,150,150,0.25)' : 'rgba(122,100,220,0.25)';
        const bClr = isDirect ? '#c0c0c0' : '#b0a0f0';

        const btnStyle = 'border:none;border-radius:3px;width:30px;min-width:30px;height:18px;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap;letter-spacing:-0.3px;';
        const stBg  = effectOn ? 'rgba(90,184,130,0.2)'   : 'rgba(200,200,200,0.1)';
        const stClr = effectOn ? '#6dcc96'                 : '#999';
        return `
       <div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
           <span style="font-size:10px;font-weight:700;color:${stClr};background:${stBg};padding:2px 6px;border-radius:3px;min-width:24px;text-align:center;">${effectOn ? 'On' : 'Off'}</span>
           <button class="ppc-sub-ovr" data-ti="${ti}" style="${btnStyle}background:${ovrBg};color:${ovrClr};">
                ${ovrLabel}
           </button>
           <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</span>
           <button class="ppc-sub-bsel" data-ti="${ti}" style="${btnStyle}background:${bBg};color:${bClr};">
                ${isDirect ? '동일' : '반전'}
           </button>
       </div>
        `;
    }).join('');

    return `
<div style="padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <button class="ppc-sub-grp-toggle" style="border:none;border-radius:4px;background:${grpBg};color:${grpClr};width:36px;height:22px;font-size:11px;font-weight:700;cursor:pointer;">
                ${grpLabel}
                </button>
           </div>
           <span style="flex:1;font-weight:600;font-size:14px;margin:0 8px;">${escapeHtml(g.name)}</span>
           <button class="ppc-sub-close" style="border:none;background:none;font-size:18px;cursor:pointer;padding:0;line-height:1;">✕</button>
        </div>

            ${rows || '<div style="padding:12px;text-align:center;opacity:0.5;font-size:12px;">토글 없음</div>'}
       </div>
   </div>
    `;
}

function wirePpcSub(sub, gi) {
    const pn = getCurrentPreset();

    sub.querySelector('.ppc-sub-close')?.addEventListener('click', e => {
        e.stopPropagation(); closePpcSub();
    });

    sub.querySelector('.ppc-sub-grp-toggle')?.addEventListener('click', e => {
        e.stopPropagation();
        const gs = getGroupsForPreset(pn);
        const cur = gs[gi].state;
        gs[gi].state = cur === 'neutral' ? 'on' : cur === 'on' ? 'off' : 'neutral';
        applyGroup(pn, gi); saveGroups(pn, gs);
        sub.innerHTML = buildPpcSubHtml(gi);
        wirePpcSub(sub, gi);
        renderPpcLower();
        renderTGGroups();
    });

    sub.querySelectorAll('.ppc-sub-ovr').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const ti = +btn.dataset.ti, gs = getGroupsForPreset(pn);
        const cur = gs[gi].toggles[ti].override ?? null;
        gs[gi].toggles[ti].override = cur === null ? true : cur === true ? false : null;
        applyGroup(pn, gi); saveGroups(pn, gs);
        sub.innerHTML = buildPpcSubHtml(gi);
        wirePpcSub(sub, gi);
        renderTGGroups();
        renderPpcLower();
    }));

    sub.querySelectorAll('.ppc-sub-bsel').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const ti = +btn.dataset.ti, gs = getGroupsForPreset(pn);
        gs[gi].toggles[ti].behavior = gs[gi].toggles[ti].behavior === 'direct' ? 'invert' : 'direct';
        applyGroup(pn, gi);
        saveGroups(pn, gs);
        sub.innerHTML = buildPpcSubHtml(gi);
        wirePpcSub(sub, gi);
        renderTGGroups();
    }));
}

// ══════════════════════════════════════════
// L. PPC — Button injection & events
// ══════════════════════════════════════════

function injectPpcButton() {
    if (document.getElementById('ppc-btn')) return;
    getOrCreatePpcPopup();
    getOrCreatePpcSub();

    const btn = document.createElement('div');
    btn.id = 'ppc-btn';
    btn.title = 'Preset & Profile';
    btn.classList.add('interactable');
    btn.setAttribute('tabindex', '0');
    btn.textContent = '🔌';
    Object.assign(btn.style, {
        fontSize: '1rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    ppcBtn = btn;

    (window.visualViewport ?? window).addEventListener('resize', () => {
        if (!ppcIsOpen) return;
        const popup = document.getElementById('ppc-popup');
        if (popup) requestAnimationFrame(() => positionPpcPopup(popup, ppcBtn));
    });

    btn.addEventListener('click', e => {
        e.stopPropagation();
        ppcIsOpen ? closePpcPopup() : openPpcPopup();
    });

    document.addEventListener('click', e => {
        if (!ppcIsOpen) return;
        const popup = document.getElementById('ppc-popup');
        const sub   = document.getElementById('ppc-sub');
        const subVisible = sub && sub.style.display !== 'none';
        const outsideAll = !btn.contains(e.target) && !popup?.contains(e.target) && !sub?.contains(e.target);
        if (!outsideAll) return;
        if (subVisible) {
            closePpcSub();
        } else {
            closePpcPopup();
        }
    });

    const wandSelectors = ['#options_button', '#extensionsMenuButton', '#extensionOptionsButton', '.fa-wand-magic-sparkles', '.fa-magic'];
    let inserted = false;
    for (const sel of wandSelectors) {
        let target = document.querySelector(sel);
        if (!target) continue;
        if (sel.startsWith('.fa-')) target = target.closest('.interactable, [tabindex]') || target.parentElement;
        if (target?.parentElement) { target.parentElement.insertBefore(btn, target.nextSibling); inserted = true; break; }
    }
    if (!inserted) {
        for (const sel of ['#leftSendForm', '#send_form > div.flex-container', '#send_form']) {
            const el = document.querySelector(sel);
            if (el) { el.appendChild(btn); inserted = true; break; }
        }
    }
    if (!inserted) {
        const sendBtn = document.getElementById('send_but');
        if (sendBtn?.parentElement) sendBtn.parentElement.insertBefore(btn, sendBtn);
    }
    updatePpcBtnVisibility();
}

function setupPpcEvents() {
    const UPDATE_EVENTS = [
        'preset_changed', 'mainApiChanged',
        'connection_profile_loaded', event_types.CHAT_CHANGED,
    ];
    for (const evt of UPDATE_EVENTS) {
        eventSource.on(evt, async () => {
            if (!ppcIsOpen) return;
            const popup = document.getElementById('ppc-popup');
            if (!popup) return;
            const preset  = escapeHtml(getCurrentPresetName());
            const profile = escapeHtml(await getCurrentProfileName());
            const upper = popup.querySelector('#ppc-upper');
            if (upper) upper.innerHTML = `
               <div style="display:flex;flex-direction:column;gap:6px;">
                   <div style="font-size:12px;opacity:0.7;">🤖${profile}</div>
                   <div style="font-size:12px;opacity:0.7;">📋${preset}</div>
               </div>
            `;
            renderPpcLower();
            if (ppcBtn) requestAnimationFrame(() => positionPpcPopup(popup, ppcBtn));
        });
    }
}

// ══════════════════════════════════════════
// MIGRATION — from prompt-toggle-manager (3-state)
// ══════════════════════════════════════════

function migrateFromLegacy() {
    try {
        const LEGACY_KEY = 'prompt-toggle-manager';
        const legacy = extension_settings[LEGACY_KEY];
        const qpm = getTGStore();

        // 1. 기존 boolean isOn → 3-state 마이그레이션
        let statesMigrated = 0;
        for (const [presetName, groups] of Object.entries(qpm.presets || {})) {
            if (!Array.isArray(groups)) continue;
            groups.forEach(g => {
                if (typeof g.isOn === 'boolean') {
                    g.state = g.isOn ? 'on' : 'off';
                    delete g.isOn;
                    statesMigrated++;
                } else if (!g.state) {
                    g.state = 'neutral';
                }
            });
        }
        if (statesMigrated > 0) {
            saveSettingsDebounced();
            console.log(`[${extensionName}] Migrated ${statesMigrated} groups to 3-state system`);
        }

        // 2. 레거시 확장에서 import
        if (qpm.migrationDone || !legacy?.presets) return;

        let migratedGroups = 0;
        for (const [presetName, groups] of Object.entries(legacy.presets)) {
            if (!Array.isArray(groups) || !groups.length) continue;
            if (!qpm.presets[presetName]) qpm.presets[presetName] = [];
            const existing = new Set(qpm.presets[presetName].map(g => g.name));
            for (const g of groups) {
                if (existing.has(g.name)) continue;
                const newGroup = {
                    ...g,
                    state: typeof g.isOn === 'boolean' ? (g.isOn ? 'on' : 'off') : 'neutral',
                };
                delete newGroup.isOn;
                qpm.presets[presetName].push(newGroup);
                migratedGroups++;
            }
        }

        qpm.migrationDone = true;
        saveSettingsDebounced();

        if (migratedGroups > 0) {
            toastr.success(`기존 확장에서 그룹 ${migratedGroups}개를 자동으로 가져왔습니다 ✅`);
            console.log(`[${extensionName}] Migrated ${migratedGroups} groups from ${LEGACY_KEY}`);
        }
    } catch(e) {
        console.warn(`[${extensionName}] Migration failed:`, e);
    }
}

// ══════════════════════════════════════════
// I. Mount & Init
// ══════════════════════════════════════════

function applyAllGroups() {
    const pn = getCurrentPreset();
    if (!pn) return;
    const groups = getGroupsForPreset(pn);
    groups.forEach((_, gi) => applyGroup(pn, gi));
}

function mount() {
    if (document.getElementById('ptm-mover-drawer')) return true;
    const target = document.querySelector('.range-block.m-b-1');
    if (!target) return false;
    const tg = buildTGDrawer(), mover = buildMoverDrawer();
    target.before(tg); tg.before(mover);
    wireMover(); wireTG(); renderTGGroups();
    return true;
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        await initImports();
        migrateFromLegacy();
        let c = 0;
        const t = setInterval(() => { 
            if (mount() || ++c > 50) clearInterval(t); 
        }, 200);
       
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => { 
            renderTGGroups(); 
            applyAllGroups(); 
        });
       
        eventSource.on(event_types.APP_READY, () => { 
            injectPpcButton(); 
            applyAllGroups(); 
        });
        
        setupPpcEvents();
        console.log(`[${extensionName}] Loaded`);
    } catch(err) { 
        console.error(`[${extensionName}] Failed:`, err); 
    }
});
