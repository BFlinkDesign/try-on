// @ts-check
// What the page does when the platform's downloads.save() rejects, by error code (downloads contract 0.2.92).
import { extOf } from './files.js';

/**
 * @typedef {object} Outcome
 * @property {string} toast        message shown to her
 * @property {string | null} blockExt  a file extension to switch off in this view, or null
 * @property {boolean} lose        true when saving stopped working altogether (hide every save control)
 */

/**
 * @param {unknown} code  the `code` of the rejection, or undefined for an error without one
 * @param {string} filename
 * @returns {Outcome}
 */
export function saveOutcome(code, filename) {
  if (code === 'declined') return { toast: 'Not saved.', blockExt: null, lose: false };
  if (code === 'rate_limited') return { toast: 'Please wait a moment, then try again.', blockExt: null, lose: false };
  if (code === 'rejected_extension' || code === 'extension_not_enabled') {
    return { toast: `This page can't save .${extOf(filename)} files here.`, blockExt: extOf(filename), lose: false };
  }
  if (code === 'too_large') return { toast: 'That file is too big to save here.', blockExt: null, lose: false };
  if (!code || code === 'bad_request' || code === 'transform_error') return { toast: 'Something went wrong saving that file. Please try again.', blockExt: null, lose: false };
  return { toast: 'Saving files is not available here.', blockExt: null, lose: true };   // unavailable, not_granted, capability_* and unknown codes
}
