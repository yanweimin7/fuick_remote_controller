export class StorageService {
  static async getString(key: string): Promise<string | null> {
    return await (globalThis as any).dartCallNativeAsync("Storage.getString", { key });
  }

  static async setString(key: string, value: string): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Storage.setString", { key, value });
  }

  static async remove(key: string): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Storage.remove", { key });
  }
}
