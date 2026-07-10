import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const judgesDir = join(projectRoot, 'src/app/admin/events/[eventId]/judges');
const linksDir = join(projectRoot, 'src/app/admin/events/[eventId]/links');

describe('admin judges and live links security surface', () => {
  it('judges e links admin non espongono Server Actions mutative dedicate', () => {
    const files = [...listSourceFiles(judgesDir), ...listSourceFiles(linksDir)];

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');

      expect(source).not.toContain("'use server'");
      expect(source).not.toContain('"use server"');
      expect(source).not.toMatch(/from\('judges'\)\.(insert|update|delete|upsert)/);
      expect(source).not.toMatch(/from\('judge_station_assignments'\)\.(insert|update|delete|upsert)/);
      expect(source).not.toMatch(/token_hash.*=.*input/);
      expect(source).not.toMatch(/qr_url.*=.*input/);
    }
  });

  it('event-links e pagine judges/links sono read-only rispetto a giudici e assignment', () => {
    const files = [
      join(projectRoot, 'src/lib/event-links.ts'),
      ...listSourceFiles(judgesDir),
      ...listSourceFiles(linksDir),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');

      expect(source).not.toMatch(/from\('judges'\)\.(insert|update|delete|upsert)/);
      expect(source).not.toMatch(/from\('judge_station_assignments'\)\.(insert|update|delete|upsert)/);
    }
  });

  it('le mutation esistenti su judges restano confinate a creazione e duplicazione edizione gia protette', () => {
    const knownMutativeFiles = [
      'src/app/admin/events/new/actions.ts',
      'src/app/admin/events/actions.ts',
    ];

    const allAdminFiles = listSourceFiles(join(projectRoot, 'src/app/admin'));
    const filesWithJudgeMutations = allAdminFiles
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          /from\('judges'\)\.(insert|update|delete|upsert)/.test(source) ||
          /from\('judge_station_assignments'\)\.(insert|update|delete|upsert)/.test(source)
        );
      })
      .map((file) => file.replace(`${projectRoot}/`, ''))
      .sort();

    expect(filesWithJudgeMutations).toEqual(knownMutativeFiles.sort());
  });
});

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      return [fullPath];
    }

    return [];
  });
}
