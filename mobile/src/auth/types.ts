export type MobileUser = { id: string; name: string; email: string };
export type MobileAuthReply = {
  accessToken: string;
  accessExpiresInSeconds: number;
  refreshToken: string;
  user: MobileUser;
};
export type MobileCredentials = { email: string; password: string };
export interface TokenStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}
export interface AuthTransport {
  login(input: MobileCredentials): Promise<MobileAuthReply>;
  refresh(refreshToken: string): Promise<MobileAuthReply>;
  logout(refreshToken: string): Promise<void>;
}
