import { describe, it, expect } from 'vitest';

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgres://***:****@...';
  }
}

describe('Database Init Utility', () => {
  it('should mask database password in postgres URLs', () => {
    const raw = 'postgres://woocs_admin:superSecret123@ep-cool-db.us-east-1.aws.neon.tech/woocs?sslmode=require';
    const masked = maskDatabaseUrl(raw);

    expect(masked).not.toContain('superSecret123');
    expect(masked).toContain('woocs_admin:****');
    expect(masked).toContain('ep-cool-db.us-east-1.aws.neon.tech/woocs?sslmode=require');
  });

  it('should handle malformed URLs safely without throwing', () => {
    const malformed = 'not-a-url';
    const masked = maskDatabaseUrl(malformed);
    expect(masked).toBe('postgres://***:****@...');
  });
});
