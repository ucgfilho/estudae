export interface ISensitiveDataCipher {
  encrypt(plaintext: string): string;
  decrypt(storedValue: string): string;
  encryptForTenant(ownerId: string, plaintext: string): string;
  decryptForTenant(ownerId: string, storedValue: string): string;
  blindIndex(value: string, namespace?: string): string;
}

