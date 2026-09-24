// Per-browser identity. The token is a secret that proves "I'm this participant" to the server;
// it's never shown to other users. Storage can be unavailable (private mode), so fall back to memory.

const TOKEN_KEY = "settled:token";
const NAME_KEY = "settled:name";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Memory fallback already holds it.
  }
}

/** crypto.randomUUID only exists on HTTPS/localhost; getRandomValues works on a LAN IP too. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getToken(): string {
  let token = read(TOKEN_KEY);
  if (!token) {
    token = randomToken();
    write(TOKEN_KEY, token);
  }
  return token;
}

export function getSavedName(): string {
  return read(NAME_KEY) ?? "";
}

export function saveName(name: string): void {
  write(NAME_KEY, name.trim());
}
