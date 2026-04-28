import Razorpay from 'razorpay';
import pool from '../db';

type RazorpayConfig = {
  key_id: string;
  key_secret: string;
};

type PaymentSettings = {
  razorpayEnabled?: boolean;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
};

function fromEnv(): RazorpayConfig | null {
  const key_id = (process.env.RAZORPAY_KEY_ID || '').trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  return key_id && key_secret ? { key_id, key_secret } : null;
}

async function fromSettings(): Promise<RazorpayConfig | null> {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', ['payment']);
  if (rows.length === 0) return null;

  const value = (rows[0].value || {}) as PaymentSettings;
  if (!value.razorpayEnabled) return null;

  const key_id = String(value.razorpayKeyId || '').trim();
  const key_secret = String(value.razorpayKeySecret || '').trim();
  return key_id && key_secret ? { key_id, key_secret } : null;
}

export async function resolveRazorpayConfig(): Promise<RazorpayConfig | null> {
  const envConfig = fromEnv();
  if (envConfig) return envConfig;
  return fromSettings();
}

let instance: Razorpay | null = null;
let cachedConfigKey: string | null = null;

export async function getRazorpay(): Promise<Razorpay> {
  const cfg = await resolveRazorpayConfig();
  if (!cfg) {
    throw new Error('Razorpay credentials are not configured');
  }

  const currentKey = `${cfg.key_id}:${cfg.key_secret}`;
  if (!instance || cachedConfigKey !== currentKey) {
    const { key_id, key_secret } = cfg;
    instance = new Razorpay({ key_id, key_secret });
    cachedConfigKey = currentKey;
  }
  return instance;
}

export async function getRazorpayKeyId(): Promise<string> {
  const cfg = await resolveRazorpayConfig();
  return cfg?.key_id || '';
}

export async function isRazorpayConfigured(): Promise<boolean> {
  const cfg = await resolveRazorpayConfig();
  return !!cfg;
}
