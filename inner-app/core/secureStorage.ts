import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { gcm } from '@noble/ciphers/aes.js';

const KEY_NAME = 'inner.sensitive-storage-key.v1';
const PREFIX = 'enc:v1:';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) => {
  if (hex.length % 2 !== 0) throw new Error('Invalid encrypted value');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

async function getKey(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return fromHex(existing);
  const key = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(KEY_NAME, toHex(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

async function encrypt(value: string): Promise<string> {
  const key = await getKey();
  const nonce = Crypto.getRandomBytes(12);
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return `${PREFIX}${toHex(nonce)}:${toHex(ciphertext)}`;
}

async function decrypt(value: string): Promise<string> {
  if (!value.startsWith(PREFIX)) return value;
  const [nonceHex, ciphertextHex] = value.slice(PREFIX.length).split(':');
  if (!nonceHex || !ciphertextHex) throw new Error('Invalid encrypted value');
  const key = await getKey();
  return new TextDecoder().decode(gcm(key, fromHex(nonceHex)).decrypt(fromHex(ciphertextHex)));
}

/** Reads old plaintext values and immediately migrates them to encrypted form. */
export async function secureGetItem(key: string): Promise<string | null> {
  const stored = await AsyncStorage.getItem(key);
  if (stored == null) return null;
  if (stored.startsWith(PREFIX)) return decrypt(stored);
  await secureSetItem(key, stored);
  return stored;
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, await encrypt(value));
}

export async function secureRemoveItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

