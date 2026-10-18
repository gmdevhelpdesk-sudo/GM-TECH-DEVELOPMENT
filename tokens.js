  /* ============================================================
     6. PUBLIC API — window.GMTokens
     ============================================================ */
  function normalize(token) {
    return String(token || '').trim().toLowerCase();
  }
  function findUsed(normalizedToken, usedList) {
    return usedList.find(x => x.token === normalizedToken);
  }
  function detectTier(normalizedToken) {
    if (ULTRA_TOKENS.indexOf(normalizedToken) !== -1) return 'ultra';
    if (PRO_TOKENS.indexOf(normalizedToken) !== -1)   return 'pro';
    if (FREE_TOKENS.indexOf(normalizedToken) !== -1)  return 'free';
    return null;
  }
  function formatUsedAt(ts) {
    if (!ts) return 'an earlier date';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /* --- NEW ASYNC VALIDATE FUNCTION --- */
  async function validate(rawToken) {
    const t = normalize(rawToken);

    if (!t) return { ok: false, code: 'empty', reason: 'Please enter a token.' };

    const usedList = loadUsed();
    const used = findUsed(t, usedList);

    if (used) {
      return { ok: false, code: 'used', usedAt: used.usedAt, reason: 'This token has already been used on ' + formatUsedAt(used.usedAt) + '.' };
    }

    /* 1. Check hardcoded lists first (offline) */
    if (ULTRA_TOKENS.indexOf(t) !== -1) return { ok: true, tier: 'ultra', token: t, duration: TIER_CONFIG.ultra.days, label: TIER_CONFIG.ultra.label };
    if (PRO_TOKENS.indexOf(t) !== -1)   return { ok: true, tier: 'pro', token: t, duration: TIER_CONFIG.pro.days, label: TIER_CONFIG.pro.label };
    if (FREE_TOKENS.indexOf(t) !== -1)  return { ok: true, tier: 'free', token: t, duration: TIER_CONFIG.free.days, label: TIER_CONFIG.free.label };

    /* 2. Check dynamic server tokens (requires internet) */
    if (/^[a-f0-9]{64}$/.test(t)) {
      try {
        const deviceId = localStorage.getItem('gmnotes_device_v1');
        // Hit the server to validate the Device ID
        const res = await fetch(`${window.GM_CONFIG.apiBase}/validate-token?token=${t}&deviceId=${deviceId}`);
        const data = await res.json();

        if (!data.ok) {
          return { ok: false, code: 'invalid', reason: data.reason };
        }

        return { 
          ok: true, 
          tier: data.tier, 
          token: t, 
          duration: data.duration, 
          label: data.tier === 'ultra' ? 'Ultra' : 'Pro' 
        };
      } catch (e) {
        return { ok: false, code: 'network', reason: 'Network error. Cannot verify token online.' };
      }
    }

    /* 3. Helpful hints for invalid tokens */
    let reason = 'Invalid token. Please check the spelling and try again.';
    if (t.length < 60) reason = 'Invalid token. Tokens are 64 characters long — check you copied the whole thing.';
    else if (!/^[a-f0-9]+$/.test(t)) reason = 'Invalid token. Only letters a–f and numbers 0–9 are allowed.';
    else reason = 'Invalid token. This code is not in our system.';

    return { ok: false, code: 'invalid', reason: reason };
  }

  /**
   * Mark a token as used (once per device).
   */
  function markUsed(rawToken, tier) {
    const t = normalize(rawToken);
    const list = loadUsed();
    if (findUsed(t, list)) return list;
    list.push({ token: t, usedAt: Date.now(), tier: tier || detectTier(t) || 'unknown' });
    saveUsed(list);
    return list;
  }

  function isUsed(rawToken) {
    const t = normalize(rawToken);
    return !!findUsed(t, loadUsed());
  }

  function getUsedList() { return loadUsed(); }
  function _resetUsed() { saveUsed([]); }

  function freeCount()  { return FREE_TOKENS.length;  }
  function proCount()   { return PRO_TOKENS.length;   }
  function ultraCount() { return ULTRA_TOKENS.length; }
  function totalCount() { return FREE_TOKENS.length + PRO_TOKENS.length + ULTRA_TOKENS.length; }

  function getDuration(tier) { const cfg = TIER_CONFIG[tier]; return cfg ? cfg.days : 0; }
  function getLabel(tier) { const cfg = TIER_CONFIG[tier]; return cfg ? cfg.label : 'Free'; }

  /* ============================================================
     7. EXPOSE — window.GMTokens
     ============================================================ */
  window.GMTokens = {
    validate: validate,
    markUsed: markUsed,
    isUsed: isUsed,
    getUsedList: getUsedList,
    getDuration: getDuration,
    getLabel: getLabel,
    freeCount: freeCount,
    proCount: proCount,
    ultraCount: ultraCount,
    totalCount: totalCount,
    _resetUsed: _resetUsed
  };

  console.log(`%cGMTokens loaded · ${totalCount()} tokens`, 'color:#f5c842;font-weight:bold');
})();