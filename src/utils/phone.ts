import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';

export function normalizePhone(phone: string): string {
  const phoneNumber = parsePhoneNumberFromString(phone);
  
  if (!phoneNumber || !phoneNumber.isValid()) {
    throw new Error('Invalid phone number');
  }
  
  return phoneNumber.format('E.164');
}

export function isValidPhone(phone: string): boolean {
  return isValidPhoneNumber(phone);
}

export function formatPhoneForDisplay(phone: string): string {
  const phoneNumber = parsePhoneNumberFromString(phone);
  return phoneNumber ? phoneNumber.format('INTERNATIONAL') : phone;
}