import { describe, it, expect, beforeEach } from 'vitest';
import {
  state, ROLES, DEFAULT_STATUSES, DEFAULT_PRIORITIES,
  createTmp, updateTmp, deleteTmp, advanceStatus,
  getFilteredTmps, getTmpsByStatus, getCountByStatus,
  getActiveStatuses, getStatusLabel, getStatusStyle,
  getPriorityLabel, getPriorityStyle, canEdit, canDelete, canManageSettings,
  userRole, persist, persistSettings,
} from '../state.js';

beforeEach(() => {
  state.tmps = [];
  state.currentUser = { username: 'admin', role: 'admin' };
  state.settings.statuses = JSON.parse(JSON.stringify(DEFAULT_STATUSES));
  state.settings.priorities = JSON.parse(JSON.stringify(DEFAULT_PRIORITIES));
  state.searchQuery = '';
  localStorage.clear();
});

describe('createTmp', () => {
  it('creates a TMP with generated number', () => {
    const tmp = createTmp({ projectName: 'Test Project', clientName: 'Test Client', location: 'Test Location' });
    expect(tmp.id).toBeTruthy();
    expect(tmp.tmpNumber).toMatch(/^TMP-\d{4}-\d{3}$/);
    expect(tmp.projectName).toBe('Test Project');
    expect(tmp.status).toBe('new');
    expect(state.tmps).toHaveLength(1);
  });

  it('uses provided tmpNumber', () => {
    const tmp = createTmp({ tmpNumber: 'CUSTOM-001', projectName: 'Test' });
    expect(tmp.tmpNumber).toBe('CUSTOM-001');
  });
});

describe('updateTmp', () => {
  it('updates a TMP', () => {
    const tmp = createTmp({ projectName: 'Original' });
    const updated = updateTmp(tmp.id, { projectName: 'Updated' });
    expect(updated.projectName).toBe('Updated');
    expect(updated.lastUpdated).not.toBe(tmp.lastUpdated);
  });

  it('returns null for non-existent id', () => {
    expect(updateTmp('nonexistent', { projectName: 'X' })).toBeNull();
  });
});

describe('deleteTmp', () => {
  it('removes a TMP', () => {
    const tmp = createTmp({ projectName: 'To Delete' });
    expect(state.tmps).toHaveLength(1);
    deleteTmp(tmp.id);
    expect(state.tmps).toHaveLength(0);
  });
});

describe('advanceStatus', () => {
  it('moves TMP to next status', () => {
    const tmp = createTmp({ projectName: 'Test', status: 'new' });
    advanceStatus(tmp.id, true);
    expect(tmp.status).toBe('in-progress');
  });

  it('does not advance past last status', () => {
    const tmp = createTmp({ projectName: 'Test', status: 'completed' });
    advanceStatus(tmp.id, true);
    expect(tmp.status).toBe('completed');
  });
});

describe('getFilteredTmps', () => {
  it('filters by search query', () => {
    createTmp({ projectName: 'Alpha Project', clientName: 'Beta Corp', location: 'Sydney' });
    createTmp({ projectName: 'Gamma Works', clientName: 'Delta Ltd', location: 'Melbourne' });
    state.searchQuery = 'alpha';
    expect(getFilteredTmps()).toHaveLength(1);
    expect(getFilteredTmps()[0].projectName).toBe('Alpha Project');
  });

  it('returns all when no query', () => {
    createTmp({ projectName: 'A' });
    createTmp({ projectName: 'B' });
    state.searchQuery = '';
    expect(getFilteredTmps()).toHaveLength(2);
  });
});

describe('getTmpsByStatus', () => {
  it('returns only TMPs matching status', () => {
    createTmp({ projectName: 'A', status: 'new' });
    createTmp({ projectName: 'B', status: 'in-progress' });
    createTmp({ projectName: 'C', status: 'new' });
    expect(getTmpsByStatus('new')).toHaveLength(2);
    expect(getTmpsByStatus('in-progress')).toHaveLength(1);
  });
});

describe('getCountByStatus', () => {
  it('counts TMPs by status', () => {
    createTmp({ projectName: 'A', status: 'new' });
    createTmp({ projectName: 'B', status: 'new' });
    expect(getCountByStatus('new')).toBe(2);
    expect(getCountByStatus('completed')).toBe(0);
  });
});

describe('getActiveStatuses', () => {
  it('returns only enabled statuses', () => {
    state.settings.statuses[0].enabled = false;
    const active = getActiveStatuses();
    expect(active.find(s => s.id === 'new')).toBeUndefined();
    expect(active).toHaveLength(DEFAULT_STATUSES.length - 1);
  });
});

describe('getStatusLabel / getStatusStyle', () => {
  it('returns label for valid status', () => {
    expect(getStatusLabel('new')).toBe('New');
  });
  it('returns id for unknown status', () => {
    expect(getStatusLabel('unknown')).toBe('unknown');
  });
  it('returns style string', () => {
    const style = getStatusStyle('new');
    expect(style).toContain('background:');
    expect(style).toContain('color:');
  });
});

describe('getPriorityLabel / getPriorityStyle', () => {
  it('returns label for valid priority', () => {
    expect(getPriorityLabel('high')).toBe('High');
  });
  it('returns style string', () => {
    const style = getPriorityStyle('high');
    expect(style).toContain('background:');
  });
});

describe('permissions', () => {
  it('admin can edit, delete, manage settings', () => {
    state.currentUser = { username: 'admin', role: 'admin' };
    expect(canEdit()).toBe(true);
    expect(canDelete()).toBe(true);
    expect(canManageSettings()).toBe(true);
  });

  it('viewer cannot edit or delete', () => {
    state.currentUser = { username: 'viewer', role: 'viewer' };
    expect(canEdit()).toBe(false);
    expect(canDelete()).toBe(false);
    expect(canManageSettings()).toBe(false);
  });

  it('planner can edit but not manage settings', () => {
    state.currentUser = { username: 'planner', role: 'planner' };
    expect(canEdit()).toBe(true);
    expect(canManageSettings()).toBe(false);
  });
});

describe('userRole', () => {
  it('returns role of current user', () => {
    state.currentUser = { username: 'test', role: 'inspector' };
    expect(userRole()).toBe('inspector');
  });

  it('returns viewer when no user', () => {
    state.currentUser = null;
    expect(userRole()).toBe('viewer');
  });
});
