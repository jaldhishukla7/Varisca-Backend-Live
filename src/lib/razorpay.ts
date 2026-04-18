import Razorpay from 'razorpay';

function requireKeys(): { key_id: string; key_secret: string } {
  const key_id = (process.env.RAZORPAY_KEY_ID || '').trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!key_id || !key_secret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
  }
  return { key_id, key_secret };
}

let instance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!instance) {
    const { key_id, key_secret } = requireKeys();
    instance = new Razorpay({ key_id, key_secret });
  }
  return instance;
}

export function getRazorpayKeyId(): string {
  return (process.env.RAZORPAY_KEY_ID || '').trim();
}

export function isRazorpayConfigured(): boolean {
  const id = (process.env.RAZORPAY_KEY_ID || '').trim();
  const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  return !!(id && secret);
}
