// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveOutcome } from '../../src/lib/save-outcome.js';

// The outcome table from docs/designs/placement_downloads_and_guide.md ("One save"), downloads contract 0.2.92.
const RETRY = 'Something went wrong saving that file. Please try again.';
describe('saveOutcome', () => {
  it.each([
    ['declined', 'a.pdf', { toast: 'Not saved.', blockExt: null, lose: false }],
    ['rate_limited', 'a.pdf', { toast: 'Please wait a moment, then try again.', blockExt: null, lose: false }],
    ['rejected_extension', 'x.png', { toast: "This page can't save .png files here.", blockExt: 'png', lose: false }],
    ['extension_not_enabled', 'synthetic-tryon-2-look-6in.pdf', { toast: "This page can't save .pdf files here.", blockExt: 'pdf', lose: false }],
    ['too_large', 'a.pdf', { toast: 'That file is too big to save here.', blockExt: null, lose: false }],
    ['bad_request', 'a.pdf', { toast: RETRY, blockExt: null, lose: false }],
    ['transform_error', 'a.pdf', { toast: RETRY, blockExt: null, lose: false }],
    [undefined, 'a.pdf', { toast: RETRY, blockExt: null, lose: false }],
    [null, 'a.pdf', { toast: RETRY, blockExt: null, lose: false }],
    ['', 'a.pdf', { toast: RETRY, blockExt: null, lose: false }],
    ['unavailable', 'a.pdf', { toast: 'Saving files is not available here.', blockExt: null, lose: true }],
    ['not_granted', 'a.pdf', { toast: 'Saving files is not available here.', blockExt: null, lose: true }],
    ['capability_disabled', 'a.pdf', { toast: 'Saving files is not available here.', blockExt: null, lose: true }],
    ['capability_removed', 'a.pdf', { toast: 'Saving files is not available here.', blockExt: null, lose: true }],
  ])('%s', (code, file, want) => { expect(saveOutcome(code, file)).toEqual(want); });

  it('names the refused format from the file name (lower case)', () => {
    expect(saveOutcome('rejected_extension', 'Preview.JPG')).toEqual({ toast: "This page can't save .jpg files here.", blockExt: 'jpg', lose: false });
  });
  it('treats every code it does not know as "saving stopped"', () => {
    const known = new Set(['declined', 'rate_limited', 'rejected_extension', 'extension_not_enabled', 'too_large', 'bad_request', 'transform_error']);
    fc.assert(fc.property(fc.string({ minLength: 1 }), code => {
      fc.pre(!known.has(code));
      expect(saveOutcome(code, 'a.pdf')).toEqual({ toast: 'Saving files is not available here.', blockExt: null, lose: true });
    }));
  });
});
