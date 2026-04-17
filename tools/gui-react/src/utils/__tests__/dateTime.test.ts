import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatTimezoneLabel,
} from '../dateTime.ts';

const REF_ISO = '2026-04-17T18:30:45.123Z';
const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const DENVER = 'America/Denver';
const CHICAGO = 'America/Chicago';

describe('formatDate', () => {
  it('formats MM-DD-YY in Pacific (PDT in April)', () => {
    strictEqual(formatDate(REF_ISO, LA, 'MM-DD-YY'), '04-17-26');
  });

  it('formats MM-DD-YYYY in Pacific', () => {
    strictEqual(formatDate(REF_ISO, LA, 'MM-DD-YYYY'), '04-17-2026');
  });

  it('formats YYYY-MM-DD in Pacific', () => {
    strictEqual(formatDate(REF_ISO, LA, 'YYYY-MM-DD'), '2026-04-17');
  });

  it('formats DD-MM-YY in Pacific', () => {
    strictEqual(formatDate(REF_ISO, LA, 'DD-MM-YY'), '17-04-26');
  });

  it('formats MM-DD-YY in UTC', () => {
    strictEqual(formatDate(REF_ISO, 'UTC', 'MM-DD-YY'), '04-17-26');
  });

  it('crosses date boundary when Pacific day is earlier than UTC', () => {
    strictEqual(formatDate('2026-04-17T05:30:00Z', LA, 'MM-DD-YY'), '04-16-26');
  });

  it('formats MM-DD-YY in Eastern', () => {
    strictEqual(formatDate(REF_ISO, NY, 'MM-DD-YY'), '04-17-26');
  });

  it('formats MM-DD-YY in Mountain', () => {
    strictEqual(formatDate(REF_ISO, DENVER, 'MM-DD-YY'), '04-17-26');
  });

  it('formats MM-DD-YY in Central', () => {
    strictEqual(formatDate(REF_ISO, CHICAGO, 'MM-DD-YY'), '04-17-26');
  });

  it('returns empty for null input', () => {
    strictEqual(formatDate(null, LA, 'MM-DD-YY'), '');
  });

  it('returns empty for undefined input', () => {
    strictEqual(formatDate(undefined, LA, 'MM-DD-YY'), '');
  });

  it('returns empty for empty string input', () => {
    strictEqual(formatDate('', LA, 'MM-DD-YY'), '');
  });

  it('returns empty for invalid ISO input', () => {
    strictEqual(formatDate('not-a-date', LA, 'MM-DD-YY'), '');
  });

  it('handles winter date (PST, standard time)', () => {
    strictEqual(formatDate('2026-01-15T12:00:00Z', LA, 'MM-DD-YY'), '01-15-26');
  });

  it('parses SQLite datetime format as UTC (not local)', () => {
    // "2026-04-17 21:24:10" from SQLite is UTC. In PDT that's 14:24 on 4-17.
    strictEqual(formatDate('2026-04-17 21:24:10', LA, 'MM-DD-YY'), '04-17-26');
  });

  it('SQLite UTC timestamp crossing to previous day in Pacific', () => {
    // 03:00 UTC on 4-17 is 20:00 PDT on 4-16
    strictEqual(formatDate('2026-04-17 03:00:00', LA, 'MM-DD-YY'), '04-16-26');
  });
});

describe('formatTime', () => {
  it('formats 12-hour time in Pacific by default', () => {
    strictEqual(formatTime(REF_ISO, LA), '11:30 AM');
  });

  it('formats 12-hour time in UTC', () => {
    strictEqual(formatTime(REF_ISO, 'UTC'), '6:30 PM');
  });

  it('formats 12-hour time in Eastern', () => {
    strictEqual(formatTime(REF_ISO, NY), '2:30 PM');
  });

  it('formats 12-hour time in Central', () => {
    strictEqual(formatTime(REF_ISO, CHICAGO), '1:30 PM');
  });

  it('formats 12-hour time in Mountain', () => {
    strictEqual(formatTime(REF_ISO, DENVER), '12:30 PM');
  });

  it('formats 24-hour time when hour12 is false', () => {
    strictEqual(formatTime(REF_ISO, 'UTC', false), '18:30');
  });

  it('formats 24-hour time in Pacific', () => {
    strictEqual(formatTime(REF_ISO, LA, false), '11:30');
  });

  it('returns empty for null', () => {
    strictEqual(formatTime(null, LA), '');
  });

  it('returns empty for undefined', () => {
    strictEqual(formatTime(undefined, LA), '');
  });

  it('returns empty for invalid ISO', () => {
    strictEqual(formatTime('bad-iso', LA), '');
  });

  it('parses SQLite datetime format as UTC', () => {
    // 21:24 UTC = 14:24 PDT (not 21:24 local)
    strictEqual(formatTime('2026-04-17 21:24:10', LA), '2:24 PM');
  });
});

describe('formatDateTime', () => {
  it('combines date and time in Pacific with MM-DD-YY default', () => {
    strictEqual(formatDateTime(REF_ISO, LA, 'MM-DD-YY'), '04-17-26 11:30 AM');
  });

  it('combines date and time in Pacific with YYYY-MM-DD', () => {
    strictEqual(formatDateTime(REF_ISO, LA, 'YYYY-MM-DD'), '2026-04-17 11:30 AM');
  });

  it('combines date and time in UTC', () => {
    strictEqual(formatDateTime(REF_ISO, 'UTC', 'MM-DD-YY'), '04-17-26 6:30 PM');
  });

  it('combines date and time 24-hour in Pacific', () => {
    strictEqual(formatDateTime(REF_ISO, LA, 'MM-DD-YY', false), '04-17-26 11:30');
  });

  it('returns empty for null', () => {
    strictEqual(formatDateTime(null, LA, 'MM-DD-YY'), '');
  });

  it('returns empty for invalid ISO', () => {
    strictEqual(formatDateTime('bad', LA, 'MM-DD-YY'), '');
  });
});

describe('formatTimezoneLabel', () => {
  const WINTER = new Date('2026-01-15T12:00:00Z');
  const SUMMER = new Date('2026-07-15T12:00:00Z');

  it('returns PST for Pacific in winter', () => {
    strictEqual(formatTimezoneLabel(LA, WINTER), 'PST');
  });

  it('returns PDT for Pacific in summer', () => {
    strictEqual(formatTimezoneLabel(LA, SUMMER), 'PDT');
  });

  it('returns EST for Eastern in winter', () => {
    strictEqual(formatTimezoneLabel(NY, WINTER), 'EST');
  });

  it('returns EDT for Eastern in summer', () => {
    strictEqual(formatTimezoneLabel(NY, SUMMER), 'EDT');
  });

  it('returns MST for Mountain in winter', () => {
    strictEqual(formatTimezoneLabel(DENVER, WINTER), 'MST');
  });

  it('returns MDT for Mountain in summer', () => {
    strictEqual(formatTimezoneLabel(DENVER, SUMMER), 'MDT');
  });

  it('returns CST for Central in winter', () => {
    strictEqual(formatTimezoneLabel(CHICAGO, WINTER), 'CST');
  });

  it('returns CDT for Central in summer', () => {
    strictEqual(formatTimezoneLabel(CHICAGO, SUMMER), 'CDT');
  });

  it('returns UTC for UTC zone', () => {
    strictEqual(formatTimezoneLabel('UTC', WINTER), 'UTC');
  });
});
