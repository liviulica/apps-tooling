/**
 * Coverage over the command and the setup doc, in the spirit of
 * devPaywallCoverage.test.ts: a new source must not be able to ship without a
 * door in /db:pulse and a click path in the setup doc.
 */
import fs from 'fs';
import path from 'path';
import {SOURCES, ENV_TEMPLATE, ENV_FILE} from '../scripts/monitoring/config';

const root = path.join(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('/db:pulse command', () => {
  const command = read('.claude/commands/db/pulse.md');

  it('names every source, so a new one cannot ship without a door', () => {
    for (const source of SOURCES) {
      expect(command).toContain(source);
    }
  });

  it('tells the agent how to gather crashes, since the script cannot', () => {
    expect(command).toContain('--crashes-from');
    expect(command).toContain('crashlytics_get_report');
  });

  it('points at the setup doc for credential failures', () => {
    expect(command).toContain('docs/monitoring-setup.md');
  });
});

describe('the setup doc', () => {
  const setup = read('docs/monitoring-setup.md');

  it('explains every variable the sources can ask for', () => {
    for (const variable of ENV_TEMPLATE) {
      expect(setup).toContain(variable);
    }
  });

  it('names the credential file', () => {
    expect(setup).toContain(ENV_FILE);
  });

  it('warns against putting these in .env, which EAS uploads', () => {
    expect(setup).toContain('.easignore');
  });
});

describe('the Firebase MCP registration', () => {
  const mcp = JSON.parse(read('.mcp.json'));

  it('registers a crashlytics-scoped firebase server', () => {
    const server = mcp.mcpServers.firebase;
    expect(server).toBeDefined();
    expect(server.args.join(' ')).toContain('firebase-tools');
    expect(server.args.join(' ')).toContain('crashlytics');
  });
});

describe('the decision record', () => {
  const record = read('docs/decisions/monitoring.md');

  it('records why Play and BigQuery are out', () => {
    expect(record).toMatch(/Play/);
    expect(record).toMatch(/BigQuery/);
  });

  it('is listed in the decisions index', () => {
    expect(read('docs/decisions/README.md')).toContain('monitoring.md');
  });
});
