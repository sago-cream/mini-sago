import { Database } from "bun:sqlite";
import { mkdir, rename, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import {
  meetingTokens,
  normalizeMeetingText,
  type CcxpDocument,
  type CcxpCoverage,
} from "../../contracts/ccxp-meetings";

export function readDocuments(path: string): CcxpDocument[] {
  if (!Bun.file(path).size) return [];
  const db = new Database(path, { readonly: true });
  try {
    return db
      .query<Omit<CcxpDocument, "pages">, []>(
        "SELECT id, category, title, sourceUrl, fetchedAt, state, pageKind FROM documents",
      )
      .all()
      .map((doc) => ({
        ...doc,
        pages: db
          .query<{ text: string }, [string]>(
            "SELECT text FROM pages WHERE documentId=? ORDER BY page",
          )
          .all(doc.id)
          .map((p) => p.text),
      }));
  } finally {
    db.close();
  }
}

// Publish a complete SQLite file by rename. Core mounts only this directory read-only.
export async function publishIndex(
  path: string,
  documents: CcxpDocument[],
  coverage: CcxpCoverage,
) {
  await mkdir(dirname(path), { recursive: true, mode: 0o750 });
  const temporary = `${path}.next`;
  const db = new Database(temporary, { create: true });
  try {
    db.exec(`
      DROP TABLE IF EXISTS metadata; DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS pages_fts;
      CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE documents(id TEXT PRIMARY KEY, category TEXT, title TEXT, sourceUrl TEXT, fetchedAt TEXT, state TEXT, pageKind TEXT, pageCount INTEGER);
      CREATE TABLE pages(documentId TEXT, page INTEGER, text TEXT, normalized TEXT, UNIQUE(documentId,page));
      CREATE VIRTUAL TABLE pages_fts USING fts5(tokens);
    `);
    db.transaction(() => {
      db.query("INSERT INTO metadata VALUES ('coverage', ?)").run(
        JSON.stringify(coverage),
      );
      const insertDoc = db.query(
        "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?)",
      );
      const insertPage = db.query("INSERT INTO pages VALUES (?,?,?,?)");
      const insertFts = db.query(
        "INSERT INTO pages_fts(rowid,tokens) VALUES (?,?)",
      );
      for (const doc of documents) {
        insertDoc.run(
          doc.id,
          doc.category,
          doc.title,
          doc.sourceUrl,
          doc.fetchedAt,
          doc.state,
          doc.pageKind,
          doc.pages.length,
        );
        doc.pages.forEach((text, i) => {
          const result = insertPage.run(
            doc.id,
            i + 1,
            text,
            normalizeMeetingText(`${doc.title} ${text}`),
          );
          insertFts.run(
            result.lastInsertRowid,
            meetingTokens(`${doc.title} ${text}`),
          );
        });
      }
    })();
  } finally {
    db.close();
  }
  await chmod(temporary, 0o640);
  await rename(temporary, path);
}
