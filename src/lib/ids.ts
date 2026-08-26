import { monotonicFactory } from 'ulidx';

const ulid = monotonicFactory();

/** ULID: globally unique, time sortable. Canonical replay order is id ascending. */
export const newId = (): string => ulid();

const DEVICE_KEY = 'upnext-device-id';

/** UUID generated once per install. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
