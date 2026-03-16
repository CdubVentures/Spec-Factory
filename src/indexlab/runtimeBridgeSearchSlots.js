// WHY: Search slot scheduler extracted from runtimeBridge.js
// Factory pattern — encapsulates 26-letter slot pool allocation/release lifecycle.

export function createSearchSlotScheduler({ observability, counters }) {
  const _searchSlots = new Map();
  const _searchSlotLabels = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let _searchNextSlotIndex = 0;
  const _queryToSlot = new Map();

  function searchQueryKey(row = {}) {
    const query = String(row.query || '').trim().toLowerCase();
    const provider = String(row.provider || '').trim().toLowerCase();
    return `${query}::${provider}`;
  }

  function allocateSlot(queryKey) {
    for (const [letter, slot] of _searchSlots) {
      if (slot.state === 'idle') {
        observability.search_slot_reuse += 1;
        slot.state = 'running';
        slot.tasks_started += 1;
        slot.current_query_key = queryKey;
        _queryToSlot.set(queryKey, letter);
        return slot;
      }
    }
    if (_searchNextSlotIndex < _searchSlotLabels.length) {
      const letter = _searchSlotLabels[_searchNextSlotIndex];
      _searchNextSlotIndex += 1;
      const slot = {
        worker_id: `search-${letter}`,
        slot: letter,
        state: 'running',
        tasks_started: 1,
        current_query_key: queryKey
      };
      _searchSlots.set(letter, slot);
      _queryToSlot.set(queryKey, letter);
      return slot;
    }
    counters.search_workers += 1;
    return {
      worker_id: `search-overflow-${counters.search_workers}`,
      slot: null,
      state: 'running',
      tasks_started: 1,
      current_query_key: queryKey
    };
  }

  function releaseSlot(queryKey) {
    const letter = _queryToSlot.get(queryKey);
    if (letter) {
      _queryToSlot.delete(queryKey);
      const slot = _searchSlots.get(letter);
      if (slot) {
        slot.state = 'idle';
        slot.current_query_key = '';
        return slot;
      }
    }
    observability.search_finish_without_start += 1;
    let fallbackSlot = null;
    for (const [, slot] of _searchSlots) {
      if (slot.state === 'running') {
        fallbackSlot = slot;
      }
    }
    if (fallbackSlot) {
      fallbackSlot.state = 'idle';
      fallbackSlot.current_query_key = '';
      return fallbackSlot;
    }
    counters.search_workers += 1;
    return {
      worker_id: `search-orphan-${counters.search_workers}`,
      slot: null,
      state: 'idle',
      tasks_started: 0,
      current_query_key: ''
    };
  }

  function getQuerySlot(queryKey) {
    return _queryToSlot.get(queryKey);
  }

  function getSlots() {
    return _searchSlots;
  }

  function getSlotLabels() {
    return _searchSlotLabels;
  }

  function getQueryToSlot() {
    return _queryToSlot;
  }

  function getNextSlotIndex() {
    return _searchNextSlotIndex;
  }

  function reset() {
    _searchSlots.clear();
    _queryToSlot.clear();
    _searchNextSlotIndex = 0;
  }

  return { searchQueryKey, allocateSlot, releaseSlot, getQuerySlot, getSlots, getSlotLabels, getQueryToSlot, getNextSlotIndex, reset };
}
