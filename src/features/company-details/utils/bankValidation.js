// Validation + input sanitising for the Bank Details form.

// Letters (incl. Hindi), spaces and . ' - & ( )
const PERSON_NAME = /^[A-Za-z\p{Script=Devanagari}][A-Za-z\p{Script=Devanagari} .'&()-]*$/u;
// Bank / branch names may also contain digits and commas
const PLACE_NAME = /^[A-Za-z\p{Script=Devanagari}][A-Za-z0-9\p{Script=Devanagari} .,'&()/-]*$/u;
const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ACCOUNT_NO = /^\d{9,18}$/;
// 4 letters (bank) + 0 + 6 alphanumeric (branch), e.g. SBIN0001234
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// 8 or 11 characters, e.g. SBININBB or SBININBB104
const SWIFT = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
// name@handle, e.g. trust.name@okicici
const UPI = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/;
// Razorpay linked-account id, e.g. acc_HJG2GbJ8M8vs8f
const RAZORPAY_ACCOUNT = /^acc_[A-Za-z0-9]{14}$/;

export const BANK_FIELD_MAX_LENGTH = {
  name: 100,
  mobile: 10,
  email_id: 254,
  beneficiary_name: 100,
  account_no: 18,
  bank_name: 100,
  branch: 100,
  ifsc_code: 11,
  swift_code: 11,
  upi_id: 100,
  razorpay_id: 18,
  vendor_share: 6, // "100.00"
};

/** Cleans a value as the user types (digits only, upper-case codes, no spaces in ids). */
export function sanitizeBankField(field, value) {
  const raw = String(value ?? '');
  const max = BANK_FIELD_MAX_LENGTH[field];
  let next = raw;

  switch (field) {
    case 'mobile':
    case 'account_no':
      next = raw.replace(/\D/g, '');
      break;
    case 'ifsc_code':
    case 'swift_code':
      next = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
      break;
    case 'email_id':
    case 'upi_id':
    case 'razorpay_id':
      next = raw.replace(/\s/g, '');
      break;
    case 'vendor_share': {
      // digits + a single dot, at most 2 decimals
      const cleaned = raw.replace(/[^\d.]/g, '');
      const [whole, ...rest] = cleaned.split('.');
      next = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
      break;
    }
    default:
      // collapse double spaces while typing, keep a single trailing space
      next = raw.replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
  }

  return max ? next.slice(0, max) : next;
}

function lengthError(value, label, min = 2, max = 100) {
  if (value.length < min) return `${label} must be at least ${min} characters.`;
  if (value.length > max) return `${label} must be at most ${max} characters.`;
  return '';
}

/** Returns an error message for one field ('' when valid). `form` is used for cross-field rules. */
export function validateBankField(field, form) {
  const value = String(form?.[field] ?? '').trim();
  const accountNo = String(form?.account_no ?? '').trim();
  const ifsc = String(form?.ifsc_code ?? '').trim();

  switch (field) {
    case 'name':
      if (!value) return 'Name is required.';
      return lengthError(value, 'Name') || (PERSON_NAME.test(value) ? '' : 'Use letters and spaces only.');

    case 'mobile':
      if (!value) return 'Mobile number is required.';
      if (value.length !== 10) return 'Mobile number must be exactly 10 digits.';
      return MOBILE.test(value) ? '' : 'Enter a valid mobile number starting with 6, 7, 8 or 9.';

    case 'email_id':
      if (!value) return '';
      return EMAIL.test(value) ? '' : 'Enter a valid email address (e.g. name@example.com).';

    case 'beneficiary_name':
      if (!value) return accountNo ? 'Beneficiary name is required with an account number.' : '';
      return lengthError(value, 'Beneficiary name')
        || (PERSON_NAME.test(value) ? '' : 'Use letters and spaces only.');

    case 'account_no':
      if (!value) return ifsc ? 'Account number is required with an IFSC code.' : '';
      return ACCOUNT_NO.test(value) ? '' : 'Account number must be 9 to 18 digits.';

    case 'bank_name':
      if (!value) return accountNo ? 'Bank name is required with an account number.' : '';
      return lengthError(value, 'Bank name') || (PLACE_NAME.test(value) ? '' : 'Enter a valid bank name.');

    case 'branch':
      if (!value) return '';
      return lengthError(value, 'Branch') || (PLACE_NAME.test(value) ? '' : 'Enter a valid branch name.');

    case 'ifsc_code':
      if (!value) return accountNo ? 'IFSC code is required with an account number.' : '';
      if (value.length !== 11) return 'IFSC code must be exactly 11 characters.';
      return IFSC.test(value) ? '' : 'Invalid IFSC format (e.g. SBIN0001234: 4 letters, 0, then 6 letters/digits).';

    case 'swift_code':
      if (!value) return '';
      return SWIFT.test(value) ? '' : 'SWIFT code must be 8 or 11 characters (e.g. SBININBB).';

    case 'upi_id':
      if (!value) return '';
      return UPI.test(value) ? '' : 'Enter a valid UPI ID (e.g. trustname@okicici).';

    case 'razorpay_id':
      if (!value) return '';
      return RAZORPAY_ACCOUNT.test(value)
        ? ''
        : 'Razorpay ID must look like acc_ followed by 14 letters/digits (e.g. acc_HJG2GbJ8M8vs8f).';

    case 'vendor_share': {
      if (!value) return '';
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return 'Enter a number with up to 2 decimals (e.g. 12.5).';
      const percent = Number(value);
      if (percent < 0 || percent > 100) return 'Vendor share must be between 0 and 100%.';
      return '';
    }

    default:
      return '';
  }
}

export const BANK_VALIDATED_FIELDS = [
  'name',
  'mobile',
  'email_id',
  'beneficiary_name',
  'account_no',
  'bank_name',
  'branch',
  'ifsc_code',
  'swift_code',
  'upi_id',
  'razorpay_id',
  'vendor_share',
];

/** Validates the whole form. Returns { errors: {field: message}, formError, isValid }. */
export function validateBankForm(form) {
  const errors = {};
  BANK_VALIDATED_FIELDS.forEach((field) => {
    const message = validateBankField(field, form);
    if (message) errors[field] = message;
  });

  const has = (key) => String(form?.[key] ?? '').trim().length > 0;
  const hasPaymentMethod = (has('account_no') && has('ifsc_code')) || has('upi_id') || has('razorpay_id') || has('qr');
  const formError = hasPaymentMethod
    ? ''
    : 'Add at least one payment detail: Account No. + IFSC, UPI ID, Razorpay ID or a QR image.';

  return { errors, formError, isValid: !Object.keys(errors).length && !formError };
}
