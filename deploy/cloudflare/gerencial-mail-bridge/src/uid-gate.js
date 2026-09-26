function normalizeMailboxUid(value) {
  const uid = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(uid)) {
    throw new TypeError(`INVALID_MAILBOX_UID:${uid || '<empty>'}`);
  }
  return uid;
}

function normalizeUidSet(values, label) {
  if (values == null || typeof values[Symbol.iterator] !== 'function') {
    throw new TypeError(`${label}_MUST_RETURN_ITERABLE`);
  }
  return new Set(Array.from(values, normalizeMailboxUid));
}

function normalizeCandidates(candidateUids) {
  if (!Array.isArray(candidateUids)) {
    throw new TypeError('CANDIDATE_UIDS_ARRAY_REQUIRED');
  }
  const unique = [];
  const seen = new Set();
  for (const rawUid of candidateUids) {
    const uid = normalizeMailboxUid(rawUid);
    if (!seen.has(uid)) {
      seen.add(uid);
      unique.push(uid);
    }
  }
  return unique;
}
export async function selectDualSinkMailboxUids({
  candidateUids,
  loadKnownPrimary,
  loadKnownMirror,
}) {
  if (typeof loadKnownPrimary !== 'function') {
    throw new TypeError('LOAD_KNOWN_PRIMARY_REQUIRED');
  }
  if (typeof loadKnownMirror !== 'function') {
    throw new TypeError('LOAD_KNOWN_MIRROR_REQUIRED');
  }

  const unique = normalizeCandidates(candidateUids);
  if (!unique.length) {
    return { known: [], unknown: [], divergent: [] };
  }

  const primary = normalizeUidSet(
    await loadKnownPrimary(unique),
    'PRIMARY_UID_LOOKUP',
  );
  const mirror = normalizeUidSet(
    await loadKnownMirror(unique),
    'MIRROR_UID_LOOKUP',
  );
  const known = [];
  const unknown = [];
  const divergent = [];

  for (const uid of unique) {
    const inPrimary = primary.has(uid);
    const inMirror = mirror.has(uid);
    if (inPrimary && inMirror) {
      known.push(uid);
      continue;
    }
    unknown.push(uid);
    if (inPrimary !== inMirror) divergent.push(uid);
  }

  return { known, unknown, divergent };
}
