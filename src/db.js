import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const storageKey = "bioform.sqlite";
let databasePromise;

function decodeDatabase(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeDatabase(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
      const savedDatabase = localStorage.getItem(storageKey);
      const database = savedDatabase
        ? new SQL.Database(decodeDatabase(savedDatabase))
        : new SQL.Database();

      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      localStorage.setItem(storageKey, encodeDatabase(database.export()));
      return database;
    })();
  }

  return databasePromise;
}

function persist(database) {
  localStorage.setItem(storageKey, encodeDatabase(database.export()));
}

function findUser(database, email) {
  const statement = database.prepare(
    "SELECT id, full_name, email, password_salt, password_hash, created_at FROM users WHERE email = ?",
  );
  try {
    statement.bind([email]);
    return statement.step() ? statement.getAsObject() : null;
  } finally {
    statement.free();
  }
}

function findUserById(database, id) {
  const statement = database.prepare(
    "SELECT id, full_name, email, created_at FROM users WHERE id = ?",
  );
  try {
    statement.bind([id]);
    return statement.step() ? statement.getAsObject() : null;
  } finally {
    statement.free();
  }
}

function toProfile(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    createdAt: user.created_at,
  };
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 120_000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(derivedBits);
}

export async function registerUser({ fullName, email, password }) {
  const database = await getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  if (findUser(database, normalizedEmail)) {
    return { ok: false, reason: "email_taken" };
  }

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID(),
    full_name: fullName.trim(),
    email: normalizedEmail,
    password_salt: salt,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };

  const statement = database.prepare(
    "INSERT INTO users (id, full_name, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  try {
    statement.run([
      user.id,
      user.full_name,
      user.email,
      user.password_salt,
      user.password_hash,
      user.created_at,
    ]);
  } finally {
    statement.free();
  }
  persist(database);

  return { ok: true, user: toProfile(user) };
}

export async function loginUser({ email, password }) {
  const database = await getDatabase();
  const user = findUser(database, email.trim().toLowerCase());
  if (!user || (await hashPassword(password, user.password_salt)) !== user.password_hash) {
    return null;
  }
  return toProfile(user);
}

export async function getUserById(id) {
  const database = await getDatabase();
  const user = findUserById(database, id);
  return user ? toProfile(user) : null;
}
