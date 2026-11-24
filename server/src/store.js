import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../storage')
const dbFile = path.join(root, 'data.json')
const initial = { releases: [], licenses: [], billingEvents: [] }

export async function readStore() {
  await fs.mkdir(root, { recursive: true })
  try { return JSON.parse(await fs.readFile(dbFile, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeStore(initial); return structuredClone(initial) }
}
export async function writeStore(data) {
  await fs.mkdir(root, { recursive: true })
  const temp = `${dbFile}.tmp`
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(temp, dbFile)
}
export const releaseDirectory = path.join(root, 'releases')
