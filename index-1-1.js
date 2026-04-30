import { saveSettingsDebounced, callGenericPopup, POPUP_TYPE, eventSource, event_types } from'../../../../script.js';
import { extension_settings } from'../../../extensions.js';
import { oai_settings, openai_setting_names, setupChatCompletionPromptManager } from'../../../openai.js';

const extensionName = 'PromptQM';
constTG_KEY = 'prompt-qm';
constGLOBAL_DUMMY_ID = 'global';

constPPC_ON_BG  = 'rgba(90,184,130,0.25)';
constPPC_ON_CLR = '#6dcc96';
constPPC_OFF_BG = 'rgba(184,90,90,0.25)';
constPPC_OFF_CLR = '#d07070';

const collapsedGroups = newSet();
let groupReorderMode  = false;
let toggleReorderMode = null;

let ppcBtn = null;
let ppcGroupsExpanded = false;
let ppcSubGi = null;

// ══════════════════════════════════════════// A. Toggle Group Data (3-state system)// ══════════════════════════════════════════functiongetTGStore() {
    if (!extension_settings[TG_KEY]) extension_settings[TG_KEY] = { presets: {} };
    return extension_settings[TG_KEY];
}

functiongetGroupsForPreset(pn) {
    const s = getTGStore();
    if (!s.presets[pn]) s.presets[pn] = [];
    return s.presets[pn];
}

functionsaveGroups(pn, groups) {
    getTGStore().presets[pn] = groups;
    saveSettingsDebounced();
}

functiongetCurrentPreset() {
    return oai_settings?.preset_settings_openai || '';
}

functiongetLivePresetData(pn) {
    return openai_settings[openai_setting_names[pn]];
}

// ══════════════════════════════════════════// B. Apply group (3-state logic)// ══════════════════════════════════════════functionapplyGroup(pn, gi) {
    const groups = getGroupsForPreset(pn);
    const g      = groups[gi];
    if (!g) return;

    try {
        const pm = setupChatCompletionPromptManager(oai_settings);

        for (const t of g.toggles) {
            const entry = pm.getPromptOrderEntry(pm.activeCharacter, t.target);
            if (!entry) continue;

            const ovr = t.override ?? null;

            if (ovr !== null) {
                entry.enabled = ovr;
            } elseif (g.state === 'neutral') {
                continue;
            } else {
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

// ══════════════════════════════════════════// MIGRATION — 3-state + legacy import// ══════════════════════════════════════════functionmigrateFromLegacy() {
    try {
        constLEGACY_KEY = 'prompt-toggle-manager';
        const legacy = extension_settings[LEGACY_KEY];
        const qpm = getTGStore();

        let statesMigrated = 0;
        for (const [presetName, groups] ofObject.entries(qpm.presets || {})) {
            if (!Array.isArray(groups)) continue;
            groups.forEach(g => {
                if (typeof g.isOn === 'boolean') {
                    g.state = g.isOn ? 'on' : 'off';
                    delete g.isOn;
                    statesMigrated++;
                } elseif (!g.state) {
                    g.state = 'neutral';
                }
            });
        }
        if (statesMigrated > 0) {
            saveSettingsDebounced();
            console.log(`[${extensionName}] Migrated ${statesMigrated} groups to 3-state system`);
        }

        if (qpm.migrationDone || !legacy?.presets) return;

        let migratedGroups = 0;
        for (const [presetName, groups] ofObject.entries(legacy.presets)) {
            if (!Array.isArray(groups) || !groups.length) continue;
            if (!qpm.presets[presetName]) qpm.presets[presetName] = [];

            const existing = newSet(qpm.presets[presetName].map(g => g.name));
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

// ══════════════════════════════════════════// C. Toggle Group UI (3-state + PT state reading)// ══════════════════════════════════════════functionrenderTGGroups() {
    const area = document.getElementById('ptm-tg-area');
    if (!area) return;
    const pn = getCurrentPreset();
    if (!pn) { area.innerHTML = '<div class="ptm-ph">프리셋이 선택되지 않았습니다</div>'; return; }

    let validIds, allPrompts, ptStateMap;
    try {
        const pm = setupChatCompletionPromptManager(oai_settings);
        const order = (pm.serviceSettings?.prompt_order || [])
            .find(o =>String(o.character_id) === String(GLOBAL_DUMMY_ID));
        validIds   = newSet((order?.order || []).map(e => e.identifier));
        allPrompts = pm.serviceSettings?.prompts || [];
        ptStateMap = newMap((order?.order || []).map(e => [e.identifier, e.enabled]));
    } catch(e) {
        const livePreset = getLivePresetData(pn) || openai_settings[openai_setting_names[pn]];
        const order = (livePreset?.prompt_order || [])
            .find(o =>String(o.character_id) === String(GLOBAL_DUMMY_ID));
        validIds   = newSet((order?.order || []).map(e => e.identifier));
        allPrompts = livePreset?.prompts || [];
        ptStateMap = newMap((order?.order || []).map(e => [e.identifier, e.enabled]));
    }

    const allPromptIds = newSet(allPrompts.map(p => p.identifier));
    const groups = getGroupsForPreset(pn);

    const displayGroups = allPrompts.length > 0
        ? groups.map(g => ({ ...g, toggles: g.toggles.filter(t => allPromptIds.has(t.target)) }))
        : groups;

    if (allPrompts.length > 0) {
        let changed = false;
        groups.forEach((g, i) => {
            const before = g.toggles.length;
            g.toggles = g.toggles.filter(t => allPromptIds.has(t.target));
            if (g.toggles.length !== before) changed = true;
        });
        if (changed) saveGroups(pn, groups);
    }

    if (!displayGroups.length) { area.innerHTML = '<div class="ptm-ph">그룹이 없습니다</div>'; return; }
    area.innerHTML = displayGroups.map((g, gi) =>buildGroupCard(g, gi, pn, allPrompts, ptStateMap)).join('');
    wireGroupCards(area);
}

functionbuildGroupCard(g, gi, pn, allPrompts, ptStateMap) {
    const inToggleReorder = toggleReorderMode === gi;

    const rows = g.toggles.map((t, ti) => {
        const name     = allPrompts.find(p => p.identifier === t.target)?.name ?? '';
        const isDirect = t.behavior === 'direct';
        const ovr      = t.override ?? null;

        let effectiveOn;
        if (ovr !== null) {
            effectiveOn = ovr;
        } elseif (g.state === 'neutral') {
            effectiveOn = ptStateMap.get(t.target) ?? false;
        } else {
            effectiveOn = isDirect ? (g.state === 'on') : (g.state !== 'on');
        }

        let ovrLabel, ovrCls;
        if (ovr === null)      { ovrLabel = '—'; ovrCls = 'ptm-tovr-lock'; }
        elseif (ovr === true) { ovrLabel = 'On';  ovrCls = 'ptm-tovr-on';  }
        else                   { ovrLabel = 'Off'; ovrCls = 'ptm-tovr-off'; }

        return`
        <div class="ptm-trow" ${inToggleReorder ? 'data-draggable="true"' : ''} data-gi="${gi}" data-ti="${ti}">
            ${inToggleReorder
                ? `<span class="ptm-drag-handle" title="드래그하여 이동">⠿</span>`
                : `<span class="ptm-tstate ${effectiveOn ? 'ptm-ts-on' : 'ptm-ts-off'}">${effectiveOn ? 'On' : 'Off'}</span>`}
            <button class="ptm-ibtn ptm-tovr ${ovrCls}" data-gi="${gi}" data-ti="${ti}">${ovrLabel}</button>
            <span class="ptm-tname">${name}</span>
            ${!inToggleReorder ? `<button class="ptm-ibtn ptm-bsel ${isDirect ? 'ptm-bsel-dir' : 'ptm-bsel-inv'}" data-gi="${gi}" data-ti="${ti}">${isDirect ? '동일' : '반전'}</button>` : ''}
            <button class="ptm-ibtn ptm-danger ptm-del-toggle" data-gi="${gi}" data-ti="${ti}">✕</button>
        </div>`;
    }).join('');

    const collapseKey = `${pn}__${gi}`;
    const isCollapsed = collapsedGroups.has(collapseKey);
    const toggleCount = g.toggles.length;
    const groups      = getGroupsForPreset(pn);
    const isFirst     = gi === 0;
    const isLast      = gi === groups.length - 1;

    let stateBg, stateClr, stateLabel;
    if (g.state === 'on') {
        stateBg = PPC_ON_BG; stateClr = PPC_ON_CLR; stateLabel = 'On';
    } elseif (g.state === 'off') {
        stateBg = PPC_OFF_BG; stateClr = PPC_OFF_CLR; stateLabel = 'Off';
    } else {
        stateBg = 'rgba(150,150,150,0.3)'; stateClr = '#999'; stateLabel = '—';
    }

    return`
    <div class="ptm-card" data-gi="${gi}">
        <div class="ptm-card-head">
            ${groupReorderMode ? `
                <button class="ptm-ibtn ptm-grp-up${isFirst ? ' ptm-arr-disabled' : ''}" data-gi="${gi}" ${isFirst ? 'disabled' : ''}>▲</button>
                <button class="ptm-ibtn ptm-grp-dn${isLast  ? ' ptm-arr-disabled' : ''}" data-gi="${gi}" ${isLast  ? 'disabled' : ''}>▼</button>
            ` : `<button class="ptm-state-btn" data-gi="${gi}" style="border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;padding:2px 8px;min-width:36px;background:${stateBg};color:${stateClr}">${stateLabel}</button>`}
            <span class="ptm-gname">${g.name} <span class="ptm-gcnt">(${toggleCount})</span></span>
            <div class="ptm-gbtns">
                ${!groupReorderMode && !inToggleReorder && !isCollapsed ? `<button class="ptm-ibtn ptm-ren-grp" data-gi="${gi}">✏️</button>` : ''}${!groupReorderMode && !inToggleReorder && !isCollapsed ? `<button class="ptm-ibtn ptm-reorder-grp-btn" data-gi="${gi}" title="토글 순서 변경">⠿</button>` : ''}${!groupReorderMode && !inToggleReorder && !isCollapsed ? `<button class="ptm-ibtn ptm-copy-grp" data-gi="${gi}" title="다른 프롬프트로 그룹 복사">📋</button>` : ''}${!groupReorderMode && !inToggleReorder ? `<button class="ptm-ibtn ptm-popup-pin${g.showInPopup ? ' ptm-pin-active' : ''}" data-gi="${gi}" title="미니창에 표시" style="${g.showInPopup ? 'opacity:1;background:rgba(160,144,232,0.25);color:#b0a0f0;' : 'opacity:0.35;'}">📌</button>` : ''}${!groupReorderMode && !inToggleReorder ? `<button class="ptm-ibtn ptm-danger ptm-del-grp" data-gi="${gi}">✕</button>` : ''}${inToggleReorder ? `<button class="ptm-ibtn ptm-toggle-reorder-done" data-gi="${gi}" style="color:#6ddb9e">✓</button>` : ''}
                <button class="ptm-ibtn ptm-collapse-grp" data-gi="${gi}" data-cpkey="${collapseKey}" title="${isCollapsed ? '펼치기' : '접기'}">${isCollapsed ? '▸' : '▾'}</button>
            </div>
        </div>
        <div class="ptm-tlist${isCollapsed ? ' ptm-hidden' : ''}">
            ${rows || '<div class="ptm-ph" style="padding:6px;font-size:11px">토글 없음</div>'}
        </div>
        ${!groupReorderMode ? `<button class="ptm-sm ptm-add-toggle${isCollapsed ? ' ptm-hidden' : ''}" data-gi="${gi}" style="width:calc(100% - 12px);margin:2px 6px;box-sizing:border-box;">+ 토글 추가</button>` : ''}
    </div>`;
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

    area.querySelectorAll('.ptm-state-btn').forEach(btn => btn.addEventListener('click', () => {
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
        return `<label style="display:flex;align-items:center;gap:8px;padding:7px 4px;cursor:${ex ? 'default' : 'pointer'};opacity:${ex ? '0.45' : '1'}">
            <input type="checkbox" class="ptm-add-cb" data-i="${idx}" data-id="${p.identifier}" ${ex ? 'disabled checked' : ''}
                style="width:16px;height:16px;accent-color:#7a6fff;flex-shrink:0;cursor:pointer">
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name ?? ''}</span>
            ${ex ? '<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:rgba(120,100,255,.25);color:#a89fff;flex-shrink:0">추가됨</span>' : ''}
        </label>`;
    }).join('');

    const html = `
        <div style="display:flex;gap:6px;margin-bottom:8px">
            <button id="ptm-mall"   class="ptm-sm" style="margin:0">전체</button>
            <button id="ptm-mnone"  class="ptm-sm" style="margin:0">해제</button>
            <button id="ptm-mrange" class="ptm-sm" style="margin:0">연속</button>
        </div>
        <div id="ptm-mlist" style="max-height:45vh;overflow-y:auto">${listHtml}</div>`;

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
                if (selectedMap.size < 2) { toastr.warning('시작과 끝 항목 2개를 선택하세요'); return; }
                const idxs = [...selectedMap.keys()].sort((a, b) => a - b);
                const mn = idxs[0], mx = idxs[idxs.length - 1];
                document.querySelectorAll('.ptm-add-cb:not(:disabled)').forEach(cb => {
                    const i = +cb.dataset.i;
                    if (i >= mn && i <= mx) { cb.checked = true; selectedMap.set(i, cb.dataset.id); }
                });
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const ok = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: '추가', cancelButton: '취소' });
    observer.disconnect();

    if (!ok) return;
    if (!selectedMap.size) { toastr.warning('추가할 항목을 선택하세요'); return; }
    const gs2 = getGroupsForPreset(pn);
    selectedMap.forEach(id => gs2[gi].toggles.push({ target: id, behavior: 'direct', override: null }));
    saveGroups(pn, gs2); renderTGGroups();
    toastr.success(`${selectedMap.size}개 추가됨`);
}

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
        .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
        .join('');
    if (!presetOpts) { toastr.warning('복사할 다른 프리셋이 없습니다'); return; }

    let selectedDst = Object.keys(openai_setting_names)
        .find(n => n !== pn && openai_settings[openai_setting_names[n]]) || '';

    const html = `
        <div style="margin-bottom:10px">
            <label style="font-size:12px;opacity:0.7;display:block;margin-bottom:4px">그룹을 붙여넣을 프롬프트:</label>
            <select id="ptm-cg-dst" style="width:100%;padding:6px;border-radius:6px;box-sizing:border-box">
                ${presetOpts}
            </select>
        </div>
        <div style="font-size:11px;opacity:0.6">
            토글 ${sourceGroup.toggles.length}개 · 이름이 일치하는 프롬프트에 자동 연결됩니다
        </div>`;

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
        state:       'neutral',
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
// ══════════════════════════════════════════
// D. Toggle reorder (drag & drop)
// ══════════════════════════════════════════

function wireTGReorder() {
    let dragSrc = null;

    document.addEventListener('dragstart', e => {
        const row = e.target.closest('[data-draggable="true"]');
        if (!row) return;
        dragSrc = row;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', row.innerHTML);
        row.style.opacity = '0.4';
    });

    document.addEventListener('dragend', e => {
        const row = e.target.closest('[data-draggable="true"]');
        if (row) row.style.opacity = '';
        dragSrc = null;
    });

    document.addEventListener('dragover', e => {
        const row = e.target.closest('[data-draggable="true"]');
        if (!row || !dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    document.addEventListener('drop', e => {
        const row = e.target.closest('[data-draggable="true"]');
        if (!row || !dragSrc || row === dragSrc) return;
        e.stopPropagation();
        e.preventDefault();

        const gi = +row.dataset.gi;
        const srcTi = +dragSrc.dataset.ti;
        const dstTi = +row.dataset.ti;

        const pn = getCurrentPreset();
        const gs = getGroupsForPreset(pn);
        const arr = gs[gi].toggles;
        const [item] = arr.splice(srcTi, 1);
        arr.splice(dstTi, 0, item);

        saveGroups(pn, gs);
        renderTGGroups();
    });
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
        const pn = getCurrentPreset();
        if (!pn) { toastr.warning('프리셋을 먼저 선택하세요'); return; }
        const name = await callGenericPopup('새 그룹 이름:', POPUP_TYPE.INPUT, '');
        if (!name?.trim()) return;
        const gs = getGroupsForPreset(pn);
        if (gs.some(g => g.name === name.trim())) {
            toastr.warning('같은 이름이 이미 있습니다');
            return;
        }
        gs.push({
            name: name.trim(),
            state: 'neutral',
            showInPopup: false,
            toggles: []
        });
        saveGroups(pn, gs);
        renderTGGroups();
    });

    document.getElementById('ptm-reorder-btn')?.addEventListener('click', () => {
        groupReorderMode = !groupReorderMode;
        if (groupReorderMode) toggleReorderMode = null;
        const btn = document.getElementById('ptm-reorder-btn');
        if (btn) {
            btn.textContent = groupReorderMode ? '✓' : '⠿';
            btn.style.color = groupReorderMode ? '#6ddb9e' : '';
        }
        renderTGGroups();
    });
    wireTGReorder();
}

// ══════════════════════════════════════════
// E. PPC (Prompt Preset Control) — popup
// ══════════════════════════════════════════

function getPpcEnabled() {
    return getTGStore().ppcEnabled ?? false;
}

function setPpcEnabled(val) {
    getTGStore().ppcEnabled = !!val;
    saveSettingsDebounced();
    updatePpcBtnVisibility();
}

function updatePpcBtnVisibility() {
    const btn = document.getElementById('ptm-ppc-enable-btn');
    if (!btn) return;
    const enabled = getPpcEnabled();
    btn.textContent = enabled ? '미니창 숨기기' : '미니창 표시';
    btn.style.background = enabled ? 'rgba(184,90,90,0.2)' : 'rgba(90,184,130,0.2)';
    btn.style.color = enabled ? '#d07070' : '#6dcc96';

    if (enabled) {
        if (!ppcBtn) createPpcButton();
    } else {
        if (ppcBtn) {
            ppcBtn.remove();
            ppcBtn = null;
        }
        const popup = document.getElementById('ppc-popup');
        if (popup) popup.remove();
        const sub = document.getElementById('ppc-sub');
        if (sub) sub.remove();
    }
}

function createPpcButton() {
    if (ppcBtn) return;
    ppcBtn = document.createElement('div');
    ppcBtn.id = 'ppc-btn';
    ppcBtn.innerHTML = '⚙️';
    ppcBtn.style.cssText = `
        position:fixed;bottom:20px;right:20px;width:48px;height:48px;
        border-radius:50%;background:rgba(122,111,255,0.9);color:#fff;
        font-size:22px;display:flex;align-items:center;justify-content:center;
        cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;
        transition:transform 0.2s,box-shadow 0.2s;user-select:none;
    `;
    ppcBtn.addEventListener('mouseenter', () => {
        ppcBtn.style.transform = 'scale(1.1)';
        ppcBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    });
    ppcBtn.addEventListener('mouseleave', () => {
        ppcBtn.style.transform = 'scale(1)';
        ppcBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    ppcBtn.addEventListener('click', e => {
        e.stopPropagation();
        togglePpcPopup();
    });
    document.body.appendChild(ppcBtn);
}

function togglePpcPopup() {
    let popup = document.getElementById('ppc-popup');
    if (popup) {
        popup.remove();
        closePpcSub();
        return;
    }
    popup = document.createElement('div');
    popup.id = 'ppc-popup';
    popup.style.cssText = `
        position:fixed;width:280px;background:#1a1a1a;border-radius:12px;
        box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:10001;padding:14px;
        display:flex;flex-direction:column;gap:10px;
    `;
    popup.innerHTML = `
        <div id="ppc-upper"></div>
        <div style="height:1px;background:rgba(255,255,255,0.1);margin:2px 0"></div>
        <div id="ppc-lower"></div>
        <div id="ppc-theme-bar" style="display:none;gap:6px;flex-wrap:wrap;margin-top:4px"></div>
    `;
    document.body.appendChild(popup);
    positionPpcPopup(popup, ppcBtn);
    renderPpcUpper();
    renderPpcLower();
    renderPpcThemeBar();

    const closeOnOutside = e => {
        if (!popup.contains(e.target) && e.target !== ppcBtn) {
            popup.remove();
            closePpcSub();
            document.removeEventListener('click', closeOnOutside);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
}

function positionPpcPopup(popup, btn) {
    if (!popup || !btn) return;
    const br = btn.getBoundingClientRect();
    const pr = popup.getBoundingClientRect();
    let top = br.top - pr.height - 10;
    let left = br.left + br.width / 2 - pr.width / 2;
    if (top < 10) top = br.bottom + 10;
    if (left < 10) left = 10;
    if (left + pr.width > window.innerWidth - 10) left = window.innerWidth - pr.width - 10;
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}

function refreshPpcPopup() {
    const popup = document.getElementById('ppc-popup');
    if (!popup) return;
    renderPpcUpper();
    renderPpcLower();
}

// ══════════════════════════════════════════
// F. PPC — Upper section (preset selector)
// ══════════════════════════════════════════

function renderPpcUpper() {
    const upper = document.getElementById('ppc-upper');
    if (!upper) return;

    const current = getCurrentPreset();
    const presets = Object.keys(openai_setting_names).filter(n => openai_settings[openai_setting_names[n]]);

    const opts = presets.map(n =>
        `<option value="${escapeHtml(n)}" ${n === current ? 'selected' : ''}>${escapeHtml(n)}</option>`
    ).join('');

    upper.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:12px;font-weight:600;opacity:0.7;flex-shrink:0">프롬프트</label>
            <select id="ppc-preset-sel" style="flex:1;padding:5px 8px;border-radius:6px;background:#2a2a2a;color:#ddd;border:1px solid rgba(255,255,255,0.15);font-size:12px;cursor:pointer">
                ${opts}
            </select>
        </div>`;

    upper.querySelector('#ppc-preset-sel')?.addEventListener('change', e => {
        const newPreset = e.target.value;
        oai_settings.preset_settings_openai = newPreset;
        saveSettingsDebounced();
        eventSource.emit(event_types.OAI_PRESET_CHANGED_AFTER, newPreset);
        renderPpcLower();
        renderTGGroups();
    });
}

// ══════════════════════════════════════════
// G. PPC — Lower section (groups, 3-state)
// ══════════════════════════════════════════

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
            rowsHtml = `<div style="font-size:12px;opacity:0.55;padding:3px 0 1px;">표시할 그룹 없음</div>`;
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
                <div style="display:flex;align-items:center;gap:7px;padding:3px 0;">
                    <button class="ppc-grp-toggle" data-gi="${gi}"
                        style="flex-shrink:0;border:none;border-radius:4px;width:32px;height:20px;font-size:11px;font-weight:700;cursor:pointer;background:${bg};color:${clr};display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;">
                        ${label}
                    </button>
                    <span class="ppc-grp-name" data-gi="${gi}"
                        style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;cursor:pointer;"
                        title="${escapeHtml(g.name)}">
                        ${escapeHtml(g.name)}
                    </span>
                </div>`;
            }).join('');
        }
    }

    lower.innerHTML = `
        <div id="ppc-grp-head" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;opacity:0.7;">
            <span style="flex:1;display:flex;align-items:center;gap:5px;">그룹 <span>${arrow}</span></span>
            <button id="ppc-theme-toggle" title="테마 선택"
                style="border:none;background:none;cursor:pointer;font-size:16px;padding:2px 4px;line-height:1.4;opacity:0.55;flex-shrink:0;display:inline-flex;align-items:center;">🤍</button>
        </div>
        ${ppcGroupsExpanded ? `<div style="margin-top:4px;">${rowsHtml}</div>` : ''}`;

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
// H. PPC — Sub-popup (3-state + PT state)
// ══════════════════════════════════════════

function buildPpcSubHtml(gi) {
    const pn = getCurrentPreset(), gs = getGroupsForPreset(pn), g = gs[gi];
    if (!g) return '<div style="padding:12px;opacity:0.6;">그룹을 찾을 수 없습니다</div>';

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
        <div style="display:flex;align-items:center;gap:5px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.08);">
            <span style="font-size:10px;width:26px;min-width:26px;height:18px;text-align:center;font-weight:700;border-radius:3px;background:${stBg};color:${stClr};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${effectOn ? 'On' : 'Off'}</span>
            <button class="ppc-sub-ovr" data-ti="${ti}"
                style="${btnStyle}background:${ovrBg};color:${ovrClr};">
                ${ovrLabel}
            </button>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <button class="ppc-sub-bsel" data-ti="${ti}"
                style="${btnStyle}background:${bBg};color:${bClr};">
                ${isDirect ? '동일' : '반전'}
            </button>
        </div>`;
    }).join('');

    return `
    <div style="padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <button class="ppc-sub-grp-toggle"
                style="border:none;border-radius:4px;width:32px;height:20px;cursor:pointer;font-size:11px;font-weight:700;flex-shrink:0;background:${grpBg};color:${grpClr};display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;">
                ${grpLabel}
            </button>
            <strong style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(g.name)}</strong>
            <button class="ppc-sub-close"
                style="border:none;background:transparent;color:#999;cursor:pointer;font-size:17px;padding:0 2px;flex-shrink:0;line-height:1;">✕</button>
        </div>
        <div class="ppc-sub-rows">
            ${rows || '<div style="opacity:0.5;font-size:12px;padding:4px 0;">토글 없음</div>'}
        </div>
    </div>`;
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

function openPpcSub(gi) {
    closePpcSub();
    ppcSubGi = gi;
    const sub = document.createElement('div');
    sub.id = 'ppc-sub';
    sub.style.cssText = `
        position:fixed;width:320px;max-height:70vh;overflow-y:auto;
        background:#1a1a1a;border-radius:12px;
        box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:10002;
    `;
    sub.innerHTML = buildPpcSubHtml(gi);
    document.body.appendChild(sub);
    positionPpcSub(sub);
    wirePpcSub(sub, gi);

    const closeOnOutside = e => {
        if (!sub.contains(e.target)) {
            closePpcSub();
            document.removeEventListener('click', closeOnOutside);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
}

function closePpcSub() {
    const sub = document.getElementById('ppc-sub');
    if (sub) sub.remove();
    ppcSubGi = null;
}

function positionPpcSub(sub) {
    if (!sub) return;
    const popup = document.getElementById('ppc-popup');
    if (!popup) return;
    const pr = popup.getBoundingClientRect();
    const sr = sub.getBoundingClientRect();
    let left = pr.right + 10;
    let top  = pr.top;
    if (left + sr.width > window.innerWidth - 10) left = pr.left - sr.width - 10;
    if (left < 10) left = 10;
    if (top + sr.height > window.innerHeight - 10) top = window.innerHeight - sr.height - 10;
    if (top < 10) top = 10;
    sub.style.left = `${left}px`;
    sub.style.top  = `${top}px`;
}

// ══════════════════════════════════════════
// I. PPC — Theme bar
// ══════════════════════════════════════════

function renderPpcThemeBar() {
    const bar = document.getElementById('ppc-theme-bar');
    if (!bar) return;
    const themes = [
        { emoji: '🤍', name: 'default' },
        { emoji: '🖤', name: 'black' },
        { emoji: '💙', name: 'blue' },
        { emoji: '💚', name: 'green' },
        { emoji: '💛', name: 'yellow' },
        { emoji: '🧡', name: 'orange' },
        { emoji: '❤️', name: 'red' },
        { emoji: '💜', name: 'purple' },
        { emoji: '🩷', name: 'pink' }
    ];
    bar.innerHTML = themes.map(t => `
        <button class="ppc-theme-btn" data-theme="${t.name}"
            style="border:none;background:rgba(255,255,255,0.08);border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:16px;display:inline-flex;align-items:center;justify-content:center;transition:background 0.2s;">
            ${t.emoji}
        </button>
    `).join('');
    bar.querySelectorAll('.ppc-theme-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.15)');
        btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,0.08)');
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const theme = btn.dataset.theme;
            applyPpcTheme(theme);
            getTGStore().ppcTheme = theme;
            saveSettingsDebounced();
        });
    });
}

function applyPpcTheme(theme) {
    const colors = {
        default: { bg: 'rgba(122,111,255,0.9)', shadow: 'rgba(122,111,255,0.4)' },
        black:   { bg: 'rgba(40,40,40,0.95)',   shadow: 'rgba(0,0,0,0.6)' },
        blue:    { bg: 'rgba(70,130,220,0.9)',  shadow: 'rgba(70,130,220,0.4)' },
        green:   { bg: 'rgba(90,184,130,0.9)',  shadow: 'rgba(90,184,130,0.4)' },
        yellow:  { bg: 'rgba(230,200,80,0.9)',  shadow: 'rgba(230,200,80,0.4)' },
        orange:  { bg: 'rgba(240,140,70,0.9)',  shadow: 'rgba(240,140,70,0.4)' },
        red:     { bg: 'rgba(220,80,80,0.9)',   shadow: 'rgba(220,80,80,0.4)' },
        purple:  { bg: 'rgba(180,100,220,0.9)', shadow: 'rgba(180,100,220,0.4)' },
        pink:    { bg: 'rgba(240,130,180,0.9)', shadow: 'rgba(240,130,180,0.4)' }
    };
    const c = colors[theme] || colors.default;
    if (ppcBtn) {
        ppcBtn.style.background = c.bg;
        ppcBtn.style.boxShadow = `0 4px 12px ${c.shadow}`;
    }
}

// ══════════════════════════════════════════
// J. Utility
// ══════════════════════════════════════════

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ══════════════════════════════════════════
// K. Init
// ══════════════════════════════════════════

jQuery(async () => {
    const html = `
    <div id="ptm-tg-drawer" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>PromptQM</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="padding:10px">
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
                <button id="ptm-add-group" class="ptm-sm">+ 그룹 추가</button>
                <button id="ptm-reorder-btn" class="ptm-sm" title="그룹 순서 변경">⠿</button>
                <button id="ptm-ppc-enable-btn" class="ptm-sm">미니창 표시</button>
            </div>
            <div id="ptm-tg-area"></div>
        </div>
    </div>`;
    $('#openai_prompt_manager_popup').append(html);

    migrateFromLegacy();
    wireTG();

    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        renderTGGroups();
        refreshPpcPopup();
    });

    const savedTheme = getTGStore().ppcTheme || 'default';
    applyPpcTheme(savedTheme);

    console.log(`[${extensionName}] Loaded (3-state system)`);
});
