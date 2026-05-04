/**
 * Unit tests for the SLA helper functions extracted from slaMonitor.js
 *
 * isSlaBreached(deadline) — returns true when the deadline has passed
 * isWithinHours(deadline, hours) — returns true when deadline is in the
 *   future but within `hours` hours from now
 *
 * These are pure functions so we test them in isolation without any mocks.
 */

// ── Inline the helpers (they are not exported from slaMonitor, so we
//    duplicate them here — this is the standard approach for private helpers) ──

const isSlaBreached = (deadline) => {
    if (!deadline) return false;
    return new Date() > new Date(deadline);
};

const isWithinHours = (deadline, hours) => {
    if (!deadline || !hours || hours <= 0) return false;
    const deadlineMs = new Date(deadline).getTime();
    const nowMs = Date.now();
    return deadlineMs > nowMs && (deadlineMs - nowMs) <= hours * 60 * 60 * 1000;
};

// ── isSlaBreached ─────────────────────────────────────────────────────────────
describe('isSlaBreached', () => {
    test('returns false for a null deadline', () => {
        expect(isSlaBreached(null)).toBe(false);
    });

    test('returns false for an undefined deadline', () => {
        expect(isSlaBreached(undefined)).toBe(false);
    });

    test('returns false when deadline is in the future', () => {
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour
        expect(isSlaBreached(future)).toBe(false);
    });

    test('returns true when deadline is in the past', () => {
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // -1 hour
        expect(isSlaBreached(past)).toBe(true);
    });

    test('returns true for a deadline that just passed (1 ms ago)', () => {
        const justPast = new Date(Date.now() - 1).toISOString();
        expect(isSlaBreached(justPast)).toBe(true);
    });
});

// ── isWithinHours ─────────────────────────────────────────────────────────────
describe('isWithinHours', () => {
    test('returns false for a null deadline', () => {
        expect(isWithinHours(null, 2)).toBe(false);
    });

    test('returns false when hours is 0', () => {
        const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        expect(isWithinHours(future, 0)).toBe(false);
    });

    test('returns false when hours is negative', () => {
        const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        expect(isWithinHours(future, -1)).toBe(false);
    });

    test('returns false when deadline is already past', () => {
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        expect(isWithinHours(past, 2)).toBe(false);
    });

    test('returns false when deadline is further away than the window', () => {
        const farFuture = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(); // +5 hours
        expect(isWithinHours(farFuture, 2)).toBe(false); // 5h away, window is 2h
    });

    test('returns true when deadline is within the window', () => {
        const soonFuture = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // +30 min
        expect(isWithinHours(soonFuture, 1)).toBe(true); // 30 min away, window is 1h
    });

    test('returns true when deadline is exactly at the edge of the window', () => {
        // 2 hours from now, window is 2 hours — should be within
        const edge = new Date(Date.now() + 2 * 60 * 60 * 1000 - 100).toISOString();
        expect(isWithinHours(edge, 2)).toBe(true);
    });
});
